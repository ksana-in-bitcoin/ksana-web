import { describe, expect, it } from 'vitest';
import { accountFromAddress, fromHex, isValidXOnlyPublicKey, scriptToAddress, toHex } from '@ksana/sdk';
import { Devnet, KSA_UNIT } from './sim/engine';
import { BTC_FINAL_DATA_CONFS, KSA_ASSET_ID, PARAMS } from './params';
import type { Chain } from './source';
import { currentLocale, LOCALES, setLocale, t } from '../i18n';
import { fmtAmount, shortHash } from '../lib/format';
import type { Block, BtcTx, Hex, IndexerCheck, OpRecord } from './types';
import { tallyCheck, type IndexerTally } from './model';
import { accountMiss, backlogLate, balancesOf, blockAhead, blockCounts, blockProgress, blocksEta, blockStage, BLOCK_TIME_GAPS, blockTime, btcBlockAt, btcBlockCarried, btcBlockSealed, btcExplorerUrl, carriedBlocks, finalityConfs, headerSpan, indexerLag, indexerStall, indexerState, indexerVouches, laneIdle, nativeAhead, nextBlockGap, nativeWaiting, networksText, opMilestone, opNews, opProgress, opStage, opStatusOf, opWhat, ownHeaderCarrier, pairFee, search, searchMiss, summarizeOp, txRoute, txTime, type Milestone, type Stage, type StepView } from './views';

const NOW = Date.UTC(2026, 9, 1, 8, 0, 0);

function sim() {
  return new Devnet({ seed: 33, now: NOW, historyMs: 12 * 60_000, trafficPerSec: 0 });
}

function freeUtxo(s: Devnet) {
  let u = s.getUtxos(s.demoId).find((x) => x.confirmedHeight !== null && !x.spentBy);
  if (!u) {
    s.faucet(s.demoId);
    s.mineBtc(1);
    u = s.getUtxos(s.demoId).find((x) => x.confirmedHeight !== null && !x.spentBy);
  }
  if (!u) throw new Error('no utxo');
  return u;
}

/** On a chain without background traffic empty blocks are slow (two-speed difficulty) and it may be in a settlement backlog: wait on a condition rather than for a fixed time */
function until(s: Devnet, cond: () => boolean, stepMs = 15_000, max = 60) {
  for (let i = 0; i < max && !cond(); i++) s.advanceTo(s.clock + stepMs);
  expect(cond()).toBe(true);
}

/** Produce blocks, broadcast settlements and mine BTC blocks until main-chain height h enters the settled closure */
function settleTo(s: Devnet, h: number) {
  for (let i = 0; i < 60 && s.settledHeight < h; i++) {
    s.advanceTo(s.clock + 10_000);
    s.mineBtc(1);
  }
  expect(s.settledHeight).toBeGreaterThanOrEqual(h);
}

