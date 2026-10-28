import { describe, expect, it } from 'vitest';
import { accountFromAddress, toHex } from '@ksana/sdk';
import { Devnet, KSA_DECIMALS, KSA_UNIT, satsForAll, type OpDraft } from './engine';
import { BTC_FINAL_DATA_CONFS, KSA_ASSET_ID, P2A_VALUE_SAT, PARAMS, emptyBlockWeight } from '../params';
import type { Block, BtcTx, Hex, OpRecord } from '../types';
import { t } from '../../i18n';
import { fmtInt } from '../../lib/format';

const NOW = Date.UTC(2026, 9, 1, 8, 0, 0);
const SEC = 1000;
const MIN = 60 * SEC;

/** Settlement batching: once the backlogged bodies exceed one eighth of the payload limit, stop waiting for the in-flight settlement transaction (same as PAYLOAD_BODY_TRIGGER in engine.ts) */
const BODY_TRIGGER = PARAMS.MAX_BLOCK_DATA_BYTES / 8;
const IN_FLIGHT_LAG = 2;

function sim(opts: ConstructorParameters<typeof Devnet>[0] = {}) {
  return new Devnet({ seed: 7, now: NOW, historyMs: 15 * MIN, ...opts });
}

/** A block and the parallel blocks it merges, in acceptance order (merged blocks first) */
function accepted(s: Devnet, c: Block): Block[] {
  return [...s.mergedOf(c), c];
}

/** The entry was executed (skipped, not-yet-accepted and nonce-mismatched entries change no state) */
function executed(reason: string | undefined): boolean {
  return reason !== 'skipped' && reason !== 'unaccepted' && reason !== 'nonce_mismatch';
}

function streakOf(s: Devnet, b: Block, memo = new Map<Hex, number>()): number {
  if (b.header.height === 0 || b.entries.length) return 0;
  const got = memo.get(b.hash);
  if (got !== undefined) return got;
  const sp = s.getBlock(b.header.parents[0] ?? '');
  const v = sp ? streakOf(s, sp, memo) + 1 : 0;
  memo.set(b.hash, v);
  return v;
}

function reveal(s: Devnet, txid: Hex): BtcTx {
  const tx = s.getBtcTx(txid);
  if (!tx) throw new Error(`missing tx ${txid}`);
  return tx;
}

/** Structure of the commit / reveal pair (D-081) */
function checkPair(s: Devnet, rv: BtcTx) {
  expect(['settlement', 'rescue', 'headers']).toContain(rv.kind);
  expect(rv.commitTxid).toBeDefined();
  const cm = reveal(s, rv.commitTxid as Hex);
  expect(cm.kind).toBe('commit');
  expect(cm.revealTxid).toBe(rv.txid);
  expect(cm.inputs).toHaveLength(1);
  expect(cm.inputs[0]?.role).toBe('producer');
  expect(cm.inputs[0]?.scriptType).toBe('p2tr');
  expect(cm.inputs[0]?.owner).toBe(rv.author);
  expect(cm.outputs.map((o) => o.role)).toEqual(['change', 'commitment']);
  expect(cm.outputs[1]?.valueSat).toBe((rv.feeSat ?? 0) + P2A_VALUE_SAT);
  expect(rv.inputs).toHaveLength(1);
  expect(rv.inputs[0]?.prevout).toEqual({ txid: cm.txid, vout: 1 });
  expect(rv.inputs[0]?.scriptType).toBe('envelope');
  expect(rv.outputs.map((o) => o.role)).toEqual(['anchor', 'op_return']);
  expect(rv.outputs[0]?.valueSat).toBe(P2A_VALUE_SAT);
  expect(rv.outputs[0]?.scriptType).toBe('p2a');
  expect(rv.headers.length).toBeGreaterThan(0);
  expect(rv.headers.length).toBeLessThanOrEqual(PARAMS.MAX_SETTLEMENT_HEADERS);
  expect(rv.payloadBytes).toBeLessThanOrEqual(PARAMS.MAX_BLOCK_DATA_BYTES);
  // Both are broadcast and confirmed together; the commit precedes the reveal within the block
  if (rv.status === 'broadcast' || rv.status === 'confirmed') expect(cm.status).toBe(rv.status);
  if (rv.status === 'confirmed') {
    expect(cm.confirmedHeight).toBe(rv.confirmedHeight);
    const blk = s.getBtcBlock(rv.confirmedHeight as number);
    expect(blk?.txids.indexOf(cm.txid)).toBeLessThan(blk?.txids.indexOf(rv.txid) ?? -1);
  }
  // A body is always carried together with its header
  for (const id of rv.bodies) expect(rv.headers).toContain(id);
}