describe('op progress (path-aware)', () => {
  it('path B: fast-confirmed first, six Bitcoin confirmations, BTC-final last, stages advance over time', () => {
    const s = sim();
    const res = s.submit({
      account: s.demoId,
      path: 'B',
      maxGas: 50_000,
      tokenFee: 10_000n,
      action: { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: s.faucetId, amount: 100n * KSA_UNIT },
    });
    if (!res.ok) throw new Error(res.message);
    const r = s.getOp(res.opId)!;

    let p = opProgress(s, r, s.clock);
    expect(p.steps.map((x) => x.key)).toEqual(['signed', 'included', 'broadcast', 'on_btc', 'deep', 'final']);
    expect(p.steps.find((x) => x.state === 'active')?.key).toBe('included');
    expect(p.status).toBe('pending');

    until(s, () => !!r.blockHash);
    p = opProgress(s, r, s.clock);
    expect(p.status).toBe('fast_confirmed');
    expect(p.steps[1]?.state).toBe('done');
    expect(p.fastLatency).toBeDefined();
    // The note names the block by its height and links it by its hash
    const inBlock = s.getBlock(r.blockHash!)!;
    expect(p.steps[1]?.ref).toEqual({ to: { name: 'block', id: inBlock.hash }, text: `#${inBlock.header.height.toLocaleString('en-US')}` });
    expect(p.steps[1]?.sub).toContain(p.steps[1]?.ref?.text);

    // The body lands on-chain with the settlement payload of this block or a later one: written to Bitcoin once in the settled closure.
    // The closure's BTC_FINALITY_CONFS confirmations are the milestone the page shows first; BTC final follows with its
    // BTC_FINAL_DATA_CONFS-th: determined at the BTC_FINALITY_CONFS-th, reported once the BTC block of that determination has
    // BTC_FINALITY_CONFS confirmations too (D-114), and counted by nothing on the page (D-116)
    const n = PARAMS.BTC_FINALITY_CONFS;
    const b = s.getBlock(r.blockHash!)!;
    settleTo(s, b.acceptedHeight!);
    p = opProgress(s, r, s.clock);
    expect(p.stage).toBe('on_btc');
    expect(p.steps[3]?.state).toBe('done');
    // The settlement is named by its ID, or by the block whose settlement carried the body; the BTC block by its height
    const sent = p.steps[2];
    expect(sent?.ref?.to.name).toBe(b.carrier && b.carrier !== b.hash ? 'block' : 'tx');
    expect(sent?.sub).toContain(sent?.ref?.text);
    expect(p.steps[3]?.ref).toEqual({ to: { name: 'btc', height: b.settlementOnBtc?.btcHeight }, text: p.steps[3]?.sub });
    const landed = finalityConfs(s, b).confs;
    expect(landed).toBeGreaterThan(0);
    expect(landed).toBeLessThan(n);
    expect(p.steps[4]).toMatchObject({ key: 'deep', state: 'active', sub: t().status.step.deepProgress(landed, n), ticks: { done: landed, total: n } });
    expect(p.steps[5]).toMatchObject({ key: 'final', state: 'todo', sub: t().status.step.finalTodo(n) });
    expect(p.steps[5]?.ticks).toBeUndefined();
    s.mineBtc(n - landed);
    p = opProgress(s, r, s.clock);
    expect(p.stage).toBe('deep');
    expect(p.status).toBe('fast_confirmed');
    expect(p.steps[4]).toMatchObject({ state: 'done', mark: 'deep', at: s.btcTip.time, ticks: { done: n, total: n } });
    expect(p.steps[5]).toMatchObject({ state: 'active', sub: t().status.step.finalSecuring });
    expect(p.steps[5]?.eta).toBeGreaterThan(0);
    expect(blockStage(s, b)).toBe('deep');
    s.mineBtc(BTC_FINAL_DATA_CONFS - 1 - n);
    p = opProgress(s, r, s.clock);
    expect(p.status).toBe('fast_confirmed');
    expect(p.steps[5]).toMatchObject({ state: 'active', sub: t().status.step.finalSecuring });
    // The BTC block that carried its body gets the seal only once that body is BTC-final
    const carriedIn = s.getBtcBlock(b.settlementOnBtc!.btcHeight)!;
    expect(btcBlockSealed(s, carriedIn)).toBe(false);
    s.mineBtc(1);
    p = opProgress(s, r, s.clock);
    expect(p.status).toBe('btc_final');
    expect(p.steps.every((x) => x.state === 'done')).toBe(true);
    expect(p.steps[5]).toMatchObject({ at: s.btcTip.time, sub: t().status.step.finalDone(n) });
    expect(p.steps[5]?.ticks).toBeUndefined();
    expect(p.steps[4]?.at).toBe(s.getBtcBlock(s.btcTip.height - BTC_FINAL_DATA_CONFS + n)?.time);
    expect(btcBlockSealed(s, carriedIn)).toBe(true);
    // BTC-final confirmations count from the closure of the chain block accepting this block, not from this block's own settlement
    const fin = finalityConfs(s, b);
    expect(fin.closure).toBe(s.blocks[b.acceptedHeight!]!.closureBtc);
    expect(fin.confs).toBe(BTC_FINAL_DATA_CONFS);

    // With the confirmations all there but BTC-final not reported yet, as when the determination waited (D-114): the op's step and
    // the block's wait and say for what, and the BTC block has no seal yet
    const reported = s.finalHeight;
    s.finalHeight = b.acceptedHeight! - 1;
    const waiting = { state: 'active', sub: t().status.step.finalWaiting };
    p = opProgress(s, r, s.clock);
    expect(p.status).toBe('fast_confirmed');
    expect(p.stage).toBe('deep');
    expect(p.steps[5]).toMatchObject(waiting);
    expect(blockProgress(s, b, s.clock).steps.find((x) => x.key === 'final')).toMatchObject(waiting);
    expect(btcBlockSealed(s, carriedIn)).toBe(false);
    s.finalHeight = reported;
    expect(blockProgress(s, b, s.clock).steps.find((x) => x.key === 'final')).toMatchObject({ state: 'done', sub: t().status.step.finalDone(n) });
    expect(blockProgress(s, b, s.clock).steps.find((x) => x.key === 'deep')).toMatchObject({ state: 'done', mark: 'deep', ticks: { done: n, total: n } });
  });

  it('path C: on Bitcoin first, then force-included', () => {
    const s = sim();
    freeUtxo(s);
    const res = s.submit({
      account: s.demoId,
      path: 'C',
      maxGas: 50_000,
      action: { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: s.faucetId, amount: 100n * KSA_UNIT },
    });
    if (!res.ok) throw new Error(res.message);
    const r = s.getOp(res.opId)!;
    let p = opProgress(s, r, s.clock);
    expect(p.steps.map((x) => x.key)).toEqual(['signed', 'native', 'included', 'on_btc', 'deep', 'final']);
    expect(p.steps[1]?.state).toBe('active');

    s.mineBtc(1);
    p = opProgress(s, r, s.clock);
    expect(p.steps[1]?.state).toBe('done');
    expect(p.steps[1]?.ref?.to).toEqual({ name: 'btc', height: s.getBtcTx(r.nativeTxid!)?.confirmedHeight });
    expect(p.steps[2]?.state).toBe('active');
    until(s, () => !!r.blockHash, 5_000);
    p = opProgress(s, r, s.clock);
    expect(p.steps[2]?.state).toBe('done');
    expect(p.steps[2]?.ref?.to).toEqual({ name: 'block', id: r.blockHash });
    expect(p.steps[2]?.sub?.startsWith(p.steps[2]?.ref?.text ?? '?')).toBe(true);
    expect(p.block?.entries[r.entryIndex ?? -1]?.entry.kind).toBe('Forced');
    expect(p.status).toBe('fast_confirmed');
  });

  it('a pending op expects the block with an entry, about TARGET_BLOCK_TIME, not the interval of the empty blocks of an idle lane (D-084)', () => {
    // Blocks minutes apart, as on an idle signet, where the median gap was 156 s
    const s = new Devnet({ seed: 33, now: NOW, historyMs: 12 * 60_000, trafficPerSec: 0, fastIntervalMs: 150_000 });
    const res = s.submit({ account: s.demoId, path: 'B', maxGas: 50_000, tokenFee: 10_000n, action: { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: s.faucetId, amount: KSA_UNIT } });
    if (!res.ok) throw new Error(res.message);
    const r = s.getOp(res.opId)!;
    const target = PARAMS.TARGET_BLOCK_TIME * 1000;
    // Sent a second after the latest block
    r.submittedAt = s.tip.time + 1000;
    const p = opProgress(s, r, r.submittedAt);
    expect(p.steps[1]).toMatchObject({ key: 'included', state: 'active', eta: target });
    expect(opProgress(s, r, r.submittedAt + target).steps[1]?.eta).toBe(0);
  });

  it('an op signed while a path C op of the account waits for BTC takes the nonce after it and waits for it, not for a producer (§7.4)', () => {
    const s = sim();
    freeUtxo(s);
    const action = { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: s.faucetId, amount: 100n * KSA_UNIT } as const;
    const c = s.submit({ account: s.demoId, path: 'C', maxGas: 50_000, action });
    if (!c.ok) throw new Error(c.message);
    const native = s.getOp(c.opId)!;
    const b = s.submit({ account: s.demoId, path: 'B', maxGas: 50_000, tokenFee: 10_000n, action });
    if (!b.ok) throw new Error(b.message);
    const r = s.getOp(b.opId)!;
    expect(r.op.nonce).toBe(native.op.nonce + 1);
    expect(nativeWaiting(s, s.demoId)).toBe(native);
    expect(nativeAhead(s, r)).toBe(native);
    expect(nativeAhead(s, native)).toBeUndefined();
    // Blocks that pass without it say nothing about the producers: no stall, and no switch to path C, which would wait the same
    const passed = s.blocks.slice(-4);
    r.submittedAt = (passed[0]?.time ?? 0) - 1;
    const p = opProgress(s, r, s.clock);
    expect(p.waitedBlocks).toBeGreaterThanOrEqual(3);
    expect(p.suggestNative).toBe(false);
    expect(p.steps[1]).toMatchObject({ key: 'included', state: 'active', sub: t().status.step.behindNative(String(native.op.nonce)), ref: { to: { name: 'op', id: native.id } } });
    expect(p.steps[1]?.stuck).toBeUndefined();
    expect(p.steps[1]?.eta).toBeGreaterThan(0);
    // Included right after it
    s.mineBtc(PARAMS.NATIVE_CONFIRMATIONS + PARAMS.ANCHOR_DEPTH);
    until(s, () => !!r.blockHash, 5_000);
    expect(native.blockHash).toBeDefined();
    expect(nativeWaiting(s, s.demoId)).toBeUndefined();
    expect(opProgress(s, r, s.clock).status).toBe('fast_confirmed');
  });

  it('parallel blocks: "awaiting merge" before the merge, and after it never in the settled closure earlier than the accepting chain block; an op skipped only in parallel blocks has status skipped', () => {
    const s = new Devnet({ seed: 36, now: NOW, historyMs: 8 * 60_000, parallelRate: 1 });
    const side = s.sideBlocks;
    const unmerged = side.filter((b) => b.acceptedHeight === undefined);
    for (const b of unmerged) expect(blockStage(s, b)).toBe('unmerged');
    const merged = side.filter((b) => b.acceptedHeight !== undefined);
    expect(merged.length).toBeGreaterThan(20);
    // With settlement batching a body may be carried by another block's payload, so the order of "settlement broadcast" no longer follows the order of the blocks; compare only settled and final
    const rank = { unmerged: -1, fast: 0, broadcast: 0, on_btc: 1, deep: 2, final: 3 } as Record<string, number>;
    for (const b of merged) {
      const chain = s.blocks[b.acceptedHeight!]!;
      expect(rank[blockStage(s, b)] ?? 0).toBeLessThanOrEqual(rank[blockStage(s, chain)] ?? 0);
    }
    for (const r of s.allOps()) {
      if (r.skippedIn?.length && !r.blockHash) expect(opStatusOf(s, r)).toBe('skipped');
      if (r.blockHash) expect(['fast_confirmed', 'btc_final', 'failed']).toContain(opStatusOf(s, r));
    }
  });

  it('block stages are monotonic: the earlier the block, the closer to eternity', () => {
    const s = new Devnet({ seed: 34, now: NOW, historyMs: 20 * 60_000 });
    // Settled and final are monotonic in main-chain height; the order of settlement broadcast is affected by batching (a body may be carried by a later block) and is not compared here
    const rank = { fast: 0, broadcast: 0, on_btc: 1, deep: 2, final: 3 } as Record<string, number>;
    let prev = 3;
    for (let h = 1; h < s.blocks.length; h++) {
      const st = blockStage(s, s.blocks[h]!);
      const v = rank[st] ?? 0;
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    // Among blocks with their own settlement transaction, settlement broadcast is monotonic too
    let seenFast = false;
    for (let h = 1; h < s.blocks.length; h++) {
      const b = s.blocks[h]!;
      if (!b.settlementTxid) continue;
      const st = blockStage(s, b);
      if (st === 'fast') seenFast = true;
      else if (st === 'broadcast') expect(seenFast).toBe(false);
    }
  });

  it('search: height, address, prefix and name', () => {
    const s = new Devnet({ seed: 35, now: NOW, historyMs: 10 * 60_000 });
    expect(search(s, '#5')[0]).toMatchObject({ kind: 'block', id: '5' });
    // As a Chinese or Japanese input method types it, full width
    expect(search(s, '\uff03\uff15')[0]).toMatchObject({ kind: 'block', id: '5' });
    // The address is the account (the bech32m spelling of the Taproot output key): any regtest P2TR address yields the account
    const addr = s.addressOf(s.demoId);
    expect(addr.startsWith('bcrt1p')).toBe(true);
    expect(search(s, addr)[0]).toMatchObject({ kind: 'account', id: s.demoId });
    expect(search(s, s.demoId)[0]).toMatchObject({ kind: 'account', id: s.demoId });
    const side = s.sideBlocks[0];
    if (side) expect(search(s, side.hash).some((h) => h.kind === 'block' && h.id === side.hash)).toBe(true);
    const tip = s.tip.hash;
    expect(search(s, tip.slice(0, 12)).some((h) => h.kind === 'block' && h.id === tip)).toBe(true);
    expect(search(s, 'devnet-2')[0]?.kind).toBe('account');
    expect(search(s, 'AMM')[0]?.kind).toBe('contract');
  });

  it('search: names in their order, not in the order the page came across them', () => {
    const labels = new Map([
      ['b2'.repeat(32), 'Producer 2'],
      ['ba'.repeat(32), 'Producer 10'],
      ['b1'.repeat(32), 'Producer 1'],
    ]);
    const chain = { ready: true, labels, assets: new Map(), isContract: () => false } as unknown as Chain;
    expect(search(chain, 'producer').map((h) => h.title)).toEqual(['Producer 1', 'Producer 2', 'Producer 10']);
  });
});

describe('a swap of the simulator’s pool', () => {
  /**
   * The demo account's two swaps, 26 and 9 minutes before now, in a history long enough for both (and the transfer that funds the
   * first), rather than whatever the random traffic happens to send
   */
  const demoSwaps = () => {
    const s = new Devnet({ seed: 33, now: NOW, historyMs: 40 * 60_000, trafficPerSec: 0 });
    return { s, swaps: [...s.allOps()].filter((r) => r.op.account === s.demoId && r.op.action.kind === 'Call' && r.op.action.contract === s.ammContract && r.op.action.method === 'swap') };
  };

  it('names what goes in by its amount and what comes out after it, each once', () => {
    const { s, swaps } = demoSwaps();
    const read = (r: OpRecord) => {
      const m = summarizeOp(s, r);
      return `${m.verb} ${m.amount?.asset.symbol} ${m.detail}`;
    };
    expect(swaps.map(read).sort()).toEqual(['Swap KSA → TKN', 'Swap TKN → KSA']);
  });

  it('is named so in the wallet’s notifications as well, in the order of each language (opWhat)', async () => {
    const { s, swaps } = demoSwaps();
    const shown = (v: bigint, decimals: number) => fmtAmount(v, decimals, { maxFrac: 4 });
    const named = () => swaps.map((r) => opWhat(summarizeOp(s, r), shown).replace(/\d[\d,.]*/, 'N')).sort();
    expect(named()).toEqual(['Swap N\u00a0KSA → TKN', 'Swap N\u00a0TKN → KSA']);
    // A hidden balance hides the amount alone
    expect(swaps.map((r) => opWhat(summarizeOp(s, r), () => '••••')).sort()).toEqual(['Swap ••••\u00a0KSA → TKN', 'Swap ••••\u00a0TKN → KSA']);
    // A claim has no amount: what it proves follows its verb
    expect(opWhat({ verb: 'Claim', detail: 'BTC #7 payment proof' }, shown)).toBe('Claim BTC #7 payment proof');
    const was = currentLocale();
    try {
      // Korean puts the verb last, after what the swap gives
      await setLocale('ko', false);
      const verb = t().status.verb.swap;
      expect(named()).toEqual([`N\u00a0KSA → TKN ${verb}`, `N\u00a0TKN → KSA ${verb}`]);
    } finally {
      await setLocale(was, false);
    }
  });
});

describe('balances', () => {
  it('KSA first, then the tokens by symbol in natural order: one symbol twice by name, then by ID', () => {
    const token = (id: string, symbol: string, name = symbol) => ({ id: id.repeat(32), symbol, name, decimals: 0, issuer: 'c0'.repeat(32) });
    const assets = [token('00', 'KSA', 'Ksana'), token('a1', 'Token 10'), token('a2', 'Token 9'), token('a3', 'Wizards', 'Wizards of the Coast'), token('a4', 'Wizards', 'Wizards Gold'), token('a6', 'Ñandú'), token('a5', 'Ñandú'), token('a7', 'abc')];
    const account = { id: 'ee'.repeat(32), nonce: 0, opIds: [], balances: new Map(assets.map((a) => [a.id, 1n])) };
    const chain = { peekAccount: () => account, assets: new Map(assets.map((a) => [a.id, a])) } as unknown as Chain;
    const order = balancesOf(chain, account.id).map((r) => `${r.asset.symbol} ${r.asset.name} ${r.asset.id.slice(0, 2)}`);
    expect(order).toEqual(['KSA Ksana 00', 'abc abc a7', 'Ñandú Ñandú a5', 'Ñandú Ñandú a6', 'Token 9 Token 9 a2', 'Token 10 Token 10 a1', 'Wizards Wizards Gold a4', 'Wizards Wizards of the Coast a3']);
  });
});

describe('an idle fast lane', () => {
  /** A main chain after the genesis block: `x` a block with an entry, `.` an empty one, oldest first */
  const lane = (pattern: string) => ({ blocks: [{ entries: [] }, ...[...pattern].map((c) => ({ entries: c === 'x' ? [{}] : [] }))] }) as unknown as Chain;

  it('most of the last 20 blocks empty, or the latest two', () => {
    expect(laneIdle(lane('x'.repeat(20)))).toBe(false);
    expect(laneIdle(lane('.'.repeat(11) + 'x'.repeat(9)))).toBe(true);
    // a single entry does not wake an idle lane
    expect(laneIdle(lane('.'.repeat(19) + 'x'))).toBe(true);
    // after a burst most of the last 20 are busy, and the latest two empty blocks say the lane has gone quiet
    expect(laneIdle(lane('.'.repeat(20) + 'x'.repeat(18) + '..'))).toBe(true);
    expect(laneIdle(lane('.'.repeat(20) + 'x'.repeat(18) + 'x.'))).toBe(false);
  });
});

describe("the block list's counts", () => {
  const block = (height: number, o: { empty?: boolean; merged?: number; side?: boolean } = {}) =>
    ({
      hash: `${o.side ? 's' : 'b'}${height}`,
      header: { height },
      entries: o.empty ? [] : [{}],
      merged: Array.from({ length: o.merged ?? 0 }, (_, i) => `s${height}-${i}`),
      ...(o.side ? { side: true } : {}),
    }) as unknown as Block;

  it('on a node, over the blocks loaded: the parallel blocks they merged, not a share of the whole chain', () => {
    // The newest 60 of a chain at #10,000, as the page loads them, and the genesis block; 3 of them merged a parallel block each
    const blocks: Block[] = [block(0)];
    for (let h = 9_941; h <= 10_000; h++) blocks[h] = block(h, { empty: h % 6 === 0, merged: h % 20 === 0 ? 1 : 0 });
    // A parallel block opened from a link, which no loaded block merged, is in the list but not counted
    const sideBlocks = [block(9_960, { side: true }), block(9_980, { side: true }), block(10_000, { side: true }), block(4_321, { side: true })];
    // The page said "3 parallel (0.0%)", dividing them by the whole chain: it now says "3 parallel (merged by the 60 loaded)"
    expect(blockCounts({ kind: 'rpc', blocks, sideBlocks, tip: blocks[10_000] } as unknown as Chain)).toMatchObject({ loaded: 60, empty: 10, parallel: 3 });
  });

  it('in the simulator, over the whole chain: every parallel block, and their share of all blocks, on the chain or parallel', () => {
    const blocks = Array.from({ length: 96 }, (_, h) => block(h, { empty: h % 2 === 1 }));
    const sideBlocks = Array.from({ length: 5 }, (_, i) => block(10 * (i + 1), { side: true }));
    expect(blockCounts({ kind: 'sim', blocks, sideBlocks } as unknown as Chain)).toEqual({ loaded: 95, empty: 48, parallel: 5, share: 0.05 });
    const s = sim();
    s.advanceTo(NOW + 30 * 60_000);
    expect(blockCounts(s)).toMatchObject({ loaded: s.tip.header.height, parallel: s.sideBlocks.length });
  });
});

describe('the block time', () => {
  const at = (height: number, time: number, merged = 0) =>
    ({ header: { height }, time, merged: Array.from({ length: merged }, (_, i) => `s${height}-${i}`) }) as unknown as Block;

  it('is the mean of the latest 36 gaps, oldest first, on the overview and the blocks page alike', () => {
    // A chain at #100 of blocks a minute apart, the latest ten 30 s apart, the tip merging two parallel blocks and #64 one: the blocks
    // page averaged all 99 gaps it held, where the overview took the latest 36
    const blocks: Block[] = [];
    let time = 0;
    for (let h = 0; h <= 100; h++) blocks[h] = at(h, (time += h > 90 ? 30_000 : 60_000), h === 100 ? 2 : h === 64 ? 1 : 0);
    const bt = blockTime({ blocks } as unknown as Chain);
    // The window the design and the progress notes name
    expect(BLOCK_TIME_GAPS).toBe(36);
    expect(bt.gaps).toHaveLength(BLOCK_TIME_GAPS);
    expect(bt.gaps.slice(0, 26)).toEqual(Array(26).fill(60_000));
    expect(bt.gaps.slice(26)).toEqual(Array(10).fill(30_000));
    expect(bt.mean).toBe((26 * 60_000 + 10 * 30_000) / 36);
    // The later block of each gap: the tip's two count, and #64's, the earlier block of the oldest gap, does not
    expect(bt.merged).toBe(2);
  });

  it('stops at the first block the page does not hold, as on a node that has read only the latest', () => {
    const blocks: Block[] = [at(0, 0)];
    for (let h = 9_995; h <= 10_000; h++) blocks[h] = at(h, h * 1_000);
    expect(blockTime({ blocks } as unknown as Chain)).toEqual({ gaps: [1_000, 1_000, 1_000, 1_000, 1_000], mean: 1_000, merged: 0 });
    // A chain of the genesis block and one more has no gap to give: the genesis block's time is when the network started
    expect(blockTime({ blocks: [at(0, 0), at(1, 5_000)] } as unknown as Chain)).toEqual({ gaps: [], mean: 0, merged: 0 });
  });

  it('with no gap to give, leaves the overview the label alone in every language, where it read "last 0 blocks"', async () => {
    const was = currentLocale();
    try {
      for (const { code } of LOCALES) {
        await setLocale(code, false);
        const label = t().overview.blockGap(0);
        expect(label, code).not.toMatch(/\d/);
        expect(t().overview.blockGap(36).startsWith(`${label} · `), code).toBe(true);
      }
    } finally {
      await setLocale(was, false);
    }
  });
});

describe('an older block on the node data source', () => {
  /** An empty block at `height`, accepted by itself, on a chain whose page has not loaded the transaction carrying its header */
  const older = (height: number) => {
    const block = { hash: 'ab'.repeat(32), header: { height, producer: 'cd'.repeat(32) }, time: NOW - 3 * 3_600_000, entries: [], needsSettlement: false, settlements: [], acceptedHeight: height, side: false } as unknown as Block;
    const chain = {
      finalHeight: 300,
      settledHeight: 317,
      blocks: Object.assign([], { [height]: block }),
      tip: { header: { height: 326 }, time: NOW },
      btcTip: { time: NOW },
      fastIntervalMs: 5_000,
      btcIntervalMs: 600_000,
      labels: new Map(),
      carriersOf: () => [],
      getBtcTx: () => undefined,
      getBtcBlock: () => undefined,
      canConfirm: () => true,
      btcConfs: () => 0,
    } as unknown as Chain;
    return blockProgress(chain, block, NOW);
  };

  it('final, its carrier and its closure unknown: its header waits for nothing, and its confirmations are all there', () => {
    const p = older(248);
    expect(p.stage).toBe('final');
    const carried = p.steps.find((s) => s.key === 'broadcast');
    expect(carried?.state).toBe('done');
    expect(carried?.sub).toBeUndefined();
    const n = PARAMS.BTC_FINALITY_CONFS;
    expect(p.steps.find((s) => s.key === 'deep')).toMatchObject({ state: 'done', mark: 'deep', ticks: { done: n, total: n } });
    expect(p.steps.find((s) => s.key === 'final')).toMatchObject({ state: 'done', sub: t().status.step.finalDone(n) });
  });

  it('not yet carried: its header waits for the next settlement, which nothing can count down to', () => {
    const p = older(326);
    expect(p.stage).toBe('fast');
    const step = p.steps.find((s) => s.key === 'broadcast');
    expect(step?.sub).toBe(t().status.step.awaitingCarrier);
    expect(step?.ticks).toBeUndefined();
    expect(step?.eta).toBeUndefined();
  });
});

describe('a BTC transaction’s time', () => {
  const chain = { getBtcBlock: (h: number) => (h === 326_983 ? { height: h, time: NOW - 600_000 } : undefined) } as unknown as Chain;
  const tx = (extra: Partial<BtcTx>) => ({ txid: 'tx', kind: 'settlement', status: 'confirmed', createdAt: NOW - 3_240_000, ...extra }) as BtcTx;

  it('is its BTC block’s once confirmed, not when it was built: a settlement read "54 min ago" beside the BTC block it confirmed in', () => {
    expect(txTime(chain, tx({ confirmedHeight: 326_983 }))).toBe(NOW - 600_000);
    expect(txTime(chain, tx({ status: 'broadcast' }))).toBe(NOW - 3_240_000);
    // Not the time it was built where the BTC block's is not known, or the height is only a bound
    expect(txTime(chain, tx({ confirmedHeight: 326_984 }))).toBeUndefined();
    expect(txTime(chain, tx({ confirmedHeight: 326_983, heightAtMost: true }))).toBeUndefined();
    // One the node gives by its ID only has no time of its own
    expect(txTime(chain, tx({ status: 'broadcast', partial: true }))).toBeUndefined();
  });
});

describe('a BTC transaction’s link (txRoute)', () => {
  const MAIN = 'aa'.repeat(32);
  const SIDE = 'bb'.repeat(32);
  const blocks: Record<string, Partial<Block>> = { [MAIN]: { header: { height: 1_899 } as Block['header'] }, [SIDE]: { header: { height: 1_900 } as Block['header'], side: true } };
  const txs: Record<string, Partial<BtcTx>> = { reveal: { forBlock: MAIN }, rescue: { forBlock: SIDE }, forced: { opId: 'in' }, waiting: { opId: 'out' }, gone: { forBlock: 'cc'.repeat(32) } };
  const ops: Record<string, Partial<OpRecord>> = { in: { blockHash: MAIN }, out: {} };
  const chain = { getBtcTx: (id: string) => txs[id], getBlock: (id: string) => blocks[id], getOp: (id: string) => ops[id] } as unknown as Chain;

  it('names the block that names the transaction, which a page opened anew reads for it: by height on the main chain, else by hash', () => {
    expect(txRoute(chain, 'reveal')).toEqual({ name: 'tx', id: 'reveal', block: '1899' });
    expect(txRoute(chain, 'rescue')).toEqual({ name: 'tx', id: 'rescue', block: SIDE });
    // A path C transaction, by the block that included its operation
    expect(txRoute(chain, 'forced')).toEqual({ name: 'tx', id: 'forced', block: '1899' });
    // One whose block the page dropped from its cache, by that block's hash
    expect(txRoute(chain, 'gone')).toEqual({ name: 'tx', id: 'gone', block: 'cc'.repeat(32) });
  });

  it('names none for a transaction no block names yet, or one the page does not know', () => {
    expect(txRoute(chain, 'waiting')).toEqual({ name: 'tx', id: 'waiting' });
    expect(txRoute(chain, 'unknown')).toEqual({ name: 'tx', id: 'unknown' });
  });
});

describe('estimates on an idle lane (D-084, D-090)', () => {
  /**
   * Block #500 holds the op and has its settlement built; the tip is #500 a second old, or the block `after` it; the next BTC block is
   * due in a minute. `interval` is the median gap of the latest blocks: 281 s on an idle signet, where most were empty and slow
   */
  const lane = ({ interval = 281_000, after = [] as number[], path = 'B' as 'B' | 'C' } = {}) => {
    const mk = (height: number, weight: number, time: number, extra = {}) =>
      ({ hash: height.toString(16).padStart(64, '0'), header: { height }, time, weight, entries: [], needsSettlement: false, settlements: [], acceptedHeight: height, side: false, merged: [], ...extra }) as unknown as Block;
    const block = mk(500, 1, NOW - 1_000 - after.length * 10_000, { needsSettlement: true, settlements: ['s500'] });
    const later = after.map((w, i) => mk(501 + i, w, NOW - 1_000 - (after.length - 1 - i) * 10_000));
    const all = [block, ...later];
    const tip = all[all.length - 1] as Block;
    const tx = { txid: 's500', kind: 'settlement', status: 'built', forBlock: block.hash, forHeight: 500 };
    const native = { txid: 'n1', kind: 'native', status: 'broadcast' };
    const chain = {
      kind: 'rpc',
      config: { chain: 'signet' },
      finalHeight: 480,
      settledHeight: 499,
      blocks: Object.assign([], Object.fromEntries(all.map((b) => [b.header.height, b]))),
      tip,
      btcTip: { time: NOW - 540_000 },
      fastIntervalMs: interval,
      btcIntervalMs: 600_000,
      labels: new Map(),
      getBlock: (h: string) => all.find((b) => b.hash === h),
      carriersOf: () => [],
      getBtcTx: (id: string) => (id === 's500' ? tx : id === 'n1' ? native : undefined),
      getBtcBlock: () => undefined,
      canConfirm: () => true,
      btcConfs: () => 0,
      pendingOf: () => [],
    } as unknown as Chain;
    const included = { id: 'op', path, origin: 'local', submittedAt: NOW - 7_000, blockHash: block.hash, height: 500, entryIndex: 0, result: { ok: true }, op: { account: 'aa'.repeat(32), nonce: 3 } };
    const pending = { ...included, blockHash: undefined, height: undefined, result: undefined, submittedAt: NOW - 1_000, ...(path === 'C' ? { nativeTxid: 'n1' } : {}) };
    return { chain, op: included as unknown as OpRecord, pending: pending as unknown as OpRecord };
  };
  const step = (p: { steps: StepView[] }, key: string) => p.steps.find((s) => s.key === key) as StepView;
  const MIN = 60_000;

  it('the settlement goes out after the two blocks after the op’s, empty at weights 12 and 24: about 1 and 2 minutes, not twice the latest interval', () => {
    const { chain, op } = lane();
    // 59 s left of the first, then 120 s: it read 281 s + 280 s
    expect(blocksEta(chain, 2, NOW)).toBe(59_000 + 2 * MIN);
    expect(step(opProgress(chain, op, NOW), 'broadcast')).toMatchObject({ state: 'active', ticks: { done: 0, total: PARAMS.SETTLEMENT_DEPTH }, eta: 59_000 + 2 * MIN });
    // One block later, at weight 12: the second, at weight 24, from the tip's time
    const one = lane({ after: [12] });
    expect(step(opProgress(one.chain, one.op, NOW), 'broadcast')).toMatchObject({ ticks: { done: 1, total: PARAMS.SETTLEMENT_DEPTH }, eta: 2 * MIN - 1_000 });
    // The status strip's clock fills over the next block's gap, at most the interval
    expect(nextBlockGap(one.chain)).toBe(2 * MIN);
    expect(nextBlockGap(lane({ after: [12, 24, 48, 96] }).chain)).toBe(281_000);
  });

  it('a settlement going out after the next BTC block lands in the one after it, and the confirmations count from there', () => {
    const { chain, op } = lane();
    const p = opProgress(chain, op, NOW);
    // The next BTC block is due in 1 min, the settlement goes in 3: it lands in 11 min, where it read 1 min
    expect(step(p, 'deep').eta).toBe(11 * MIN + (PARAMS.BTC_FINALITY_CONFS - 1) * 10 * MIN);
    expect(step(p, 'final').eta).toBe(11 * MIN + (BTC_FINAL_DATA_CONFS - 1) * 10 * MIN);
    // An op still waiting for its block: the same, from its block
    expect(step(opProgress(chain, lane().pending, NOW), 'deep').eta).toBe(11 * MIN + (PARAMS.BTC_FINALITY_CONFS - 1) * 10 * MIN);
  });

  it('on a busy lane the blocks come at the latest interval, and the settlement makes the next BTC block', () => {
    const { chain, op } = lane({ interval: 5_000 });
    expect(step(opProgress(chain, op, NOW), 'broadcast').eta).toBe(4_000 + 5_000);
    expect(step(opProgress(chain, op, NOW), 'deep').eta).toBe(MIN + (PARAMS.BTC_FINALITY_CONFS - 1) * 10 * MIN);
  });

  it('a path C op counts its transaction’s confirmations before its block, 2 on signet', () => {
    const { chain, pending } = lane({ path: 'C' });
    // Confirmed in 1 min and 11 min, forced in 5 s later, its settlement 3 min after that: in the BTC block 21 min from now
    expect(step(opProgress(chain, pending, NOW), 'deep').eta).toBe(21 * MIN + (PARAMS.BTC_FINALITY_CONFS - 1) * 10 * MIN);
  });
});

describe('a body that waited in the backlog (D-077)', () => {
  /**
   * Block #325 has an entry but carries no settlement: one was in flight when it was produced, so its body waits for a later block's
   * settlement. #328 carries it when `carrier` is given, in the settlement `status` gives; the tip is #329.
   */
  const backlogged = (status?: 'built' | 'broadcast', carrierLoaded = true) => {
    const carrier = { hash: 'c8'.repeat(32), header: { height: 328 }, settlements: ['tx'], acceptedHeight: 328 } as unknown as Block;
    const block = {
      hash: 'c5'.repeat(32),
      header: { height: 325, producer: 'cd'.repeat(32) },
      time: NOW - 60_000,
      entries: [],
      needsSettlement: true,
      settlements: [],
      ...(status ? { carrier: carrier.hash, carrierHeight: 328 } : {}),
      acceptedHeight: 325,
      side: false,
    } as unknown as Block;
    const tx = { txid: 'tx', kind: 'settlement', status, forBlock: carrier.hash, forHeight: 328 };
    const chain = {
      finalHeight: 300,
      settledHeight: 324,
      blocks: Object.assign([], { 325: block, 328: carrier }),
      tip: { header: { height: 329 }, time: NOW },
      btcTip: { time: NOW },
      fastIntervalMs: 5_000,
      btcIntervalMs: 600_000,
      labels: new Map(),
      getBlock: (h: string) => [block, ...(carrierLoaded ? [carrier] : [])].find((b) => b.hash === h),
      carriersOf: () => [],
      getBtcTx: (id: string) => (status && id === 'tx' ? tx : undefined),
      getBtcBlock: () => undefined,
      canConfirm: () => true,
      btcConfs: () => 0,
    } as unknown as Chain;
    const op = { id: 'op', path: 'B', origin: 'chain', submittedAt: NOW - 70_000, blockHash: block.hash, height: 325, entryIndex: 0, result: { ok: true } } as unknown as OpRecord;
    const step = (p: { steps: { key: string }[] }) => p.steps.find((s) => s.key === 'broadcast') as StepView;
    return { chain, block, block_: step(blockProgress(chain, block, NOW)), op_: step(opProgress(chain, op, NOW)) };
  };
  const st = () => t().status.step;

  it('before a later block carries it: it waits for that settlement, with no countdown by its own depth', () => {
    const { chain, block, block_, op_ } = backlogged();
    expect(blockStage(chain, block)).toBe('fast');
    for (const s of [block_, op_]) {
      expect(s).toMatchObject({ state: 'active', sub: st().awaitingCarrier });
      expect(s.ticks).toBeUndefined();
      expect(s.eta).toBeUndefined();
      expect(s.ref).toBeUndefined();
    }
  });

  it('carried by #328: it counts that block’s depth, and goes when that settlement does', () => {
    const built = backlogged('built');
    expect(blockStage(built.chain, built.block)).toBe('fast');
    for (const s of [built.block_, built.op_]) {
      expect(s).toMatchObject({ state: 'active', sub: st().carriedBy('328') + st().notYetBroadcast, ticks: { done: 1, total: PARAMS.SETTLEMENT_DEPTH } });
      expect(s.eta).toBe((PARAMS.SETTLEMENT_DEPTH - 2) * 5_000 + 5_000);
    }
    const sent = backlogged('broadcast');
    expect(blockStage(sent.chain, sent.block)).toBe('broadcast');
    for (const s of [sent.block_, sent.op_]) expect(s).toMatchObject({ state: 'done', sub: st().carriedBy('328') });
    for (const s of [built.block_, built.op_, sent.block_, sent.op_]) expect(s.ref).toEqual({ to: { name: 'block', id: 'c8'.repeat(32) }, text: '#328' });
  });

  it('carried by a block the page has not loaded: named by the height the node gives, with nothing to count', () => {
    const { block_, op_ } = backlogged('built', false);
    for (const s of [block_, op_]) {
      expect(s).toMatchObject({ state: 'active', sub: st().carriedBy('328') });
      expect(s.ticks).toBeUndefined();
      // Its page loads the block the link names
      expect(s.ref).toEqual({ to: { name: 'block', id: 'c8'.repeat(32) }, text: '#328' });
    }
  });

  it('a carrier without a body of its own: its header goes in the settlement it sends, which its page names by ID, not by its own height', () => {
    const txid = 'e1'.repeat(32);
    const carrier = { hash: 'c8'.repeat(32), header: { height: 328, producer: 'cd'.repeat(32) }, time: NOW - 5_000, entries: [], needsSettlement: false, settlements: [txid], acceptedHeight: 328, side: false } as unknown as Block;
    const sheet = (status: 'built' | 'broadcast', kind = 'settlement') => {
      const tx = { txid, kind, status, forBlock: carrier.hash, forHeight: 328 };
      const chain = {
        finalHeight: 300,
        settledHeight: 324,
        blocks: Object.assign([], { 328: carrier }),
        tip: { header: { height: 329 }, time: NOW },
        btcTip: { time: NOW },
        fastIntervalMs: 5_000,
        btcIntervalMs: 600_000,
        labels: new Map(),
        getBlock: (h: string) => (h === carrier.hash ? carrier : undefined),
        carriersOf: (h: string) => (h === carrier.hash ? [tx] : []),
        getBtcTx: (id: string) => (id === txid ? tx : undefined),
        getBtcBlock: () => undefined,
        canConfirm: () => true,
        btcConfs: () => 0,
      } as unknown as Chain;
      return blockProgress(chain, carrier, NOW).steps.find((s) => s.key === 'broadcast') as StepView;
    };
    const ref = { to: { name: 'tx', id: txid }, text: shortHash(txid, 6, 4) };
    expect(sheet('built')).toMatchObject({ state: 'active', sub: shortHash(txid, 6, 4) + st().notYetBroadcast, ref, ticks: { done: 1, total: PARAMS.SETTLEMENT_DEPTH } });
    expect(sheet('broadcast')).toMatchObject({ state: 'done', sub: shortHash(txid, 6, 4), ref });
    expect(sheet('broadcast', 'rescue')).toMatchObject({ state: 'done', sub: st().rebuilt(shortHash(txid, 6, 4)), ref });
  });

  it('a block carries its own header only without a body, in a settlement it sent', () => {
    const own = { hash: 'c8'.repeat(32), needsSettlement: false } as unknown as Block;
    const tx = (o: Partial<BtcTx>) => ({ txid: 'e1'.repeat(32), kind: 'settlement', status: 'broadcast', forBlock: own.hash, ...o }) as BtcTx;
    expect(ownHeaderCarrier(own, tx({}))).toBe(true);
    expect(ownHeaderCarrier(own, tx({ kind: 'rescue' }))).toBe(true);
    // A republish of its header, another block's settlement, no carrier yet, a block with a body
    expect(ownHeaderCarrier(own, tx({ kind: 'headers' }))).toBe(false);
    expect(ownHeaderCarrier(own, tx({ forBlock: 'c9'.repeat(32) }))).toBe(false);
    expect(ownHeaderCarrier(own, undefined)).toBe(false);
    expect(ownHeaderCarrier({ ...own, needsSettlement: true }, tx({}))).toBe(false);
  });
});

describe('BTC block pages', () => {
  it('with a node, every BTC height from the genesis anchor to the tip has a page, known to the page or not', () => {
    const known = { height: 120, hash: 'ab'.repeat(32), txids: ['cd'.repeat(32)] };
    const node = { kind: 'rpc', btcBase: 100, btcTip: { height: 130, hash: '', txids: [] }, getBtcBlock: (h: number) => (h === 120 ? known : undefined) } as unknown as Chain;
    expect(btcBlockAt(node, 120)).toBe(known);
    for (const h of [100, 121, 130]) expect(btcBlockAt(node, h)).toEqual({ height: h, hash: '', txids: [] });
    // Before the genesis anchor, past the tip
    expect(btcBlockAt(node, 99)).toBeUndefined();
    expect(btcBlockAt(node, 131)).toBeUndefined();
  });

  it('the simulator has a page for the BTC blocks it mined only', () => {
    const s = sim();
    const tip = s.btcTip.height;
    expect(btcBlockAt(s, tip)).toBe(s.getBtcBlock(tip));
    expect(btcBlockAt(s, tip + 1)).toBeUndefined();
    expect(btcBlockAt(s, s.btcBase - 1)).toBeUndefined();
    expect(search(s, String(tip)).some((h) => h.kind === 'btc_block' && h.id === String(tip))).toBe(true);
    expect(search(s, String(tip + 1)).some((h) => h.kind === 'btc_block')).toBe(false);
  });
});

describe('a search that finds nothing says why (searchMiss)', () => {
  /**
   * The signet's page: Ksana blocks to #2,409 and a parallel one at #2,411, and the BTC blocks it covers, from the genesis anchor at
   * 300,000 to the tip at 327,412
   */
  const signet = {
    kind: 'rpc',
    ready: true,
    network: 'signet',
    config: { chain: 'signet' },
    tip: { header: { height: 2409 } },
    btcBase: 300_000,
    btcTip: { height: 327_412 },
    getBtcBlock: () => undefined,
    sideAt: (n: number) => (n === 2411 ? [{ hash: 'ef'.repeat(32), header: { height: 2411 } }] : []),
    accountOfAddress: (address: string) => {
      try {
        return toHex(accountFromAddress(address, 'signet'));
      } catch {
        return undefined;
      }
    },
  } as unknown as Chain;
  const hash20 = new Uint8Array(20).fill(0xab);
  // A key an account has (secp256k1's generator), and 32 bytes that no key stands behind
  const key = fromHex('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
  const offCurve = new Uint8Array(32).fill(0xcd);
  const p2wpkh = Uint8Array.of(0x00, 0x14, ...hash20);
  const p2pkh = Uint8Array.of(0x76, 0xa9, 0x14, ...hash20, 0x88, 0xac);
  const p2sh = Uint8Array.of(0xa9, 0x14, ...hash20, 0x87);
  const p2tr = Uint8Array.of(0x51, 0x20, ...key);
  const keyless = Uint8Array.of(0x51, 0x20, ...offCurve);

  it('a height no block is at yet: past Ksana’s tip, and past Bitcoin’s too where no block of either chain is there', () => {
    expect(searchMiss(signet, '2410')).toEqual({ kind: 'aboveTip', tip: 2409 });
    // As an input method types it, full width; below the BTC blocks the page covers, where one of Bitcoin's may well be
    expect(searchMiss(signet, '\uff12\uff14\uff11\uff10')).toEqual({ kind: 'aboveTip', tip: 2409 });
    expect(searchMiss(signet, '#5,000')).toEqual({ kind: 'aboveTip', tip: 2409 });
    expect(searchMiss(signet, '#400,000')).toEqual({ kind: 'aboveTip', tip: 2409, btcTip: 327_412 });
    // A block of one chain or the other, or a parallel block above the main chain's tip, which the search lists
    for (const q of ['2409', '0', '300000', '327412', '2411']) expect(searchMiss(signet, q)).toBeUndefined();
  });

  it('a block’s page for a height no block is at yet gives the tip; an account’s page for a height says nothing of it', () => {
    expect(blockAhead(signet, '2410')).toBe(2409);
    expect(blockAhead(signet, '99999999')).toBe(2409);
    // At or below the tip, at a parallel block's height, or a hash: the node's own answer stands
    for (const id of ['2409', '0', '2411', 'ab'.repeat(32)]) expect(blockAhead(signet, id)).toBeUndefined();
    expect(accountMiss(signet, '2410')).toBeUndefined();
    const address = scriptToAddress(p2wpkh, 'signet');
    expect(accountMiss(signet, address)).toEqual({ kind: 'notTaproot', address });
  });

  it('a Bitcoin address of the page’s network that is not a Taproot one, with its page on a public explorer', () => {
    for (const script of [p2wpkh, p2pkh, p2sh]) {
      const address = scriptToAddress(script, 'signet');
      expect(searchMiss(signet, ` ${address} `)).toEqual({ kind: 'notTaproot', address });
      expect(btcExplorerUrl(signet, 'address', address)).toBe(`https://mempool.space/signet/address/${address}`);
    }
    expect(btcExplorerUrl(signet, 'address', 'devnet-1')).toBeUndefined();
    // Spelled in capitals, a bech32 address is linked in lower case; one of another network is not linked
    const upper = scriptToAddress(p2wpkh, 'signet').toUpperCase();
    expect(btcExplorerUrl(signet, 'address', upper)).toBe(`https://mempool.space/signet/address/${upper.toLowerCase()}`);
    for (const net of ['mainnet', 'regtest'] as const) expect(btcExplorerUrl(signet, 'address', scriptToAddress(p2wpkh, net))).toBeUndefined();
    // The simulator's regtest has no public explorer
    const s = sim();
    const regtest = scriptToAddress(p2wpkh, 'regtest');
    expect(searchMiss(s, regtest)).toEqual({ kind: 'notTaproot', address: regtest });
    expect(btcExplorerUrl(s, 'address', regtest)).toBeUndefined();
  });

  it('a Bitcoin address of another network, Taproot or not', () => {
    expect(searchMiss(signet, scriptToAddress(p2tr, 'mainnet'))).toEqual({ kind: 'otherNetwork', networks: ['mainnet'] });
    expect(searchMiss(signet, scriptToAddress(p2wpkh, 'regtest'))).toEqual({ kind: 'otherNetwork', networks: ['regtest'] });
    // The simulator runs on regtest: a tb1 address is of testnet or signet
    expect(searchMiss(sim(), scriptToAddress(p2tr, 'signet'))).toEqual({ kind: 'otherNetwork', networks: ['testnet', 'signet'] });
  });

  it('a Taproot address of the page’s network that no key stands behind, with its page on a public explorer', () => {
    expect(isValidXOnlyPublicKey(offCurve)).toBe(false);
    const address = scriptToAddress(keyless, 'signet');
    expect(search(signet, address)).toEqual([]);
    expect(searchMiss(signet, address)).toEqual({ kind: 'noKey', address });
    expect(accountMiss(signet, address)).toEqual({ kind: 'noKey', address });
    expect(btcExplorerUrl(signet, 'address', address)).toBe(`https://mempool.space/signet/address/${address}`);
  });

  it('nothing for an account, a hash, a name or a word, which say nothing of why', () => {
    expect(isValidXOnlyPublicKey(key)).toBe(true);
    const s = sim();
    for (const q of [scriptToAddress(p2tr, 'signet'), 'ab'.repeat(32), 'devnet-1', 'hello', '']) expect(searchMiss(signet, q)).toBeUndefined();
    expect(searchMiss(s, s.addressOf(s.demoId))).toBeUndefined();
  });

  it('joins the networks an address is for in each language', async () => {
    const or = () => [['mainnet'], ['testnet', 'signet'], ['testnet', 'signet', 'regtest']].map(networksText);
    expect(or()).toEqual(['mainnet', 'testnet or signet', 'testnet, signet or regtest']);
    const was = currentLocale();
    try {
      const joined = { es: ' o ', ja: ' \u307e\u305f\u306f ', ko: ' \ub610\ub294 ', 'zh-CN': ' \u6216 ', 'zh-TW': ' \u6216 ' } as const;
      for (const [lang, word] of Object.entries(joined)) {
        await setLocale(lang as keyof typeof joined, false);
        const comma = lang === 'ja' || lang.startsWith('zh') ? '\u3001' : ', ';
        expect(or()).toEqual(['mainnet', `testnet${word}signet`, `testnet${comma}signet${word}regtest`]);
      }
    } finally {
      await setLocale(was, false);
    }
  });
});

describe('the blocks a payload carries', () => {
  // #1,748 and the parallel #1,749′ are loaded; #1,744 to #1,747 are not, older than the page's window
  const loaded = [['b1748', 1748, false], ['b1749', 1749, true]].map(([hash, height, side]) => ({ hash, header: { height }, side }) as unknown as Block);
  const chain = { getBlock: (h: string) => loaded.find((b) => b.hash === h) } as unknown as Chain;
  const headers = ['b1744', 'b1745', 'b1746', 'b1747', 'b1748', 'b1749'];

  it('names a block the page has not loaded by the height its header in the payload gives (node data source)', () => {
    const tx = { headers, headerHeights: [1744, 1745, 1746, 1747, 1748, 1749], bodies: ['b1744', 'b1749'] } as unknown as BtcTx;
    expect(carriedBlocks(chain, tx).map((b) => b.height)).toEqual([1744, 1745, 1746, 1747, 1748, 1749]);
    expect(carriedBlocks(chain, tx, tx.bodies)).toEqual([
      { hash: 'b1744', height: 1744, side: false },
      { hash: 'b1749', height: 1749, side: true },
    ]);
    expect(headerSpan(chain, tx)).toBe(t().status.spanWithSide(t().status.span('#1,744', t().status.sideBlock('1,749')), 1));
  });

  it('without the heights (the simulator, which has every block), only by the blocks loaded', () => {
    const tx = { headers, bodies: [] } as unknown as BtcTx;
    expect(carriedBlocks(chain, tx).map((b) => b.hash)).toEqual(['b1748', 'b1749']);
    expect(headerSpan(chain, { headers: ['b1744'], bodies: [] } as unknown as BtcTx)).toBe('');
  });

  it("a BTC block's page gives every header and body its payloads carry, each once, by height", () => {
    // BTC #500 holds #1,749′'s settlement and its commit, a republish of #1,746's header, and a rescue the node gives by its ID only,
    // found for #1,748's body
    const txs: Record<string, Partial<BtcTx>> = {
      commit: { kind: 'commit', forBlock: 'b1749', headers: [], bodies: [] },
      reveal: { kind: 'settlement', forBlock: 'b1749', headers: headers.slice(2), headerHeights: [1746, 1747, 1748, 1749], bodies: ['b1747', 'b1749'] },
      republish: { kind: 'headers', headers: ['b1746'], headerHeights: [1746], bodies: [] },
      rescue: { kind: 'rescue', partial: true, forBlock: 'b1748', headers: [], bodies: ['b1748'] },
    };
    const sim = { ...chain, getBlock: chain.getBlock, getBtcTx: (id: string) => txs[id] } as unknown as Chain;
    const { headers: hs, bodies } = btcBlockCarried(sim, { height: 500, hash: '', txids: ['commit', 'reveal', 'republish', 'rescue'] });
    expect(hs.map((b) => b.height)).toEqual([1746, 1747, 1748, 1749]);
    expect(bodies.map((b) => b.height)).toEqual([1747, 1748, 1749]);
    expect(bodies.map((b) => b.side)).toEqual([false, false, true]);
  });
});

describe("a BTC block's vermilion seal", () => {
  /**
   * BTC block #500 can hold a settlement for chain block #50 with the headers of #49 and #50 and the body of #50; a republish of the
   * headers of P, a parallel block #52 accepts, of S, which no chain block accepts, and of a block the page has not loaded; and the
   * native transaction of a path C op that #53 includes. `final` is the BTC-final height, `confs` the confirmations of #500
   */
  const sealed = (txids: string[], final: number, confs = BTC_FINAL_DATA_CONFS) => {
    const blocks = [['49', 49], ['50', 50], ['p', 52], ['s', undefined], ['w', 53]].map(([hash, acceptedHeight]) => ({ hash, acceptedHeight }) as unknown as Block);
    const txs: Record<string, Partial<BtcTx>> = {
      settlement: { kind: 'settlement', forBlock: '50', headers: ['49', '50'], bodies: ['50'] },
      republish: { kind: 'headers', headers: ['p', 's', 'gone'], bodies: [] },
      native: { kind: 'native', opId: 'op', headers: [], bodies: [] },
    };
    const chain = {
      finalHeight: final,
      btcConfs: (h: number) => (h === 500 ? confs : 0),
      getBtcTx: (id: string) => txs[id],
      getBlock: (h: string) => blocks.find((b) => b.hash === h),
      getOp: (id: string) => (id === 'op' ? { blockHash: 'w' } : undefined),
    } as unknown as Chain;
    return btcBlockSealed(chain, { height: 500, hash: '', txids });
  };

  it('once every block it carries data for is BTC-final, so with a node once the node reports it (D-114), and never before the confirmations', () => {
    expect(sealed(['settlement'], 50)).toBe(true);
    expect(sealed(['settlement'], 49)).toBe(false);
    expect(sealed(['settlement'], 50, BTC_FINAL_DATA_CONFS - 1)).toBe(false);
  });

  it('a republish waits for the blocks a chain block accepts, not for one none accepts or the page has not loaded', () => {
    expect(sealed(['republish'], 51)).toBe(false);
    expect(sealed(['republish'], 52)).toBe(true);
  });

  it('a path C op is not its data: the op shows its own stage, by the block that includes it', () => {
    expect(sealed(['native'], 0)).toBe(true);
    expect(sealed(['settlement', 'republish', 'native'], 51)).toBe(false);
    expect(sealed(['settlement', 'republish', 'native'], 52)).toBe(true);
  });

  it('without Ksana data the page knows of: the confirmations alone', () => {
    expect(sealed([], 0)).toBe(true);
    expect(sealed(['unknown'], 0)).toBe(true);
    expect(sealed([], 0, BTC_FINAL_DATA_CONFS - 1)).toBe(false);
  });
});

describe('the settlement backlog reading late', () => {
  const late = (chain: Partial<Chain>, waited: number) => backlogLate(chain as Chain, { waited });

  it('past what settlements in step with Bitcoin reach: 1 + ANCHOR_DEPTH, so on signet from 3, not at the 2 the strip warned of', () => {
    const signet = { kind: 'rpc', config: { chain: 'signet' } } as unknown as Partial<Chain>;
    expect(late(signet, 2)).toBe(false);
    expect(late(signet, 3)).toBe(true);
    // The simulator and devnet anchor at the BTC tip (ANCHOR_DEPTH 0)
    expect(late({ kind: 'sim' } as unknown as Partial<Chain>, 1)).toBe(false);
    expect(late({ kind: 'sim' } as unknown as Partial<Chain>, 2)).toBe(true);
    expect(late({ kind: 'rpc', config: { chain: 'devnet' } } as unknown as Partial<Chain>, 2)).toBe(true);
  });

  it('says a block on Bitcoin above the anchor is on Bitcoin, with the confirmations at which it leaves the backlog', () => {
    const o = t().overview;
    expect(o.backlogLanded('#1,890', 2)).toBe('Oldest data: #1,890 · on Bitcoin; leaves the backlog at 2\u00a0confirmations');
  });

  it('names the oldest data off Bitcoin, not the oldest block: it read "Oldest not on Bitcoin: #1,955" while empty blocks before it waited too', () => {
    expect(t().overview.backlogOldest('#1,955')).toBe('Oldest data not on Bitcoin: #1,955');
  });
});

describe('the indexer trailing the tip', () => {
  const lag = (tip: number, settled: number, indexer: number) => indexerLag({ tip: { header: { height: tip } }, settledHeight: settled, indexerHeight: indexer } as unknown as Chain);
  const say = (tip: number, settled: number, indexer: number) => {
    const l = lag(tip, settled, indexer);
    return t().verify.lag(l.blocks, l.unwritten, PARAMS.SETTLEMENT_DEPTH);
  };

  it('tells the newest blocks not yet written to Bitcoin from those written that wait for the blocks after them', () => {
    // The signet as it stood: tip #674, settled #672, the indexer at #670; #671 and #672 are on Bitcoin, which the page said they were not
    expect(lag(674, 672, 670)).toEqual({ blocks: 4, unwritten: 2 });
    expect(say(674, 672, 670)).toBe('The indexer trails the tip by 4\u00a0blocks: the newest 2\u00a0are not yet written to Bitcoin, and it runs a block once the 2\u00a0after it are written too.');
    expect(say(673, 672, 670)).toBe('The indexer trails the tip by 3\u00a0blocks: the newest is not yet written to Bitcoin, and it runs a block once the 2\u00a0after it are written too.');
    // Every block above the indexer still to be written, as where BTC-final blocks need no blocks after them
    expect(lag(674, 670, 670)).toEqual({ blocks: 4, unwritten: 4 });
    expect(say(674, 670, 670)).toBe('The indexer trails the tip by 4\u00a0blocks not yet written to Bitcoin.');
    expect(say(671, 670, 670)).toBe('The indexer trails the tip by 1\u00a0block not yet written to Bitcoin.');
    // Every one written
    expect(say(672, 672, 670)).toBe('The indexer trails the tip by 2\u00a0blocks: it runs a block once the 2\u00a0after it are written to Bitcoin too.');
    // An indexer that has seen settlements the page has yet to read: as many to be written as the page knows of, no more than the lag
    expect(lag(674, 668, 670)).toEqual({ blocks: 4, unwritten: 4 });
    // At the tip, or past a node that is behind: nothing to say
    expect(lag(674, 672, 674).blocks).toBe(0);
    expect(lag(670, 668, 672)).toEqual({ blocks: 0, unwritten: 0 });
  });
});

describe('what a settlement paid (D-081)', () => {
  it('its commit and reveal transactions together, or the reveal transaction’s fee alone where the page does not know the commit’s', () => {
    const s = sim();
    const reveal = [...s.allBtcTxs()].find((x) => x.kind === 'settlement' && x.commitTxid);
    const commit = reveal?.commitTxid ? s.getBtcTx(reveal.commitTxid) : undefined;
    if (reveal?.feeSat === undefined || commit?.feeSat === undefined) throw new Error('no settlement with its fees');
    const feeSat = commit.feeSat + reveal.feeSat;
    const vsize = commit.vsize + reveal.vsize;
    expect(pairFee(s, reveal)).toEqual({ feeSat, feeRate: Math.round((feeSat / vsize) * 100) / 100, vsize, parts: { commit: commit.feeSat, reveal: reveal.feeSat }, revealOnly: false });
    // The simulator pays both at one fee rate, rounded up for each transaction
    expect(pairFee(s, reveal).feeRate).toBeCloseTo(commit.feeRate ?? 0, 1);
    // The node data source, where the commit spends an output the page has not read
    const unread = { getBtcTx: (id: string) => (id === commit.txid ? { ...commit, feeSat: undefined, feeRate: undefined } : s.getBtcTx(id)) } as unknown as Chain;
    expect(pairFee(unread, reveal)).toEqual({ feeSat: reveal.feeSat, feeRate: reveal.feeRate, vsize: reveal.vsize, revealOnly: true });
    // A transaction given by its ID only: nothing known, nothing said of the commit
    expect(pairFee(unread, { ...reveal, feeSat: undefined, feeRate: undefined })).toEqual({ vsize: reveal.vsize, revealOnly: false });
    // Not half of a pair: its own fee
    const single: BtcTx = { ...reveal, kind: 'cpfp', commitTxid: undefined, feeSat: 500, feeRate: 3.5, vsize: 143 };
    expect(pairFee(s, single)).toEqual({ feeSat: 500, feeRate: 3.5, vsize: 143, revealOnly: false });
  });
});

describe('the indexer check', () => {
  const blocks = Array.from({ length: 11 }, (_, h) => ({ hash: `b${h}`, header: { height: h } }) as unknown as Block);
  const check = (height: number, o: { root?: string; nodeHash?: string } = {}): IndexerCheck => ({
    height,
    hash: `b${height}`,
    ...(o.nodeHash ? { nodeHash: o.nodeHash } : {}),
    nodeRoot: 'aa',
    indexerRoot: o.root ?? 'aa',
    at: 0,
  });
  const chain = (checks: IndexerCheck[], o: { error?: string; halted?: string; off?: boolean } = {}) =>
    ({ kind: 'rpc', hasIndexer: !o.off, indexerHalted: o.halted ?? null, indexerError: o.error ?? null, indexerChecks: checks, blocks }) as unknown as Chain;
  const vouched = (sim: Chain) => blocks.filter((b) => indexerVouches(sim, b)).map((b) => b.header.height);

  it('says nothing matches before a check has: none made, or the indexer not answering', () => {
    expect(indexerState(chain([]))).toBe('none');
    expect(indexerState(chain([], { error: 'Failed to fetch' }))).toBe('unreachable');
    // A check made before the indexer stopped answering does not speak for now
    expect(indexerState(chain([check(8)], { error: 'Failed to fetch' }))).toBe('unreachable');
    expect(indexerState(chain([], { off: true }))).toBe('off');
    expect(indexerState(chain([check(8)], { halted: 'invalid finalized block' }))).toBe('halted');
    expect(indexerState(chain([check(7), check(8)]))).toBe('ok');
    expect(indexerState(chain([check(7, { root: 'bb' }), check(8)]))).toBe('mismatch');
    expect(indexerState(chain([check(7, { nodeHash: 'x7' }), check(8)]))).toBe('forked');
    expect(vouched(chain([]))).toEqual([]);
  });

  it('vouches for a chain block by the latest check at or above it, of the block the node’s chain still has there, if it matched', () => {
    expect(vouched(chain([check(8)]))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // A mismatch at the latest check vouches for nothing, whatever matched before it
    expect(vouched(chain([check(9), check(8, { root: 'bb' })]))).toEqual([]);
    // The indexer's block at #8 is not the node's
    expect(vouched(chain([check(8, { nodeHash: 'x8' })]))).toEqual([]);
    // A parallel block is not on the chain the check followed
    expect(indexerVouches(chain([check(8)]), { ...blocks[5], side: true } as Block)).toBe(false);
    // The node's chain no longer has the checked block at #8
    const moved = { ...(chain([check(8)]) as object), blocks: blocks.map((b) => (b.header.height === 8 ? { ...b, hash: 'other' } : b)) } as unknown as Chain;
    expect(vouched(moved)).toEqual([]);
  });

  it('tells a block the indexer could have run and has not: its data, and the headers of the blocks after it, on Bitcoin two BTC blocks below what it scanned', () => {
    // #5's closure on BTC #100, the headers of the SETTLEMENT_DEPTH blocks after it on by #101; nothing known to have landed above them
    const last = 5 + PARAMS.SETTLEMENT_DEPTH;
    const landed = blocks.map((b) => {
      const h = b.header.height;
      return h > last ? b : ({ ...b, closureBtc: 100, headerOnBtc: { txid: 'tx', btcHeight: h <= 5 ? 100 : 101 } } as Block);
    });
    const at = (indexerHeight: number, indexerBtcHeight: number, checks = [check(indexerHeight)]) =>
      ({ ...(chain(checks) as object), blocks: landed, indexerHeight, indexerBtcHeight }) as unknown as Chain;
    expect(indexerStall(at(4, 103))).toEqual({ height: 5, since: 101 });
    expect(indexerState(at(4, 103))).toBe('stalled');
    // A BTC block sooner, the indexer's round may not have run it yet
    expect(indexerStall(at(4, 102))).toBeUndefined();
    expect(indexerState(at(4, 102))).toBe('ok');
    // #6 needs a header the page does not know to be on Bitcoin
    expect(indexerStall(at(5, 110))).toBeUndefined();
    // Nothing is known of what the indexer scanned
    expect(indexerStall(at(4, 0))).toBeUndefined();
    // Another chain at a check is told first
    expect(indexerState(at(4, 103, [check(4, { nodeHash: 'x4' })]))).toBe('forked');
  });

  it('counts every check, so that a mismatch the recent ones have let go of is still told', () => {
    const tally: IndexerTally = { count: 0, failed: 0, lastFailed: null };
    const bad = check(3, { root: 'bb' });
    const other = check(5, { nodeHash: 'x5' });
    for (const c of [check(1), check(2), bad, check(4)]) tallyCheck(tally, c);
    expect(tally).toEqual({ count: 4, failed: 1, lastFailed: bad });
    tallyCheck(tally, other);
    expect(tally).toEqual({ count: 5, failed: 2, lastFailed: other });
  });
});

describe("the notifications about an operation sent from the wallet (opNews, opMilestone)", () => {
  /** What is announced along the marks the wallet sees one after another (`opStage`) */
  const news = (stages: Stage[]) => {
    const out: Milestone[] = [];
    let prev: Stage | undefined;
    for (const stage of stages) {
      out.push(...opMilestone(prev, stage));
      prev = stage;
    }
    return out;
  };

  it('each milestone once on the way to BTC final; a first sight of a pending op is not news', () => {
    expect(news(['pending', 'fast', 'broadcast', 'on_btc', 'deep', 'final'])).toEqual(['fast', 'on_btc', 'deep', 'final']);
    // Included and its settlement broadcast between two looks: the inclusion is still announced
    expect(news(['pending', 'broadcast', 'on_btc'])).toEqual(['fast', 'on_btc']);
    expect(opMilestone(undefined, 'pending')).toEqual([]);
  });

  it('an operation whose execution failed is announced once, as failed, when it is included, and none of its block\'s stages after it', () => {
    const s = sim();
    const send = (asset: string) => {
      const res = s.submit({ account: s.demoId, path: 'B', maxGas: 50_000, tokenFee: 10_000n, action: { kind: 'AssetTransfer', asset, to: s.faucetId, amount: 100n * KSA_UNIT } });
      if (!res.ok) throw new Error(res.message);
      return s.getOp(res.opId)!;
    };
    // A transfer of an asset that does not exist is included, and fails
    const ok = send(KSA_ASSET_ID);
    const bad = send('ee'.repeat(32));
    const heard = new Map<Hex, Milestone[]>([[ok.id, []], [bad.id, []]]);
    const seen = new Map<Hex, Stage>();
    /** A look of the wallet's watcher at both ops: what it announces is what `opNews` finds, as `OpWatcher` asks it */
    const look = () => {
      for (const r of [ok, bad]) heard.get(r.id)?.push(...(opNews(s, r, seen)?.news ?? []));
    };
    look();
    until(s, () => {
      look();
      return !!ok.blockHash && !!bad.blockHash;
    });
    expect(opStatusOf(s, bad)).toBe('failed');
    // Settled, six BTC confirmations and BTC final, a BTC block at a time
    for (let i = 0; i < 60 && opStage(s, ok) !== 'final'; i++) {
      s.advanceTo(s.clock + 10_000);
      s.mineBtc(1);
      look();
    }
    expect(opStage(s, ok)).toBe('final');
    expect(heard.get(ok.id)).toEqual(['fast', 'on_btc', 'deep', 'final']);
    // The failed op's block went the same way: the op's page shows it, its notifications do not
    expect(opProgress(s, bad, s.clock).stage).toBe('final');
    expect(opStage(s, bad)).toBe('failed');
    expect(heard.get(bad.id)).toEqual(['failed']);
    // Long BTC-final, its block left the page's cache: read without it, the op is pending and its BTC final taken back. No news, the mark stays
    const uncached = new Proxy(s, { get: (o, k) => (k === 'getBlock' ? (h: Hex) => (h === ok.blockHash ? undefined : o.getBlock(h)) : Reflect.get(o, k)) });
    expect(opNews(uncached, ok, seen)?.news).toBeUndefined();
    expect(seen.get(ok.id)).toBe('final');
  });

  it('an amount in an asset the node has yet to name is no news until it is named, then announced by its name (opNews)', () => {
    const s = sim();
    const res = s.submit({ account: s.demoId, path: 'B', maxGas: 50_000, tokenFee: 10_000n, action: { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: s.faucetId, amount: 100n * KSA_UNIT } });
    if (!res.ok) throw new Error(res.message);
    const r = s.getOp(res.opId)!;
    const ksa = s.assets.get(KSA_ASSET_ID)!;
    const seen = new Map<Hex, Stage>();
    ksa.pending = true;
    until(s, () => !!r.blockHash);
    // A toast keeps the words it was given: nothing while the asset is not named, and no mark announced
    expect(opNews(s, r, seen)?.news).toBeUndefined();
    expect(seen.has(r.id)).toBe(false);
    delete ksa.pending;
    const found = opNews(s, r, seen);
    expect(found?.news).toEqual(['fast']);
    expect(found?.sum.amount?.asset.symbol).toBe('KSA');
  });

  it('a failed operation whose block leaves the chain is no news, and its inclusion in another block is, as failed or not', () => {
    expect(news(['pending', 'failed', 'pending', 'fast', 'on_btc'])).toEqual(['failed', 'fast', 'on_btc']);
    expect(news(['failed', 'pending', 'broadcast'])).toEqual(['failed', 'fast']);
    expect(news(['pending', 'fast', 'pending', 'failed'])).toEqual(['fast', 'failed']);
    expect(news(['skipped', 'broadcast'])).toEqual(['skipped', 'fast']);
  });

  it('a BTC reorg taking a stage back is not announced, fast confirmation included; the stage reached again is', () => {
    expect(news(['pending', 'fast', 'broadcast', 'on_btc', 'fast', 'broadcast', 'on_btc', 'deep', 'on_btc', 'deep'])).toEqual(['fast', 'on_btc', 'on_btc', 'deep', 'deep']);
  });

  it('BTC final taken back is a warning, whatever the stage it falls to, and BTC final reached again is announced again (D-114)', () => {
    for (const to of ['deep', 'on_btc', 'broadcast', 'fast', 'unmerged', 'pending'] as const) expect(opMilestone('final', to), to).toEqual(['taken_back']);
    expect(news(['on_btc', 'deep', 'final', 'deep', 'final'])).toEqual(['on_btc', 'deep', 'final', 'taken_back', 'final']);
  });

  it('an operation that falls from BTC final straight to its end gets the warning, then its end (the review of D-116)', () => {
    // After a BTC reorg that reached the BTC block deciding it, executed again in another block and failed there, or skipped, or dropped
    for (const to of ['failed', 'skipped', 'dropped'] as const) expect(opMilestone('final', to), to).toEqual(['taken_back', to]);
    expect(news(['pending', 'fast', 'on_btc', 'deep', 'final', 'failed'])).toEqual(['fast', 'on_btc', 'deep', 'final', 'taken_back', 'failed']);
    // Its block left the chain first, and the op failed in the next one: the same news, a look apart
    expect(news(['deep', 'final', 'pending', 'failed'])).toEqual(['deep', 'final', 'taken_back', 'failed']);
  });

  it('dropped and skipped are announced from a stage below BTC final; the op included again later is announced again', () => {
    expect(news(['pending', 'dropped', 'pending', 'fast'])).toEqual(['dropped', 'fast']);
    expect(news(['pending', 'fast', 'skipped', 'pending', 'fast'])).toEqual(['fast', 'skipped', 'fast']);
  });
});