/** Rules the simulated chain must satisfy at any moment */
function checkInvariants(s: Devnet) {
  const ksa = s.assets.get(KSA_ASSET_ID);
  expect(ksa).toBeDefined();
  expect(s.finalHeight).toBeLessThanOrEqual(s.settledHeight);
  expect(s.settledHeight).toBeLessThan(s.blocks.length);

  const streaks = new Map<Hex, number>();
  const order = { Forced: 0, Unlock: 1, Sponsored: 2 } as const;
  let lastUnlock = { height: 0, index: 0 };
  const seenOps = new Set<Hex>();

  for (let h = 1; h < s.blocks.length; h++) {
    const c = s.blocks[h] as Block;
    const prev = s.blocks[h - 1] as Block;
    expect(c.header.height).toBe(h);
    expect(c.header.parents[0]).toBe(prev.hash);
    expect([...c.header.parents.slice(1)].sort()).toEqual([...c.merged].sort());
    expect(c.acceptedHeight).toBe(h);
    expect(c.acceptedBy).toBe(c.hash);
    expect(c.header.btcAnchor.height).toBeGreaterThanOrEqual(prev.header.btcAnchor.height);
    // Settlement broadcast depth: the chain block that accepts it must have SETTLEMENT_DEPTH blocks after it
    for (const b of accepted(s, c)) {
      for (const id of b.settlements) {
        const rv = reveal(s, id);
        if (rv.kind === 'settlement' && (rv.status === 'broadcast' || rv.status === 'confirmed')) {
          expect(h + PARAMS.SETTLEMENT_DEPTH).toBeLessThanOrEqual(s.tip.header.height);
        }
      }
    }

    for (const b of accepted(s, c)) {
      // Entry order: forced inclusions, at most one unlock, fast path
      let rank = -1;
      let unlocks = 0;
      for (const e of b.entries) {
        const r = order[e.entry.kind];
        expect(r).toBeGreaterThanOrEqual(rank);
        rank = r;
        if (e.entry.kind === 'Unlock') unlocks++;
      }
      expect(unlocks).toBeLessThanOrEqual(1);
      expect(b.needsSettlement).toBe(b.entries.some((e) => e.entry.kind !== 'Forced'));
      // Two-speed difficulty: weight 1 with entries, otherwise by the selected parent's empty-block streak
      const w = b.entries.length ? 1 : emptyBlockWeight(streakOf(s, s.getBlock(b.header.parents[0] ?? '') as Block, streaks));
      expect(b.weight).toBe(w);

      if (b.side) {
        expect(b.acceptedHeight).toBe(h);
        expect(b.acceptedBy).toBe(c.hash);
        expect(b.header.height).toBeLessThanOrEqual(h);
        // A parallel block at the same height is no heavier and has the smaller hash (the fork choice counts a block's own work, and with equal chain work the larger hash is the selected parent, D-100)
        const rival = s.blocks[b.header.height] as Block;
        expect(b.weight ?? 1).toBeLessThanOrEqual(rival.weight ?? 1);
        expect(b.hash < rival.hash).toBe(true);
        expect(s.sideAt(b.header.height)).toContain(b);
      }

      // Forced-inclusion window (max h(parents), h(this block)] (NATIVE_CONFIRMATIONS = 1)
      const parentAnchor = Math.max(...b.header.parents.map((p) => s.getBlock(p)?.header.btcAnchor.height ?? 0));
      for (const e of b.entries) {
        if (e.entry.kind !== 'Forced') continue;
        const tx = s.getBtcTx(e.entry.btcTxid);
        expect(tx?.kind).toBe('native');
        if (!b.side) {
          expect(tx?.confirmedHeight).toBeGreaterThan(parentAnchor - PARAMS.NATIVE_CONFIRMATIONS + 1 - 1);
          expect(tx?.confirmedHeight).toBeLessThanOrEqual(b.header.btcAnchor.height - PARAMS.NATIVE_CONFIRMATIONS + 1);
        }
      }

      // An operation executes only once and is recorded in the block that executed it
      for (let i = 0; i < b.entries.length; i++) {
        const e = b.entries[i] as Block['entries'][number];
        if (e.entry.kind === 'Unlock') {
          // An unlock entry of a merged block is never executed (D-100)
          if (b.side) expect(e.result.ok).toBe(false);
          if (e.result.ok) {
            const pos = { height: e.entry.height, index: e.entry.index };
            expect(pos.height > lastUnlock.height || (pos.height === lastUnlock.height && pos.index > lastUnlock.index)).toBe(true);
            lastUnlock = pos;
            expect(pos.height).toBeLessThan(h);
            // The target block is inside the settled closure at this block's anchor
            expect((s.blocks[pos.height] as Block).closureBtc).toBeLessThanOrEqual(c.header.btcAnchor.height);
            expect(e.entry.blocks?.length).toBeGreaterThan(0);
            expect(e.entry.amount).toBeDefined();
          }
          continue;
        }
        const r = s.getOp(e.entry.opId);
        expect(r).toBeDefined();
        if (!r) continue;
        if (executed(e.result.reason)) {
          expect(seenOps.has(r.id)).toBe(false);
          seenOps.add(r.id);
          expect(r.blockHash).toBe(b.hash);
          expect(r.height).toBe(h);
          expect(r.entryIndex).toBe(i);
          if (e.entry.kind === 'Forced') expect(r.path).toBe('C');
          else expect(r.path).toBe('B');
        } else if (e.result.reason === 'skipped') {
          expect(b.side).toBe(true);
        }
      }

      // Structure of the settlement transactions
      if (b.settlementTxid) {
        expect(b.settlements[0]).toBe(b.settlementTxid);
        for (const id of b.settlements) {
          const rv = reveal(s, id);
          checkPair(s, rv);
          expect(rv.forBlock).toBe(b.hash);
          expect(rv.headers[rv.headers.length - 1]).toBe(b.hash);
          expect(rv.bodies.includes(b.hash)).toBe(b.needsSettlement);
          // the block's own entries and those of the other bodies it carries (D-077)
          expect(rv.entryCount).toBe(b.entries.length + rv.bodies.filter((id) => id !== b.hash).reduce((n, id) => n + (s.getBlock(id)?.entries.length ?? 0), 0));
        }
        // At most one of a block's versions confirms
        expect(b.settlements.filter((id) => reveal(s, id).status === 'confirmed').length).toBeLessThanOrEqual(1);
      } else {
        expect(b.settlements).toEqual([]);
      }
      if (b.carrier) {
        expect(b.settlementTxid).toBeUndefined();
        const carrier = s.getBlock(b.carrier);
        expect(carrier).toBeDefined();
        expect(carrier?.settlements.some((id) => reveal(s, id).bodies.includes(b.hash))).toBe(true);
      }
      if (b.settlementOnBtc) {
        const tx = reveal(s, b.settlementOnBtc.txid);
        expect(tx.status).toBe('confirmed');
        expect(tx.confirmedHeight).toBe(b.settlementOnBtc.btcHeight);
        expect(tx.bodies).toContain(b.hash);
        expect(b.headerOnBtc).toBeDefined();
        expect(b.headerOnBtc?.btcHeight).toBeLessThanOrEqual(b.settlementOnBtc.btcHeight);
      }
      if (b.headerOnBtc) {
        const tx = reveal(s, b.headerOnBtc.txid);
        expect(tx.status).toBe('confirmed');
        expect(tx.headers).toContain(b.hash);
      }
    }

    // Settled closure: closure(b) = max(data(b), closure(parents))
    if (h <= s.settledHeight) {
      const closure = c.closureBtc;
      expect(closure).toBeDefined();
      const data = c.needsSettlement ? c.settlementOnBtc?.btcHeight : c.headerOnBtc?.btcHeight;
      expect(data).toBeDefined();
      let want = data as number;
      for (const p of c.header.parents) {
        const pc = s.getBlock(p)?.closureBtc;
        expect(pc).toBeDefined();
        want = Math.max(want, pc ?? 0);
      }
      expect(closure).toBe(want);
      expect(closure).toBeGreaterThanOrEqual(prev.closureBtc ?? 0);
    }
    // BTC-final: the closure has BTC_FINAL_DATA_CONFS confirmations, and the first settled block above the BTC-final tip has fewer (D-114)
    if (h <= s.finalHeight) expect((c.closureBtc ?? Infinity) + BTC_FINAL_DATA_CONFS - 1).toBeLessThanOrEqual(s.btcTip.height);
    else if (h === s.finalHeight + 1 && h <= s.settledHeight) expect((c.closureBtc ?? 0) + BTC_FINAL_DATA_CONFS - 1).toBeGreaterThan(s.btcTip.height);
  }

  // nonce: the executed operations of each account have distinct nonces 0 … n−1
  const nonces = new Map<Hex, number[]>();
  for (const r of s.allOps()) {
    if (!r.blockHash || !r.result || !executed(r.result.reason)) continue;
    const list = nonces.get(r.op.account) ?? [];
    list.push(r.op.nonce);
    nonces.set(r.op.account, list);
  }
  for (const [acct, list] of nonces) {
    list.sort((a, b) => a - b);
    expect(list, acct).toEqual(list.map((_, i) => i));
    expect(s.peekAccount(acct)?.nonce).toBe(list.length);
  }

  // Settlement funding always comes from confirmed UTXOs; commit and reveal share the same status
  for (const tx of s.allBtcTxs()) {
    if (tx.kind === 'commit') {
      const u = s.getUtxos(tx.author ?? '').find((x) => x.outpoint.txid === tx.inputs[0]?.prevout.txid && x.outpoint.vout === tx.inputs[0]?.prevout.vout);
      if (u) {
        expect(u.confirmedHeight).not.toBeNull();
        if (tx.status === 'broadcast' || tx.status === 'confirmed') expect(u.spentBy).toBe(tx.txid);
      }
    }
    if (tx.kind === 'settlement' || tx.kind === 'rescue' || tx.kind === 'headers') checkPair(s, tx);
    if (tx.status === 'confirmed') expect(s.getBtcBlock(tx.confirmedHeight as number)?.txids).toContain(tx.txid);
  }
  for (const tx of s.btcMempool) expect(tx.status).toBe('broadcast');

  // Indexer: the verified state roots match and the heights are consecutive
  let prevH = 0;
  for (const chk of s.indexerChecks) {
    expect(chk.nodeRoot).toBe(chk.indexerRoot);
    if (prevH) expect(chk.height).toBe(prevH + 1);
    prevH = chk.height;
  }
  expect(s.indexerHeight).toBeLessThanOrEqual(s.settledHeight);

  // KSA conservation: account balances + locked sponsored fees = total supply (block rewards enter the supply only when unlocked)
  let sum = 0n;
  for (const acc of s.accounts.values()) sum += acc.balances.get(KSA_ASSET_ID) ?? 0n;
  expect(sum + s.lockedSupply().fees).toBe(ksa?.totalSupply);
  expect(ksa?.totalSupply).toBeLessThanOrEqual(BigInt(PARAMS.KSA_MAX_SUPPLY));

  // The block-share account only receives unlocked portions; a producer's balance = preallocation + unlocked portions
  let share = 0n;
  const byProducer = new Map<Hex, bigint>();
  for (const row of s.lockedFees.values()) {
    if (!row.unlocked) {
      expect(row.unlockHeight).toBeUndefined();
      continue;
    }
    expect(row.unlockHeight).toBeDefined();
    if (row.producer === s.shareAccountId) share += row.amount;
    else byProducer.set(row.producer, (byProducer.get(row.producer) ?? 0n) + row.amount);
  }
  expect(s.balance(s.shareAccountId, KSA_ASSET_ID)).toBe(share);
  for (const p of s.producers) expect(s.balance(p.id, KSA_ASSET_ID)).toBe(20_000n * KSA_UNIT + (byProducer.get(p.id) ?? 0n));
}

/** Advance until chain height h is inside the settled closure: produce blocks, broadcast settlements, mine BTC blocks */
function settleTo(s: Devnet, h: number, maxRounds = 80) {
  for (let i = 0; i < maxRounds && s.settledHeight < h; i++) {
    s.advanceTo(s.clock + 6 * SEC);
    s.mineBtc(1);
  }
  expect(s.settledHeight).toBeGreaterThanOrEqual(h);
}

function transfer(s: Devnet, from: Hex, to: Hex, amount: bigint, path: 'B' | 'C' = 'B', extra: Partial<OpDraft> = {}): OpDraft {
  const draft: OpDraft = { account: from, path, maxGas: 50_000, action: { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to, amount }, ...extra };
  s.fillFees(draft);
  return draft;
}

describe('devnet simulator', () => {
  it('the generated history satisfies every invariant and keeps satisfying them over time', () => {
    const s = sim();
    expect(s.blocks.length).toBeGreaterThan(100);
    expect(s.sideBlocks.length).toBeGreaterThan(0);
    expect(s.settledHeight).toBeGreaterThan(0);
    expect(s.finalHeight).toBeGreaterThan(0);
    checkInvariants(s);
    s.advanceTo(NOW + 2 * MIN);
    checkInvariants(s);
    s.mineBtc(3);
    s.advanceTo(NOW + 4 * MIN);
    checkInvariants(s);
  });

  it('accounts are Taproot output keys: addresses are bcrt1p…, address and account derive from each other; contracts have no address', () => {
    const s = sim({ historyMs: 2 * MIN });
    const addr = s.addressOf(s.demoId);
    expect(addr.startsWith('bcrt1p')).toBe(true);
    expect(s.accountOfAddress(addr)).toBe(s.demoId);
    expect(toHex(accountFromAddress(addr, 'regtest'))).toBe(s.demoId);
    expect(s.accountOfAddress(addr.toUpperCase())).toBe(s.demoId);
    for (const p of s.producers) expect(s.accountOfAddress(s.addressOf(p.id))).toBe(p.id);
    expect(s.addressOf(s.ammContract)).toBe('');
    expect(s.addressOf(s.exchangeContract)).toBe('');
    // Other address types and other networks have no account
    expect(s.accountOfAddress('bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080')).toBeUndefined();
    expect(s.accountOfAddress('bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297')).toBeUndefined();
    expect(s.accountOfAddress('not an address')).toBeUndefined();
    // Every built-in account has a name
    for (const id of [s.faucetId, s.operatorId, s.sellerId, s.shareAccountId, s.demoId, s.exchangeContract]) expect(s.labels.get(id)).toBeTruthy();
    // KSA decimals 8: preallocations are whole KSA
    expect(s.assets.get(KSA_ASSET_ID)?.decimals).toBe(KSA_DECIMALS);
    expect(s.balance(s.operatorId, KSA_ASSET_ID)).toBeLessThanOrEqual(20_000_000n * KSA_UNIT);
    expect(s.balance(s.operatorId, KSA_ASSET_ID)).toBeGreaterThan(10_000_000n * KSA_UNIT);
  });

  it('two runs with the same seed produce the same chain', () => {
    const run = () => {
      const s = sim({ seed: 99, historyMs: 10 * MIN });
      s.advanceTo(NOW + 90 * SEC);
      s.mineBtc(2);
      s.advanceTo(NOW + 3 * MIN);
      return s;
    };
    const a = run();
    const b = run();
    expect(a.blocks.length).toBe(b.blocks.length);
    expect(a.tip.hash).toBe(b.tip.hash);
    expect(a.tip.header.stateRoot).toBe(b.tip.header.stateRoot);
    expect(a.btcTip.hash).toBe(b.btcTip.hash);
    expect(a.opOrder).toEqual(b.opOrder);
    expect(a.events.map((e) => e.text)).toEqual(b.events.map((e) => e.text));
    expect(a.balance(a.demoId, KSA_ASSET_ID)).toBe(b.balance(b.demoId, KSA_ASSET_ID));
    expect([...a.allBtcTxs()].map((t) => t.txid)).toEqual([...b.allBtcTxs()].map((t) => t.txid));
  });

  it('settlement: a commit + reveal pair, the last header in the payload is this block, and the payload carries the body of this block when it must land', () => {
    const s = sim();
    const withSettlement = s.blocks.filter((b) => b.settlementTxid);
    expect(withSettlement.length).toBeGreaterThan(10);
    let confirmed = 0;
    for (const b of withSettlement) {
      const rv = reveal(s, b.settlementTxid as Hex);
      expect(rv.kind).toBe('settlement');
      checkPair(s, rv);
      expect(rv.headers[rv.headers.length - 1]).toBe(b.hash);
      expect(rv.bodies.includes(b.hash)).toBe(b.needsSettlement);
      if (rv.status === 'confirmed') {
        confirmed++;
        expect(b.settlementOnBtc?.txid).toBe(rv.txid);
        expect(b.headerOnBtc).toBeDefined();
      }
    }
    expect(confirmed).toBeGreaterThan(5);
  });

  it('settlement batching: while a settlement transaction is in flight later blocks carry no settlement, and their bodies are carried by a later settlement payload', () => {
    const s = sim();
    const carried = s.blocks.filter((b) => b.needsSettlement && !b.settlementTxid);
    expect(carried.length).toBeGreaterThan(10);
    for (const b of carried) {
      if (b.header.height > s.tip.header.height - 1) continue;
      // A block without its own settlement transaction sooner or later has its body carried by some chain block's payload
      if (!b.carrier) {
        expect(b.header.height).toBeGreaterThan(s.settledHeight);
        continue;
      }
      const carrier = s.getBlock(b.carrier) as Block;
      expect(carrier.header.height).toBeGreaterThan(b.header.height);
      const rv = carrier.settlements.map((id) => reveal(s, id)).find((t) => t.bodies.includes(b.hash));
      expect(rv).toBeDefined();
      if (b.settlementOnBtc) {
        const tx = reveal(s, b.settlementOnBtc.txid);
        expect(tx.bodies).toContain(b.hash);
        expect(tx.status).toBe('confirmed');
      }
    }
    expect(carried.some((b) => b.settlementOnBtc)).toBe(true);
    // The data of every block inside the settled closure has landed
    for (let h = 1; h <= s.settledHeight; h++) {
      const b = s.blocks[h] as Block;
      if (b.needsSettlement) expect(b.settlementOnBtc).toBeDefined();
      else expect(b.headerOnBtc).toBeDefined();
    }
    // Two consecutive chain blocks with settlement transactions: when the latter is produced, the settlement of the former has confirmed, or the anchor of the former is more than two BTC blocks behind, or too many bodies are backlogged
    const carriers = s.blocks.filter((b) => b.settlementTxid && reveal(s, b.settlementTxid).kind === 'settlement');
    let waited = 0;
    for (let i = 1; i < carriers.length; i++) {
      const prev = carriers[i - 1] as Block;
      const cur = carriers[i] as Block;
      const prevTx = reveal(s, prev.settlementTxid as Hex);
      const curTx = reveal(s, cur.settlementTxid as Hex);
      const bodyBytes = curTx.bodies.filter((id) => id !== cur.hash).reduce((sum, id) => sum + (s.getBlock(id)?.entries.reduce((x, e) => x + e.dataBytes, 0) ?? 0), 0);
      const ownBytes = cur.entries.reduce((x, e) => x + e.dataBytes, 0);
      const prevDone = prevTx.status === 'replaced' || (prevTx.confirmedAt !== undefined && prevTx.confirmedAt <= cur.time);
      const lagged = cur.header.btcAnchor.height - prev.header.btcAnchor.height > IN_FLIGHT_LAG;
      if (prevDone) waited++;
      expect(prevDone || lagged || bodyBytes > BODY_TRIGGER || ownBytes > BODY_TRIGGER, `#${cur.header.height}`).toBe(true);
    }
    expect(waited).toBeGreaterThan(5);
  });

  it('unlock: at most one unlock entry per block, the cursor advances monotonically; after unlocking, sponsored fees and rewards (including the 20% share) enter available balances', () => {
    const s = sim();
    const unlocks: Block[] = [];
    for (const c of s.blocks) for (const b of accepted(s, c)) if (b.entries.some((e) => e.entry.kind === 'Unlock' && e.result.ok)) unlocks.push(b);
    expect(unlocks.length).toBeGreaterThan(5);
    const shareBefore = s.balance(s.shareAccountId, KSA_ASSET_ID);
    expect(shareBefore).toBeGreaterThan(0n);
    // For every unlocked block: the share account's portion is 20% of the reward, the producer gets the remaining 80% plus the sponsored fees
    const rows = [...s.lockedFees.entries()];
    let checked = 0;
    for (const [key, row] of rows) {
      if (key.endsWith(':share') || !row.unlocked) continue;
      const shareRow = s.lockedFees.get(`${key}:share`);
      expect(shareRow?.unlocked).toBe(true);
      const b = s.getBlock(row.blockHash) as Block;
      let fees = 0n;
      for (const e of b.entries) {
        if (e.entry.kind !== 'Sponsored' || !executed(e.result.reason)) continue;
        const r = s.getOp(e.entry.opId);
        if (r?.op.fee.kind === 'Token') fees += r.op.fee.amount;
      }
      const reward = row.amount - fees;
      expect(reward).toBeGreaterThan(0n);
      expect((shareRow?.amount ?? 0n) * 4n).toBe(reward);
      expect(reward + (shareRow?.amount ?? 0n)).toBe(BigInt(PARAMS.BLOCK_REWARD) * BigInt(b.weight ?? 1));
      expect(row.unlockHeight).toBeGreaterThan(row.height);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);

    // Keep running: after the next unlock the share account's balance grows, and the blocks listed by the unlock entry are all settled
    const before = s.blocks.length;
    settleTo(s, before + 2);
    s.advanceTo(s.clock + 20 * SEC);
    const later: Block[] = [];
    for (let h = before; h < s.blocks.length; h++) for (const b of accepted(s, s.blocks[h] as Block)) if (b.entries.some((e) => e.entry.kind === 'Unlock' && e.result.ok)) later.push(b);
    expect(later.length).toBeGreaterThan(0);
    expect(s.balance(s.shareAccountId, KSA_ASSET_ID)).toBeGreaterThan(shareBefore);
    for (const b of later) {
      const e = b.entries.find((x) => x.entry.kind === 'Unlock');
      if (!e || e.entry.kind !== 'Unlock') continue;
      for (const id of e.entry.blocks ?? []) {
        const t = s.getBlock(id) as Block;
        expect(s.lockedFees.get(t.hash)?.unlocked).toBe(true);
        expect((s.blocks[t.acceptedHeight as number] as Block).closureBtc).toBeDefined();
      }
    }
    checkInvariants(s);
  });

  it('two-speed difficulty: without entries block production slows down with weights 12, 24, 48…; when an operation arrives a block is produced at the normal interval right away', () => {
    const s = sim({ historyMs: 0, trafficPerSec: 0, parallelRate: 0 });
    s.advanceTo(NOW + 20 * MIN);
    const blocks = s.blocks.slice(1);
    expect(blocks.length).toBeGreaterThan(3);
    // The first block includes the operator's bootstrap operations; after that only empty blocks and unlock blocks
    expect(blocks[0]?.entries.length).toBeGreaterThan(0);
    const empties = blocks.filter((b) => b.entries.length === 0);
    expect(empties.length).toBeGreaterThan(2);
    let streak = 0;
    for (const b of blocks) {
      const prev = s.blocks[b.header.height - 1] as Block;
      if (b.entries.length) {
        expect(b.weight).toBe(1);
        streak = 0;
        continue;
      }
      const w = emptyBlockWeight(streak);
      expect(b.weight).toBe(w);
      // An empty block's interval is about weight target block times
      expect(b.time - prev.time).toBeGreaterThanOrEqual(0.75 * w * PARAMS.TARGET_BLOCK_TIME * SEC);
      streak++;
    }
    expect(empties.map((b) => b.weight).slice(0, 2)).toEqual([12, 24]);
    // Empty blocks do not change the state root
    for (const b of empties) expect(b.header.stateRoot).toBe((s.blocks[b.header.height - 1] as Block).header.stateRoot);

    // Submit an operation: the next block appears within the normal interval and includes it
    const t0 = s.clock;
    const res = s.submit(transfer(s, s.demoId, s.faucetId, 10n * KSA_UNIT));
    expect(res.ok).toBe(true);
    s.advanceTo(t0 + 15 * SEC);
    const tip = s.tip;
    expect(tip.time - t0).toBeLessThanOrEqual(14 * SEC);
    expect(tip.weight).toBe(1);
    expect(tip.entries.some((e) => e.entry.kind === 'Sponsored' && res.ok && e.entry.opId === res.opId)).toBe(true);
    checkInvariants(s);
  });

  it('path B: submit → include → broadcast settlement → land on BTC → final', () => {
    const s = sim();
    const to = s.faucetId;
    const before = s.balance(s.demoId, KSA_ASSET_ID);
    const draft = transfer(s, s.demoId, to, 1_000n * KSA_UNIT);
    expect(s.validate(draft)).toBeNull();
    const res = s.submit(draft);
    if (!res.ok) throw new Error(res.message);
    expect(res.op.version).toBe(2);
    expect(res.op.fee.kind).toBe('Token');
    expect(s.pendingOf(s.demoId).map((r) => r.id)).toContain(res.opId);

    s.advanceTo(s.clock + 20 * SEC);
    const r = s.getOp(res.opId);
    expect(r?.blockHash).toBeDefined();
    expect(r?.result?.ok).toBe(true);
    expect(s.balance(s.demoId, KSA_ASSET_ID)).toBe(before - 1_000n * KSA_UNIT - (draft.tokenFee ?? 0n));
    const b = s.getBlock(r?.blockHash ?? '') as Block;
    expect(b.entries[r?.entryIndex ?? -1]?.entry.kind).toBe('Sponsored');
    expect(b.needsSettlement).toBe(true);

    // Broadcasting the settlement needs SETTLEMENT_DEPTH blocks after the chain block that accepts it; the body is carried by the settlement payload of this block or of a later one
    s.advanceTo(s.clock + 30 * SEC);
    const carrierTx = (): BtcTx | undefined => {
      const own = b.settlements.map((id) => reveal(s, id)).find((t) => t.status === 'broadcast' || t.status === 'confirmed');
      if (own) return own;
      const carrier = b.carrier ? s.getBlock(b.carrier) : undefined;
      return carrier?.settlements.map((id) => reveal(s, id)).find((t) => t.bodies.includes(b.hash) && (t.status === 'broadcast' || t.status === 'confirmed'));
    };
    for (let i = 0; i < 20 && !carrierTx(); i++) s.advanceTo(s.clock + 5 * SEC);
    const tx = carrierTx();
    expect(tx).toBeDefined();
    expect(tx?.bodies).toContain(b.hash);
    expect(s.canConfirm(tx as BtcTx)).toBe(true);

    settleTo(s, b.acceptedHeight as number);
    expect(b.settlementOnBtc).toBeDefined();
    expect(s.settledHeight).toBeGreaterThanOrEqual(b.acceptedHeight as number);
    s.mineBtc(BTC_FINAL_DATA_CONFS);
    expect(s.finalHeight).toBeGreaterThanOrEqual(b.acceptedHeight as number);
    checkInvariants(s);
  });

  it('a transfer uses ASSET_TRANSFER_GAS whatever max_gas allows, and below it runs out of gas and pays its fee all the same', () => {
    const s = sim();
    const before = s.balance(s.demoId, KSA_ASSET_ID);
    const first = transfer(s, s.demoId, s.faucetId, KSA_UNIT);
    const ok = s.submit(first);
    if (!ok.ok) throw new Error(ok.message);
    const low = transfer(s, s.demoId, s.faucetId, KSA_UNIT, 'B', { maxGas: PARAMS.ASSET_TRANSFER_GAS - 1 });
    const short = s.submit(low);
    if (!short.ok) throw new Error(short.message);
    for (let i = 0; i < 20 && !(s.getOp(ok.opId)?.result && s.getOp(short.opId)?.result); i++) s.advanceTo(s.clock + 5 * SEC);
    expect(s.getOp(ok.opId)?.result).toMatchObject({ ok: true, gasUsed: PARAMS.ASSET_TRANSFER_GAS });
    expect(s.getOp(short.opId)?.result).toMatchObject({ ok: false, reason: 'out_of_gas', gasUsed: PARAMS.ASSET_TRANSFER_GAS - 1 });
    // The first moved its amount; the second only paid its fee
    expect(s.balance(s.demoId, KSA_ASSET_ID)).toBe(before - KSA_UNIT - (first.tokenFee ?? 0n) - (low.tokenFee ?? 0n));
  });

  it('path C: the native transaction lands on Bitcoin first and is then force-included', () => {
    const s = sim();
    const before = s.balance(s.demoId, KSA_ASSET_ID);
    const draft = transfer(s, s.demoId, s.faucetId, 2_500n * KSA_UNIT, 'C');
    expect(s.validate(draft)).toBeNull();
    const res = s.submit(draft);
    if (!res.ok) throw new Error(res.message);
    expect(res.op.fee.kind).toBe('BtcNative');
    const r = s.getOp(res.opId);
    expect(r?.nativeTxid).toBeDefined();
    const tx = s.getBtcTx(r?.nativeTxid ?? '') as BtcTx;
    expect(tx.kind).toBe('native');
    expect(tx.status).toBe('broadcast');
    expect(tx.outputs[0]?.role).toBe('op_return');
    expect(tx.outputs[0]?.payloadBytes).toBeGreaterThan(0);
    expect(tx.inputs.every((i) => i.owner === s.demoId && i.scriptType === 'p2tr')).toBe(true);
    for (const i of tx.inputs) expect(s.getUtxos(s.demoId).find((u) => u.outpoint.txid === i.prevout.txid && u.outpoint.vout === i.prevout.vout)?.spentBy).toBe(tx.txid);
    expect(s.nativePending).toContain(r);
    // Producers do not include it before it confirms (regtest may mine a BTC block on its own during these 20 seconds)
    s.advanceTo(s.clock + 20 * SEC);
    if (r?.blockHash) expect(tx.status).toBe('confirmed');
    else expect(tx.status).toBe('broadcast');

    s.mineBtc(1);
    expect(tx.status).toBe('confirmed');
    s.advanceTo(s.clock + 15 * SEC);
    expect(r?.blockHash).toBeDefined();
    const b = s.getBlock(r?.blockHash ?? '') as Block;
    const e = b.entries[r?.entryIndex ?? -1];
    expect(e?.entry.kind).toBe('Forced');
    if (e?.entry.kind === 'Forced') expect(e.entry.btcTxid).toBe(tx.txid);
    expect(r?.result?.ok).toBe(true);
    expect(s.balance(s.demoId, KSA_ASSET_ID)).toBe(before - 2_500n * KSA_UNIT);
    // The change comes back as its own UTXO
    expect(s.getUtxos(s.demoId).some((u) => u.outpoint.txid === tx.txid && !u.spentBy)).toBe(true);
    settleTo(s, b.acceptedHeight as number);
    s.mineBtc(BTC_FINAL_DATA_CONFS);
    expect(s.finalHeight).toBeGreaterThanOrEqual(b.acceptedHeight as number);
    checkInvariants(s);
  });

  it('top-up: pay the lock payment address → BTC confirmation → forced inclusion → KSA credited to the beneficiary account, the lock becomes Claimed', () => {
    // The default-length history already contains one completed top-up
    const full = new Devnet({ seed: 7, now: NOW });
    const allLocks = [...Array(12).keys()].map((i) => full.getLock(full.exchangeContract, BigInt(i))).filter((l) => !!l);
    const done = allLocks.filter((l) => l.state === 'Claimed');
    expect(done.length).toBeGreaterThanOrEqual(1);
    // A claimed lock has nothing left locked; the totals of its claims are in the state (D-098)
    expect(done[0]?.ksa).toBe(0n);
    expect(done[0]?.ksaPaid ?? 0n).toBeGreaterThan(0n);
    expect(done[0]?.beneficiary).toBe(full.demoId);
    expect(full.locksFor(full.demoId).length).toBeGreaterThanOrEqual(2);

    const s = sim();
    const locks = s.locksFor(s.demoId);
    expect(locks.length).toBeGreaterThanOrEqual(2);

    const lock = locks[0] as NonNullable<(typeof locks)[number]>;
    expect(lock.seller).toBe(s.sellerId);
    expect(lock.address?.startsWith('bcrt1p')).toBe(true);
    expect(lock.expiry).toBeGreaterThan(s.btcTip.height);
    // Every lock has a distinct payment address
    expect(new Set(locks.map((l) => l.address)).size).toBe(locks.length);
    expect(s.getLock(s.exchangeContract, lock.id)).toBe(lock);
    expect(s.getLock(s.ammContract, lock.id)).toBeUndefined();

    const before = s.balance(s.demoId, KSA_ASSET_ID);
    const inContract = s.balance(s.exchangeContract, KSA_ASSET_ID);
    const locked = lock.ksa;
    const sats = satsForAll(lock);
    expect(s.topUp(lock.id, 0)).toMatchObject({ ok: false, code: 'sats' });
    expect(s.topUp(999_999n, sats)).toMatchObject({ ok: false, code: 'lock_missing' });
    expect(s.topUp(lock.id, sats, s.faucetId)).toMatchObject({ ok: false, code: 'not_beneficiary' });
    const res = s.topUp(lock.id, sats, s.demoId);
    if (!res.ok) throw new Error(res.message);
    // One-time account, nonce 0, path C
    expect(res.op.account).not.toBe(s.demoId);
    expect(res.op.nonce).toBe(0);
    expect(res.op.fee.kind).toBe('BtcNative');
    const r = s.getOp(res.opId) as NonNullable<ReturnType<Devnet['getOp']>>;
    expect(r.path).toBe('C');
    const tx = s.getBtcTx(r.nativeTxid ?? '') as BtcTx;
    expect(tx.kind).toBe('native');
    expect(tx.author).toBe(s.demoId);
    expect(tx.outputs[0]?.role).toBe('op_return');
    expect(tx.outputs[1]).toMatchObject({ role: 'payment', valueSat: sats, address: lock.address, owner: s.sellerId });
    expect(tx.outputs[2]?.role).toBe('change');
    expect(s.peekAccount(s.demoId)?.opIds).toContain(res.opId);

    s.mineBtc(1);
    s.advanceTo(s.clock + 15 * SEC);
    expect(r.blockHash).toBeDefined();
    expect(r.result?.ok).toBe(true);
    const b = s.getBlock(r.blockHash ?? '') as Block;
    expect(b.entries[r.entryIndex ?? -1]?.entry.kind).toBe('Forced');
    expect(lock.state).toBe('Claimed');
    expect(lock.paidSats).toBe(sats);
    expect(lock.ksaPaid).toBe(locked);
    expect(lock.ksa).toBe(0n);
    expect(s.balance(s.demoId, KSA_ASSET_ID)).toBeGreaterThanOrEqual(before + locked);
    expect(s.balance(s.exchangeContract, KSA_ASSET_ID)).toBe(inContract - locked);
    expect(s.locksFor(s.demoId)).not.toContain(lock);
    // The seller receives the payment UTXO
    expect(s.getUtxos(s.sellerId).some((u) => u.outpoint.txid === tx.txid && u.valueSat === sats)).toBe(true);
    // A closed lock cannot be paid again
    expect(s.topUp(lock.id, sats)).toMatchObject({ ok: false, code: 'lock_not_open' });

    // Underpayment: buys part at the price, the rest stays locked for the buyer and a second payment buys it (D-098)
    const second = s.locksFor(s.demoId)[0] as NonNullable<(typeof locks)[number]>;
    const secondLocked = second.ksa;
    const half = Math.floor(satsForAll(second) / 2);
    const res2 = s.topUp(second.id, half);
    expect(res2.ok).toBe(true);
    s.mineBtc(1);
    s.advanceTo(s.clock + 15 * SEC);
    expect(second.state).toBe('Open');
    expect(second.ksaPaid).toBe(BigInt(half) * second.price);
    expect(second.ksa).toBe(secondLocked - BigInt(half) * second.price);
    const rest = satsForAll(second);
    expect(s.topUp(second.id, rest).ok).toBe(true);
    s.mineBtc(1);
    s.advanceTo(s.clock + 15 * SEC);
    expect(second.state).toBe('Claimed');
    expect(second.ksa).toBe(0n);
    expect(second.ksaPaid).toBe(secondLocked);
    expect(second.paidSats).toBe(half + rest);
    checkInvariants(s);
  });

  it('admission checks: too large, path C gas, sponsored fee, KSA balance, UTXO, nonce', () => {
    const s = sim({ historyMs: 3 * MIN });
    const base = transfer(s, s.demoId, s.faucetId, 1n * KSA_UNIT);
    expect(s.validate(base)).toBeNull();
    expect(s.validate({ ...base, action: { kind: 'Deploy', codeHash: 'ab'.repeat(32), codeSize: 70_000, initArgsSize: 0, name: 'big' } })?.code).toBe('too_large');
    expect(s.validate({ ...base, path: 'C', maxGas: PARAMS.NATIVE_MAX_GAS + 1 })?.code).toBe('native_gas');
    expect(s.validate({ ...base, tokenFee: 0n })?.code).toBe('fee_low');
    expect(s.validate({ ...base, tokenFee: s.balance(s.demoId, KSA_ASSET_ID) })?.code).toBe('ksa');
    expect(s.validate({ ...base, nonce: 0 })?.code).toBe('nonce_used');
    expect(s.validate({ ...base, path: 'C', account: s.shareAccountId })?.code).toBe('no_utxo');
    const est = s.estimateFee();
    expect(est.pathB.amount).toBeGreaterThanOrEqual(est.pathB.nodeMin);
    expect(est.pathB.producerMins.map((p) => p.name)).toEqual(s.producers.map((p) => p.name));
    expect(est.feerateSatVb).toBeGreaterThanOrEqual(PARAMS.MIN_SETTLEMENT_FEERATE);
    expect(est.pathC(300)).toBeGreaterThan(0);
    expect(est.pathC(300, 10)).toBeGreaterThan(est.pathC(300, 1));
    expect(s.opSize('B', base.action)).toBeLessThan(s.opSize('B', base.action, 'Bip322Simple'));
  });

  it('fee-rate spike: settlements stuck in the mempool, the backlog limit triggers; after CPFP via the P2A anchor, commit / reveal enter a block together', () => {
    const s = sim();
    s.setFeeSpike(true);
    expect(s.btcMinFeeRate).toBeGreaterThan(s.settlementFeeRate);
    // Wait until a settlement transaction is broadcast and stuck
    for (let i = 0; i < 40 && !s.pendingSettlements.length; i++) s.advanceTo(s.clock + 5 * SEC);
    expect(s.pendingSettlements.length).toBeGreaterThan(0);
    const stuck = s.pendingSettlements[0] as BtcTx;
    expect(s.canConfirm(stuck)).toBe(false);
    s.mineBtc(1);
    expect(stuck.status).toBe('broadcast');
    expect(s.btcMempool).toContain(stuck);
    // Backlog: after SETTLEMENT_TIMEOUT BTC blocks the fast path pauses; the blocks after that are empty or contain only forced inclusions
    for (let i = 0; i < PARAMS.SETTLEMENT_TIMEOUT + 1; i++) {
      s.advanceTo(s.clock + 10 * SEC);
      s.mineBtc(1);
    }
    expect(s.backlogStatus().triggered).toBe(true);
    const paused = s.blocks.length;
    for (let i = 0; i < 20 && s.blocks.length - paused < 2; i++) s.advanceTo(s.clock + 30 * SEC);
    const after = s.blocks.slice(paused);
    expect(after.length).toBeGreaterThan(0);
    for (const b of after) expect(b.entries.every((e) => e.entry.kind === 'Forced')).toBe(true);
    expect(s.mempool.length).toBeGreaterThan(0);

    // CPFP: the child spends the reveal transaction's P2A anchor, the package fee rate suffices, commit and reveal confirm together
    const n = s.cpfpStuck(s.demoId);
    expect(n).toBeGreaterThan(0);
    const child = s.btcMempool.find((t) => t.kind === 'cpfp' && t.parent === stuck.txid) as BtcTx;
    expect(child).toBeDefined();
    expect(child.inputs[0]).toMatchObject({ prevout: { txid: stuck.txid, vout: 0 }, role: 'anchor', scriptType: 'p2a' });
    expect(s.canConfirm(stuck)).toBe(true);
    const commit = s.getBtcTx(stuck.commitTxid ?? '') as BtcTx;
    expect(s.canConfirm(commit)).toBe(true);
    s.mineBtc(1);
    expect(stuck.status).toBe('confirmed');
    expect(commit.status).toBe('confirmed');
    expect(child.status).toBe('confirmed');
    expect(commit.confirmedHeight).toBe(stuck.confirmedHeight);
    const blk = s.getBtcBlock(stuck.confirmedHeight as number);
    expect(blk?.txids.indexOf(commit.txid)).toBeLessThan(blk?.txids.indexOf(stuck.txid) ?? -1);
    expect(blk?.txids.indexOf(stuck.txid)).toBeLessThan(blk?.txids.indexOf(child.txid) ?? -1);
    for (const id of stuck.bodies) expect(s.getBlock(id)?.settlementOnBtc?.txid).toBe(stuck.txid);

    // Once fees fall back the rest confirm one by one; during the backlog new blocks are empty (slower production) or forced-inclusion only, and the backlog clears after the settlement carrying the bodies reaches the broadcast depth and lands
    s.setFeeSpike(false);
    for (let i = 0; i < 40 && s.backlogStatus().triggered; i++) {
      s.advanceTo(s.clock + 10 * SEC);
      s.mineBtc(1);
    }
    expect(s.backlogStatus().triggered).toBe(false);
    s.advanceTo(s.clock + 20 * SEC);
    expect(s.tip.entries.some((e) => e.entry.kind === 'Sponsored')).toBe(true);
    // The "backlog cleared" alert is only raised after a "backlog" alert
    expect(s.events.some((e) => e.kind === 'alert' && e.text === t().sim.event.backlogOff)).toBe(true);
    checkInvariants(s);
  });

  it('producers exclude an account: the operation stays in the entry pool; resending the same nonce via path C gets it force-included and the original is dropped', () => {
    const s = sim();
    s.setCensored(s.demoId, true);
    const draft = transfer(s, s.demoId, s.faucetId, 100n * KSA_UNIT);
    const res = s.submit(draft);
    if (!res.ok) throw new Error(res.message);
    s.advanceTo(s.clock + 60 * SEC);
    const r = s.getOp(res.opId);
    expect(r?.blockHash).toBeUndefined();
    expect(s.mempool).toContain(r);
    // Path C bypasses the producers' entry pool, same nonce
    const native = s.submit(transfer(s, s.demoId, s.faucetId, 100n * KSA_UNIT, 'C', { nonce: res.op.nonce }));
    if (!native.ok) throw new Error(native.message);
    expect(native.op.nonce).toBe(res.op.nonce);
    s.mineBtc(1);
    s.advanceTo(s.clock + 15 * SEC);
    const rn = s.getOp(native.opId);
    expect(rn?.blockHash).toBeDefined();
    expect(rn?.result?.ok).toBe(true);
    expect(s.mempool).not.toContain(r);
    expect(r?.dropped).toBeDefined();
    expect(r?.blockHash).toBeUndefined();
    s.setCensored(s.demoId, false);
    checkInvariants(s);
  });

  it('producer offline: the settlement transaction it had built is rebuilt (commit / reveal pair) with funding from another producer and broadcast', () => {
    const s = sim({ seed: 11 });
    // Find the most recent block whose settlement transaction is not yet broadcast and take its producer offline
    const target = [...s.blocks].reverse().find((b) => b.settlementTxid && reveal(s, b.settlementTxid).status === 'built') as Block;
    expect(target).toBeDefined();
    const original = reveal(s, target.settlementTxid as Hex);
    const offline = target.header.producer;
    const offAt = s.clock;
    s.setProducerOffline(offline);
    s.advanceTo(s.clock + 60 * SEC);
    expect(original.status).toBe('replaced');
    expect(original.replacedBy).toBeDefined();
    const rescue = reveal(s, original.replacedBy as Hex);
    expect(rescue.kind).toBe('rescue');
    expect(rescue.forBlock).toBe(target.hash);
    expect(rescue.author).not.toBe(offline);
    expect(rescue.headers).toEqual(original.headers);
    expect(rescue.bodies).toEqual(original.bodies);
    expect(['broadcast', 'confirmed']).toContain(rescue.status);
    checkPair(s, rescue);
    expect(target.settlements).toEqual([original.txid, rescue.txid]);
    // The original commit transaction is voided too and its funding UTXO is released
    const brokenCommit = reveal(s, original.commitTxid as Hex);
    expect(brokenCommit.status).toBe('replaced');
    const u = s.getUtxos(offline).find((x) => x.outpoint.txid === brokenCommit.inputs[0]?.prevout.txid && x.outpoint.vout === brokenCommit.inputs[0]?.prevout.vout);
    expect(u?.spentBy).toBeUndefined();
    // No blocks are produced while offline
    const since = s.blocks.filter((b) => b.time > offAt);
    expect(since.every((b) => b.header.producer !== offline)).toBe(true);
    s.mineBtc(1);
    expect(rescue.status).toBe('confirmed');
    expect(target.settlementOnBtc?.txid).toBe(target.needsSettlement ? rescue.txid : target.settlementOnBtc?.txid);
    s.setProducerOffline(null);
    checkInvariants(s);
  });

  it('parallel blocks: merged by the next chain block, duplicate entries skipped, the rest executed in lenient mode', () => {
    const s = sim({ seed: 36, historyMs: 8 * MIN, parallelRate: 1 });
    const merged = s.sideBlocks.filter((b) => b.acceptedHeight !== undefined);
    expect(merged.length).toBeGreaterThan(20);
    let skipped = 0;
    let ran = 0;
    for (const b of merged) {
      const chain = s.blocks[b.acceptedHeight as number] as Block;
      expect(chain.merged).toContain(b.hash);
      expect(chain.header.parents).toContain(b.hash);
      expect(b.acceptedHeight).toBe(b.header.height + 1);
      for (const e of b.entries) {
        if (e.result.reason === 'skipped') {
          skipped++;
          if (e.entry.kind === 'Sponsored') {
            const r = s.getOp(e.entry.opId);
            // Only operations that appeared solely in parallel blocks record where they were skipped; ones executed elsewhere do not.
            // Such an operation waits in the entry pool to be included again until its nonce is used (D-063)
            if (!r?.blockHash) {
              expect(r?.skippedIn?.some((x) => x.block === b.hash)).toBe(true);
              expect(!!r?.requeued).toBe(!r?.dropped);
              expect(s.mempool.includes(r as OpRecord)).toBe(!r?.dropped);
            }
          }
        } else if (e.result.reason !== 'unaccepted') ran++;
      }
    }
    expect(skipped).toBeGreaterThan(0);
    expect(ran).toBeGreaterThan(0);
    // A parallel block's settlement transaction is broadcast SETTLEMENT_DEPTH blocks after the chain block that merges it
    const withPair = merged.filter((b) => b.settlementTxid);
    expect(withPair.length).toBeGreaterThan(0);
    const mergedBy = (e: { ref?: string }) => s.blocks.find((c) => c.hash === e.ref && c.merged.length > 0);
    expect(
      s.events.some((e) => {
        const chain = e.kind === 'fast_block' ? mergedBy(e) : undefined;
        return !!chain && e.text.startsWith(t().sim.event.merged(fmtInt(chain.header.height), chain.merged.length));
      }),
    ).toBe(true);
    checkInvariants(s);
    s.advanceTo(NOW + 2 * MIN);
    s.mineBtc(2);
    checkInvariants(s);
  });

  it('faucet: 5,000 KSA on the fast lane, 0.1 BTC on Bitcoin', () => {
    const s = sim({ historyMs: 3 * MIN, trafficPerSec: 0 });
    const me = s.shareAccountId;
    const before = s.balance(me, KSA_ASSET_ID);
    const { opId, txid } = s.faucet(me);
    expect(opId).toBeDefined();
    expect(txid).not.toBe('');
    expect(s.getUtxos(me)).toHaveLength(0);
    // Without background traffic empty blocks are slow and the chain may be in a settlement backlog; wait until the faucet transfer is included
    const r = s.getOp(opId as Hex);
    for (let i = 0; i < 40 && !r?.blockHash; i++) s.advanceTo(s.clock + 15 * SEC);
    expect(r?.result?.ok).toBe(true);
    // The share account also receives unlocked reward portions in the meantime
    expect(s.balance(me, KSA_ASSET_ID)).toBeGreaterThanOrEqual(before + 5_000n * KSA_UNIT);
    s.mineBtc(1);
    expect(s.getUtxos(me).map((u) => u.valueSat)).toEqual([10_000_000]);
    expect(s.getBtcTx(txid)?.kind).toBe('faucet');
    expect(s.getBtcTx(txid)?.status).toBe('confirmed');
  });
});
