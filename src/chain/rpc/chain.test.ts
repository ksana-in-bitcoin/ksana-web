/**
 * Tests of the node data source: replay recorded responses of a real node (ksana-node main, two producing nodes + mock
 * bitcoind + standalone indexer).
 *
 * To re-record: start a devnet locally (`cargo test -p ksana-node --test web_devnet -- --ignored --nocapture`, which prints
 * the accounts and the op_id of every transfer in its traffic), wait a few minutes for the settlements to land on BTC and
 * become BTC-final, then
 *   KSANA_RECORD=http://127.0.0.1:18545 KSANA_RECORD_INDEXER=http://127.0.0.1:18548 \
 *   KSANA_RECORD_ACCOUNT=<account (64 hex digits)> KSANA_RECORD_OP=<one path B op of that account> npx vitest run src/chain/rpc/chain.test.ts
 * The fixture is written to fixtures/devnet.json; on replay every request is looked up by "method + params", and a request that
 * was not recorded gets a node internal error. While recording, each request is asked of the node only once (its first answer
 * is reused afterwards), so recording and replay take exactly the same path.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ChainMismatchError,
  DEVNET,
  RpcError,
  RpcTransportError,
  type VmOp as SdkVmOp,
  accountToAddress,
  blockHash,
  decodeAddress,
  encodeKs20Event,
  encodeLock,
  fromHex,
  fromJson,
  nativeDataOutput,
  parseTx,
  serializeTx,
  sha256,
  toHex,
  toJson,
  txid,
  type Tx,
} from '@ksana/sdk';
import { KSA_ASSET_ID, PARAMS } from '../params';
import { balancesOf, blockProgress, blockStage, finalityConfs, headerCarrier, indexerState, indexerVouches, lockedFeesOf, opProgress, opStatusOf, pairFee, search, summarizeOp, txRoute } from '../views';
import type { Block, BtcTx, OpRecord } from '../types';
import { RpcChain, type RpcConfig, noAnswer, wsUrlOf } from './chain';
import { addressOfScript, contractIdOf, eventFields, eventName, failReason, opIdOf, parseSettlement, toResult } from './convert';
import { explainChainMismatch, explainRpcError, rpcErrorMayPass } from '../../app/SourcePanel';
import { lookupShown } from '../../components/Lookup';
import { LOCALES, currentLocale, setLocale, t } from '../../i18n';
import { COIN_NAMES } from '../../i18n/coins';
import { namedProducer } from '../views';
import { activity, inflight, unfinalFlows } from '../../wallet/model';

const FIXTURE = new URL('./fixtures/devnet.json', import.meta.url);

interface Fixture {
  meta: { recordedAt: number; source: string; account: string; op: string; window: number };
  calls: Record<string, { result?: unknown; error?: { code: number; message: string } }>;
}

const keyOf = (method: string, params: unknown) => `${method} ${JSON.stringify(params)}`;

function replayFetch(fx: Fixture, missed: string[], early: string[] = []): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown };
    const hit = fx.calls[keyOf(body.method, body.params)] ?? derived(fx, body.method, body.params);
    if (!hit) (beforeSearch(fx, body.method, body.params) ? early : missed).push(keyOf(body.method, body.params));
    const reply = hit ?? { error: { code: -32603, message: 'request not recorded' } };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, ...reply }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

/** The methods of the node's index of the standards' events (D-120), which the node the recording was made from predates */
const INDEX_METHODS = new Set(['ksana_getContract', 'ksana_getToken', 'ksana_getAccountAssets', 'ksana_getTokenHolders', 'ksana_getNfts', 'ksana_getApprovals']);

/**
 * An answer of the node the recording tells without having asked it: a block's settlement status by height, which a recording made
 * before the page asked by height has by the block's hash, or has as none for a block that needs no body (-32004, D-043); the
 * status of an operation the recording has only where merged blocks skipped it (`skippedStatus`); and the standards index's methods,
 * which a node older than the index does not have
 */
function derived(fx: Fixture, method: string, params: unknown): Fixture['calls'][string] | undefined {
  if (INDEX_METHODS.has(method)) return { error: { code: -32601, message: 'Method not found' } };
  if (method === 'ksana_getOpStatus' && Array.isArray(params)) return skippedStatus(fx, String(params[0]));
  if (method !== 'ksana_getSettlement') return undefined;
  const block = fx.calls[keyOf('ksana_getBlock', params)]?.result as { hash: string; settlement: unknown; entries: Record<string, unknown>[] } | undefined;
  if (!block) return undefined;
  const byHash = fx.calls[keyOf(method, [block.hash])];
  if (byHash) return byHash;
  const body = !!block.settlement || block.entries.some((e) => !('Forced' in e));
  return body ? undefined : { error: { code: -32004, message: 'that block has no settlement transactions' } };
}

/**
 * A read the recording predates: a height between block 3, which `exercise` opens, and the lowest height above it that the recording
 * read, which the page reads looking for what carried that empty block's header (`askHeaderCarrier`), the recording having been made
 * before it did. Answered as unrecorded, which fails the search as a node's error would, and kept apart from the requests missed
 */
function beforeSearch(fx: Fixture, method: string, params: unknown): boolean {
  const asked = method === 'ksana_getBlock' && Array.isArray(params) && /^\d+$/.test(String(params[0])) ? Number(params[0]) : Number.NaN;
  const read = Object.keys(fx.calls).flatMap((key) => {
    const m = /^ksana_getBlock \["(\d+)"\]$/.exec(key);
    return m && Number(m[1]) > 3 ? [Number(m[1])] : [];
  });
  return asked > 3 && asked < Math.min(...read);
}

/**
 * The status of an operation the recording has only where merged blocks skipped it, which the page asks the node about (D-063) and a
 * recording made before it did has no answer for: the node's for an op it skipped and holds in no entry pool, at the first of those
 * positions. Where the node executed it instead, in a block below what was recorded, the recording cannot tell
 */
function skippedStatus(fx: Fixture, id: string): Fixture['calls'][string] | undefined {
  type Raw = { hash: string; accepted_height: string | null; entries: { Sponsored?: { op: unknown }; Forced?: { op: unknown } }[]; receipts: { error: string | null }[] };
  let executed = false;
  let first: { height: number; hash: string; index: number; receipt: unknown } | undefined;
  for (const [key, v] of Object.entries(fx.calls)) {
    const b = key.startsWith('ksana_getBlock ') ? (v.result as Raw | undefined) : undefined;
    b?.entries.forEach((e, index) => {
      const op = (e.Sponsored ?? e.Forced)?.op;
      if (!op || opIdOf(fromJson('VmOp', op)) !== id) return;
      const receipt = b.receipts[index];
      const height = Number(b.accepted_height ?? Number.NaN);
      if (!receipt?.error?.startsWith('skipped')) executed = true;
      else if (Number.isFinite(height) && (!first || height < first.height)) first = { height, hash: b.hash, index, receipt };
    });
  }
  if (executed || !first) return undefined;
  return { result: { status: 'skipped', block: { height: String(first.height), hash: first.hash }, index: first.index, receipt: first.receipt } };
}

/**
 * The answer of `ksana_getChainInfo` from a node on chain `chainId`, at the recording's tip (the page reads `chain_id` and
 * `finalized` from it). Recordings made before A2-11 (D-106) have none, because the page did not read the chain ID then: the replay
 * adds devnet's, with the BTC-final tip (D-114) at the highest of the blocks the recorded statuses give as BTC-final.
 */
function chainInfo(fx: Fixture, chainId: number): Fixture['calls'][string] {
  const ref = (key: string) => {
    const b = fx.calls[key]?.result as { hash: string; header: { height: string } } | undefined;
    return { height: b?.header.height ?? '0', hash: b?.hash ?? '00'.repeat(32) };
  };
  const tip = ref(keyOf('ksana_getBlock', ['latest']));
  let finalized = ref(keyOf('ksana_getBlock', [0]));
  for (const [key, v] of Object.entries(fx.calls)) {
    const s = key.startsWith('ksana_getSettlement ') ? (v.result as { block: { height: string; hash: string }; btc_final: boolean } | undefined) : undefined;
    if (s?.btc_final && Number(s.block.height) > Number(finalized.height)) finalized = s.block;
  }
  return { result: { chain_id: chainId, tip, daa_score: tip.height, protocol_version: 2, next_upgrade: null, max_known_version: 2, finalized } };
}

/** The replay as a server that takes JSON-RPC batches too (`batch.ts`), with the number of calls in each request it was sent */
function batchServer(replay: typeof fetch) {
  const requests: number[] = [];
  /** The methods of each request, in the order the requests came */
  const methods: string[][] = [];
  const serve = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as unknown;
    if (!Array.isArray(body)) {
      requests.push(1);
      methods.push([(body as { method: string }).method]);
      return replay(url, init);
    }
    requests.push(body.length);
    methods.push(body.map((call: { method: string }) => call.method));
    const answers = await Promise.all(body.map(async (call) => (await replay(url, { ...init, body: JSON.stringify(call) })).json()));
    return new Response(JSON.stringify(answers), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: serve, requests, methods };
}

async function settle(chain: RpcChain, keys: [Parameters<RpcChain['request']>[0], string][]) {
  for (const [kind, id] of keys) chain.request(kind, id);
  for (let i = 0; i < 200; i++) {
    if (keys.every(([kind, id]) => chain.lookup(kind, id)?.state !== 'loading')) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('the on-demand lookups did not finish');
}

/** Recording and replay make the same sequence of calls, so that on replay every request is found in the table */
async function exercise(chain: RpcChain, account: string, op: string) {
  await chain.sync();
  await settle(chain, [
    ['account', account],
    ['block', '3'],
    ['op', op],
  ]);
  // The second one is an incremental sync: it checks the linkage along the selected parents; the blocks fetched on demand are in the cache too
  await chain.sync();
}

const opIdsOf = (b: Block) => b.entries.flatMap((e) => ('opId' in e.entry ? [e.entry.opId] : []));

const recordUrl = process.env.KSANA_RECORD;

describe.skipIf(!recordUrl)('Record node responses', () => {
  it('writes the fixture', async () => {
    const calls: Fixture['calls'] = {};
    const recording: typeof fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown };
      const key = keyOf(body.method, body.params);
      if (!calls[key]) {
        const json = (await (await fetch(url, init)).json()) as { result?: unknown; error?: { code: number; message: string } };
        calls[key] ??= json.error ? { error: json.error } : { result: json.result };
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, ...calls[key] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const account = process.env.KSANA_RECORD_ACCOUNT ?? '';
    const op = process.env.KSANA_RECORD_OP ?? '';
    const window = 8;
    const config: RpcConfig = { url: recordUrl as string, chain: 'devnet', ...(process.env.KSANA_RECORD_INDEXER ? { indexerUrl: process.env.KSANA_RECORD_INDEXER } : {}) };
    const recordedAt = Date.now();
    const chain = new RpcChain(config, { fetch: recording, manual: true, window, backfillStep: 12, now: () => recordedAt });
    await exercise(chain, account, op);
    const fx: Fixture = { meta: { recordedAt, source: 'ksana-node main (2 producing nodes, mock bitcoind, ksana-indexer; D-077 settlement batching, D-081 commit / reveal)', account, op, window }, calls };
    writeFileSync(FIXTURE, JSON.stringify(fx));
  }, 120_000);
});

const fx: Fixture | null = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture) : null;

describe.skipIf(!fx || !!recordUrl)('Node data source (replaying recorded responses)', () => {
  /**
   * One copy of the fixture per test (the node's answers can be rewritten to simulate a main-chain switch; prepare changes them
   * before the first sync); with backfillStep 0 there is no backfill downwards, so the requests are a subset of the recording
   */
  const load = async (backfillStep = 12, prepare?: (f: Fixture) => void) => {
    const f: Fixture = { ...(fx as Fixture), calls: { ...(fx as Fixture).calls } };
    f.calls[keyOf('ksana_getChainInfo', [])] ??= chainInfo(f, PARAMS.CHAIN_ID);
    prepare?.(f);
    const missed: string[] = [];
    const early: string[] = [];
    const chain = new RpcChain(
      { url: 'http://node.test', indexerUrl: 'http://indexer.test', chain: 'devnet' },
      { fetch: replayFetch(f, missed, early), manual: true, window: f.meta.window, backfillStep, now: () => f.meta.recordedAt },
    );
    await exercise(chain, f.meta.account, f.meta.op);
    return { chain, missed, early, f };
  };

  it('every request was recorded for the replay and the sync succeeds', async () => {
    const { chain, missed, early } = await load();
    expect(missed).toEqual([]);
    // But the heights above block 3 that its header carrier search reads first, eight, which the recording predates
    expect(early).toEqual(Array.from({ length: 8 }, (_, k) => keyOf('ksana_getBlock', [String(4 + k)])));
    expect(chain.conn.state).toBe('live');
    expect(chain.ready).toBe(true);
  });

  it('a settlement waiting in the BTC mempool counts once there, by its reveal transaction, not again by its commit (D-081)', async () => {
    const { chain } = await load();
    const waiting = [...chain.allBtcTxs()].filter((tx) => tx.status === 'broadcast');
    expect(waiting.map((tx) => tx.kind).sort()).toEqual(['commit', 'settlement']);
    expect(chain.pendingSettlements.map((tx) => tx.kind)).toEqual(['settlement']);
  });

  it('the main chain links end to end along the selected parents; a parallel block is accepted by the chain block that merges it', async () => {
    const { chain } = await load();
    const tip = chain.tip.header.height;
    let linked = 0;
    for (let h = tip; h > chain.loadedFrom; h--) {
      const b = chain.blocks[h] as Block;
      const parent = chain.blocks[h - 1] as Block;
      expect(b.header.parents[0]).toBe(parent.hash);
      expect(b.acceptedHeight).toBe(h);
      expect(b.side).toBeUndefined();
      linked++;
    }
    expect(linked).toBeGreaterThan(5);
    for (const s of chain.sideBlocks) {
      expect(s.side).toBe(true);
      if (s.acceptedHeight === undefined) continue;
      expect(s.acceptedHeight).toBeGreaterThan(s.header.height);
      const by = chain.blocks[s.acceptedHeight];
      if (by) {
        expect(by.merged).toContain(s.hash);
        expect(s.acceptedBy).toBe(by.hash);
      }
    }
  });

  it('the block hash is the sha256d of the block header (recomputed with the SDK)', async () => {
    const { chain, f } = await load();
    const latest = f.calls[keyOf('ksana_getBlock', ['latest'])]?.result as { hash: string; header: unknown };
    expect(toHex(blockHash(fromJson('BlockHeader', latest.header)))).toBe(latest.hash);
    expect(chain.tip.hash).toBe(latest.hash);
  });

  it('the settled and BTC-final heights are inferred from the settled / btc_final of each block and form a prefix', async () => {
    const { chain, f } = await load();
    expect(chain.finalHeight).toBeLessThanOrEqual(chain.settledHeight);
    expect(chain.settledHeight).toBeLessThanOrEqual(chain.tip.header.height);
    expect(chain.finalHeight).toBeGreaterThan(0);
    for (const [key, v] of Object.entries(f.calls)) {
      if (!key.startsWith('ksana_getSettlement ') || !v.result) continue;
      const s = v.result as { block: { hash: string }; settled: boolean; btc_final: boolean };
      const b = chain.getBlock(s.block.hash);
      if (!b || b.acceptedHeight === undefined) continue;
      if (s.settled) expect(b.acceptedHeight).toBeLessThanOrEqual(chain.settledHeight);
      if (s.btc_final) expect(b.acceptedHeight).toBeLessThanOrEqual(chain.finalHeight);
      // The stage agrees with the node's verdict, and a settled block's with the depth of its closure (D-116)
      const stage = blockStage(chain, b);
      if (s.btc_final) expect(stage).toBe('final');
      else if (s.settled) expect(stage).toBe(finalityConfs(chain, b).confs >= PARAMS.BTC_FINALITY_CONFS ? 'deep' : 'on_btc');
    }
  });

  it("a settled block shows the six confirmations with its closure's sixth, and BTC-final only once the node reports it (D-116)", async () => {
    const { chain: recorded } = await load();
    const open = (chain: RpcChain) => chain.blocks.filter((b): b is Block => !!b && b.header.height > chain.finalHeight && b.header.height <= chain.settledHeight);
    const lowest = Math.min(...open(recorded).map((b) => b.closureBtc ?? Number.POSITIVE_INFINITY));
    // The BTC tip moved up through the indexer's BTC height: one block short of six confirmations for the lowest closure, six, and 30 more
    for (const tip of [lowest + 4, lowest + 5, lowest + 35]) {
      const { chain, missed } = await load(12, (f) => {
        const k = keyOf('indexer_status', []);
        f.calls[k] = { result: { ...(f.calls[k]?.result as object), btc_height: tip } };
      });
      expect(missed).toEqual([]);
      expect(chain.btcTip.height).toBe(tip);
      const stages = open(chain).map((b) => blockStage(chain, b));
      open(chain).forEach((b, i) => expect(stages[i]).toBe(chain.btcConfs(b.closureBtc) >= PARAMS.BTC_FINALITY_CONFS ? 'deep' : 'on_btc'));
      expect(stages.includes('deep')).toBe(tip >= lowest + 5);
      // However deep the data, BTC-final is the node's report
      expect(chain.finalHeight).toBe(recorded.finalHeight);
    }
  });

  it('a cache short of the BTC-final boundary shows no six confirmations: a block below it may have landed after the cached ones (D-116)', async () => {
    const { chain: recorded } = await load();
    const final = recorded.finalHeight;
    const low = recorded.tip.header.height - (fx as Fixture).meta.window + 1;
    type Answer = { block: { height: string }; confirmed: { txid: string; height: number; confirmations: number } | null };
    const answers = (f: Fixture) => Object.entries(f.calls).flatMap(([key, v]) => (key.startsWith('ksana_getSettlement ') && v.result ? [[key, v.result as Answer] as const] : []));
    const cached = new Set(answers(fx as Fixture).flatMap(([, s]) => (Number(s.block.height) >= low && s.confirmed ? [s.confirmed.txid] : [])));
    const own = Math.max(...answers(fx as Fixture).flatMap(([, s]) => (s.confirmed && cached.has(s.confirmed.txid) ? [s.confirmed.height] : [])));
    // The data of the blocks between the BTC-final tip and the window lands two BTC blocks after the window's own, as when a stuck settlement
    // is bumped late, and the BTC tip is where the window's own data has six confirmations
    const late = (f: Fixture) => {
      for (const [key, s] of answers(f)) {
        const h = Number(s.block.height);
        if (h > final && h < low && s.confirmed && !cached.has(s.confirmed.txid)) f.calls[key] = { result: { ...s, confirmed: { ...s.confirmed, height: own + 2, confirmations: 4 } } };
      }
      const k = keyOf('indexer_status', []);
      f.calls[k] = { result: { ...(f.calls[k]?.result as object), btc_height: own + 5 } };
    };
    // Backfilled down to the BTC-final boundary, the page counts the late data: four confirmations
    const full = (await load(12, late)).chain;
    // With the window alone, as in the first syncs of a page load, it knows no closure
    const shallow = (await load(0, late)).chain;
    expect(full.finalityLoaded).toBe(true);
    expect(shallow.finalityLoaded).toBe(false);
    expect(shallow.btcTip.height).toBe(own + 5);
    let checked = 0;
    for (let h = low; h <= full.settledHeight; h++) {
      const a = full.blocks[h] as Block;
      const b = shallow.blocks[h] as Block;
      expect(a.closureBtc).toBe(own + 2);
      expect(blockStage(full, a)).toBe('on_btc');
      expect(b.closureBtc).toBeUndefined();
      expect(blockStage(shallow, b)).toBe('on_btc');
      expect(finalityConfs(shallow, b).confs).toBe(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('a chain block above the BTC-final tip whose merged blocks are not fetched yet has no closure, nor have the blocks above it (D-116)', async () => {
    const { chain } = await load();
    expect(chain.finalityLoaded).toBe(true);
    const merging = chain.blocks.filter((b): b is Block => !!b && b.header.height > chain.finalHeight && b.header.height <= chain.settledHeight && b.merged.length > 0);
    const c = merging[Math.floor(merging.length / 2)] as Block;
    const before = chain.blocks.map((b) => b?.closureBtc);
    expect(before[c.header.height]).toBeDefined();
    // As in a sync that has taken the chain block in and not yet fetched the blocks it merges
    const inner = chain as unknown as { forget(hash: string): void; derive(): void };
    for (const id of c.merged) inner.forget(id);
    inner.derive();
    for (let h = chain.finalHeight + 1; h <= chain.tip.header.height; h++) {
      if (h < c.header.height) expect(chain.blocks[h]?.closureBtc).toBe(before[h]);
      else expect(chain.blocks[h]?.closureBtc).toBeUndefined();
    }
    expect(c.header.height).toBeGreaterThan(chain.finalHeight + 1);
  });

  it('settlement transactions: the payload is parsed from the Taproot envelope of the reveal transaction and its last header is this block; the commit transaction is paired with it', async () => {
    const { chain } = await load();
    let checked = 0;
    let listed = 0;
    let carrying = 0;
    for (const b of [...chain.blocks.filter(Boolean), ...chain.sideBlocks]) {
      if (!b.settlementTxid) continue;
      const reveal = chain.getBtcTx(b.settlementTxid);
      expect(reveal).toBeDefined();
      if (!reveal) continue;
      expect(reveal.kind).toBe('settlement');
      expect(reveal.partial).toBeFalsy();
      expect(reveal.headers[reveal.headers.length - 1]).toBe(b.hash);
      // Each header with its height from the payload, which names a block the page has not loaded too
      expect(reveal.headerHeights?.length).toBe(reveal.headers.length);
      expect(reveal.headerHeights?.[reveal.headers.length - 1]).toBe(b.header.height);
      reveal.headers.forEach((h, i) => {
        const at = chain.getBlock(h)?.header.height;
        if (at !== undefined) expect(reveal.headerHeights?.[i]).toBe(at);
      });
      // When this block needs its body on BTC, its own settlement payload carries it (D-077)
      if (b.needsSettlement) expect(reveal.bodies).toContain(b.hash);
      // Its entries are the block's own and those of every other body it carries: #1,899's on signet, carrying #1,894's, read 0
      const others = reveal.bodies.filter((h) => h !== b.hash).map((h) => chain.getBlock(h));
      if (others.every((o) => o !== undefined)) expect(reveal.entryCount).toBe(b.entries.length + others.reduce((n, o) => n + (o?.entries.length ?? 0), 0));
      if (others.some((o) => o?.entries.length)) carrying++;
      // Reveal transaction: spends the commit transaction's commitment output (the envelope is in the witness); the outputs are a P2A anchor and an empty OP_RETURN (D-081)
      expect(reveal.inputs.filter((i) => i.role === 'commit' && i.scriptType === 'envelope').length).toBe(1);
      expect(reveal.outputs.some((o) => o.role === 'anchor' && o.valueSat === 240)).toBe(true);
      expect(reveal.outputs.filter((o) => o.role === 'op_return').length).toBe(1);
      expect(reveal.chunks ?? 0).toBeGreaterThan(0);
      expect(reveal.payloadBytes).toBeGreaterThan(0);
      // Fee = commitment output − the reveal transaction's outputs
      expect(reveal.feeSat ?? 0).toBeGreaterThan(0);
      // Commit transaction: one P2TR input of the producer, the commitment output and the change
      expect(reveal.commitTxid).toBeDefined();
      const commit = reveal.commitTxid ? chain.getBtcTx(reveal.commitTxid) : undefined;
      expect(commit?.kind).toBe('commit');
      expect(commit?.revealTxid).toBe(reveal.txid);
      expect(commit?.inputs.every((i) => i.role === 'producer' && i.scriptType === 'p2tr')).toBe(true);
      expect(commit?.outputs.filter((o) => o.role === 'commitment').length).toBe(1);
      // Whose the funding is, the transactions do not say: an input names no account, and an output names the block's producer only where it pays that account's address (SPEC §7.7)
      expect(commit?.inputs.every((i) => i.owner === null)).toBe(true);
      for (const o of [...(commit?.outputs ?? []), ...reveal.outputs]) expect(o.owner).toBe(o.role === 'change' && o.address === chain.addressOf(b.header.producer) ? b.header.producer : null);
      // The two transactions are broadcast together and confirmed together, and their BTC block lists the commit before the reveal
      expect(commit?.status).toBe(reveal.status);
      expect(commit?.confirmedHeight).toBe(reveal.confirmedHeight);
      if (reveal.status === 'confirmed' && reveal.confirmedHeight !== undefined) {
        const ids = chain.getBtcBlock(reveal.confirmedHeight)?.txids ?? [];
        expect(ids.indexOf(reveal.commitTxid ?? '')).toBeGreaterThanOrEqual(0);
        expect(ids.indexOf(reveal.commitTxid ?? '')).toBeLessThan(ids.indexOf(reveal.txid));
        listed++;
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
    expect(listed).toBeGreaterThan(0);
    expect(carrying).toBeGreaterThan(0);
  });

  it('a commit transaction’s fee is worked out where its input spends the change of a commit the page has read, as on signet, and a settlement’s fee is then the pair’s (D-081)', async () => {
    // The recording's commits spend a funding transaction the page never reads. The later of two settlements is made to spend the
    // earlier one's change, as a signet producer's commits spend an earlier one's, and pay 308 sats
    const settled = new Map<string, { height: number; commit: string; reveal: string }>();
    for (const [key, v] of Object.entries((fx as Fixture).calls)) {
      const r = key.startsWith('ksana_getBlock ') ? (v.result as { hash: string; header: { height: string }; settlement: { commit: string; reveal: string } | null } | undefined) : undefined;
      if (r?.settlement) settled.set(r.hash, { height: Number(r.header.height), ...r.settlement });
    }
    const sorted = [...settled].sort((x, y) => x[1].height - y[1].height || (x[0] < y[0] ? -1 : 1));
    const [firstHash, first] = sorted[0] ?? [];
    const second = sorted[1]?.[1];
    if (!firstHash || !first || !second) throw new Error('the recording holds fewer than two settlements');
    const shown = (id: Uint8Array) => toHex(id).match(/../g)?.reverse().join('') ?? '';
    const spends = (tx: Tx, parent: Tx) => tx.inputs.findIndex((i) => toHex(i.txid) === toHex(txid(parent)));
    const [aCommit, aReveal, bCommit, bReveal] = [first.commit, first.reveal, second.commit, second.reveal].map((hex) => parseTx(fromHex(hex))) as [Tx, Tx, Tx, Tx];
    const aCommitment = aReveal.inputs[spends(aReveal, aCommit)]?.vout;
    const change = aCommit.outputs.findIndex((_, vout) => vout !== aCommitment);
    const changeValue = aCommit.outputs[change]?.value ?? 0n;
    const bCommitment = bReveal.inputs[spends(bReveal, bCommit)]?.vout;
    const commitment = bCommit.outputs.find((_, vout) => vout === bCommitment)?.value ?? 0n;
    const commit: Tx = {
      ...bCommit,
      inputs: bCommit.inputs.map((i) => ({ ...i, txid: txid(aCommit), vout: change })),
      outputs: bCommit.outputs.map((o, vout) => (vout === bCommitment ? o : { ...o, value: changeValue - commitment - 308n })),
    };
    const vin = spends(bReveal, bCommit);
    const reveal: Tx = { ...bReveal, inputs: bReveal.inputs.map((i, k) => (k === vin ? { ...i, txid: txid(commit) } : i)) };
    const swaps: [string, string][] = [
      [second.commit, toHex(serializeTx(commit))],
      [second.reveal, toHex(serializeTx(reveal))],
      [toHex(txid(bCommit)), toHex(txid(commit))],
      [shown(txid(bCommit)), shown(txid(commit))],
      [toHex(txid(bReveal)), toHex(txid(reveal))],
      [shown(txid(bReveal)), shown(txid(reveal))],
    ];
    const { chain, missed } = await load(12, (f) => {
      let text = JSON.stringify(f.calls);
      for (const [from, to] of swaps) text = text.split(from).join(to);
      Object.assign(f.calls, JSON.parse(text));
    });
    expect(missed).toEqual([]);

    const paid = chain.getBtcTx(shown(txid(commit)));
    const revealTx = chain.getBtcTx(shown(txid(reveal)));
    if (!paid || !revealTx) throw new Error('the settlement was not read');
    expect(paid.inputs.map((i) => i.valueSat)).toEqual([Number(changeValue)]);
    // Its input also shows the address of the change it spends: the producer node's funding address, not an account
    const spent = chain.getBtcTx(shown(txid(aCommit)))?.outputs[change];
    expect(spent?.address).toMatch(/^bcrt1/);
    expect(paid.inputs.map((i) => [i.address, i.owner])).toEqual([[spent?.address, null]]);
    expect(paid.feeSat).toBe(308);
    expect(paid.feeRate).toBe(Math.round((308 / paid.vsize) * 100) / 100);
    const revealFee = revealTx.feeSat ?? 0;
    expect(revealFee).toBeGreaterThan(0);
    expect(pairFee(chain, revealTx)).toMatchObject({ feeSat: 308 + revealFee, vsize: paid.vsize + revealTx.vsize, parts: { commit: 308, reveal: revealFee }, revealOnly: false });
    // The earlier settlement's commit spends the funding transaction: its fee is not known, and its settlement's is the reveal's alone
    const earlier = chain.getBtcTx(chain.getBlock(firstHash)?.settlementTxid ?? '');
    const earlierCommit = chain.getBtcTx(earlier?.commitTxid ?? '');
    expect(earlierCommit?.feeSat).toBeUndefined();
    expect(earlierCommit?.inputs.every((i) => i.valueSat === undefined)).toBe(true);
    expect(earlier && pairFee(chain, earlier)).toEqual({ feeSat: earlier?.feeSat, feeRate: earlier?.feeRate, vsize: earlier?.vsize, revealOnly: true });
  });

  it('a commit transaction’s fee is found below the blocks loaded: the settlements under its block are read, nearest first, until the one whose commit its input spends (D-081)', async () => {
    // Block #119's settlement is made to spend, paying 308 sats, the change of a commit that only #100's settlement status gives, as
    // a signet producer's commits spend the change of one some 40 blocks below; the page loads no main-chain block below #114
    const f: Fixture = { ...(fx as Fixture), calls: { ...(fx as Fixture).calls } };
    f.calls[keyOf('ksana_getChainInfo', [])] ??= chainInfo(f, PARAMS.CHAIN_ID);
    const own = (f.calls[keyOf('ksana_getBlock', ['119'])]?.result as { settlement: { commit: string; reveal: string } | null } | undefined)?.settlement;
    if (!own) throw new Error('the recording holds no settlement at #119');
    const shown = (id: Uint8Array) => toHex(id).match(/../g)?.reverse().join('') ?? '';
    const [bCommit, bReveal] = [own.commit, own.reveal].map((hex) => parseTx(fromHex(hex))) as [Tx, Tx];
    const vin = bReveal.inputs.findIndex((i) => toHex(i.txid) === toHex(txid(bCommit)));
    const change = bCommit.outputs.findIndex((_, vout) => vout !== bReveal.inputs[vin]?.vout);
    const paidOut = bCommit.outputs.reduce((s, o) => s + o.value, 0n);
    // The funding pair: #119's own, its change worth #119's commit's outputs and 308 sats more
    const funding: Tx = { ...bCommit, outputs: bCommit.outputs.map((o, vout) => (vout === change ? { ...o, value: paidOut + 308n } : o)) };
    const fundingReveal: Tx = { ...bReveal, inputs: bReveal.inputs.map((i, k) => (k === vin ? { ...i, txid: txid(funding) } : i)) };
    const commit: Tx = { ...bCommit, inputs: bCommit.inputs.map((i) => ({ ...i, txid: txid(funding), vout: change })) };
    const reveal: Tx = { ...bReveal, inputs: bReveal.inputs.map((i, k) => (k === vin ? { ...i, txid: txid(commit) } : i)) };
    let text = JSON.stringify(f.calls);
    for (const [from, to] of [
      [own.commit, toHex(serializeTx(commit))],
      [own.reveal, toHex(serializeTx(reveal))],
      [toHex(txid(bCommit)), toHex(txid(commit))],
      [shown(txid(bCommit)), shown(txid(commit))],
      [toHex(txid(bReveal)), toHex(txid(reveal))],
      [shown(txid(bReveal)), shown(txid(reveal))],
    ] as const)
      text = text.split(from).join(to);
    Object.assign(f.calls, JSON.parse(text));
    // #100's settlement status gives the funding pair, and none of the other heights from #113 down to #90 has one besides those recorded
    const template = f.calls[keyOf('ksana_getSettlement', ['110'])]?.result as Record<string, unknown>;
    f.calls[keyOf('ksana_getSettlement', ['100'])] = {
      result: {
        ...template,
        block: { height: '100', hash: 'ab'.repeat(32) },
        txid: toHex(txid(fundingReveal)),
        txid_rpc: shown(txid(fundingReveal)),
        commit_txid: toHex(txid(funding)),
        commit_txid_rpc: shown(txid(funding)),
        txs: { commit: toHex(serializeTx(funding)), reveal: toHex(serializeTx(fundingReveal)) },
        carrier: null,
      },
    };
    for (let h = 90; h <= 113; h++) f.calls[keyOf('ksana_getSettlement', [String(h)])] ??= { error: { code: -32004, message: 'that block has no settlement transactions' } };
    const missed: string[] = [];
    const replay = replayFetch(f, missed);
    const asked: string[] = [];
    const watched = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (body.method === 'ksana_getSettlement') asked.push(String(body.params[0]));
      return replay(url, init);
    }) as typeof fetch;
    const chain = new RpcChain(
      { url: 'http://node.test', indexerUrl: 'http://indexer.test', chain: 'devnet' },
      { fetch: watched, manual: true, window: f.meta.window, backfillStep: 12, now: () => f.meta.recordedAt },
    );
    await exercise(chain, f.meta.account, f.meta.op);
    const id = shown(txid(commit));
    const revealId = shown(txid(reveal));
    expect(chain.getBtcTx(id)?.feeSat).toBeUndefined();
    expect(pairFee(chain, chain.getBtcTx(revealId) as BtcTx).revealOnly).toBe(true);

    asked.length = 0;
    await chain.askCommitFees([id]);
    // Twelve at a time from #113 down, past the loaded blocks' heights, stopping with the twelve that hold #100
    expect(asked).toEqual(Array.from({ length: 24 }, (_, k) => String(113 - k)));
    expect(missed).toEqual([]);
    const paid = chain.getBtcTx(id);
    const revealTx = chain.getBtcTx(revealId);
    if (!paid || !revealTx) throw new Error('the settlement was not read');
    expect(paid.feeSat).toBe(308);
    expect(paid.inputs.map((i) => [i.valueSat, i.owner])).toEqual([[Number(paidOut + 308n), null]]);
    expect(paid.inputs[0]?.address).toMatch(/^bcrt1/);
    const revealFee = revealTx.feeSat ?? 0;
    expect(pairFee(chain, revealTx)).toMatchObject({ feeSat: 308 + revealFee, vsize: paid.vsize + revealTx.vsize, parts: { commit: 308, reveal: revealFee }, revealOnly: false });
  });

  it('the search for what a commit spends reads no deeper than 240 blocks below its block, each height once, and again only where a read failed', async () => {
    // The recording's #119 settlement carried by block #990 of a longer chain: its commit spends a transaction no settlement gives
    const own = ((fx as Fixture).calls[keyOf('ksana_getBlock', ['119'])]?.result as { settlement: { commit: string; reveal: string } | null } | undefined)?.settlement;
    if (!own) throw new Error('the recording holds no settlement at #119');
    const node = syntheticNode({ tip: 1000, opsAt: [990], finalAt: 0, settlementAt: (h) => (h === 990 ? own : undefined) });
    const asked: number[] = [];
    let failing = 2;
    const watched = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
      if (body.method === 'ksana_getSettlement') asked.push(Number(body.params[0]));
      // #800's first two reads fail
      if (body.method === 'ksana_getSettlement' && body.params[0] === '800' && failing > 0) {
        failing--;
        const error = { code: -32603, message: 'storage error' };
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return node.fetch(url, init);
    }) as typeof fetch;
    const server = batchServer(watched);
    let now = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, backfillStep: 0, now: () => now });
    await chain.sync();
    const commit = [...chain.allBtcTxs()].find((tx) => tx.kind === 'commit');
    const reveal = [...chain.allBtcTxs()].find((tx) => tx.kind === 'settlement');
    if (!commit || !reveal) throw new Error('the settlement was not read');
    expect(commit.forHeight).toBe(990);

    asked.length = 0;
    const sent = server.requests.length;
    await chain.askCommitFees([commit.txid]);
    // #980 down to #750, below the 20 blocks loaded, a batch at a time
    expect(asked).toEqual(Array.from({ length: 231 }, (_, k) => 980 - k));
    expect(server.requests.slice(sent)).toEqual([64, 64, 64, 39]);
    expect(chain.getBtcTx(commit.txid)?.feeSat).toBeUndefined();
    expect(pairFee(chain, reveal).revealOnly).toBe(true);
    // Asked again, it reads nothing until a minute has passed, and then only the height whose read failed
    asked.length = 0;
    await chain.askCommitFees([commit.txid]);
    expect(asked).toEqual([]);
    now += 61_000;
    await chain.askCommitFees([commit.txid]);
    expect(asked).toEqual([800]);
    // A chain stopped, as when its network started over, reads nothing more
    chain.stop();
    now += 61_000;
    await chain.askCommitFees([commit.txid]);
    expect(asked).toEqual([800]);
  });

  /**
   * `n` settlement pairs made from the recording's #119, each commit spending the change of the one before and paying 308 sats, the
   * first spending output 0 of `from`, which no settlement gives; each change pays the script `to` where given
   */
  const fundedPairs = (n: number, from: string, to?: Uint8Array) => {
    const own = ((fx as Fixture).calls[keyOf('ksana_getBlock', ['119'])]?.result as { settlement: { commit: string; reveal: string } | null } | undefined)?.settlement;
    if (!own) throw new Error('the recording holds no settlement at #119');
    const [first, firstReveal] = [own.commit, own.reveal].map((hex) => parseTx(fromHex(hex))) as [Tx, Tx];
    const vin = firstReveal.inputs.findIndex((i) => toHex(i.txid) === toHex(txid(first)));
    const commitment = firstReveal.inputs[vin]?.vout ?? -1;
    const change = first.outputs.findIndex((_, vout) => vout !== commitment);
    const locked = first.outputs[commitment]?.value ?? 0n;
    const pairs: { commit: Tx; reveal: Tx }[] = [];
    for (let k = 0; k < n; k++) {
      // Each change pays for the commits after it: what each pays out, and 308 sats more
      const value = (first.outputs[change]?.value ?? 0n) + BigInt(n - 1 - k) * (locked + 308n);
      const before = pairs[k - 1];
      const spends = before ? { txid: txid(before.commit), vout: change } : { txid: fromHex(from), vout: 0 };
      const outputs = first.outputs.map((o, vout) => (vout === change ? { ...o, value, ...(to ? { script: to } : {}) } : o));
      const commit: Tx = { ...first, inputs: first.inputs.map((i) => ({ ...i, ...spends })), outputs };
      const reveal: Tx = { ...firstReveal, inputs: firstReveal.inputs.map((i, j) => (j === vin ? { ...i, txid: txid(commit) } : i)) };
      pairs.push({ commit, reveal });
    }
    const shown = (id: Uint8Array) => toHex(id).match(/../g)?.reverse().join('') ?? '';
    return pairs.map((p) => ({ id: shown(txid(p.commit)), revealId: shown(txid(p.reveal)), hex: { commit: toHex(serializeTx(p.commit)), reveal: toHex(serializeTx(p.reveal)) } }));
  };
  type Funded = ReturnType<typeof fundedPairs>[number];

  /**
   * A chain that reads `node` in batches, 20 blocks from the tip unless `window` says otherwise, synced once, and the identifiers
   * whose settlement status it asked for since (`seen` hears each as it is asked)
   */
  const fundedChain = async (node: { fetch: typeof fetch }, o: { window?: number; now?: () => number; seen?: (id: string) => void } = {}) => {
    const asked: string[] = [];
    const watched = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (body.method === 'ksana_getSettlement') {
        asked.push(String(body.params[0]));
        o.seen?.(String(body.params[0]));
      }
      return node.fetch(url, init);
    }) as typeof fetch;
    const chain = new RpcChain(
      { url: 'http://node.test', chain: 'devnet' },
      { fetch: batchServer(watched).fetch, batch: true, manual: true, window: o.window ?? 20, backfillStep: 0, now: o.now ?? (() => 1_800_000_000_000) },
    );
    await chain.sync();
    asked.length = 0;
    return { chain, asked };
  };
  const heightsDown = (from: number, count: number) => Array.from({ length: count }, (_, k) => String(from - k));

  it('every commit transaction a search reads is kept: a block opened below, whose commit spends one of them, has its fee as it opens (D-081)', async () => {
    const [p970, p980, p990] = fundedPairs(3, 'aa'.repeat(32)) as [Funded, Funded, Funded];
    const at = new Map([[970, p970], [980, p980], [990, p990]]);
    const node = syntheticNode({ tip: 1000, opsAt: [970, 980, 990], finalAt: 0, settlementAt: (h) => at.get(h)?.hex });
    const { chain, asked } = await fundedChain(node);
    await chain.askCommitFees([p990.id]);
    // One batch from #980 down finds what #990's commit spends, and #970's settlement with it
    expect(asked).toEqual(heightsDown(980, 64));
    expect(chain.getBtcTx(p990.id)?.feeSat).toBe(308);
    // The change pays the recording's funding key, not the producer account: the input names no owner
    expect(chain.getBtcTx(p990.id)?.inputs.map((i) => i.owner)).toEqual([null]);
    // Going down the chain, the reader opens block #980, whose commit spends #970's change: only the block's own status is read
    asked.length = 0;
    await settle(chain, [['block', '980']]);
    expect(asked).toEqual(['980']);
    expect(chain.getBtcTx(p980.id)?.feeSat).toBe(308);
    expect(pairFee(chain, chain.getBtcTx(p980.revealId) as BtcTx).revealOnly).toBe(false);
  });

  it('the change of a commit read below that pays the producer account’s key is named as that account on the input spending it (SPEC §7.7)', async () => {
    const producer = '33'.repeat(32);
    const script = fromHex('5120' + producer);
    const [p980, p990] = fundedPairs(2, 'ab'.repeat(32), script) as [Funded, Funded];
    const at = new Map([[980, p980], [990, p990]]);
    const node = syntheticNode({ tip: 1000, opsAt: [980, 990], finalAt: 0, settlementAt: (h) => at.get(h)?.hex });
    const { chain } = await fundedChain(node);
    expect(chain.getBlock(990)?.header.producer).toBe(producer);
    await chain.askCommitFees([p990.id]);
    const paid = chain.getBtcTx(p990.id);
    expect(paid?.feeSat).toBe(308);
    expect(paid?.inputs.map((i) => [i.owner, i.address])).toEqual([[producer, addressOfScript(script, 'regtest')]]);
  });

  it('one search reads for several commits, and the fee of each shows as soon as what it spends is found (D-081)', async () => {
    // #995's commit spends the change of #960's, #985's that of #900's, below the 20 blocks loaded
    const [a960, a995] = fundedPairs(2, 'a1'.repeat(32)) as [Funded, Funded];
    const [b900, b985] = fundedPairs(2, 'b1'.repeat(32)) as [Funded, Funded];
    const at = new Map([[900, b900], [960, a960], [985, b985], [995, a995]]);
    const node = syntheticNode({ tip: 1000, opsAt: [900, 960, 985, 995], finalAt: 0, settlementAt: (h) => at.get(h)?.hex });
    const fees: { at: string; a?: number; b?: number }[] = [];
    const held: { chain?: RpcChain } = {};
    const { chain, asked } = await fundedChain(node, { seen: (id) => id === '916' && fees.push({ at: id, a: held.chain?.getBtcTx(a995.id)?.feeSat, b: held.chain?.getBtcTx(b985.id)?.feeSat }) });
    held.chain = chain;
    await chain.askCommitFees([b985.id, a995.id]);
    // Two batches from #980 down: as the second goes out, the first has given #995's commit its fee
    expect(asked).toEqual(heightsDown(980, 128));
    expect(fees).toEqual([{ at: '916', a: 308, b: undefined }]);
    expect([a995, b985].map((p) => chain.getBtcTx(p.id)?.feeSat)).toEqual([308, 308]);
  });

  it('one search at a time: a commit asked while another search reads waits for it, no height is read twice, and its fee comes from what that search kept (D-081)', async () => {
    // #990's commit spends a transaction no settlement gives, so its search reads every height below the blocks loaded down to #750;
    // #985's spends the change of #940's commit, which that search reads on its way
    const [p990] = fundedPairs(1, 'e1'.repeat(32)) as [Funded];
    const [p940, p985] = fundedPairs(2, 'e2'.repeat(32)) as [Funded, Funded];
    const at = new Map([[940, p940], [985, p985], [990, p990]]);
    const node = syntheticNode({ tip: 1000, opsAt: [940, 985, 990], finalAt: 0, settlementAt: (h) => at.get(h)?.hex });
    const { chain, asked } = await fundedChain(node);
    expect(chain.getBtcTx(p985.id)?.feeSat).toBeUndefined();
    await Promise.all([chain.askCommitFees([p990.id]), chain.askCommitFees([p985.id])]);
    expect(asked).toEqual(heightsDown(980, 231));
    expect(chain.getBtcTx(p985.id)?.feeSat).toBe(308);
    expect(chain.getBtcTx(p990.id)?.feeSat).toBeUndefined();
  });

  it('a main-chain switch reaching below the blocks walked has the heights read for what commits spend read again (D-081)', async () => {
    const [old960, old990] = fundedPairs(2, 'c1'.repeat(32)) as [Funded, Funded];
    const [new960, new990] = fundedPairs(2, 'c2'.repeat(32)) as [Funded, Funded];
    let switched = false;
    const settlementAt = (h: number) => (h === 960 ? (switched ? new960 : old960) : h === 990 ? (switched ? new990 : old990) : undefined)?.hex;
    // From #950 up, the chain switched to is another branch, its #960 and #990 carrying other settlements
    const node = syntheticNode({ tip: 1000, opsAt: [960, 990], finalAt: 0, era: (h) => (switched && h >= 950 ? 1 : 0), settlementAt });
    const { chain, asked } = await fundedChain(node);
    await chain.askCommitFees([old990.id]);
    expect(asked).toEqual(heightsDown(980, 64));
    expect(chain.getBtcTx(old990.id)?.feeSat).toBe(308);
    switched = true;
    await chain.sync();
    expect(chain.getBlock(990)?.hash).toBe(node.hash(990));
    asked.length = 0;
    await chain.askCommitFees([new990.id]);
    expect(asked).toEqual(heightsDown(980, 64));
    expect(chain.getBtcTx(new990.id)?.feeSat).toBe(308);
  });

  it('the commits read outlast the blocks pruning drops: a block opened again has its commit’s fee as it opens (D-081)', async () => {
    const [p900, p910, p920] = fundedPairs(3, 'd1'.repeat(32)) as [Funded, Funded, Funded];
    const at = new Map([[900, p900], [910, p910], [920, p920]]);
    let now = 1_800_000_000_000;
    // 4,060 blocks from the tip, more than the cache keeps, down to #950, whose settlement status says it is BTC-final
    const node = syntheticNode({ tip: 5000, opsAt: [900, 910, 920, 950], finalAt: 950, settlementAt: (h) => at.get(h)?.hex });
    const { chain, asked } = await fundedChain(node, { window: 4060, now: () => now });
    await settle(chain, [['block', '920']]);
    await chain.askCommitFees([p920.id]);
    expect(chain.getBtcTx(p920.id)?.feeSat).toBe(308);
    // Eleven minutes on, no page holds the block: the cache drops it with its transactions
    now += 11 * 60_000;
    await chain.sync();
    expect(chain.getBlock(920)).toBeUndefined();
    expect(chain.getBtcTx(p920.id)).toBeUndefined();
    // Opened again, its commit spends the change of #910's, read before: only the block's own status is read
    asked.length = 0;
    await settle(chain, [['block', '920']]);
    expect(asked).toEqual(['920']);
    expect(chain.getBtcTx(p920.id)?.feeSat).toBe(308);
  });

  it('a node that funds its settlements with its producer account’s key, as ksana-keytool sets it up, has its change named as that account (SPEC §7.7)', () => {
    const r = Object.entries((fx as Fixture).calls)
      .map(([key, v]) => (key.startsWith('ksana_getBlock ') ? (v.result as { hash: string; header: { height: string; producer: string }; settlement: { commit: string; reveal: string } | null } | undefined) : undefined))
      .find((x) => x?.settlement);
    if (!r?.settlement) throw new Error('the recording holds no settlement');
    const producer = r.header.producer;
    const block = { hash: r.hash, height: Number(r.header.height), producer, time: 0 };
    const [commit, reveal] = [r.settlement.commit, r.settlement.reveal].map((hex) => parseTx(fromHex(hex))) as [Tx, Tx];
    const theirs = parseSettlement({ commit: serializeTx(commit), reveal: serializeTx(reveal) }, block, DEVNET, 'regtest');
    const change = theirs?.commit.outputs.findIndex((o) => o.role === 'change') ?? -1;
    expect(change).toBeGreaterThanOrEqual(0);
    expect(theirs?.commit.outputs[change]?.owner).toBeNull();
    // The recording's nodes fund with keys of their own; the same pair with its change paying the producer account's address
    const script = Uint8Array.of(0x51, 0x20, ...fromHex(producer, 32));
    const own: Tx = { ...commit, outputs: commit.outputs.map((o, vout) => (vout === change ? { ...o, script } : o)) };
    const spends = (i: Tx['inputs'][number]) => toHex(i.txid) === toHex(txid(commit));
    const revealOwn: Tx = { ...reveal, inputs: reveal.inputs.map((i) => (spends(i) ? { ...i, txid: txid(own) } : i)) };
    const mine = parseSettlement({ commit: serializeTx(own), reveal: serializeTx(revealOwn) }, block, DEVNET, 'regtest');
    expect(mine?.commit.outputs[change]).toMatchObject({ role: 'change', owner: producer, address: accountToAddress(fromHex(producer, 32), 'regtest') });
    expect(mine?.commit.outputs.filter((o) => o.owner !== null).length).toBe(1);
    expect(mine?.commit.inputs.every((i) => i.owner === null)).toBe(true);
  });

  it('a reveal transaction is read as the node reads it: a KSN1 output beside its envelope leaves it carrying nothing (D-081, D-133)', () => {
    const r = Object.entries((fx as Fixture).calls)
      .map(([key, v]) => (key.startsWith('ksana_getBlock ') ? (v.result as { hash: string; header: { height: string; producer: string }; settlement: { commit: string; reveal: string } | null } | undefined) : undefined))
      .find((x) => x?.settlement);
    if (!r?.settlement) throw new Error('the recording holds no settlement');
    const block = { hash: r.hash, height: Number(r.header.height), producer: r.header.producer, time: 0 };
    const [commit, reveal] = [r.settlement.commit, r.settlement.reveal].map((hex) => parseTx(fromHex(hex))) as [Tx, Tx];
    expect(parseSettlement({ commit: serializeTx(commit), reveal: serializeTx(reveal) }, block, DEVNET, 'regtest')).not.toBeNull();
    const op: SdkVmOp = {
      version: 2,
      chain_id: DEVNET.chain_id,
      account: new Uint8Array(32).fill(3),
      nonce: 0n,
      fee: { kind: 'BtcNative' },
      max_gas: 1000n,
      action: { kind: 'AssetTransfer', asset: new Uint8Array(32), to: new Uint8Array(32).fill(4), amount: 1n },
      sig: { kind: 'Bip340', bytes: new Uint8Array(64) },
    };
    const both: Tx = { ...reveal, outputs: [...reveal.outputs, nativeDataOutput(op, DEVNET)] };
    expect(parseSettlement({ commit: serializeTx(commit), reveal: serializeTx(both) }, block, DEVNET, 'regtest')).toBeNull();
  });

  it('settlement batching: a block without a settlement transaction has its body carried by a later block, and carrier points to it (D-077)', async () => {
    const { chain } = await load();
    let carried = 0;
    for (const b of chain.blocks.filter(Boolean)) {
      if (!b.needsSettlement || b.settlementTxid) continue;
      if (!b.carrier) continue;
      const carrier = chain.getBlock(b.carrier);
      expect(carrier).toBeDefined();
      expect(carrier?.header.height ?? 0).toBeGreaterThan(b.header.height);
      const tx = carrier?.settlementTxid ? chain.getBtcTx(carrier.settlementTxid) : undefined;
      if (tx) {
        expect(tx.bodies).toContain(b.hash);
        expect(tx.headers).toContain(b.hash);
      }
      // The on-chain position of the body is the transaction that carries it
      if (b.settlementOnBtc && tx?.confirmedHeight !== undefined) expect(b.settlementOnBtc.btcHeight).toBe(tx.confirmedHeight);
      carried++;
    }
    expect(carried).toBeGreaterThan(0);
    // The on-chain position of the header comes from a reveal transaction whose payload included it, and is no later than the body's
    for (const b of chain.blocks.filter(Boolean)) {
      if (!b.headerOnBtc) continue;
      const tx = chain.getBtcTx(b.headerOnBtc.txid);
      expect(tx?.headers).toContain(b.hash);
      if (b.settlementOnBtc) expect(b.headerOnBtc.btcHeight).toBeLessThanOrEqual(b.settlementOnBtc.btcHeight);
    }
  });

  it('path B op: the account is the output key of the Taproot address (D-092), and the status agrees with the node', async () => {
    const { chain, f } = await load();
    const r = chain.getOp(f.meta.op);
    expect(r?.path).toBe('B');
    expect(r?.op.account).toBe(f.meta.account);
    expect(r?.op.fee.kind).toBe('Token');
    const address = chain.addressOf(f.meta.account);
    expect(decodeAddress(address).networks).toContain('regtest');
    expect(chain.accountOfAddress(address)).toBe(f.meta.account);
    const st = f.calls[keyOf('ksana_getOpStatus', [r?.id])]?.result as { status: string; block: { height: string } } | undefined;
    if (st && r) {
      expect(Number(st.block.height)).toBe(r.height);
      const mine = opStatusOf(chain, r);
      expect(mine === 'btc_final' ? 'btc_final' : 'fast_confirmed').toBe(st.status === 'btc_final' ? 'btc_final' : 'fast_confirmed');
    }
  });

  it('ksana_estimateFee: the suggested path B amount and the settlement fee rate come from the node; path C is quoted by transaction size', async () => {
    const { chain, f } = await load();
    const est = f.calls[keyOf('ksana_estimateFee', [])]?.result as { feerate_sat_vb: string; path_b: { amount: string } };
    const mine = chain.estimateFee();
    expect(mine.pathB.amount).toBe(BigInt(est.path_b.amount));
    expect(mine.feerateSatVb).toBe(Number(est.feerate_sat_vb));
    const small = mine.pathC(120);
    expect(small).toBeGreaterThan(0);
    expect(mine.pathC(400)).toBeGreaterThan(small);
    expect(mine.pathC(120, mine.feerateSatVb * 2)).toBeGreaterThanOrEqual(small * 2 - 1);
  });

  it('ksana_estimateFee: an op is suggested its own cost at the node’s fee rate, not below the amount for a plain transfer (RPC.md, D-095)', async () => {
    for (const [pathB, basis] of [
      [{ amount: '300', per_kib: '2048' }, 'rate'],
      [{ amount: '7', per_kib: '0' }, 'minimum'],
    ] as const) {
      const node = syntheticNode({ tip: 10, opsAt: [], finalAt: 10, pathB });
      const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20 });
      await chain.sync();
      const est = chain.estimateFee();
      expect(est.pathB.amount).toBe(BigInt(pathB.amount));
      expect(est.pathB.basis).toBe(basis);
      // At 2 per byte: 400 bytes cost 800; max_gas 1,000,000 costs 819 bytes (80 KiB of data per 100,000,000 gas), 1,638; 100 bytes
      // would cost 200, below the plain transfer's 300. At a rate of 0 the suggestion is the node's minimum, whatever the op
      expect(est.pathB.forOp(400, 50_000)).toBe(basis === 'rate' ? 800n : 7n);
      expect(est.pathB.forOp(400, 1_000_000)).toBe(basis === 'rate' ? 1638n : 7n);
      expect(est.pathB.forOp(100, 50_000)).toBe(basis === 'rate' ? 300n : 7n);
    }
  });

  it('account: balances come from ksana_getAccount and the op list is sorted by acceptance height', async () => {
    const { chain, f } = await load();
    const acc = chain.peekAccount(f.meta.account);
    expect(acc).toBeDefined();
    if (!acc) return;
    expect(acc.balances.get('0'.repeat(64)) ?? 0n).toBeGreaterThan(0n);
    // An operation merged blocks only skipped goes at the height of the first block that merged one, where the node lists it (D-111)
    const heightOf = (id: string) => {
      const r = chain.getOp(id);
      return r?.height ?? Math.min(...(r?.skippedIn ?? []).map((s) => chain.getBlock(s.block)?.acceptedHeight ?? Infinity));
    };
    const heights = acc.opIds.map(heightOf);
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
  });

  it("locked portions: a block's producer, its carrier and the block share account each keep theirs, and only the carrier's is marked (D-089, D-095)", async () => {
    const tip = (fx as Fixture).calls[keyOf('ksana_getBlock', ['latest'])]?.result as { hash: string; header: { producer: string } };
    const producer = tip.header.producer;
    // The recording's other producer landed the tip's data on Bitcoin; the account the recording follows, which produces no blocks,
    // stands for the block share account
    const carrier = (await load()).chain.producers.find((p) => p.id !== producer)?.id as string;
    const share = (fx as Fixture).meta.account;
    expect(new Set([producer, carrier, share]).size).toBe(3);
    const { chain } = await load(12, (f) => {
      const recorded = f.calls[keyOf('ksana_getAccount', [share])]?.result as Record<string, unknown>;
      const locked = (account: string, amount: string) => ({ result: { ...recorded, account, locked_fees: [{ block_hash: tip.hash, amount }] } });
      f.calls[keyOf('ksana_getAccount', [share])] = locked(share, '20');
      f.calls[keyOf('ksana_getAccount', [carrier])] = locked(carrier, '7');
      f.calls[keyOf('ksana_getAccount', [producer])] = locked(producer, '73');
    });
    // The block share account's was read first; the others, read after it, used to take the block's one entry in turn
    await settle(chain, [
      ['account', carrier],
      ['account', producer],
    ]);
    const portion = (account: string) => lockedFeesOf(chain, account).rows.map((f) => ({ block: f.blockHash, amount: f.amount, asCarrier: f.asCarrier }));
    expect(portion(share)).toEqual([{ block: tip.hash, amount: 20n, asCarrier: undefined }]);
    expect(portion(carrier)).toEqual([{ block: tip.hash, amount: 7n, asCarrier: true }]);
    expect(portion(producer)).toEqual([{ block: tip.hash, amount: 73n, asCarrier: undefined }]);
  });

  it('indexer check: the state_root at the same height matches the node block header', async () => {
    const { chain } = await load();
    expect(chain.indexerChecks.length).toBeGreaterThan(0);
    for (const c of chain.indexerChecks) expect(c.indexerRoot).toBe(c.nodeRoot);
  });

  it('fetches earlier blocks on demand; for a full hash not in the cache, search offers an entry point to query the node', async () => {
    const { chain } = await load();
    expect(chain.getBlock(3)?.header.height).toBe(3);
    const hits = search(chain, 'ab'.repeat(32));
    expect(hits.map((h) => h.kind)).toEqual(expect.arrayContaining(['block', 'op']));
  });

  it("a BTC transaction's link names its block, which a page opened anew below the window reads for it: the node looks one up by its block only", async () => {
    const { chain: full } = await load();
    const low = full.tip.header.height - (fx as Fixture).meta.window + 1;
    // A block below the window with a settlement of its own, which the backfill read and the window alone does not
    const block = full.blocks.find((b): b is Block => !!b && b.header.height < low && b.settlementTxid !== undefined) as Block;
    const reveal = block.settlementTxid as string;
    const commit = full.getBtcTx(reveal)?.commitTxid as string;
    const height = String(block.header.height);
    expect(txRoute(full, reveal)).toEqual({ name: 'tx', id: reveal, block: height });
    expect(txRoute(full, commit)).toEqual({ name: 'tx', id: commit, block: height });
    const { chain, missed } = await load(0);
    expect(chain.getBlock(block.hash)).toBeUndefined();
    expect(chain.getBtcTx(reveal)).toBeUndefined();
    await settle(chain, [['block', height]]);
    expect(missed).toEqual([]);
    expect(chain.getBtcTx(reveal)).toMatchObject({ kind: 'settlement', forBlock: block.hash, commitTxid: commit });
    expect(chain.getBtcTx(commit)).toMatchObject({ kind: 'commit', forBlock: block.hash, revealTxid: reveal });
    expect(txRoute(chain, reveal)).toEqual(txRoute(full, reveal));
  });

  it('an empty block opened below the window names the settlement that carried its header, the next one above it, from its first frame (D-075)', async () => {
    const { chain: full } = await load();
    const low = full.tip.header.height - (fx as Fixture).meta.window + 1;
    // An empty block below the window, which the backfill read with the next block above it to send a settlement
    const block = full.blocks.find((b): b is Block => !!b && b.header.height > 3 && b.header.height < low && !b.needsSettlement && !b.settlementTxid) as Block;
    const next = full.blocks.find((b): b is Block => !!b && b.header.height > block.header.height && b.settlementTxid !== undefined) as Block;
    const carrier = full.getBtcTx(next.settlementTxid as string) as BtcTx;
    expect(carrier.headers).toContain(block.hash);
    expect(carrier.status).toBe('confirmed');
    const { chain, missed } = await load(0);
    expect(chain.getBlock(block.hash)).toBeUndefined();
    expect(chain.getBlock(next.hash)).toBeUndefined();
    await settle(chain, [['block', String(block.header.height)]]);
    expect(missed).toEqual([]);
    // As its lookup ends, which is the page's first frame
    const opened = chain.getBlock(block.hash) as Block;
    expect(chain.headerCarrierRead(block.hash)).toBe(true);
    expect(headerCarrier(chain, opened)).toMatchObject({ txid: carrier.txid, kind: 'settlement', forBlock: next.hash, status: 'confirmed' });
    expect(opened.headerOnBtc).toEqual({ txid: carrier.txid, btcHeight: carrier.confirmedHeight });
    expect(blockStage(chain, opened)).toBe(blockStage(full, block));
  });

  /** Heights from `from` up, `count` of them, as the synthetic node counts the blocks read */
  const heightsUp = (from: number, count: number) => Array.from({ length: count }, (_, k) => String(from + k));

  it('the search ends at the first block above to send a settlement, whose payload may not carry the header: a republish landed it first (D-047)', async () => {
    const [pair] = fundedPairs(1, 'a2'.repeat(32)) as [Funded];
    // #905's settlement carries the recording's headers, none of this chain's
    const node = syntheticNode({ tip: 1000, opsAt: [905], finalAt: 0, settlementAt: (h) => (h === 905 ? pair.hex : undefined) });
    const { chain } = await fundedChain(node);
    const id = node.hash(900);
    node.asked.clear();
    await settle(chain, [['block', '900']]);
    // The block, then the eight heights above it read first, #905 among them: none higher
    expect([...node.asked.keys()]).toEqual(heightsUp(900, 9));
    expect(chain.headerCarrierRead(id)).toBe(true);
    expect(headerCarrier(chain, chain.getBlock(900) as Block)).toBeUndefined();
    // Asked again as the page draws: nothing is read
    node.asked.clear();
    await chain.askHeaderCarrier(id);
    expect(node.asked.size).toBe(0);
  });

  it('the search reads no further than 240 heights above the block, nor any height the page holds', async () => {
    const node = syntheticNode({ tip: 1000, opsAt: [], finalAt: 0 });
    const { chain } = await fundedChain(node);
    node.asked.clear();
    await settle(chain, [['block', '500']]);
    expect([...node.asked.keys()]).toEqual(heightsUp(500, 241));
    expect(chain.headerCarrierRead(node.hash(500))).toBe(true);
    // One just below the 20 blocks loaded from the tip: the search stops where they start
    node.asked.clear();
    await settle(chain, [['block', '975']]);
    expect([...node.asked.keys()]).toEqual(heightsUp(975, 6));
    // One among them asks nothing
    node.asked.clear();
    await chain.askHeaderCarrier(node.hash(990));
    expect(node.asked.size).toBe(0);
  });

  it('a search whose reads failed is asked again a minute later, not before, and the page says nothing of the carrier meanwhile', async () => {
    const [pair] = fundedPairs(1, 'a3'.repeat(32)) as [Funded];
    const node = syntheticNode({ tip: 1000, opsAt: [905], finalAt: 0, settlementAt: (h) => (h === 905 ? pair.hex : undefined) });
    let down = false;
    const failing = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
      const h = body.method === 'ksana_getBlock' ? Number(body.params[0]) : Number.NaN;
      if (!down || !(h > 900)) return node.fetch(url, init);
      const error = { code: -32603, message: 'storage error' };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    let now = 1_800_000_000_000;
    const { chain } = await fundedChain({ fetch: failing }, { now: () => now });
    const id = node.hash(900);
    down = true;
    await settle(chain, [['block', '900']]);
    expect(chain.lookup('block', '900')).toBeUndefined();
    expect(chain.headerCarrierRead(id)).toBe(false);
    down = false;
    node.asked.clear();
    now += 59_000;
    await chain.askHeaderCarrier(id);
    expect(node.asked.size).toBe(0);
    now += 1_000;
    await chain.askHeaderCarrier(id);
    expect([...node.asked.keys()]).toEqual(heightsUp(901, 8));
    expect(chain.headerCarrierRead(id)).toBe(true);
  });

  it('the searches of a page of empty blocks below the window, asked together, read each height above them once, and the carrier once', async () => {
    const [pair] = fundedPairs(1, 'a4'.repeat(32)) as [Funded];
    const node = syntheticNode({ tip: 1000, opsAt: [700], finalAt: 0, settlementAt: (h) => (h === 700 ? pair.hex : undefined) });
    const { chain, asked } = await fundedChain(node);
    node.asked.clear();
    // The blocks page's 25 rows from #524 down, asked highest first as it asks them
    await settle(chain, heightsDown(524, 25).map((h) => ['block', h] as ['block', string]));
    // Each search went up to #700, which carries settlement transactions: it read up to 240 heights above each of the 25
    expect([...node.asked].filter(([, n]) => n > 1)).toEqual([]);
    expect(node.asked.has('700')).toBe(true);
    expect(Math.max(...[...node.asked.keys()].map(Number))).toBeLessThan(700 + 64);
    expect(asked.filter((id) => id === node.hash(700))).toEqual([node.hash(700)]);
    for (const h of heightsDown(524, 25)) expect(chain.headerCarrierRead(node.hash(Number(h)))).toBe(true);
  });

  it('the blocks a search reads are kept with the parallel blocks they merge, and the carrier with its settlement status, as their lookups would read them', async () => {
    const [pair] = fundedPairs(1, 'a5'.repeat(32)) as [Funded];
    // #904 merges a parallel block beside #903; #905's settlement carries the recording's headers, none of this chain's
    const node = syntheticNode({ tip: 1000, opsAt: [905], finalAt: 0, settlementAt: (h) => (h === 905 ? pair.hex : undefined), skipped: { at: 903, nonce: 1, status: () => 'skipped' } });
    const { chain, asked } = await fundedChain(node);
    const side = 'ee'.repeat(32);
    node.asked.clear();
    await settle(chain, [['block', '900']]);
    expect(node.asked.get(side)).toBe(1);
    expect(chain.getBlock(side)?.acceptedHeight).toBe(904);
    // Its page opens without a lookup, and the carrier's with its status
    expect(asked).toEqual(['900', node.hash(905)]);
    expect((chain as unknown as { settlementInfo: Map<string, unknown> }).settlementInfo.has(node.hash(905))).toBe(true);
  });

  it('the searches waiting behind one whose reads time out end with it, rather than each wait out the same reads, and a later one reads again', async () => {
    const [pair] = fundedPairs(1, 'a6'.repeat(32)) as [Funded];
    const node = syntheticNode({ tip: 1000, opsAt: [700], finalAt: 0, settlementAt: (h) => (h === 700 ? pair.hex : undefined) });
    let slow = false;
    const unanswered: string[] = [];
    const failing = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      const h = body.method === 'ksana_getBlock' ? Number(body.params[0]) : Number.NaN;
      if (!slow || !(h > 524)) return node.fetch(url, init);
      unanswered.push(String(h));
      // As the client aborts a read the node has not answered in its time
      throw new DOMException('The operation was aborted.', 'AbortError');
    }) as typeof fetch;
    let now = 1_800_000_000_000;
    const { chain } = await fundedChain({ fetch: failing }, { now: () => now });
    const rows = heightsDown(524, 25);
    slow = true;
    await settle(chain, rows.map((h) => ['block', h] as ['block', string]));
    // The first search read the heights above the rows, each once; those behind it read nothing
    expect(unanswered.length).toBeGreaterThan(0);
    expect(new Set(unanswered).size).toBe(unanswered.length);
    for (const h of rows) expect(chain.headerCarrierRead(node.hash(Number(h)))).toBe(false);
    // Asked again a minute later, as a page asks
    slow = false;
    now += 60_000;
    await chain.askHeaderCarrier(node.hash(524));
    expect(chain.headerCarrierRead(node.hash(524))).toBe(true);
  });

  it('a search asked again after the parallel blocks it went to read failed reads them then, from the blocks the one before kept', async () => {
    const [pair] = fundedPairs(1, 'a7'.repeat(32)) as [Funded];
    // #904 merges a parallel block beside #903, which the node fails to give the first time
    const node = syntheticNode({ tip: 1000, opsAt: [905], finalAt: 0, settlementAt: (h) => (h === 905 ? pair.hex : undefined), skipped: { at: 903, nonce: 1, status: () => 'skipped' } });
    const side = 'ee'.repeat(32);
    let down = true;
    const failing = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
      if (!down || body.method !== 'ksana_getBlock' || body.params[0] !== side) return node.fetch(url, init);
      const error = { code: -32603, message: 'storage error' };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    let now = 1_800_000_000_000;
    const { chain } = await fundedChain({ fetch: failing }, { now: () => now });
    const id = node.hash(900);
    await settle(chain, [['block', '900']]);
    expect(chain.getBlock(side)).toBeUndefined();
    expect(chain.headerCarrierRead(id)).toBe(false);
    down = false;
    node.asked.clear();
    now += 60_000;
    await chain.askHeaderCarrier(id);
    // The heights above #900 are not read again, the parallel block is
    expect([...node.asked.keys()]).toEqual([side]);
    expect(chain.getBlock(side)?.acceptedHeight).toBe(904);
    expect(chain.headerCarrierRead(id)).toBe(true);
  });

  it('a block kept whose header carrier pruning drops names it no longer, and is searched for again as its page asks', async () => {
    const [pair] = fundedPairs(1, 'a8'.repeat(32)) as [Funded];
    let now = 1_800_000_000_000;
    // More blocks than the page keeps: those far below the tip and BTC-final, below #950 here, go as it prunes unless a page holds them
    const node = syntheticNode({ tip: 5000, opsAt: [905, 950], finalAt: 950, settlementAt: (h) => (h === 905 ? pair.hex : undefined) });
    const { chain } = await fundedChain(node, { window: 4060, now: () => now });
    await settle(chain, [['block', '900']]);
    // #905's payload carries the recording's headers, none of this chain's: as if it carried #900's
    const id = node.hash(900);
    const reveal = chain.getBlock(905)?.settlementTxid as string;
    (chain as unknown as { carriers: Map<string, Set<string>> }).carriers.set(id, new Set([reveal]));
    expect(headerCarrier(chain, chain.getBlock(900) as Block)?.txid).toBe(reveal);
    // Its page asks for #900 again, which holds it; nothing holds #905 by the next sync
    now += 6 * 60_000;
    await settle(chain, [['block', '900']]);
    now += 5 * 60_000;
    await chain.sync();
    expect(chain.getBlock(905)).toBeUndefined();
    expect(headerCarrier(chain, chain.getBlock(900) as Block)).toBeUndefined();
    expect(chain.headerCarrierRead(id)).toBe(false);
    node.asked.clear();
    await chain.askHeaderCarrier(id);
    expect(node.asked.has('905')).toBe(true);
    expect(chain.headerCarrierRead(id)).toBe(true);
  });

  /** The highest chain block in the window that has ops (the tip may have been an empty block when recording), and its raw answer in the fixture */
  const withOps = (chain: RpcChain, f: Fixture) => {
    const H = chain.tip.header.height;
    let K = H;
    while (K > chain.loadedFrom + 1 && opIdsOf(chain.blocks[K] as Block).length === 0) K--;
    const block = chain.blocks[K] as Block;
    expect(opIdsOf(block).length).toBeGreaterThan(0);
    const raw = f.calls[keyOf('ksana_getBlock', [K === H ? 'latest' : String(K)])]?.result as { header: Record<string, unknown> };
    return { H, K, block, raw };
  };

  it('main-chain switch: another block at the same height becomes the selected parent and the former chain block is merged by the new tip as a parallel block', async () => {
    const { chain, missed, f } = await load(0);
    const oldTip = chain.tip;
    const { H, K, block: old, raw } = withOps(chain, f);
    const ALT = 'ee'.repeat(32);
    const NEXT = 'dd'.repeat(32);
    const empty = { entries: [], receipts: [], settlement: null, merged: [] };
    // ALT: an empty block with the same parent as the original block; NEXT: the new tip built on ALT, which merges the original block
    f.calls[keyOf('ksana_getBlock', [ALT])] = { result: { ...raw, ...empty, hash: ALT, accepted_height: String(K) } };
    f.calls[keyOf('ksana_getBlock', ['latest'])] = {
      result: { ...raw, ...empty, hash: NEXT, header: { ...raw.header, height: String(K + 1), parents: [ALT, old.hash] }, merged: [old.hash], accepted_height: String(K + 1) },
    };
    f.calls[keyOf('ksana_getBlock', [old.hash])] = { result: { ...raw, accepted_height: String(K + 1) } };
    await chain.sync();
    expect(missed).toEqual([]);
    expect(chain.conn.state).toBe('live');
    expect(chain.tip.hash).toBe(NEXT);
    expect(chain.blocks.length).toBe(K + 2);
    expect(chain.blocks[K]?.hash).toBe(ALT);
    const merged = chain.getBlock(old.hash);
    expect(merged?.side).toBe(true);
    expect(merged?.acceptedHeight).toBe(K + 1);
    expect(merged?.acceptedBy).toBe(NEXT);
    expect(chain.sideAt(K).map((b) => b.hash)).toContain(old.hash);
    // The ops in the original block still point to it (now accepted by the new tip)
    for (const id of opIdsOf(old)) expect(chain.getOp(id)?.blockHash).toBe(old.hash);
    if (K < H) expect(chain.getBlock(oldTip.hash)).toBeUndefined();
  });

  it('the tip gets lower: the blocks above it are no longer chain blocks and the ops in them lose their position', async () => {
    const { chain, missed, f } = await load(0);
    const { K, block: old } = withOps(chain, f);
    const below = chain.blocks[K - 1] as Block;
    f.calls[keyOf('ksana_getBlock', ['latest'])] = f.calls[keyOf('ksana_getBlock', [String(K - 1)])] as Fixture['calls'][string];
    await chain.sync();
    expect(missed).toEqual([]);
    expect(chain.tip.hash).toBe(below.hash);
    expect(chain.blocks.length).toBe(K);
    expect(chain.getBlock(old.hash)).toBeUndefined();
    for (const id of opIdsOf(old)) {
      const r = chain.getOp(id);
      expect(r).toBeDefined();
      expect(r?.blockHash).toBeUndefined();
      expect(r?.height).toBeUndefined();
    }
  });

  it('a former parallel block becomes the tip: when the block that merged it is discarded, it is not discarded with it', async () => {
    const SIDE = 'cc'.repeat(32);
    const latest = (fx as Fixture).calls[keyOf('ksana_getBlock', ['latest'])]?.result as { header: { height: string } };
    const H = Number(latest.header.height) - 3;
    const rawAt = (f: Fixture, h: number) => f.calls[keyOf('ksana_getBlock', [String(h)])]?.result as { hash: string; header: { parents: string[] } } & Record<string, unknown>;
    // Before the first sync: add at height H a parallel block SIDE with the same parent as the chain block, merged by the chain block at H + 1
    const { chain, missed, f } = await load(0, (f) => {
      const p = rawAt(f, H);
      const t = rawAt(f, H + 1);
      f.calls[keyOf('ksana_getBlock', [SIDE])] = { result: { ...p, hash: SIDE, entries: [], receipts: [], settlement: null, merged: [], accepted_height: String(H + 1) } };
      f.calls[keyOf('ksana_getBlock', [String(H + 1)])] = { result: { ...t, header: { ...t.header, parents: [...t.header.parents, SIDE] }, merged: [SIDE] } };
    });
    const by = chain.blocks[H + 1] as Block;
    const replaced = chain.blocks[H] as Block;
    expect(chain.getBlock(SIDE)?.acceptedBy).toBe(by.hash);
    // The node changes its answer: SIDE becomes a chain block (the tip drops to H)
    f.calls[keyOf('ksana_getBlock', ['latest'])] = { result: { ...(f.calls[keyOf('ksana_getBlock', [SIDE])]?.result as object), accepted_height: String(H) } };
    await chain.sync();
    expect(missed).toEqual([]);
    expect(chain.ready).toBe(true);
    expect(chain.tip.hash).toBe(SIDE);
    expect(chain.blocks.length).toBe(H + 1);
    expect(chain.tip.side).toBeUndefined();
    expect(chain.tip.acceptedBy).toBe(SIDE);
    expect(chain.getBlock(by.hash)).toBeUndefined();
    expect(chain.getBlock(replaced.hash)).toBeUndefined();
  });

  it('the BTC tip is not below any height inferred from a settlement confirmation', async () => {
    const { chain } = await load();
    for (const tx of chain.allBtcTxs()) if (tx.confirmedHeight !== undefined) expect(chain.btcTip.height).toBeGreaterThanOrEqual(tx.confirmedHeight);
    expect(chain.btcTip.height).toBeGreaterThanOrEqual(chain.tip.header.btcAnchor.height);
    expect(PARAMS.BTC_FINALITY_CONFS).toBe(6);
  });

  it('a node on another network than the page, on mainnet or on none is refused before anything else is read (A2-11)', async () => {
    for (const chainId of [1002, 1000, 4242]) {
      const f: Fixture = { ...(fx as Fixture), calls: { ...(fx as Fixture).calls, [keyOf('ksana_getChainInfo', [])]: chainInfo(fx as Fixture, chainId) } };
      const asked: string[] = [];
      const replay = replayFetch(f, []);
      const watched = (async (url: RequestInfo | URL, init?: RequestInit) => {
        asked.push((JSON.parse(String(init?.body)) as { method: string }).method);
        return replay(url, init);
      }) as typeof fetch;
      const chain = new RpcChain({ url: 'http://node.test', indexerUrl: 'http://indexer.test', chain: 'devnet' }, { fetch: watched, manual: true, window: f.meta.window, now: () => f.meta.recordedAt });
      await chain.sync();
      expect(chain.conn.state).toBe('error');
      expect(chain.ready).toBe(false);
      expect(asked).toEqual(['ksana_getChainInfo']);
      const e = chain.conn.error;
      expect(e).toBeInstanceOf(ChainMismatchError);
      expect((e as ChainMismatchError).chainId).toBe(chainId);
      expect((e as ChainMismatchError).expected).toBe(PARAMS.CHAIN_ID);
      // the page says which network the node is on, not that it is unreachable
      expect(explainRpcError(e, 'http://node.test')).toBe(explainChainMismatch(e as ChainMismatchError));
      expect(explainRpcError(e, 'http://node.test')).toContain(String(chainId));
    }
  });

  it('a node that answers 502 while it restarts is said to be down for a moment, and the page opens once it answers', async () => {
    const f: Fixture = { ...(fx as Fixture), calls: { ...(fx as Fixture).calls } };
    f.calls[keyOf('ksana_getChainInfo', [])] ??= chainInfo(f, PARAMS.CHAIN_ID);
    let down = true;
    const replay = replayFetch(f, []);
    const restarting = (async (url: RequestInfo | URL, init?: RequestInit) =>
      down ? new Response('Bad Gateway', { status: 502 }) : replay(url, init)) as typeof fetch;
    const chain = new RpcChain({ url: '/rpc', chain: 'devnet' }, { fetch: restarting, manual: true, window: f.meta.window, now: () => f.meta.recordedAt });
    await chain.sync();
    expect(chain.conn.state).toBe('error');
    expect(chain.conn.error).toBeInstanceOf(RpcTransportError);
    expect(explainRpcError(chain.conn.error, '/rpc')).toBe(t().source.error.unavailable('/rpc', '502'));
    down = false;
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    expect(chain.ready).toBe(true);
    // a path on the page's own server that gets no answer at all: no cross-origin setting to name
    const lost = new RpcTransportError('ksana_getChainInfo: request failed: Failed to fetch');
    expect(explainRpcError(lost, '/rpc')).toBe(t().source.error.offline('/rpc'));
    expect(explainRpcError(lost, 'http://node.test')).toContain('--rpc-cors');
    expect(explainRpcError(lost, '//node.test/rpc')).toContain('--rpc-cors');
    // the page's own origin written out is its own server too; a path is named with the server, as "/rpc" said nothing of where it was
    vi.stubGlobal('location', { origin: 'https://signet.example', href: 'https://signet.example/#/wallet' });
    try {
      expect(explainRpcError(lost, 'https://signet.example/rpc')).toBe(t().source.error.offline('https://signet.example/rpc'));
      expect(explainRpcError(lost, 'rpc')).toBe(t().source.error.offline('https://signet.example/rpc'));
      expect(explainRpcError(lost, '/rpc')).toBe(t().source.error.offline('https://signet.example/rpc'));
      expect(explainRpcError(lost, 'https://node.example/rpc')).toContain('--rpc-cors');
      expect(explainRpcError(lost, '//node.example/rpc')).toContain('--rpc-cors');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a first load whose genesis block fails stops asking for the other blocks', async () => {
    const f: Fixture = { ...(fx as Fixture), calls: { ...(fx as Fixture).calls } };
    f.calls[keyOf('ksana_getChainInfo', [])] ??= chainInfo(f, PARAMS.CHAIN_ID);
    const replay = replayFetch(f, []);
    const latest = keyOf('ksana_getBlock', ['latest']);
    let blocks = 0;
    const failing = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
      if (body.method !== 'ksana_getBlock' || body.params[0] === 'latest') return replay(url, init);
      blocks++;
      // the genesis block, the first of the heights, fails while the next eleven are on their way
      if (String(body.params[0]) === '0') {
        await new Promise((r) => setTimeout(r, 5));
        return new Response('Bad Gateway', { status: 502 });
      }
      await new Promise((r) => setTimeout(r, 30));
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, ...f.calls[latest] }), { status: 200 });
    }) as typeof fetch;
    // a window of 40 blocks, fetched twelve at a time
    const chain = new RpcChain({ url: '/rpc', chain: 'devnet' }, { fetch: failing, manual: true, window: 40, now: () => f.meta.recordedAt });
    await chain.sync();
    expect(chain.conn.state).toBe('error');
    // once those eleven have answered, nothing more is asked
    await new Promise((r) => setTimeout(r, 150));
    expect(blocks).toBe(12);
  });

  it('the connecting screen says it tries again only where waiting can help', () => {
    // no answer, a timeout, a 5xx, a node at its connection limit or busy, a block gone as the tip moved: the next sync may get through
    expect(rpcErrorMayPass(new RpcTransportError('ksana_getChainInfo: request failed: Failed to fetch'))).toBe(true);
    expect(rpcErrorMayPass(new RpcTransportError('ksana_getChainInfo: HTTP 502, response is not JSON', 502))).toBe(true);
    expect(rpcErrorMayPass(new RpcTransportError('ksana_getChainInfo: HTTP 429, response is not JSON', 429))).toBe(true);
    expect(rpcErrorMayPass(new Error('The operation was aborted due to timeout'))).toBe(true);
    expect(rpcErrorMayPass(new RpcError(-32009, 'The node is busy'))).toBe(true);
    expect(rpcErrorMayPass(new RpcError(-32004, 'Block not found'))).toBe(true);
    // an address that answers something else, a node without the page's methods or of another version, another network: waiting does not mend them
    expect(rpcErrorMayPass(new RpcTransportError('ksana_getChainInfo: HTTP 404, response is not JSON', 404))).toBe(false);
    expect(rpcErrorMayPass(new RpcTransportError('ksana_getChainInfo: HTTP 200, response is not JSON', 200))).toBe(false);
    expect(rpcErrorMayPass(new RpcTransportError('malformed result: chain info missing chain_id'))).toBe(false);
    expect(rpcErrorMayPass(new RpcError(-32601, 'Method not found'))).toBe(false);
    expect(rpcErrorMayPass(new RpcError(-32602, 'Invalid params'))).toBe(false);
    expect(rpcErrorMayPass(new ChainMismatchError(1, 2, 'the node is on another network'))).toBe(false);
    // a node at its connection limit reads as not answering for the moment, as a 5xx does
    const busy = new RpcTransportError('ksana_getChainInfo: HTTP 429, response is not JSON', 429);
    expect(explainRpcError(busy, '/rpc')).toBe(t().source.error.unavailable('/rpc', '429'));
  });

  it('the chain ID is read again before anything is signed: a node that changed networks since the sync is refused', async () => {
    const { chain, f } = await load(0);
    expect(chain.conn.state).toBe('live');
    await chain.checkChain();
    f.calls[keyOf('ksana_getChainInfo', [])] = chainInfo(f, 1002);
    await expect(chain.checkChain()).rejects.toBeInstanceOf(ChainMismatchError);
    // a page set to signet takes that node, and refuses a devnet one
    const signet = new RpcChain({ url: 'http://node.test', chain: 'signet' }, { fetch: replayFetch(f, []), manual: true });
    await signet.checkChain();
    f.calls[keyOf('ksana_getChainInfo', [])] = chainInfo(f, PARAMS.CHAIN_ID);
    await expect(signet.checkChain()).rejects.toThrow(/devnet \(chain ID 1001\), not signet \(chain ID 1002\)/);
  });
});

describe('Node data source helpers', () => {
  it('the WebSocket URL follows the HTTP URL and the page protocol', () => {
    expect(wsUrlOf('http://127.0.0.1:18545')).toBe('ws://127.0.0.1:18545/');
    expect(wsUrlOf('https://node.example/rpc')).toBe('wss://node.example/rpc');
    expect(wsUrlOf('/rpc', 'https://wallet.example/app/')).toBe('wss://wallet.example/rpc');
  });

  it("classifies the failure reason of a receipt by the node's texts", () => {
    expect(failReason('skipped: nonce not consecutive: account has 145, op has 144')).toBe('skipped');
    expect(failReason('nonce mismatch')).toBe('nonce_mismatch');
    expect(failReason('trap: unreachable')).toBe('trap');
    expect(failReason('out of gas')).toBe('out_of_gas');
    expect(failReason('insufficient BTC block header depth')).toBe('btc_header_too_shallow');
    // A contract's own failure is the contract's, whatever its text says
    expect(failReason('revert: insufficient')).toBe('revert');
    expect(failReason('revert: nonce too low')).toBe('revert');
    expect(failReason('revert: insufficient balance')).toBe('revert');
    // The built-in modules' and the VM's texts (builtin.rs, executor.rs, engine.rs)
    expect(failReason('insufficient balance')).toBe('insufficient_balance');
    expect(failReason('attached funds transfer failed: insufficient balance')).toBe('insufficient_balance');
    expect(failReason('asset does not exist')).toBe('unknown_asset');
    expect(failReason('contract does not exist')).toBe('no_contract');
    expect(failReason('callee contract does not exist')).toBe('no_contract');
    expect(failReason('deployment rejected: import not allowed: env.f')).toBe('deploy_rejected');
    // A path C op: its nonce used and nothing else, or nothing at all (§7.4)
    expect(failReason('max_gas exceeds NATIVE_MAX_GAS')).toBe('native_gas');
    expect(failReason('invalid signature: invalid signature')).toBe('not_authenticated');
    expect(failReason('chain_id 2 does not match this network')).toBe('not_authenticated');
    expect(failReason('fee mode of a native op must be BtcNative')).toBe('not_authenticated');
    expect(failReason('unsupported VmOp version 3')).toBe('not_authenticated');
    expect(failReason('VmOp encoding exceeds MAX_OP_BYTES')).toBe('not_authenticated');
    // Anything else is shown as failed, with the node's text
    expect(failReason('contract call depth exceeds the limit')).toBeUndefined();
    expect(failReason('balance overflow')).toBeUndefined();
  });

  it('the ID of the contract a deployment creates, checked against two deployments on signet (SPEC §9.2, D-015)', () => {
    const deployer = fromHex('a9be1f052555f5b32ae6c156f8846444a6be0d44c21876586c3f79fc1ae42d3a', 32);
    // a token issuer, then an AMM pair: the same deployer, nonces 1 and 2
    expect(contractIdOf(deployer, 1n, fromHex('148d314784b919b2dd66a591f3c424d35c756c82910b45b865c7cabedccefb7f', 32))).toBe(
      '517f47d96fc555d18d5acfc43af7f047e7d802c2edafd99453a2887b7d37eb68',
    );
    expect(contractIdOf(deployer, 2n, fromHex('2ddf1f1cbe93c502f8ca7acdb9ac4a18e3fe07d10fc698a998240c77ee33b883', 32))).toBe(
      '8d85e4e326eae76d3b8cfbedd5b3ed13879f360c18ab1248e439176d927b41c4',
    );
  });

  it("an event's name, where its data starts with one as the example contracts' events do", () => {
    // the start of a swap event of the AMM pair on signet: ("swap", trader, …)
    const swap = fromHex('0400000073776170865539b9d038c4840f5c69b4d83e4a1481397bd02db51373bde979d57677a573', 40);
    expect(eventName(swap)).toBe('swap');
    expect(eventName(fromHex('0c000000706169725f63726561746564', 16))).toBe('pair_created');
    // no name: too short, an empty or a long length, a name cut short, or bytes that are not an identifier
    expect(eventName(new Uint8Array([4, 0, 0]))).toBeUndefined();
    expect(eventName(fromHex('00000000', 4))).toBeUndefined();
    expect(eventName(fromHex('2100000041414141', 8))).toBeUndefined();
    expect(eventName(fromHex('0400000073776170', 8).subarray(0, 7))).toBeUndefined();
    expect(eventName(fromHex('0400000073772d70', 8))).toBeUndefined();
    expect(eventName(fromHex('0400000173776170', 8))).toBeUndefined();
  });

  it("the example contracts' events by field, read by name and exact length: three of the live signet's, and the exchange's claim", () => {
    const read = (name: string, hex: string) => eventFields(name, fromHex(hex, hex.length / 2));
    // #76: the fixed-supply token's issue at its deployment
    expect(
      read('issue', '0500000069737375650841acceccfb84021c2cabfc3e05042cd58a2398438e44f8f0b6ea9cc8f0494ea9be1f052555f5b32ae6c156f8846444a6be0d44c21876586c3f79fc1ae42d3a0040075af07507000000000000000000'),
    ).toEqual({ asset: '0841acceccfb84021c2cabfc3e05042cd58a2398438e44f8f0b6ea9cc8f0494e', owner: 'a9be1f052555f5b32ae6c156f8846444a6be0d44c21876586c3f79fc1ae42d3a', supply: '2100000000000000' });
    // #80: 5 KSA (asset ID 0) swapped into the pair's other asset, which the event does not name
    expect(
      read('swap', '0400000073776170865539b9d038c4840f5c69b4d83e4a1481397bd02db51373bde979d57677a57300000000000000000000000000000000000000000000000000000000000000000065cd1d00000000000000000000000031ea33de3e0800000000000000000000'),
    ).toEqual({ trader: '865539b9d038c4840f5c69b4d83e4a1481397bd02db51373bde979d57677a573', asset_in: '0'.repeat(64), amount_in: '500000000', amount_out: '9066108938801' });
    // #272
    expect(
      read('remove_liquidity', '1000000072656d6f76655f6c6971756964697479d08a82dc475034a5f18bb589be8343472e67996b830764889bcbed12e24510bfda7a00081a000000000000000000000090310d09810400000000000000000000563a7696000000000000000000000000'),
    ).toEqual({ provider: 'd08a82dc475034a5f18bb589be8343472e67996b830764889bcbed12e24510bf', shares: '111803398874', out_a: '4952249151888', out_b: '2524330582' });

    // The exchange's claim, Borsh as the contract emits it; through a receipt it keeps the contract that emitted it, and its bytes, which
    // a standard's events are read from (D-123)
    const le = (v: bigint, n: number) => Uint8Array.from({ length: n }, (_, i) => Number((v >> BigInt(8 * i)) & 0xffn));
    const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));
    const exchange = 'ee'.repeat(32);
    const beneficiary = 'ab'.repeat(32);
    const txidBytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const claim = join(le(5n, 4), new TextEncoder().encode('claim'), le(7n, 8), fromHex(beneficiary, 32), txidBytes, le(25_000n, 8), le(2_500_000_000_000n, 16), le(0n, 16));
    const receipt = (data: Uint8Array) => toResult({ op_id: null, success: true, error: null, gas_used: 1n, output: new Uint8Array(), events: [{ contract: fromHex(exchange, 32), data }], asset_changes: [] });
    const shownTxid = toHex(txidBytes.slice().reverse());
    expect(receipt(claim).events).toEqual([
      { name: 'claim', fields: { contract: exchange, lock: '7', beneficiary, txid: shownTxid, paid_sats: '25000', ksa_paid: '2500000000000', remaining: '0' }, raw: toHex(claim) },
    ]);
    // One byte more or less, or a name the page does not read: the bytes as they are
    const longer = join(claim, Uint8Array.of(0));
    expect(receipt(longer).events).toEqual([{ name: 'claim', fields: { contract: exchange, data: toHex(longer) }, raw: toHex(longer) }]);
    expect(eventFields('claim', claim.subarray(0, claim.length - 1))).toBeUndefined();
    expect(read('pair_created', '0c000000706169725f63726561746564')).toBeUndefined();
  });
});

describe('An operation a merged parallel block skipped (D-063)', () => {
  const NOW = (1_790_000_000 + 40 * 5) * 1000;
  /** Until the sync a submission starts is over */
  const idle = async (chain: RpcChain) => {
    for (let i = 0; i < 500 && (chain as unknown as { syncing: boolean }).syncing; i++) await new Promise((r) => setTimeout(r, 1));
  };

  it("another's: said to wait only while the node holds it again, asked again meanwhile, and listed where it was skipped", async () => {
    let status: 'pending' | 'skipped' | 'error' = 'error';
    let now = NOW;
    // ALICE's operations at 10, 20 and 28 (nonces 0 to 2); #26 merges a parallel block that skipped her nonce 3, ahead of her nonce 2
    const node = syntheticNode({ tip: 30, opsAt: [10, 20, 28], finalAt: 0, skipped: { at: 25, nonce: 3, status: () => status } });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 40, now: () => now });
    const note = () => opProgress(chain, chain.getOp(node.skippedId) as OpRecord, now).skipNote;
    const asked = () => node.calls.get('ksana_getOpStatus') ?? 0;
    const m = t().status;
    // Not known while the node fails to say, and the sync goes on
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    expect(opStatusOf(chain, chain.getOp(node.skippedId) as OpRecord)).toBe('skipped');
    expect(note()).toBeUndefined();
    expect(asked()).toBe(1);
    // Held again: it waits, asked again every 8 seconds
    status = 'pending';
    await chain.sync();
    expect(asked()).toBe(1);
    now += 8_001;
    await chain.sync();
    expect(asked()).toBe(2);
    expect(note()).toBe(m.skipRetry);
    // Listed where it was skipped, at #26, between the ones executed at 20 and 28, as the node lists it (D-111)
    const at = (h: number) => chain.blocks[h]?.entries[0]?.entry;
    const id = (h: number) => (at(h) as { opId: string }).opId;
    expect(chain.opOrder).toEqual([id(10), id(20), node.skippedId, id(28)]);
    // No longer held: it won't be included again, and is no longer asked about
    status = 'skipped';
    now += 8_001;
    await chain.sync();
    expect(note()).toBe(m.skipFinal(t().rpc.notRequeued));
    now += 8_001;
    await chain.sync();
    expect(asked()).toBe(3);
  });

  it("this page's own: pending and holding its nonce while the node holds it again, neither once it does not", async () => {
    let status: 'pending' | 'skipped' = 'pending';
    const o = { tip: 25, opsAt: [10, 20], finalAt: 0, skipped: { at: 25, nonce: 3, status: () => status } };
    const node = syntheticNode(o);
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 40, now: () => NOW });
    chain.walletKey = { account: node.ALICE };
    await chain.sync();
    // Submitted after her nonce 2, still waiting for it
    chain.noteSubmitted(fromJson('VmOp', node.skippedOp), node.skippedId, NOW);
    await idle(chain);
    expect(chain.nextNonce(node.ALICE)).toBe(4);
    // #26 merges the parallel block that skipped it, and the node holds it again
    o.tip = 30;
    await chain.sync();
    const r = chain.getOp(node.skippedId) as OpRecord;
    expect(opStatusOf(chain, r)).toBe('skipped');
    expect(opProgress(chain, r, NOW).skipNote).toBe(t().status.skipRetry);
    expect(chain.mempool.map((x) => x.id)).toEqual([node.skippedId]);
    expect(chain.nextNonce(node.ALICE)).toBe(4);
    // The node no longer holds it: out of the pending list, its nonce free again
    status = 'skipped';
    await chain.sync();
    expect(opProgress(chain, r, NOW).skipNote).toBe(t().status.skipFinal(t().rpc.notRequeued));
    expect(chain.mempool).toEqual([]);
    expect(chain.nextNonce(node.ALICE)).toBe(2);
  });

  it('one the node executed in a block below those the page read shows executed there, its block read for it', async () => {
    // Included by both parallel blocks: executed at #12, below the ten blocks read, and skipped beside #25
    const reason = 'nonce not consecutive: account has 1, op has 0';
    const node = syntheticNode({ tip: 30, opsAt: [], finalAt: 0, skipped: { at: 25, nonce: 0, reason, status: () => 12 } });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 10, backfillStep: 0, now: () => NOW });
    await chain.sync();
    const r = chain.getOp(node.skippedId) as OpRecord;
    expect(node.asked.get(node.hash(12))).toBe(1);
    expect(r.blockHash).toBe(node.hash(12));
    expect(opStatusOf(chain, r)).toBe('fast_confirmed');
  });
});

describe('A path C operation the page broadcast (§7.4)', () => {
  it('holds its nonce until a block includes it: the node knows nothing of it before its BTC confirmations, and the next operation follows it', async () => {
    const node = syntheticNode({ tip: 10, opsAt: [], finalAt: 10 });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20 });
    await chain.sync();
    const account = 'ab'.repeat(32);
    expect(chain.nextNonce(account)).toBe(0);
    expect(chain.pendingOf(account)).toEqual([]);
    const native: OpRecord = {
      id: 'cd'.repeat(32),
      op: { version: 2, chainId: PARAMS.CHAIN_ID, account, nonce: 0, fee: { kind: 'BtcNative' }, maxGas: 50_000, action: { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: 'ef'.repeat(32), amount: 1n }, sig: { kind: 'Bip322Simple', sig: '00' } },
      path: 'C',
      size: 180,
      submittedAt: 0,
      origin: 'wallet',
    };
    chain.nativePending = [native];
    expect(chain.nextNonce(account)).toBe(1);
    expect(chain.pendingOf(account)).toEqual([native]);
    expect(chain.nextNonce('ef'.repeat(32))).toBe(0);
  });

  it('one the node does not know may still wait for its BTC confirmations, as many as its network forces it after', async () => {
    for (const [chain, chainId, confs] of [
      ['signet', 1002, '2\u00a0confirmations'],
      ['devnet', PARAMS.CHAIN_ID, '1\u00a0confirmation'],
    ] as const) {
      const rpc = new RpcChain({ url: 'http://node.test', chain }, { fetch: anchoredNode({ tip: 30, chainId }).fetch, manual: true, window: 20 });
      await rpc.sync();
      const id = 'cd'.repeat(32);
      await settle(rpc, [['op', id]]);
      const l = rpc.lookup('op', id);
      expect(l?.state === 'missing' ? l.message : undefined).toContain(`its BTC transaction has ${confs} and a block includes it`);
    }
  });
});

describe('A top-up claim the page broadcast: after a reload, its BTC confirmations and its BTC height (D-036, D-085)', () => {
  const ME = 'ab'.repeat(32);
  const EXCHANGE = 'ee'.repeat(32);
  const le = (v: bigint, n: number) => Uint8Array.from({ length: n }, (_, i) => Number((v >> BigInt(8 * i)) & 0xffn));
  const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));
  // The claim, signed with a one-time key, in the transaction that pays the seller and carries it (path C), its change to the wallet
  const op: SdkVmOp = {
    version: 2,
    chain_id: DEVNET.chain_id,
    account: fromHex('77'.repeat(32), 32),
    nonce: 0n,
    fee: { kind: 'BtcNative' },
    max_gas: 100_000n,
    action: { kind: 'Call', contract: fromHex(EXCHANGE, 32), method: 'claim', args: new Uint8Array(), funds: [] },
    sig: { kind: 'Bip340', bytes: new Uint8Array(64) },
  };
  const script = Uint8Array.from([0x51, 0x20, ...fromHex(ME, 32)]);
  const tx: Tx = {
    version: 2,
    inputs: [{ txid: new Uint8Array(32).fill(9), vout: 1, scriptSig: new Uint8Array(), sequence: 0xfffffffd, witness: [] }],
    outputs: [nativeDataOutput(op, DEVNET), { value: 25_000n, script: Uint8Array.from([0x51, 0x20, ...new Uint8Array(32).fill(0x44)]) }, { value: 70_000n, script }],
    locktime: 0,
  };
  const raw = serializeTx(tx);
  const id = opIdOf(op);
  const shownTxid = toHex(txid(tx).slice().reverse());
  const claimEvent = join(le(5n, 4), new TextEncoder().encode('claim'), le(7n, 8), fromHex(ME, 32), txid(tx), le(25_000n, 8), le(2_500_000_000_000n, 16), le(0n, 16));
  const forced = (at: number) => ({ at, btc_txid: toHex(txid(tx)), op: toJson('VmOp', op), events: [{ contract: EXCHANGE, data: toHex(claimEvent) }] });
  const memory = () => {
    const saved = new Map<string, unknown>();
    return { saved, load: (key: string) => saved.get(key) ?? null, save: (key: string, value: unknown) => void saved.set(key, JSON.parse(JSON.stringify(value)) as unknown) };
  };
  const NOW = (1_790_000_000 + 300 * 5) * 1000;

  it('is remembered on the device: after a reload it waits under the wallet account again, or shows in its block, read for it', async () => {
    const store = memory();
    const unknown = syntheticNode({ tip: 300, opsAt: [], finalAt: 50, opAt: () => undefined });
    const open = (fetch: typeof globalThis.fetch) => {
      const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch, manual: true, window: 20, now: () => NOW, claims: store });
      chain.walletKey = { account: ME };
      return chain;
    };
    const first = open(unknown.fetch);
    await first.sync();
    first.noteNative(op, raw, { owner: ME, ownerScript: script, inputValues: [100_000] });
    const key = `topups:${unknown.hash(0)}`;
    expect(store.saved.get(key)).toEqual([{ id, owner: ME, script: toHex(script), tx: toHex(raw), inputs: [100_000], at: NOW }]);

    // Reloaded while the node knows nothing of it: waiting for its BTC confirmations, under the account it pays
    const waiting = open(unknown.fetch);
    await waiting.sync();
    expect(waiting.nativePending.map((r) => r.id)).toEqual([id]);
    expect(inflight(waiting, ME).map((r) => r.id)).toEqual([id]);
    expect(waiting.getBtcTx(shownTxid)?.status).toBe('broadcast');

    // Reloaded once a block below the blocks a first sync reads included it: its block is read for it, and the KSA the claim paid
    // counts as not BTC-final yet
    const included = syntheticNode({ tip: 300, opsAt: [], finalAt: 50, forced: forced(200), opAt: (x) => (x === id ? 200 : undefined) });
    const later = open(included.fetch);
    await later.sync();
    expect(included.asked.get(included.hash(200))).toBe(1);
    expect(later.getOp(id)?.blockHash).toBe(included.hash(200));
    expect(later.nativePending).toEqual([]);
    expect(later.getBtcTx(shownTxid)?.status).toBe('confirmed');
    expect(activity(later, ME, 'in').map((r) => r.id)).toEqual([id]);
    expect(unfinalFlows(later, ME).assets.get(KSA_ASSET_ID)).toEqual({ inflow: 2_500_000_000_000n, outflow: 0n });
    expect(store.saved.get(key)).toHaveLength(1);

    // One the first sync read already: the account gets it, and its transaction stays confirmed
    const loaded = syntheticNode({ tip: 300, opsAt: [], finalAt: 50, forced: forced(295), opAt: (x) => (x === id ? 295 : undefined) });
    const near = open(loaded.fetch);
    await near.sync();
    expect(near.getOp(id)?.blockHash).toBe(loaded.hash(295));
    expect(near.peekAccount(ME)?.opIds).toEqual([id]);
    expect(near.getBtcTx(shownTxid)?.status).toBe('confirmed');
  });

  it('handed back to be broadcast by hand: built, not broadcast, with no estimate, after a reload too, until a block forces it in', async () => {
    const store = memory();
    const unknown = syntheticNode({ tip: 300, opsAt: [], finalAt: 50, opAt: () => undefined });
    const open = (fetch: typeof globalThis.fetch) => {
      const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch, manual: true, window: 20, now: () => NOW, claims: store });
      chain.walletKey = { account: ME };
      return chain;
    };
    const first = open(unknown.fetch);
    await first.sync();
    first.noteNative(op, raw, { owner: ME, ownerScript: script, inputValues: [100_000], byHand: true });
    expect(first.getBtcTx(shownTxid)?.status).toBe('built');
    expect(store.saved.get(`topups:${unknown.hash(0)}`)).toEqual([{ id, owner: ME, script: toHex(script), tx: toHex(raw), inputs: [100_000], at: NOW, byHand: true }]);
    const steps = opProgress(first, first.getOp(id) as OpRecord, NOW).steps;
    expect(steps[0]).toMatchObject({ key: 'signed', label: t().status.step.signedByHand, state: 'done' });
    // When it is broadcast is not known here: no step gives an estimate, and none reads as stuck
    expect(steps.filter((s) => s.eta !== undefined || s.stuck).map((s) => s.key)).toEqual([]);
    expect(steps.find((s) => s.key === 'native')?.state).toBe('active');

    // Reloaded while the node knows nothing of it: still not known to be broadcast
    const waiting = open(unknown.fetch);
    await waiting.sync();
    expect(waiting.getBtcTx(shownTxid)?.status).toBe('built');
    expect(opProgress(waiting, waiting.getOp(id) as OpRecord, NOW).steps[0]?.label).toBe(t().status.step.signedByHand);

    // A block forced it in: it was broadcast and confirmed
    const included = syntheticNode({ tip: 300, opsAt: [], finalAt: 50, forced: forced(295), opAt: (x) => (x === id ? 295 : undefined) });
    const later = open(included.fetch);
    await later.sync();
    expect(later.getBtcTx(shownTxid)?.status).toBe('confirmed');
    expect(opProgress(later, later.getOp(id) as OpRecord, NOW).steps[0]?.label).toBe(t().status.step.signedNative);
  });

  it('has its BTC confirmations followed until a block forces it in: its change, listed with its BTC block, gives its height', async () => {
    const node = syntheticNode({ tip: 300, opsAt: [], finalAt: 50, opAt: () => undefined });
    let btcTip = 131;
    let clock = NOW;
    let unspents: unknown[] = [];
    let away = false;
    const asked: string[] = [];
    const fetch: typeof globalThis.fetch = async (url, init) => {
      if (!String(url).startsWith('http://btc.test')) return node.fetch(url, init);
      const body = JSON.parse(String(init?.body)) as { id: number; method: string };
      asked.push(body.method);
      const result = body.method === 'getblockchaininfo' ? { chain: 'regtest', blocks: btcTip } : { success: true, unspents };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet', btcUrl: 'http://btc.test' }, { fetch, manual: true, window: 20, now: () => clock, hidden: () => away });
    chain.walletKey = { account: ME };
    await chain.sync();
    expect(asked).not.toContain('scantxoutset');
    chain.noteNative(op, raw, { owner: ME, ownerScript: script, inputValues: [100_000] });
    const scans = () => asked.filter((m) => m === 'scantxoutset').length;
    // A page out of view reads nothing
    away = true;
    await chain.sync();
    expect(scans()).toBe(0);
    away = false;
    // In the mempool: its change is not listed yet (a scan lists confirmed outputs only), and the listing is read once per BTC tip, or a minute later
    await chain.sync();
    expect(scans()).toBe(1);
    expect(chain.getBtcTx(shownTxid)?.status).toBe('broadcast');
    clock += 30_000;
    await chain.sync();
    expect(scans()).toBe(1);
    // Mined at 132: its change (output 2) is listed there
    btcTip = 132;
    clock += 31_000;
    unspents = [{ txid: 'cd'.repeat(32), vout: 0, amount: 0.001, height: 120 }, { txid: shownTxid, vout: 2, amount: 0.0007, height: 132 }];
    await chain.sync();
    expect(scans()).toBe(2);
    expect(chain.getBtcTx(shownTxid)).toMatchObject({ status: 'confirmed', confirmedHeight: 132 });
    // It has the one confirmation forced inclusion takes on devnet, since its BTC block was first seen (the tip read then), and waits for
    // the next Ksana block
    const r = chain.getOp(id) as OpRecord;
    const steps = opProgress(chain, r, clock).steps;
    expect(steps.find((s) => s.key === 'native')).toMatchObject({ state: 'done', sub: 'BTC #132', ticks: { done: 1, total: 1 }, at: clock });
    expect(steps.find((s) => s.key === 'included')?.state).toBe('active');
    // Confirmed, it is not read again
    btcTip = 133;
    clock += 61_000;
    await chain.sync();
    expect(scans()).toBe(2);
  });

  it('known from the block that forced it in, has that block\'s BTC height when its window is one height, else at most the top of it', async () => {
    const read = async (node: ReturnType<typeof syntheticNode>) => {
      const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => NOW });
      await chain.sync();
      return { tx: chain.getBtcTx(shownTxid), chain };
    };
    // Block 290 anchors at 129 and its parent at 128: the window (h(289), h(290)] is BTC 129 alone (NATIVE_CONFIRMATIONS 1), whose
    // page lists it
    const one = await read(syntheticNode({ tip: 300, opsAt: [], finalAt: 50, forced: forced(290) }));
    expect(one.tx).toMatchObject({ status: 'confirmed', confirmedHeight: 129 });
    expect(one.tx?.heightAtMost).toBeUndefined();
    expect(one.chain.getBtcBlock(129)?.txids).toContain(shownTxid);
    // Block 295 anchors two BTC blocks above its parent: the transaction confirmed at 130 or 131, so neither page lists it
    const wide = await read(syntheticNode({ tip: 300, opsAt: [], finalAt: 50, forced: forced(295), anchorAt: (h) => (h >= 295 ? 131 : 100 + Math.floor(h / 10)) }));
    expect(wide.tx).toMatchObject({ status: 'confirmed', confirmedHeight: 131, heightAtMost: true });
    for (const h of [130, 131]) expect(wide.chain.getBtcBlock(h)?.txids ?? []).not.toContain(shownTxid);
  });

  it('is forgotten when the node still knows nothing of it a day after its broadcast, or after 30 days', async () => {
    const node = syntheticNode({ tip: 300, opsAt: [], finalAt: 50, opAt: () => undefined });
    for (const [age, kept] of [
      [86_400_000 - 1, 1],
      [86_400_000 + 1, 0],
    ] as const) {
      const store = memory();
      const at = NOW - age;
      const first = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => at, claims: store });
      await first.sync();
      first.noteNative(op, raw, { owner: ME, ownerScript: script, inputValues: [100_000] });
      const later = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => NOW, claims: store });
      await later.sync();
      expect(later.nativePending).toHaveLength(kept);
      expect(store.saved.get(`topups:${node.hash(0)}`)).toHaveLength(kept);
    }
    const included = syntheticNode({ tip: 300, opsAt: [], finalAt: 290, forced: forced(295), opAt: (x) => (x === id ? 295 : undefined) });
    const store = memory();
    store.save(`topups:${included.hash(0)}`, [{ id, owner: ME, script: toHex(script), tx: toHex(raw), inputs: [100_000], at: NOW - 31 * 86_400_000 }, { id: 'zz', at: 1 }]);
    const late = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: included.fetch, manual: true, window: 20, now: () => NOW, claims: store });
    late.walletKey = { account: ME };
    await late.sync();
    expect(late.peekAccount(ME)?.opIds).toEqual([]);
    expect(store.saved.get(`topups:${included.hash(0)}`)).toEqual([]);
  });
});

describe('A lock of an exchange contract read for a top-up (D-078, D-085)', () => {
  const EXCHANGE = 'ee'.repeat(32);
  const lock = {
    seller: fromHex('11'.repeat(32), 32),
    beneficiary: fromHex('22'.repeat(32), 32),
    script: Uint8Array.from([0x51, 0x20, ...new Uint8Array(32).fill(0x44)]),
    price: 100_000_000n,
    ksa: 5_000_000_000n,
    expiry: 400,
    state: { kind: 'Open' as const },
  };
  // `ksana_call` by lock number: 1 is the lock, 2 none (the call fails), 3 answers what is no lock, 4 finds the node busy; for 5 the
  // proxy in front of the node answers HTTP 502, and for 6 nothing answers
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as unknown;
    const calls = (Array.isArray(body) ? body : [body]) as { id: number; method: string; params: [{ args: string }] }[];
    const number = (c: (typeof calls)[number]) => parseInt(c.params[0].args.slice(0, 2), 16);
    if (calls.some((c) => number(c) === 6)) throw new TypeError('Failed to fetch');
    if (calls.some((c) => number(c) === 5)) return new Response('Bad Gateway', { status: 502 });
    const receipt = (output: string, success = true) => ({ op_id: null, success, error: success ? null : 'no such lock', gas_used: '1000', output, events: [] });
    const answers = calls.map((c) => {
      const n = number(c);
      if (n === 4) return { jsonrpc: '2.0', id: c.id, error: { code: -32009, message: '4 read-only calls are already running; try again later' } };
      const result = n === 1 ? receipt(toHex(encodeLock(lock))) : n === 2 ? receipt('', false) : receipt('00');
      return { jsonrpc: '2.0', id: c.id, result };
    });
    return new Response(JSON.stringify(Array.isArray(body) ? answers : answers[0]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch, manual: true });

  it('gives the lock, or none when the call fails or answers no lock', async () => {
    expect(await chain.fetchLock(EXCHANGE, 1n)).toMatchObject({ id: 1n, exchange: EXCHANGE, seller: '11'.repeat(32), beneficiary: '22'.repeat(32), ksa: 5_000_000_000n, expiry: 400, state: 'Open' });
    expect(await chain.fetchLock(EXCHANGE, 2n)).toBeUndefined();
    expect(await chain.fetchLock(EXCHANGE, 3n)).toBeUndefined();
  });

  it('throws when the node does not answer, or answers with an error: whether the lock is there is not known', async () => {
    await expect(chain.fetchLock(EXCHANGE, 4n)).rejects.toMatchObject({ name: 'RpcError', code: -32009 });
    const proxy = await chain.fetchLock(EXCHANGE, 5n).catch((e: unknown) => e);
    expect(proxy).toBeInstanceOf(RpcTransportError);
    expect(explainRpcError(proxy, 'http://node.test')).toBe(t().source.error.unavailable('http://node.test', '502'));
    await expect(chain.fetchLock(EXCHANGE, 6n)).rejects.toBeInstanceOf(RpcTransportError);
  });
});

describe('Contracts on the node data source', () => {
  /** A wasm module header: what the code is does not matter here, only that the contract ID it gives is on the curve */
  const CODE = '0061736d01000000';
  const start = async (ok?: (h: number) => boolean) => {
    const ALICE = '11'.repeat(32);
    // ALICE deploys at height 8 (her first op, nonce 0) and calls the contract at height 9
    const contract = contractIdOf(fromHex(ALICE, 32), 0n, sha256(fromHex(CODE)));
    const action = (h: number) => (h === 8 ? { Deploy: { code: CODE, init_args: '', funds: [] } } : { Call: { contract, method: 'ping', args: '', funds: [] } });
    const node = syntheticNode({ tip: 10, opsAt: [8, 9], finalAt: 10, action, ...(ok ? { ok } : {}) });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20 });
    await chain.sync();
    return { chain, node, contract };
  };

  it('a deployment names the contract it creates, which is a contract with no address, with the calls to it', async () => {
    const { chain, node, contract } = await start();
    const deploy = chain.deployOf(contract);
    expect(deploy?.height).toBe(8);
    expect(deploy?.op.action).toMatchObject({ kind: 'Deploy', contract });
    expect(deploy && summarizeOp(chain, deploy).contract).toBe(contract);
    expect(chain.isContract(contract)).toBe(true);
    // a contract ID is a hash with no key behind it, so it has no Taproot address, though this one is on the curve and would make one
    expect(accountToAddress(fromHex(contract, 32), 'regtest')).toMatch(/^bcrt1p/);
    expect(chain.addressOf(contract)).toBe('');
    expect(chain.isContract(node.ALICE)).toBe(false);
    // a contract is an account too, read from the node when a page asks for it
    chain.peekAccount(contract);
    await chain.sync();
    expect((chain.peekAccount(contract)?.opIds ?? []).map((id) => chain.getOp(id)?.height)).toEqual([9]);
    expect(search(chain, contract)).toEqual([expect.objectContaining({ kind: 'contract', id: contract })]);
  });

  it('a failed deployment creates no contract', async () => {
    // and the call to where it would be fails too
    const { chain, contract } = await start(() => false);
    expect(chain.deployOf(contract)).toBeUndefined();
    const deploy = chain.opOrder.map((id) => chain.getOp(id)).find((r) => r?.op.action.kind === 'Deploy');
    expect(deploy?.result?.ok).toBe(false);
    expect(deploy && summarizeOp(chain, deploy).contract).toBeUndefined();
    expect(chain.isContract(contract)).toBe(false);
    expect(search(chain, contract).some((x) => x.kind === 'contract')).toBe(false);
    // the ID is still a hash with no key behind it
    expect(chain.addressOf(contract)).toBe('');
  });

  it('a call that succeeded tells a contract, and a failed call to an account tells nothing', async () => {
    // a contract deployed before the blocks the page reads, on the curve like any other 32 bytes may be
    const pair = 'e726c09142ded75d6f6136c169357c9396ac0a631bed8aef6575cc2b5174bca5';
    const BOB = '22'.repeat(32);
    const action = (h: number) => ({ Call: { contract: h === 8 ? BOB : pair, method: 'swap', args: '', funds: [] } });
    const node = syntheticNode({ tip: 10, opsAt: [8, 9], finalAt: 10, action, ok: (h) => h !== 8 });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20 });
    await chain.sync();
    expect(chain.isContract(pair)).toBe(true);
    expect(chain.addressOf(pair)).toBe('');
    expect(chain.deployOf(pair)).toBeUndefined();
    // a call to BOB's account failed: it is still an account, with its address
    expect(chain.isContract(BOB)).toBe(false);
    expect(chain.addressOf(BOB)).toBe(accountToAddress(fromHex(BOB, 32), 'regtest'));
    expect(chain.knownContracts()).toEqual([pair]);
  });

  it("an account's address is worked out once, and a contract found after it was asked for has none", async () => {
    // the pair is a contract on the curve: until the page reads the call to it, nothing tells it from an account
    const pair = 'e726c09142ded75d6f6136c169357c9396ac0a631bed8aef6575cc2b5174bca5';
    const BOB = '22'.repeat(32);
    const node = syntheticNode({ tip: 10, opsAt: [9], finalAt: 10, action: () => ({ Call: { contract: pair, method: 'swap', args: '', funds: [] } }) });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20 });
    const kept = (chain as unknown as { addresses: Map<string, string> }).addresses;
    expect(chain.addressOf(pair)).toBe(accountToAddress(fromHex(pair, 32), 'regtest'));
    await chain.sync();
    expect(chain.isContract(pair)).toBe(true);
    expect(chain.addressOf(pair)).toBe('');
    // an account's address is read from what was worked out, not worked out again at every draw
    const bob = chain.addressOf(BOB);
    expect(bob).toBe(accountToAddress(fromHex(BOB, 32), 'regtest'));
    kept.set(BOB, 'kept');
    expect(chain.addressOf(BOB)).toBe('kept');
    // and what was worked out is let go past 4 096 accounts; 32 bytes off the curve are kept as having no address
    for (let i = 0; kept.size < 4096; i++) kept.set(i.toString(16).padStart(64, '0'), '');
    expect(() => accountToAddress(fromHex(node.ALICE, 32), 'regtest')).toThrow();
    expect(chain.addressOf(node.ALICE)).toBe('');
    expect([...kept]).toEqual([[node.ALICE, '']]);
    expect(chain.addressOf(BOB)).toBe(bob);
  });

  it('a contract that emitted an event is a contract, though no operation the page read called it: a pool moving its token', async () => {
    const pair = 'e726c09142ded75d6f6136c169357c9396ac0a631bed8aef6575cc2b5174bca5';
    const TOKEN = '44'.repeat(32);
    // the token's transfer, emitted inside the pool's add_liquidity at height 9; the pool's own event names the pool
    const action = () => ({ Call: { contract: pair, method: 'add_liquidity', args: '', funds: [] } });
    const events = (h: number) => (h === 9 ? [{ contract: TOKEN, data: '00000000' }, { contract: pair, data: '00000000' }] : []);
    const node = syntheticNode({ tip: 10, opsAt: [9], finalAt: 10, action, events });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20 });
    await chain.sync();
    expect(chain.isContract(TOKEN)).toBe(true);
    expect(chain.addressOf(TOKEN)).toBe('');
    expect([...chain.knownContracts()].sort()).toEqual([TOKEN, pair].sort());
    // an account the event names in its data stays an account
    expect(chain.isContract(node.ALICE)).toBe(false);
  });

  it('what the receipts told outlasts the operations a page left open drops from its cache', async () => {
    const dropOps = (chain: RpcChain) => (chain as unknown as { ops: Map<string, unknown> }).ops.clear();
    // a call that succeeded, before anything asked about the contract
    const pair = 'e726c09142ded75d6f6136c169357c9396ac0a631bed8aef6575cc2b5174bca5';
    const node = syntheticNode({ tip: 10, opsAt: [9], finalAt: 10, action: () => ({ Call: { contract: pair, method: 'swap', args: '', funds: [] } }) });
    const called = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20 });
    await called.sync();
    dropOps(called);
    expect(called.isContract(pair)).toBe(true);
    expect(called.addressOf(pair)).toBe('');
    // a failed deployment
    const { chain, contract } = await start(() => false);
    dropOps(chain);
    expect(chain.isContract(contract)).toBe(false);
    expect(chain.addressOf(contract)).toBe('');
  });
});

/** The reveal transaction of block `h`'s settlement in a synthetic node, in internal byte order */
const carrierTxid = (h: number) => '01' + h.toString(16).padStart(62, 'e');

/**
 * A node answering from a synthetic main chain 0..tip of empty blocks with one path B op of ALICE at each height of `opsAt`, a
 * transfer to BOB unless `action` gives another (in JSON), succeeding unless `ok` says it failed; `ksana_getSettlement` says the
 * blocks with entries up to `finalAt` are settled and BTC-final. `asked` counts the
 * `ksana_getBlock` calls per block identifier, `calls` the calls per method. With `lists` it answers the operation listings (D-111; `listed` records their
 * calls), the first `failLists` of them with HTTP 503, or with the JSON-RPC error `failCode`; without, it has no such methods,
 * like a node older than D-111.
 */
function syntheticNode(o: {
  tip: number;
  opsAt: number[];
  finalAt: number;
  lists?: boolean;
  failLists?: number;
  failCode?: number;
  action?: (h: number) => unknown;
  ok?: (h: number) => boolean;
  /** The height of the later block whose settlement carried the body at h, confirmed at BTC height 500 (D-077) */
  carriedBy?: (h: number) => number | undefined;
  /** The blocks whose rewards ALICE has locked, as their producer */
  lockedAt?: number[];
  /** Contracts' assets ALICE holds 5 of, each by its ID, the name its issuer gave it and its decimals (none unless given) */
  assets?: { id: string; name: string; decimals?: number }[];
  /** The height of the operation an ID names, for `ksana_getOpStatus` (which it does not answer without) */
  opAt?: (id: string) => number | undefined;
  /** The path B suggestion of `ksana_estimateFee` (1 base unit at 1 per KiB unless given) */
  pathB?: { amount: string; per_kib: string };
  /** A path C operation (in JSON) a block force-included at `at`, carried by `btc_txid` (internal byte order), with its receipt's events */
  forced?: { at: number; btc_txid: string; op: unknown; events: { contract: string; data: string }[] };
  /** The events in the receipt of the path B operation at h, when it succeeds (none unless given) */
  events?: (h: number) => { contract: string; data: string }[];
  /** The changes to built-in assets in the receipt of the operation at h (D-122); without, the receipts record none, as before D-122 */
  changes?: (h: number) => unknown[];
  /**
   * The node's index of the standards' events (D-120): the contracts' declared standards, what `ksana_getToken` answers of each token
   * (in JSON, its contract and tip left out) and each account's tokens and collections; without, the node has none of its methods
   */
  index?: { contracts: Record<string, string[]>; tokens?: Record<string, Record<string, unknown>>; holdings?: Record<string, unknown[]> };
  /** The BTC height block h anchors at (100 + h / 10 rounded down unless given) */
  anchorAt?: (h: number) => number;
  /** The settlement transactions block h carries (network serialization), which its settlement status gives too, none unless given */
  settlementAt?: (h: number) => { commit: string; reveal: string } | undefined;
  /**
   * A parallel block beside block `at`, merged by block at + 1, with a path B op of ALICE's of nonce `nonce` that the merge skipped
   * (D-063) for `reason`, for which `ksana_getOpStatus` answers `status()`: `pending` while the node holds it in its entry pool again,
   * an error, or the height of the block that executed it, as its only entry
   */
  skipped?: { at: number; nonce: number; reason?: string; status: () => 'pending' | 'skipped' | 'error' | number };
  /**
   * The era of the block at h: blocks of another era are another chain's, each with a hash of its own, as a branch the chain switched
   * to or a network that started over from its genesis block (0 unless given)
   */
  era?: (h: number) => number;
}) {
  const ALICE = '11'.repeat(32);
  const BOB = '22'.repeat(32);
  const ERA = 2 ** 32;
  const hash = (h: number) => ((o.era?.(h) ?? 0) * ERA + h + 1).toString(16).padStart(64, '0');
  const ref = (h: number) => ({ height: String(h), hash: hash(h) });
  const SIDE = 'ee'.repeat(32);
  const skippedOp = {
    version: 2,
    chain_id: PARAMS.CHAIN_ID,
    account: ALICE,
    nonce: String(o.skipped?.nonce ?? 0),
    fee: { Token: { amount: '1' } },
    max_gas: '50000',
    action: { AssetTransfer: { asset: '00'.repeat(32), to: BOB, amount: '999' } },
    sig: { Bip340: '00'.repeat(64) },
  };
  const skippedId = opIdOf(fromJson('VmOp', skippedOp));
  const skipReason = o.skipped?.reason ?? `nonce not consecutive: account has ${o.opsAt.length}, op has ${o.skipped?.nonce}`;
  const skipReceipt = { op_id: null, success: false, error: `skipped: ${skipReason}`, gas_used: '0', output: '', events: [] };
  /** ALICE's operation at a height of `opsAt` */
  const opAt = (h: number) => {
    const n = o.opsAt.indexOf(h);
    if (n < 0) return undefined;
    return {
      version: 2,
      chain_id: PARAMS.CHAIN_ID,
      account: ALICE,
      nonce: String(n),
      fee: { Token: { amount: '1' } },
      max_gas: '50000',
      action: o.action?.(h) ?? { AssetTransfer: { asset: '00'.repeat(32), to: BOB, amount: String(100 + h) } },
      sig: { Bip340: '00'.repeat(64) },
    };
  };
  const entriesAt = (h: number): unknown[] => {
    if (o.forced?.at === h) return [{ Forced: { btc_txid: o.forced.btc_txid, op: o.forced.op } }];
    if (o.skipped?.status() === h) return [{ Sponsored: { op: skippedOp } }];
    const op = opAt(h);
    return op ? [{ Sponsored: { op } }] : [];
  };
  const block = (h: number) => {
    const entries = entriesAt(h);
    const merges = o.skipped !== undefined && o.skipped.at === h - 1;
    return {
      hash: hash(h),
      header: {
        version: 2,
        height: String(h),
        parents: h === 0 ? [] : merges ? [hash(h - 1), SIDE] : [hash(h - 1)],
        btc_anchor: { height: o.anchorAt?.(h) ?? 100 + Math.floor(h / 10), hash: 'ab'.repeat(32) },
        // an empty block's is the root of no entries, sha256 of nothing (`Params::is_empty_block`)
        entries_root: entries.length ? '00'.repeat(32) : toHex(sha256(new Uint8Array(0))),
        state_root: '00'.repeat(32),
        producer: '33'.repeat(32),
        timestamp: String(1_790_000_000 + h * 5),
        bits: 520448707,
        nonce: '0',
      },
      entries,
      settlement: o.settlementAt?.(h) ?? null,
      receipts: entries.map(() =>
        o.ok?.(h) === false
          ? { op_id: null, success: false, error: 'trap: unreachable', gas_used: '50000', output: '', events: [] }
          : {
              op_id: null,
              success: true,
              error: null,
              gas_used: '10000',
              output: '',
              events: o.forced?.at === h ? o.forced.events : (o.events?.(h) ?? []),
              ...(o.changes ? { asset_changes: o.changes(h) } : {}),
            },
      ),
      accepted_height: String(h),
      merged: merges ? [SIDE] : [],
    };
  };
  /** The parallel block beside `at`, by another producer */
  const side = (at: number) => {
    const b = block(at);
    return { ...b, hash: SIDE, header: { ...b.header, entries_root: '00'.repeat(32), producer: '44'.repeat(32) }, entries: [{ Sponsored: { op: skippedOp } }], receipts: [skipReceipt], accepted_height: String(at + 1) };
  };
  const heightOf = (id: string) => {
    if (id === 'latest') return o.tip;
    if (id.length !== 64) return Number(id);
    // a hash of another era than the block at its height's names no block of the chain
    const n = Number.parseInt(id, 16) - 1;
    const h = n % ERA;
    return Math.floor(n / ERA) === (o.era?.(h) ?? 0) ? h : -1;
  };
  const asked = new Map<string, number>();
  const calls = new Map<string, number>();
  const listed: { method: string; params: unknown[] }[] = [];
  let failLists = o.failLists ?? 0;
  /** The accounts an op is listed under, as the node lists them: ALICE, who signed it, and the receiving account or the contract called */
  const accountsAt = (h: number) => {
    const a = (o.action?.(h) ?? { AssetTransfer: { to: BOB } }) as { AssetTransfer?: { to: string }; Call?: { contract: string } };
    return [ALICE, a.AssetTransfer?.to ?? a.Call?.contract];
  };
  /** A page of the listing, every operation at position height:0:0 */
  const list = (account: unknown, before: unknown, limit: unknown) => {
    const all = o.opsAt.filter((h) => account === null || accountsAt(h).includes(String(account))).sort((x, y) => y - x);
    const below = typeof before === 'string' ? all.filter((h) => h < Number(before.split(':')[0])) : all;
    const n = typeof limit === 'number' ? limit : 50;
    const page = below.slice(0, n);
    return {
      ops: page.map((h) => {
        const op = o.forced?.at === h ? o.forced.op : opAt(h);
        const id = op ? opIdOf(fromJson('VmOp', op)) : hash(h);
        return { op_id: id, status: o.ok?.(h) === false ? 'failed' : h <= o.finalAt ? 'btc_final' : 'fast_confirmed', block: ref(h), index: 0, position: `${h}:0:0` };
      }),
      next: below.length > n ? `${page[page.length - 1]}:0:0` : null,
      at: ref(o.tip),
    };
  };
  const answer = (method: string, params: unknown[]): { result?: unknown; error?: { code: number; message: string } } => {
    const id = String(params[0] ?? '');
    if (o.skipped && method === 'ksana_getOpStatus' && id === skippedId) {
      const status = o.skipped.status();
      if (status === 'error') return { error: { code: -32603, message: 'storage error' } };
      if (status === 'pending') return { result: { status, block: null, index: null, receipt: null } };
      if (typeof status === 'number') {
        const receipt = { op_id: id, success: true, error: null, gas_used: '10000', output: '', events: [] };
        return { result: { status: 'fast_confirmed', block: ref(status), index: 0, receipt } };
      }
      return { result: { status, block: { height: String(o.skipped.at + 1), hash: SIDE }, index: 0, receipt: skipReceipt } };
    }
    if (o.index && method === 'ksana_getContract') {
      const standards = o.index.contracts[id];
      const result = { contract: id, code_hash: '00'.repeat(32), deployer: ALICE, standards, declared: standards?.length ? '1:0:0' : null, at: ref(o.tip) };
      return standards ? { result } : { error: { code: -32004, message: 'not a contract' } };
    }
    if (o.index && method === 'ksana_getToken') {
      const token = o.index.tokens?.[id];
      return token ? { result: { contract: id, ...token, at: ref(o.tip) } } : { error: { code: -32004, message: 'not a token' } };
    }
    if (o.index && method === 'ksana_getAccountAssets') return { result: { assets: o.index.holdings?.[id] ?? [], next: null, at: ref(o.tip) } };
    if (o.lists && method === 'ksana_getAccountOps') return { result: list(params[0], params[1], params[2]) };
    if (o.lists && method === 'ksana_getLatestOps') return { result: list(null, params[0], params[1]) };
    if (o.opAt && method === 'ksana_getOpStatus') {
      const h = o.opAt(id);
      if (h === undefined) return { error: { code: -32004, message: 'unknown op' } };
      const receipt = { op_id: id, success: true, error: null, gas_used: '10000', output: '', events: [] };
      return { result: { status: h <= o.finalAt ? 'btc_final' : 'fast_confirmed', block: ref(h), index: 0, receipt } };
    }
    switch (method) {
      case 'ksana_getChainInfo':
        return { result: { chain_id: PARAMS.CHAIN_ID, tip: ref(o.tip), daa_score: String(o.tip), protocol_version: 2, next_upgrade: null, max_known_version: 2, finalized: ref(o.finalAt) } };
      case 'ksana_getBlock': {
        asked.set(id, (asked.get(id) ?? 0) + 1);
        if (o.skipped && id === SIDE) return { result: side(o.skipped.at) };
        const h = heightOf(id);
        return h >= 0 && h <= o.tip ? { result: block(h) } : { error: { code: -32004, message: 'unknown block' } };
      }
      case 'ksana_getSettlement': {
        const h = heightOf(id);
        if (!(h >= 0 && h <= o.tip) || !entriesAt(h).length) return { error: { code: -32004, message: 'no settlement' } };
        const final = h <= o.finalAt;
        const by = o.carriedBy?.(h);
        if (by !== undefined) {
          // The carrier's settlement: its reveal transaction in internal byte order, and the same ID as Bitcoin shows it
          const txid = carrierTxid(by);
          const shown = txid.match(/../g)?.reverse().join('') ?? '';
          return {
            result: {
              block: ref(h),
              txid,
              txid_rpc: shown,
              commit_txid: null,
              commit_txid_rpc: null,
              txs: null,
              carrier_account: null,
              carrier: ref(by),
              status: 'confirmed',
              confirmed: { txid, height: 500, block: 'cd'.repeat(32), confirmations: 10 },
              settled: final,
              btc_final: final,
            },
          };
        }
        // The settlement transactions the block carries, with their IDs in internal byte order and as Bitcoin shows them
        const txs = o.settlementAt?.(h);
        const [reveal, commit] = txs ? [txs.reveal, txs.commit].map((hex) => toHex(txid(parseTx(fromHex(hex))))) : [];
        const shown = (id: string | undefined) => id?.match(/../g)?.reverse().join('') ?? null;
        return {
          result: {
            block: ref(h),
            txid: reveal ?? null,
            txid_rpc: shown(reveal),
            commit_txid: commit ?? null,
            commit_txid_rpc: shown(commit),
            txs: txs ?? null,
            carrier_account: null,
            carrier: null,
            status: 'pending',
            confirmed: null,
            settled: final,
            btc_final: final,
          },
        };
      }
      case 'ksana_getAccount': {
        const locked = id === ALICE ? (o.lockedAt ?? []).map((h) => ({ block_hash: hash(h), amount: '5' })) : [];
        const balances = id === ALICE ? (o.assets ?? []).map((a) => ({ asset: a.id, amount: '5' })) : [];
        return { result: { account: id, nonce: String(id === ALICE ? o.opsAt.length : 0), balances, locked_fees: locked, at: ref(o.tip) } };
      }
      case 'ksana_getAsset': {
        const a = o.assets?.find((x) => x.id === id);
        const result = { asset: a?.id, name: a?.name, symbol: a?.name, decimals: a?.decimals ?? 0, total_supply: '1000', issuer: 'cc'.repeat(32), capabilities: [], paused: false, at: ref(o.tip) };
        return a ? { result } : { error: { code: -32004, message: 'unknown asset' } };
      }
      case 'indexer_status':
        return { result: { height: String(o.tip - 5), hash: hash(o.tip - 5), state_root: '00'.repeat(32), btc_height: 140, finalized: ref(o.finalAt), halted: null } };
      case 'ksana_estimateFee':
        return { result: { feerate_sat_vb: '2', path_b: o.pathB ?? { amount: '1', per_kib: '1' }, at: ref(o.tip) } };
      default:
        return { error: { code: -32601, message: `${method} not answered` } };
    }
  };
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    calls.set(body.method, (calls.get(body.method) ?? 0) + 1);
    if (body.method === 'ksana_getAccountOps' || body.method === 'ksana_getLatestOps') {
      listed.push({ method: body.method, params: body.params });
      if (failLists > 0) {
        failLists--;
        if (o.failCode === undefined) return new Response('busy', { status: 503 });
        const error = { code: o.failCode, message: 'storage error' };
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, ...answer(body.method, body.params) }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, asked, calls, listed, hash, ALICE, BOB, skippedOp, skippedId };
}

describe('The indexer check on a node', () => {
  const loaded = (chain: RpcChain) => chain.blocks.filter((b): b is Block => !!b);

  it('claims no match before a check: unreachable while the indexer does not answer, then its latest check vouches for the blocks at or below it', async () => {
    const node = syntheticNode({ tip: 400, opsAt: [390], finalAt: 380 });
    let down = true;
    const fetch: typeof globalThis.fetch = async (url, init) => {
      if (down && String(url).startsWith('http://indexer.test')) throw new TypeError('Failed to fetch');
      return node.fetch(url, init);
    };
    const chain = new RpcChain({ url: 'http://node.test', indexerUrl: 'http://indexer.test', chain: 'devnet' }, { fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    expect(chain.indexerChecks).toEqual([]);
    expect(indexerState(chain)).toBe('unreachable');
    expect(loaded(chain).filter((b) => indexerVouches(chain, b))).toEqual([]);
    down = false;
    await chain.sync();
    expect(indexerState(chain)).toBe('ok');
    // The indexer at #395, five below the tip
    const vouched = loaded(chain).filter((b) => indexerVouches(chain, b)).map((b) => b.header.height);
    expect(vouched.length).toBeGreaterThan(5);
    expect(Math.max(...vouched)).toBe(395);
    expect(loaded(chain).some((b) => b.header.height > 395 && indexerVouches(chain, b))).toBe(false);
    down = true;
    await chain.sync();
    expect(indexerState(chain)).toBe('unreachable');
  });

  it('counts every check it made beyond the forty it keeps, so that a mismatch older than them is still told', async () => {
    const node = syntheticNode({ tip: 400, opsAt: [390], finalAt: 380 });
    // The indexer a block further at each answer, its first state root not the node's
    let answers = 0;
    const fetch: typeof globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string };
      if (body.method !== 'indexer_status') return node.fetch(url, init);
      const h = 340 + answers++;
      const result = { height: String(h), hash: node.hash(h), state_root: (answers === 1 ? 'ff' : '00').repeat(32), btc_height: 140, finalized: { height: '380', hash: node.hash(380) }, halted: null };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const chain = new RpcChain({ url: 'http://node.test', indexerUrl: 'http://indexer.test', chain: 'devnet' }, { fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    for (let i = 0; i < 45; i++) await chain.sync();
    expect(answers).toBeGreaterThan(40);
    expect(chain.indexerChecks).toHaveLength(40);
    expect(chain.indexerTally).toMatchObject({ count: answers, failed: 1, lastFailed: { height: 340, indexerRoot: 'ff'.repeat(32) } });
    expect(chain.indexerChecks.some((c) => c === chain.indexerTally.lastFailed)).toBe(false);
    expect(indexerState(chain)).toBe('ok');
  });
});

describe("The node's calls in batches (batch.ts)", () => {
  it('the first load reads the same as call by call in a few requests, the boundaries far below its window found in a few rounds', async () => {
    // an operation every seventh block, BTC-final up to #250, far below the window of #381–#400
    const opsAt = Array.from({ length: 57 }, (_, i) => 1 + i * 7);
    const run = async (batch: boolean) => {
      const node = syntheticNode({ tip: 400, opsAt, finalAt: 250 });
      const server = batchServer(node.fetch);
      const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch, manual: true, window: 20, now: () => 1_800_000_000_000 });
      await chain.sync();
      expect(chain.conn.state).toBe('live');
      return { chain, requests: server.requests };
    };
    const plain = await run(false);
    const batched = await run(true);
    const summary = (chain: RpcChain) => ({
      blocks: chain.blocks.map((b) => (b ? `${b.hash} ${blockStage(chain, b)}` : null)),
      settled: chain.settledHeight,
      final: chain.finalHeight,
    });
    expect(summary(batched.chain)).toEqual(summary(plain.chain));
    // the boundary the search found: the last block with a settlement at or below #250
    expect(batched.chain.finalHeight).toBe(246);
    // call by call, a request each; in batches, a handful: the first sync's probes ask all their candidates at once (12 requests)
    expect(plain.requests.every((n) => n === 1)).toBe(true);
    expect(plain.requests.length).toBeGreaterThan(100);
    expect(batched.requests.length).toBeLessThanOrEqual(14);
  });

  it('a page back after the tip moved on reads the blocks it missed by height in a few requests, not along the parents one by one', async () => {
    // A lane where a block comes every few minutes: a page out of view for an hour finds the tip ten blocks on, for a day some 300
    const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [390, 405, 406, 408, 700], finalAt: 395 };
    const node = syntheticNode(o);
    const server = batchServer(node.fetch);
    let now = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => now });
    await chain.sync();
    const away = async (on: number) => {
      const before = server.requests.length;
      o.tip += on;
      o.finalAt += on;
      now += 3_600_000;
      await chain.sync();
      return server.requests.length - before;
    };
    // Ten on: the tip, the nine between in one request, the new blocks' settlements, the fee and the node's report; 12 requests before,
    // the ten blocks one after another
    expect(await away(10)).toBeLessThanOrEqual(4);
    for (let h = 381; h <= 410; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    expect(chain.finalHeight).toBe(405);
    // Meanwhile the chain switches to a branch from 407 on, and moves 300 on. The blocks the page held above the BTC-final boundary,
    // 406 to 410, are read again by height with the window, being fewer than the 280 heights between: the tip, the window and those
    // blocks, their settlements, the BTC-final boundary's probes, the node's report, the fee; 306 requests before, one after another
    o.era = (h) => (h >= 407 ? 1 : 0);
    expect(await away(300)).toBeLessThanOrEqual(7);
    for (let h = 691; h <= 710; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    // The blocks that were BTC-final stay, the others are the chain's, the branch's from 407 on, and the heights between are left to
    // the backfill, which stops at the BTC-final boundary, now above them
    for (let h = 381; h <= 410; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    expect(chain.blocks.flatMap((b, h) => (b && h > 410 && h < 691 ? [h] : []))).toEqual([]);
    // The operations of the blocks read again are in them, the one of block 408 in the branch's block: none waits to be included
    for (const h of [406, 408]) expect(chain.getOp(opIdsOf(chain.blocks[h] as Block)[0] as string)?.blockHash).toBe(node.hash(h));
    expect(chain.opOrder.filter((id) => opStatusOf(chain, chain.getOp(id) as OpRecord) === 'pending')).toEqual([]);
  });

  it('a page back after hours keeps the operations of the blocks it held where they are, in the lists and the wallet', async () => {
    // Operations in the blocks the page held above the BTC-final boundary, which six hours later is above them all (at heights whose
    // synthetic hashes have a letter: one of digits alone reads as a height)
    const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [394, 395, 397, 398, 685, 695], finalAt: 390 };
    const node = syntheticNode(o);
    let now = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: batchServer(node.fetch).fetch, batch: true, manual: true, window: 20, now: () => now });
    chain.setWallet({ account: node.ALICE });
    await chain.sync();
    const held = chain.opOrder.slice();
    expect(held).toHaveLength(4);
    o.tip = 700;
    o.finalAt = 690;
    now += 6 * 3_600_000;
    for (let i = 0; i < 5; i++) {
      now += 2_500;
      await chain.sync();
    }
    // Each in its block, BTC-final, the newest of the lists the operation of block 695; none in the wallet's operations on their way
    for (const id of held) expect(opStatusOf(chain, chain.getOp(id) as OpRecord)).toBe('btc_final');
    expect(chain.getOp(chain.opOrder[chain.opOrder.length - 1] as string)?.height).toBe(695);
    expect(inflight(chain, node.ALICE).filter((r) => held.includes(r.id))).toEqual([]);
  });

  it('a block a link opened above the tip of the round before leaves the page to read what it missed by height', async () => {
    const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [390], finalAt: 380 };
    const node = syntheticNode(o);
    const server = batchServer(node.fetch);
    let now = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => now });
    await chain.sync();
    o.tip = 700;
    o.finalAt = 680;
    now += 3_600_000;
    // A link to block 690 opened as the page comes back, read before the sync: the sync still goes from block 400, where it walked
    // from 690 down to 400 along the parents, a request a block. The tip; the window and the 60 blocks held in two; the settlements
    // and the boundaries' probes in four; the node's report; a backfill step; the fee
    await settle(chain, [['block', '690']]);
    const before = server.requests.length;
    await chain.sync();
    expect(server.requests.length - before).toBeLessThanOrEqual(10);
    for (let h = 381; h <= 400; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    for (let h = 681; h <= 700; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
  });

  it('where the heights between are fewer than the blocks held above the BTC-final boundary, those are read and the blocks checked by their links', async () => {
    // A devnet whose BTC-final boundary trails by hundreds of blocks: the page holds 300 not yet final, and comes back 50 blocks on
    const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [90, 395], finalAt: 100 };
    const node = syntheticNode(o);
    const server = batchServer(node.fetch);
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, backfillStep: 400, now: () => 1_800_000_000_000 });
    await chain.sync();
    for (let h = 101; h <= 400; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    o.tip = 450;
    const before = server.requests.length;
    await chain.sync();
    // The 30 heights between and the window in one request after the tip; the walk along the parents checks the 300 held, none read
    // again
    expect(server.requests.length - before).toBeLessThanOrEqual(5);
    for (let h = 101; h <= 450; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    expect(node.asked.get('200')).toBe(1);
    // Away again while the chain switches to a branch from 380 on, among the blocks held: the walk replaces them
    o.era = (h) => (h >= 380 ? 1 : 0);
    o.tip = 500;
    await chain.sync();
    for (let h = 101; h <= 500; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
  });

  it('an operation a branch took out of a block read again, included again among the heights between, is where the node has it', async () => {
    // The page holds 381 to 400, BTC-final to 380, an operation in block 398. Away for six hours, the chain switched to a branch from
    // 397 on, which included the operation again in block 450, and moved 300 on: the round reads 381 to 400 again, and not 450
    const transfer = () => ({ AssetTransfer: { asset: '00'.repeat(32), to: '22'.repeat(32), amount: '777' } });
    const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [398], finalAt: 380, action: transfer };
    const node = syntheticNode(o);
    let now = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: batchServer(node.fetch).fetch, batch: true, manual: true, window: 20, now: () => now });
    await chain.sync();
    const id = chain.opOrder[0] as string;
    expect(chain.getOp(id)?.height).toBe(398);
    o.era = (h) => (h >= 397 ? 1 : 0);
    o.opsAt = [450];
    o.opAt = (x) => (x === id ? 450 : undefined);
    o.tip = 700;
    o.finalAt = 690;
    now += 6 * 3_600_000;
    await chain.sync();
    const r = chain.getOp(id) as OpRecord;
    expect(r.blockHash).toBe(node.hash(450));
    expect(opStatusOf(chain, r)).toBe('btc_final');
  });

  it("a parallel block merged by a branch's block read again is read, though the heights between are not", async () => {
    const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [390], finalAt: 380 };
    const node = syntheticNode(o);
    let now = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: batchServer(node.fetch).fetch, batch: true, manual: true, window: 20, now: () => now });
    await chain.sync();
    expect(chain.sideBlocks).toEqual([]);
    // The chain switched to a branch from 397 on, whose block 397 merges a parallel block beside 396, and moved 300 on
    o.era = (h) => (h >= 397 ? 1 : 0);
    o.skipped = { at: 396, nonce: 1, status: () => 'skipped' };
    o.tip = 700;
    o.finalAt = 690;
    now += 6 * 3_600_000;
    await chain.sync();
    expect(chain.blocks[397]?.hash).toBe(node.hash(397));
    expect(chain.sideBlocks.map((b) => b.hash)).toEqual(['ee'.repeat(32)]);
  });

  it('the blocks a round read again past the heights between are checked by their links once the backfill joins them', async () => {
    // The BTC-final boundary stalls at 300, no settlement landing after it: the page holds 301 to 400, and comes back 220 blocks on. It
    // reads the 100 again with the window, and the backfill reads the heights between in steps of 100, which then join them
    const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [300, 390], finalAt: 300 };
    const node = syntheticNode(o);
    const chain = new RpcChain(
      { url: 'http://node.test', chain: 'devnet' },
      { fetch: batchServer(node.fetch).fetch, batch: true, manual: true, window: 20, backfillStep: 100, now: () => 1_800_000_000_000 },
    );
    await chain.sync();
    for (let h = 301; h <= 400; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    o.tip = 620;
    for (let i = 0; i < 3; i++) await chain.sync();
    expect(chain.loadedFrom).toBeLessThanOrEqual(301);
    // Then the chain switches to a branch from 350 on: the walk goes down through the blocks read again and replaces them
    o.era = (h) => (h >= 350 ? 1 : 0);
    o.tip = 625;
    await chain.sync();
    for (let h = 301; h <= 625; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
  });

  it('a node that takes no batch is read twelve calls at a time, as before batches, not a batch\'s worth', async () => {
    const node = syntheticNode({ tip: 400, opsAt: [390, 395], finalAt: 380 });
    let inFlight = 0;
    let most = 0;
    // a proxy in front of the node that refuses lists, and answers each call a moment later
    const refusing = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (Array.isArray(JSON.parse(String(init?.body)))) {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32005, message: 'Batched requests are not supported by this server' } }), { status: 200 });
      }
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return node.fetch(url, init);
    }) as typeof fetch;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: refusing, batch: true, manual: true, window: 60, now: () => 1_800_000_000_000 });
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    expect(chain.blocks.length).toBe(401);
    expect(most).toBe(12);
  });

  it('a node that takes no batch is read the blocks of the listing the page opened on after the settlements, twelve calls at a time still', async () => {
    // thirty operations in the window and thirty below it, all on the latest list
    const opsAt = [...Array.from({ length: 30 }, (_, i) => 100 + i * 3), ...Array.from({ length: 30 }, (_, i) => 341 + i * 2)];
    const node = syntheticNode({ tip: 400, opsAt, finalAt: 90, lists: true });
    let inFlight = 0;
    let most = 0;
    const refusing = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (Array.isArray(JSON.parse(String(init?.body)))) {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32005, message: 'Batched requests are not supported by this server' } }), { status: 200 });
      }
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return node.fetch(url, init);
    }) as typeof fetch;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: refusing, batch: true, manual: true, window: 60, now: () => 1_800_000_000_000 });
    chain.listAhead({ key: 'latest', rows: 60 });
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    expect(listing(chain, 'latest').listed).toBe(60);
    for (const h of opsAt) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    expect(most).toBe(12);
  });

  it('the first sync reads its window with the call for the tip, below the tip the network\'s answer named, and what the tip moved by once it is known', async () => {
    for (const batch of [true, false]) {
      for (const moved of [403, 395]) {
        const o = { tip: 400, opsAt: [390, 395], finalAt: 380 };
        const node = syntheticNode(o);
        let checked = false;
        // the chain moves on, or switches to a shorter branch, as its network is read
        const moving = (async (url: RequestInfo | URL, init?: RequestInit) => {
          const answer = await node.fetch(url, init);
          if (!checked && String(init?.body).includes('ksana_getChainInfo')) {
            checked = true;
            o.tip = moved;
          }
          return answer;
        }) as typeof fetch;
        const server = batchServer(moving);
        const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch, manual: true, window: 20, now: () => 1_800_000_000_000 });
        await chain.sync();
        expect(chain.conn.state).toBe('live');
        expect(chain.blocks.length).toBe(moved + 1);
        // every block from the bottom of the window guessed or known up to the tip, each its height's, linked to the one below
        const bottom = Math.min(381, moved - 19);
        for (let h = bottom; h <= moved; h++) {
          expect(chain.blocks[h]?.hash).toBe(node.hash(h));
          if (h > bottom) expect(chain.blocks[h]?.header.parents[0]).toBe(node.hash(h - 1));
        }
        // each height asked once: the guess's and the heights the tip moved by; those above a lower tip asked and left out
        for (let h = bottom; h < moved; h++) expect(node.asked.get(String(h))).toBe(1);
        for (let h = moved + 1; h < 400; h++) expect(node.asked.get(String(h))).toBe(1);
        expect(node.asked.get('0')).toBe(1);
        if (batch) expect(server.methods[1]?.filter((m) => m === 'ksana_getBlock')).toHaveLength(21);
      }
    }
  });

  it('a tip that moves on by a window or more as the network is read leaves the gap below its window to the backfill, which reads it by height, not a block at a time', async () => {
    const o = { tip: 400, opsAt: [390, 395, 445], finalAt: 380 };
    const node = syntheticNode(o);
    let checked = false;
    // a node catching up after a restart, fifty blocks on by the call for the tip
    const moving = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const answer = await node.fetch(url, init);
      if (!checked && String(init?.body).includes('ksana_getChainInfo')) {
        checked = true;
        o.tip = 450;
      }
      return answer;
    }) as typeof fetch;
    const server = batchServer(moving);
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    for (let h = 431; h <= 450; h++) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    // no block read by itself, a round trip each, down the gap from #430 to #400
    expect(server.methods.filter((m) => m.length === 1 && m[0] === 'ksana_getBlock')).toEqual([]);
    expect(server.requests.length).toBeLessThanOrEqual(10);
  });

  it('the blocks guessed below such a gap are not kept: a branch the chain left there never shows as chain blocks, nor as BTC-final', async () => {
    const o = { tip: 400, opsAt: [385, 390, 395, 420, 435, 445], finalAt: 380 };
    const node = syntheticNode(o);
    let checked = false;
    const left = (h: number) => `ee${node.hash(h).slice(2)}`;
    // fifty blocks on by the call for the tip, BTC-final close to it, and the selected chain switched below the guessed window
    // meanwhile: the guessed heights answer from the branch it left, which the backfill never reaches, the BTC-final boundary being
    // above the gap
    const switching = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const call = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      const answer = await node.fetch(url, init);
      if (!checked && call.method === 'ksana_getChainInfo') {
        checked = true;
        o.tip = 450;
        o.finalAt = 440;
        return answer;
      }
      const h = typeof call.params[0] === 'string' && /^\d+$/.test(call.params[0]) ? Number(call.params[0]) : -1;
      if (call.method !== 'ksana_getBlock' || h < 381 || h > 399 || node.asked.get(String(h)) !== 1) return answer;
      const json = (await answer.json()) as { result: { hash: string; header: { parents: string[] } } };
      json.result.hash = left(h);
      if (h > 381) json.result.header.parents = [left(h - 1)];
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: batchServer(switching).fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
    for (let round = 0; round < 3; round++) {
      await chain.sync();
      for (let h = 381; h <= 399; h++) expect(chain.blocks[h]?.hash).not.toBe(left(h));
    }
    // the heights the guess read are BTC-final: the branch's blocks would have shown so
    expect(chain.finalHeight).toBeGreaterThanOrEqual(399);
    expect(chain.blocks[0]?.hash).toBe(node.hash(0));
  });

  it('the first sync takes the BTC-final tip the node reports from its network check, and asks again only where the statuses give more', async () => {
    for (const later of [380, 390]) {
      const o = { tip: 400, opsAt: Array.from({ length: 21 }, (_, i) => 300 + i * 5), finalAt: 380 };
      const node = syntheticNode(o);
      let checked = false;
      // the BTC-final tip stays, or moves on with BTC, as the network is read
      const moving = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const answer = await node.fetch(url, init);
        if (!checked && String(init?.body).includes('ksana_getChainInfo')) {
          checked = true;
          o.finalAt = later;
        }
        return answer;
      }) as typeof fetch;
      const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: batchServer(moving).fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
      await chain.sync();
      expect(chain.conn.state).toBe('live');
      expect(chain.finalHeight).toBe(later);
      expect(node.calls.get('ksana_getChainInfo')).toBe(later === 380 ? 1 : 2);
    }
  });

  it('the BTC-final height the search below the window finds is not held back by the older report of the network check', async () => {
    for (const later of [300, 350]) {
      // an operation every fifth block, BTC-final up to #300 as the network is read, far below the window of #381–#400
      const o = { tip: 400, opsAt: Array.from({ length: 80 }, (_, i) => 1 + i * 5), finalAt: 300 };
      const node = syntheticNode(o);
      let checked = false;
      const moving = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const answer = await node.fetch(url, init);
        if (!checked && String(init?.body).includes('ksana_getChainInfo')) {
          checked = true;
          o.finalAt = later;
        }
        return answer;
      }) as typeof fetch;
      const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: batchServer(moving).fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
      await chain.sync();
      // the last block with a settlement at or below the BTC-final tip, found by the search below the window
      expect(chain.finalHeight).toBe(later === 300 ? 296 : 346);
      expect(node.calls.get('ksana_getChainInfo')).toBe(later === 300 ? 1 : 2);
    }
  });

  it('on a chain whose blocks all have a settlement, a later search in batches asks little more of the node than call by call', async () => {
    const run = async (batch: boolean) => {
      // BTC-final up to #400, far below the window; a later sync, once the search may run again, looks for it again
      const o = { tip: 1000, opsAt: Array.from({ length: 1100 }, (_, i) => i + 1), finalAt: 400 };
      const node = syntheticNode(o);
      let now = 1_800_000_000_000;
      const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: batchServer(node.fetch).fetch, batch, manual: true, window: 60, now: () => now });
      await chain.sync();
      expect(chain.finalHeight).toBe(400);
      o.tip = 1010;
      now += 60_000;
      const before = node.calls.get('ksana_getSettlement') ?? 0;
      await chain.sync();
      expect(chain.finalHeight).toBe(400);
      return (node.calls.get('ksana_getSettlement') ?? 0) - before;
    };
    const plain = await run(false);
    const batched = await run(true);
    // a probe's first candidate has a settlement: it is asked alone, its neighbours not at all
    expect(batched).toBeLessThan(plain + 40);
  });

  it("the first sync's reads that need no block go out with its call for the tip, and what names blocks is worked out with them", async () => {
    const node = syntheticNode({ tip: 400, opsAt: [390, 395], finalAt: 380, lockedAt: [392, 398] });
    const server = batchServer(node.fetch);
    const chain = new RpcChain({ url: 'http://node.test', indexerUrl: 'http://indexer.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
    chain.peekAccount(node.ALICE);
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    // the network alone and first (A2-11); the fee estimate, the account and the window's blocks with the tip; the indexer's status beside them
    expect(server.methods[0]).toEqual(['ksana_getChainInfo']);
    const withTip = server.methods[1] ?? [];
    expect([...new Set(withTip)].sort()).toEqual(['ksana_estimateFee', 'ksana_getAccount', 'ksana_getBlock']);
    // the tip, and the genesis block and the nineteen below the tip the network's answer named
    expect(withTip.filter((m) => m === 'ksana_getBlock')).toHaveLength(21);
    expect(server.methods[2]).toEqual(['indexer_status']);
    for (const method of ['ksana_estimateFee', 'ksana_getAccount', 'indexer_status']) expect(node.calls.get(method)).toBe(1);
    // read before the blocks, worked out after them: the locked rows name their blocks' heights, the indexer's check its block's
    expect([...chain.lockedFees.values()].map((f) => f.height).sort()).toEqual([392, 398]);
    expect(chain.indexerChecks.map((c) => [c.height, c.nodeHash])).toEqual([[395, undefined]]);
    expect(node.asked.get('395')).toBe(1);
  });
});

/** A history view's reach through the node's listing (D-111) */
function listing(chain: RpcChain, key: string) {
  const reach = chain.history(key);
  if (reach.source !== 'listing') throw new Error('not listed by the node');
  return reach;
}

/** Lets the requests a history view started (a listing page and its blocks) finish */
async function idle(chain: RpcChain, key: string) {
  for (let i = 0; i < 200; i++) {
    const reach = chain.history(key);
    if (reach.source === 'blocks' || !reach.loading) return;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw new Error('the listing did not finish');
}

describe('History views read older blocks from a node without the operation listings (D-110)', () => {
  const TIP = 300;
  const OPS = [5, 120, 250, 285];
  const start = async (options: { historyDepth?: number; historyStep?: number } = {}) => {
    const node = syntheticNode({ tip: TIP, opsAt: OPS, finalAt: 290 });
    let clock = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => clock, ...options });
    await chain.sync();
    chain.peekAccount(node.ALICE);
    await chain.sync();
    const heights = () => (chain.peekAccount(node.ALICE)?.opIds ?? []).map((id) => chain.getOp(id)?.height);
    /** A view of ALICE's operations asks for more; the first ask finds that the node has no listings */
    const want = async () => {
      chain.wantHistory(node.ALICE);
      await idle(chain, node.ALICE);
    };
    return { chain, node, heights, want, tick: (ms: number) => (clock += ms) };
  };

  it('without a history view the cache covers the window and the stretch not yet BTC-final, as before', async () => {
    const { chain, node, heights } = await start();
    expect(chain.finalHeight).toBe(285);
    expect(chain.loadedFrom).toBe(TIP - 20 + 1);
    expect(chain.history(node.ALICE)).toMatchObject({ source: 'listing', loading: false });
    expect(heights()).toEqual([285]);
  });

  it('a history view has the chain read down to historyDepth below the tip, in rounds shown one by one, each block fetched once', async () => {
    const { chain, node, heights, want } = await start({ historyStep: 30 });
    let shown = 0;
    chain.subscribe(() => shown++);
    await want();
    expect(node.listed.map((c) => c.method)).toEqual(['ksana_getAccountOps']);
    expect(chain.history(node.ALICE)).toEqual({ source: 'blocks', loading: true, from: TIP - 20 + 1 });
    await chain.sync();
    // the whole synthetic chain is shorter than the default depth of 2000 blocks
    expect(chain.loadedFrom).toBe(0);
    expect(chain.history(node.ALICE)).toEqual({ source: 'blocks', loading: false, from: 0 });
    expect(heights()).toEqual(OPS);
    expect(shown).toBeGreaterThanOrEqual(Math.ceil((TIP - 20) / 30));
    for (let h = 1; h < TIP; h++) expect(node.asked.get(String(h)), `block ${h}`).toBe(1);
    // the node is not asked for listings again
    await want();
    chain.wantHistory('latest');
    expect(node.listed).toHaveLength(1);
  });

  it('beyond historyDepth the reading stops until loadEarlier asks for more', async () => {
    const { chain, node, heights, want } = await start({ historyDepth: 100, historyStep: 30 });
    await want();
    await chain.sync();
    expect(chain.loadedFrom).toBe(TIP - 100 + 1);
    expect(chain.history(node.ALICE).loading).toBe(false);
    expect(heights()).toEqual([250, 285]);
    // asking again while the list is shown keeps the floor where it is
    await want();
    await chain.sync();
    expect(chain.loadedFrom).toBe(TIP - 100 + 1);
    chain.loadEarlier(node.ALICE);
    expect(chain.history(node.ALICE).loading).toBe(true);
    await chain.sync();
    expect(chain.loadedFrom).toBe(TIP - 200 + 1);
    expect(heights()).toEqual([120, 250, 285]);
    chain.loadEarlier(node.ALICE);
    await chain.sync();
    expect(chain.loadedFrom).toBe(0);
    expect(heights()).toEqual(OPS);
  });

  it('a view that does without (the overview) has nothing read: it keeps to the loaded blocks', async () => {
    const { chain, node } = await start();
    chain.wantHistory('latest', true, { readBlocks: false });
    await idle(chain, 'latest');
    expect(node.listed.map((c) => c.method)).toEqual(['ksana_getLatestOps']);
    expect(chain.history('latest')).toEqual({ source: 'blocks', loading: false, from: TIP - 20 + 1 });
    await chain.sync();
    chain.wantHistory('latest', true, { readBlocks: false });
    await chain.sync();
    expect(chain.loadedFrom).toBe(TIP - 20 + 1);
    expect(node.listed).toHaveLength(1);
  });

  it('a request lapses when no page asks for ten minutes', async () => {
    const { chain, node, want, tick } = await start({ historyDepth: 100 });
    await want();
    tick(10 * 60_000 + 1);
    expect(chain.history(node.ALICE).loading).toBe(false);
    await chain.sync();
    expect(chain.loadedFrom).toBe(TIP - 20 + 1);
    // a later request starts again from the tip
    await want();
    await chain.sync();
    expect(chain.loadedFrom).toBe(TIP - 100 + 1);
  });
});

describe("History views page through the node's operation listings (D-111)", () => {
  const TIP = 300;
  const OPS = [5, 60, 120, 200, 250, 285];
  const start = async (options: { listPage?: number; listBudget?: number; failLists?: number; failCode?: number } = {}) => {
    const { failLists, failCode, ...rest } = options;
    const node = syntheticNode({ tip: TIP, opsAt: OPS, finalAt: 290, lists: true, ...(failLists ? { failLists } : {}), ...(failCode ? { failCode } : {}) });
    let clock = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => clock, ...rest });
    await chain.sync();
    chain.peekAccount(node.ALICE);
    await chain.sync();
    const heights = () => (chain.peekAccount(node.ALICE)?.opIds ?? []).map((id) => chain.getOp(id)?.height);
    const want = async (key: string = node.ALICE) => {
      chain.wantHistory(key);
      await idle(chain, key);
    };
    return { chain, node, heights, want, tick: (ms: number) => (clock += ms) };
  };

  it('fetches only the blocks holding the listed operations, without reading the chain down', async () => {
    const { chain, node, heights, want } = await start();
    const asked = node.asked.size;
    await want();
    expect(node.listed).toEqual([{ method: 'ksana_getAccountOps', params: [node.ALICE, null, 60] }]);
    expect(heights()).toEqual(OPS);
    expect(chain.history(node.ALICE)).toEqual({ source: 'listing', loading: false, complete: true, paused: false, listed: OPS.length });
    // the blocks below the window, once each, by hash; nothing else
    for (const h of [5, 60, 120, 200, 250]) expect(node.asked.get(node.hash(h)), `block ${h}`).toBe(1);
    expect(node.asked.size).toBe(asked + 5);
    expect(chain.loadedFrom).toBe(TIP - 20 + 1);
    // a complete listing is not asked again
    await want();
    expect(node.listed).toHaveLength(1);
    // the listed blocks are kept while the view asks
    expect(chain.getBlock(5)?.entries).toHaveLength(1);
    expect(blockStage(chain, chain.getBlock(5) as Block)).toBe('final');
  });

  it('pages on while the view is short, up to the budget, then waits for the button', async () => {
    const { chain, node, heights, want } = await start({ listPage: 2, listBudget: 3 });
    await want();
    expect(heights()).toEqual([250, 285]);
    expect(chain.history(node.ALICE)).toMatchObject({ complete: false, paused: false, listed: 2 });
    await want();
    expect(heights()).toEqual([120, 200, 250, 285]);
    expect(node.listed.map((c) => c.params)).toEqual([
      [node.ALICE, null, 2],
      [node.ALICE, '250:0:0', 2],
    ]);
    // the budget is used up: asking again does not list further
    expect(chain.history(node.ALICE)).toMatchObject({ complete: false, paused: true, listed: 4 });
    await want();
    expect(node.listed).toHaveLength(2);
    chain.loadEarlier(node.ALICE);
    await idle(chain, node.ALICE);
    expect(node.listed[2]?.params).toEqual([node.ALICE, '120:0:0', 2]);
    expect(heights()).toEqual(OPS);
    expect(chain.history(node.ALICE)).toMatchObject({ complete: true, paused: false, listed: 6 });
    // a view that is full only keeps its blocks
    chain.wantHistory(node.ALICE, false);
    expect(node.listed).toHaveLength(3);
  });

  it('the latest operations of the whole chain', async () => {
    const { chain, node, want } = await start({ listPage: 4 });
    await want('latest');
    expect(node.listed).toEqual([{ method: 'ksana_getLatestOps', params: [null, 4] }]);
    expect(chain.opOrder.map((id) => chain.getOp(id)?.height)).toEqual([120, 200, 250, 285]);
    expect(chain.history('latest')).toMatchObject({ source: 'listing', listed: 4, complete: false });
  });

  it('a failed page is shown, asked again after a while or at once by the button', async () => {
    const { chain, node, heights, want, tick } = await start({ failLists: 2 });
    await want();
    expect(chain.history(node.ALICE)).toMatchObject({ source: 'listing', loading: false, listed: 0 });
    expect(listing(chain, node.ALICE).error).toMatch(/503/);
    await want();
    expect(node.listed).toHaveLength(1);
    tick(8_000);
    await want();
    expect(node.listed).toHaveLength(2);
    chain.loadEarlier(node.ALICE);
    await idle(chain, node.ALICE);
    expect(node.listed).toHaveLength(3);
    expect(heights()).toEqual(OPS);
    expect(chain.history(node.ALICE)).toEqual({ source: 'listing', loading: false, complete: true, paused: false, listed: OPS.length });
  });

  it('a JSON-RPC error other than METHOD_NOT_FOUND fails the page too: the node still lists, and blocks are not read down', async () => {
    const { chain, node, heights, want, tick } = await start({ failCode: -32603, failLists: 1 });
    const asked = node.asked.size;
    await want();
    expect(listing(chain, node.ALICE)).toMatchObject({ loading: false, listed: 0 });
    expect(listing(chain, node.ALICE).error).toMatch(/storage error/);
    expect(node.asked.size).toBe(asked);
    tick(8_000);
    await want();
    expect(node.listed).toHaveLength(2);
    expect(heights()).toEqual(OPS);
    expect(chain.history(node.ALICE)).toEqual({ source: 'listing', loading: false, complete: true, paused: false, listed: OPS.length });
  });

  it('the listing the page shows first comes with the first load: its page with the call for the tip, its blocks with the settlements', async () => {
    const node = syntheticNode({ tip: TIP, opsAt: OPS, finalAt: 290, lists: true });
    const server = batchServer(node.fetch);
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
    chain.listAhead({ key: 'latest', rows: 4 });
    await chain.sync();
    // as many as the view shows, with the tip; the blocks they name outside the window in the next request, with the settlements
    expect(node.listed).toEqual([{ method: 'ksana_getLatestOps', params: [null, 4] }]);
    expect(server.methods[0]).toEqual(['ksana_getChainInfo']);
    expect(server.methods[1]).toContain('ksana_getLatestOps');
    expect(server.methods[2]).toContain('ksana_getSettlement');
    expect(server.methods[2]?.filter((m) => m === 'ksana_getBlock')).toHaveLength(3);
    for (const h of [120, 200, 250]) expect(node.asked.get(node.hash(h)), `block ${h}`).toBe(1);
    // the view finds its operations in place when it first shows, and lists no further while it is full
    expect(chain.opOrder.map((id) => chain.getOp(id)?.height)).toEqual([120, 200, 250, 285]);
    expect(chain.history('latest')).toEqual({ source: 'listing', loading: false, complete: false, paused: false, listed: 4 });
    chain.wantHistory('latest', false);
    expect(node.listed).toHaveLength(1);
    // one that finds it short lists on from where it stopped
    chain.wantHistory('latest');
    await idle(chain, 'latest');
    expect(node.listed[1]).toEqual({ method: 'ksana_getLatestOps', params: ['120:0:0', 60] });
    expect(chain.history('latest')).toMatchObject({ complete: true, listed: OPS.length });
  });

  it("an account page opened from a link has the first load read the account and its listing with the tip, however long it waited for its node", async () => {
    const node = syntheticNode({ tip: TIP, opsAt: OPS, finalAt: 290, lists: true });
    const server = batchServer(node.fetch);
    let down = true;
    let clock = 1_800_000_000_000;
    const restarting = (async (url: RequestInfo | URL, init?: RequestInit) => (down ? new Response('Bad Gateway', { status: 502 }) : server.fetch(url, init))) as typeof fetch;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: restarting, batch: true, manual: true, window: 20, now: () => clock });
    chain.listAhead({ key: node.ALICE, rows: 50 });
    // the connecting screen waits a minute and a half for the node, longer than an account stays watched
    await chain.sync();
    expect(chain.ready).toBe(false);
    clock += 90_000;
    down = false;
    await chain.sync();
    expect(server.methods[1]).toEqual(expect.arrayContaining(['ksana_getAccount', 'ksana_getAccountOps']));
    expect(node.listed).toEqual([{ method: 'ksana_getAccountOps', params: [node.ALICE, null, 50] }]);
    // the page finds the account and its operations in place: all six, the blocks below the window read with the settlements
    expect(server.methods[2]?.filter((m) => m === 'ksana_getBlock')).toHaveLength(5);
    expect((chain.peekAccount(node.ALICE)?.opIds ?? []).map((id) => chain.getOp(id)?.height)).toEqual(OPS);
    expect(chain.history(node.ALICE)).toEqual({ source: 'listing', loading: false, complete: true, paused: false, listed: OPS.length });
    expect(node.calls.get('ksana_getAccount')).toBe(1);
  });

  it('what the page opened on is read with the first load only: a chain of its genesis block alone, whose every sync reads as a first, lists it once', async () => {
    const node = syntheticNode({ tip: 0, opsAt: [], finalAt: 0, lists: true });
    let clock = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => clock });
    chain.listAhead({ key: 'latest', rows: 9 });
    await chain.sync();
    expect(chain.ready).toBe(true);
    // no view asks for the listing, which lapses, and is not read again
    clock += 11 * 60_000;
    await chain.sync();
    await chain.sync();
    expect(node.listed).toEqual([{ method: 'ksana_getLatestOps', params: [null, 9] }]);
  });

  it('the first load goes on without the listing it read ahead where the node has none (D-110) or the page fails, which the view then asks for', async () => {
    const plain = syntheticNode({ tip: TIP, opsAt: OPS, finalAt: 290 });
    const without = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: plain.fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    without.listAhead({ key: 'latest', rows: 9 });
    await without.sync();
    expect(without.conn.state).toBe('live');
    expect(without.history('latest').source).toBe('blocks');
    const failing = syntheticNode({ tip: TIP, opsAt: OPS, finalAt: 290, lists: true, failLists: 1, failCode: -32603 });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: failing.fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    chain.listAhead({ key: 'latest', rows: 9 });
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    expect(chain.history('latest')).toEqual({ source: 'listing', loading: false, complete: false, paused: false, listed: 0 });
    chain.wantHistory('latest');
    await idle(chain, 'latest');
    expect(failing.listed.map((c) => c.params)).toEqual([
      [null, 9],
      [null, 60],
    ]);
    expect(chain.history('latest')).toMatchObject({ complete: true, listed: OPS.length });
  });

  it('a listing lapses when no page asks for ten minutes; a later view lists from the top again', async () => {
    const { chain, node, want, tick } = await start({ listPage: 2 });
    await want();
    expect(listing(chain, node.ALICE).listed).toBe(2);
    tick(10 * 60_000 + 1);
    await chain.sync();
    expect(listing(chain, node.ALICE).listed).toBe(0);
    await want();
    expect(node.listed.map((c) => c.params[1])).toEqual([null, null]);
  });
});

describe('A block whose body a later block carried (D-077), opened by itself', () => {
  it('names the carrier by the height the node gives, and takes its settlement for the carrier’s, not for a republish of the block', async () => {
    const node = syntheticNode({ tip: 300, opsAt: [250], finalAt: 290, carriedBy: (h) => (h === 250 ? 258 : undefined) });
    const now = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => now });
    await chain.sync();
    await settle(chain, [['block', '250']]);
    await chain.sync();
    const b = chain.getBlock(node.hash(250)) as Block;
    // The carrier is below the window the page loads, and nothing asked for it
    expect(chain.getBlock(node.hash(258))).toBeUndefined();
    expect(b.carrierHeight).toBe(258);
    const shown = carrierTxid(258).match(/../g)?.reverse().join('') ?? '';
    expect(b.settlementOnBtc).toEqual({ txid: shown, btcHeight: 500 });
    expect(chain.getBtcTx(shown)).toMatchObject({ kind: 'settlement', forBlock: node.hash(258), forHeight: 258, partial: true, createdAt: b.time });
    const step = blockProgress(chain, b, now).steps.find((s) => s.key === 'broadcast');
    expect(step).toMatchObject({ state: 'done', sub: t().status.step.carriedBy('258'), ref: { to: { name: 'block', id: node.hash(258) }, text: '#258' } });
  });

  const carriedBy = (h: number) => (h === 250 ? 258 : undefined);
  const sorted = (methods: string[][]) => methods.map((m) => [...m].sort());
  // with operations in the window too, which finds the boundaries there: the first load reads nothing as far down as #250
  const OPS = [250, 285, 295];

  it('its page names the carrier as soon as the block is found: the status goes with the block in one request, by height or by hash', async () => {
    const node = syntheticNode({ tip: 300, opsAt: OPS, finalAt: 290, carriedBy });
    for (const id of ['250', node.hash(250)]) {
      const server = batchServer(node.fetch);
      const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
      await chain.sync();
      expect(chain.getBlock(node.hash(250))).toBeUndefined();
      const before = server.methods.length;
      await settle(chain, [['block', id]]);
      expect(sorted(server.methods.slice(before))).toEqual([['ksana_getBlock', 'ksana_getSettlement']]);
      const b = chain.getBlock(node.hash(250)) as Block;
      expect(b.carrierHeight).toBe(258);
      expect(b.settlementOnBtc?.btcHeight).toBe(500);
    }
  });

  it('a status by height that names another block, the chain having switched between the two answers, is asked again by hash', async () => {
    const node = syntheticNode({ tip: 300, opsAt: OPS, finalAt: 290, carriedBy });
    const asked: unknown[] = [];
    const switched = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const call = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      const res = await node.fetch(url, init);
      if (call.method !== 'ksana_getSettlement') return res;
      asked.push(call.params[0]);
      if (call.params[0] !== '250') return res;
      const body = (await res.json()) as { result: { block: { hash: string } } };
      body.result.block.hash = 'ff'.repeat(32);
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: switched, manual: true, window: 20, now: () => 1_800_000_000_000 });
    await chain.sync();
    asked.length = 0;
    await settle(chain, [['block', '250']]);
    expect(asked).toEqual(['250', node.hash(250)]);
    expect((chain.getBlock(node.hash(250)) as Block).carrierHeight).toBe(258);
    expect(chain.getBlock('ff'.repeat(32))).toBeUndefined();
  });

  it("an operation's page opened from a link reads its block and the block's status together, in one request after the operation's", async () => {
    // the operation's ID, from a page whose window holds its block
    const wide = syntheticNode({ tip: 300, opsAt: OPS, finalAt: 290, carriedBy });
    const seen = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: wide.fetch, manual: true, window: 60, now: () => 1_800_000_000_000 });
    await seen.sync();
    const op = opIdsOf(seen.getBlock(wide.hash(250)) as Block)[0] as string;
    const node = syntheticNode({ tip: 300, opsAt: OPS, finalAt: 290, carriedBy, opAt: (id) => (id === op ? 250 : undefined) });
    const server = batchServer(node.fetch);
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
    await chain.sync();
    const before = server.methods.length;
    await settle(chain, [['op', op]]);
    expect(sorted(server.methods.slice(before))).toEqual([['ksana_getOpStatus'], ['ksana_getBlock', 'ksana_getSettlement']]);
    expect(chain.getOp(op)?.height).toBe(250);
    expect((chain.getBlock(node.hash(250)) as Block).carrierHeight).toBe(258);
  });
});

describe('The page opens once the first sync has worked out what it read', () => {
  it('not when its tip is in: an asset named meanwhile, which has the page draw again, finds it still connecting', async () => {
    const GOLD = 'ee'.repeat(32);
    const node = syntheticNode({ tip: 300, opsAt: [295], finalAt: 290, action: () => ({ AssetTransfer: { asset: GOLD, to: '22'.repeat(32), amount: '7' } }), assets: [{ id: GOLD, name: 'Gold' }] });
    let open = () => {};
    const gate = new Promise<void>((r) => (open = r));
    // the statuses are held until the asset's name is in
    const held = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if ((JSON.parse(String(init?.body)) as { method: string }).method === 'ksana_getSettlement') await gate;
      return node.fetch(url, init);
    }) as typeof fetch;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: held, manual: true, window: 20, now: () => 1_800_000_000_000 });
    const seen: boolean[] = [];
    chain.subscribe(() => seen.push(chain.ready));
    const sync = chain.sync();
    for (let i = 0; i < 200 && !seen.length; i++) await new Promise((r) => setTimeout(r, 1));
    expect(node.calls.get('ksana_getAsset')).toBe(1);
    expect(chain.blocks.length).toBe(301);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((ready) => !ready)).toBe(true);
    expect(chain.ready).toBe(false);
    open();
    await sync;
    expect(chain.ready).toBe(true);
    expect(seen.at(-1)).toBe(true);
  });
});

describe('A sync whose reads get no answer', () => {
  /** A node whose reads get no answer while `lost` (as a phone's browser that came back from the background has them), or a 502 while `down` */
  const start = (manual = true) => {
    const node = syntheticNode({ tip: 12, opsAt: [5], finalAt: 5 });
    let mode: 'answers' | 'lost' | 'down' = 'answers';
    let tips = 0;
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (mode === 'lost') throw new TypeError('Load failed');
      if (mode === 'down') return new Response('Bad Gateway', { status: 502 });
      if (String(init?.body).includes('"latest"')) tips++;
      return node.fetch(url, init);
    }) as typeof fetch;
    class Quiet {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      send() {}
      close() {}
    }
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: fetchFn, manual, window: 20, now: () => 1_800_000_000_000, WebSocket: Quiet as never });
    return { chain, set: (m: typeof mode) => (mode = m), tips: () => tips };
  };

  it('says the node is disconnected only once the next sync gets none either, and at once where the node answers with an error', async () => {
    const { chain, set } = start();
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    const lastSync = chain.conn.lastSync;
    // One sync's reads lost: nothing is said, and the next one answers
    set('lost');
    await chain.sync();
    expect(chain.conn).toMatchObject({ state: 'live', lastSync });
    set('answers');
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    // Two in a row: the node is disconnected, its last answer as before
    set('lost');
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    await chain.sync();
    expect(chain.conn).toMatchObject({ state: 'error', lastSync });
    expect(chain.conn.error).toBeInstanceOf(RpcTransportError);
    expect(noAnswer(chain.conn.error)).toBe(true);
    set('answers');
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    // A proxy's 502 while the node restarts is an answer: said at once
    set('down');
    await chain.sync();
    expect(chain.conn.state).toBe('error');
    expect(noAnswer(chain.conn.error)).toBe(false);
  });

  it('keeps a first load connecting until the second sync gets none either', async () => {
    const { chain, set } = start();
    const seen: string[] = [];
    chain.subscribe(() => seen.push(chain.conn.state));
    set('lost');
    await chain.sync();
    expect(chain.conn.state).toBe('connecting');
    expect(chain.ready).toBe(false);
    // nothing new to draw meanwhile
    expect(seen).toEqual([]);
    await chain.sync();
    expect(chain.conn.state).toBe('error');
    expect(seen).toEqual(['error']);
    set('answers');
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    expect(chain.ready).toBe(true);
  });

  it('is tried again a second after it got none, not at the next poll', async () => {
    const { chain, set, tips } = start(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      chain.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(chain.conn.state).toBe('live');
      // the poll at 2.5 s gets no answer
      set('lost');
      await vi.advanceTimersByTimeAsync(2_400);
      expect(chain.conn.state).toBe('live');
      set('answers');
      const asked = tips();
      await vi.advanceTimersByTimeAsync(990);
      expect(tips()).toBe(asked);
      await vi.advanceTimersByTimeAsync(20);
      expect(tips()).toBe(asked + 1);
      expect(chain.conn.state).toBe('live');
    } finally {
      chain.stop();
      vi.useRealTimers();
    }
  });

  it('is told from an answer: a request that failed, not a status, an error from the node or a result of another shape', () => {
    expect(noAnswer(new RpcTransportError('ksana_getBlock: request failed: Load failed'))).toBe(true);
    expect(noAnswer(new RpcTransportError('ksana_getBlock: request failed: The network connection was lost.'))).toBe(true);
    // A read that waited out its 15 s has waited enough: the SDK aborts it, which browsers word as they do
    expect(noAnswer(new RpcTransportError('ksana_getBlock: request failed: signal is aborted without reason'))).toBe(false);
    expect(noAnswer(new RpcTransportError('ksana_getBlock: request failed: The operation was aborted.'))).toBe(false);
    expect(noAnswer(new RpcTransportError('ksana_getBlock: HTTP 502', 502))).toBe(false);
    expect(noAnswer(new RpcTransportError('malformed result: block missing hash'))).toBe(false);
    expect(noAnswer(new RpcError(-32603, 'ksana_getBlock: storage error'))).toBe(false);
    expect(noAnswer(new TypeError('Load failed'))).toBe(false);
  });
});

describe('A page out of view', () => {
  it('leaves the node alone, its polls and block notifications alike, and reads it as soon as it is in view again', async () => {
    const node = syntheticNode({ tip: 12, opsAt: [5], finalAt: 5 });
    let tips = 0;
    let away = false;
    let shown: (() => void) | undefined;
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(init?.body).includes('"latest"')) tips++;
      return node.fetch(url, init);
    }) as typeof fetch;
    class Quiet {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      send() {}
      close() {}
    }
    const chain = new RpcChain(
      { url: 'http://node.test', chain: 'devnet' },
      {
        fetch: fetchFn,
        window: 20,
        now: () => 1_800_000_000_000,
        WebSocket: Quiet as never,
        hidden: () => away,
        shown: (fn) => {
          shown = fn;
          return () => (shown = undefined);
        },
      },
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      chain.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(chain.conn.state).toBe('live');
      const before = tips;
      // Another tab in front for 10 s, four polls' time, and a block notified meanwhile
      away = true;
      await vi.advanceTimersByTimeAsync(10_000);
      chain.notifyBlock();
      await vi.advanceTimersByTimeAsync(100);
      expect(tips).toBe(before);
      // Back in view: read at once, the next poll a whole interval later
      away = false;
      shown?.();
      await vi.advanceTimersByTimeAsync(100);
      expect(tips).toBe(before + 1);
      await vi.advanceTimersByTimeAsync(2_300);
      expect(tips).toBe(before + 1);
      await vi.advanceTimersByTimeAsync(200);
      expect(tips).toBe(before + 2);
      // In view again after a moment out of it with no poll left: nothing more
      shown?.();
      await vi.advanceTimersByTimeAsync(100);
      expect(tips).toBe(before + 2);
    } finally {
      chain.stop();
      vi.useRealTimers();
    }
    expect(shown).toBeUndefined();
  });
});

describe('A page held in the background', () => {
  it('reads the node on coming into view where its last read is a poll old, though no poll came meanwhile', async () => {
    const node = syntheticNode({ tip: 12, opsAt: [5], finalAt: 5 });
    let tips = 0;
    let clock = 1_800_000_000_000;
    let shown: (() => void) | undefined;
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(init?.body).includes('"latest"')) tips++;
      return node.fetch(url, init);
    }) as typeof fetch;
    class Quiet {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      send() {}
      close() {}
    }
    const chain = new RpcChain(
      { url: 'http://node.test', chain: 'devnet' },
      {
        fetch: fetchFn,
        window: 20,
        now: () => clock,
        WebSocket: Quiet as never,
        hidden: () => false,
        shown: (fn) => {
          shown = fn;
          return () => (shown = undefined);
        },
      },
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      chain.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(chain.conn.state).toBe('live');
      const before = tips;
      // A phone's browser in the background for a minute holds the page's timers: no poll comes, none is left to be read
      clock += 60_000;
      shown?.();
      await vi.advanceTimersByTimeAsync(100);
      expect(tips).toBe(before + 1);
      // Out of view and back within a poll of that read: nothing more
      clock += 1_000;
      shown?.();
      await vi.advanceTimersByTimeAsync(100);
      expect(tips).toBe(before + 1);
    } finally {
      chain.stop();
      vi.useRealTimers();
    }
  });
});

describe('A network that started over from another genesis block', () => {
  const at = (o: Parameters<typeof syntheticNode>[0]) => {
    const node = syntheticNode(o);
    const server = batchServer(node.fetch);
    let told = 0;
    const chain = new RpcChain(
      { url: 'http://node.test', chain: 'devnet' },
      { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000, startedOver: () => told++ },
    );
    return { node, server, chain, told: () => told };
  };

  it('is found where the tip is lower than the page held, more than a window on, or switched all the way down, and the chain stops', async () => {
    // A node restarted from genesis, back with a short chain; a page out of view while the new chain passed the old tip by more than
    // a window; or by less, where the walk along the parents meets the old chain
    for (const tip of [30, 700, 410]) {
      const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [390], finalAt: 380 };
      const { node, server, chain, told } = at(o);
      await chain.sync();
      const genesis = node.hash(0);
      o.era = () => 1;
      o.tip = tip;
      o.finalAt = tip - 20;
      await chain.sync();
      expect(told()).toBe(1);
      // The page drops the chain it read, its genesis block among it; nothing is read after
      expect(chain.blocks[0]?.hash).toBe(genesis);
      const before = server.requests.length;
      await chain.sync();
      expect(server.requests.length).toBe(before);
      expect(told()).toBe(1);
    }
  });

  it('is not a tip lower than the page held on the same network, or a switch below the tip, each reading the genesis block once', async () => {
    const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [390], finalAt: 380 };
    const { node, chain, told } = at(o);
    await chain.sync();
    // The chain switches to a branch from 397 on, two blocks shorter, then to one from 395 on, two blocks on
    for (const [from, tip] of [
      [397, 398],
      [395, 402],
    ] as const) {
      const was = node.asked.get('0') ?? 0;
      o.era = (h) => (h >= from ? from : 0);
      o.tip = tip;
      await chain.sync();
      expect(told()).toBe(0);
      expect(node.asked.get('0')).toBe(was + 1);
      expect(chain.blocks.length).toBe(tip + 1);
      for (let h = 0; h <= tip; h++) if (h === 0 || h > 380) expect(chain.blocks[h]?.hash).toBe(node.hash(h));
    }
  });

  it('is found on a page that held only the genesis block, as a network before its first block does', async () => {
    const o: Parameters<typeof syntheticNode>[0] = { tip: 0, opsAt: [], finalAt: 0 };
    const { node, server, chain, told } = at(o);
    await chain.sync();
    expect(chain.blocks.length).toBe(1);
    const genesis = node.hash(0);
    o.era = () => 1;
    o.tip = 30;
    o.finalAt = 10;
    await chain.sync();
    expect(told()).toBe(1);
    expect(chain.blocks[0]?.hash).toBe(genesis);
    expect(chain.blocks.length).toBe(1);
    const before = server.requests.length;
    await chain.sync();
    expect(server.requests.length).toBe(before);
  });

  it('is found on a page that held a chain a block high, block 1 naming another genesis block', async () => {
    const o: Parameters<typeof syntheticNode>[0] = { tip: 1, opsAt: [], finalAt: 0 };
    const { chain, told } = at(o);
    await chain.sync();
    expect(chain.blocks.length).toBe(2);
    // The network started over, and is a block high again when the page next reads it
    o.era = () => 1;
    await chain.sync();
    expect(told()).toBe(1);
  });

  it('stops the chain from starting anything more, the lookups that failed while the node was down included', async () => {
    const o: Parameters<typeof syntheticNode>[0] = { tip: 400, opsAt: [390], finalAt: 380 };
    const node = syntheticNode(o);
    let down = false;
    let calls = 0;
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      return down ? new Response('Bad Gateway', { status: 502 }) : node.fetch(url, init);
    }) as typeof fetch;
    // The reads made by the time the page is told
    let atStop = -1;
    const chain = new RpcChain(
      { url: 'http://node.test', chain: 'devnet' },
      { fetch: fetchFn, manual: true, window: 20, now: () => 1_800_000_000_000, startedOver: () => (atStop = calls) },
    );
    await chain.sync();
    // The node restarts: the page says it is disconnected, and a block's page opened meanwhile could not be read
    down = true;
    await chain.sync();
    expect(chain.conn.state).toBe('error');
    await settle(chain, [['block', '350']]);
    expect(chain.lookup('block', '350')?.state).toBe('error');
    // It comes back on a network that started over: the next sync finds it
    down = false;
    o.era = () => 1;
    o.tip = 30;
    o.finalAt = 10;
    await chain.sync();
    expect(atStop).toBeGreaterThan(0);
    // The chain stopped starts nothing: neither the lookup that failed again, as the node answers, nor a page's lookup, nor a sync
    chain.request('block', '351');
    await chain.sync();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(atStop);
    expect(chain.lookup('block', '350')?.state).toBe('error');
    expect(chain.lookup('block', '351')).toBeUndefined();
  });
});

describe('The socket of block notifications', () => {
  /** A node, the sockets the page opens to it for block notifications, and whether the page is out of view */
  const start = () => {
    const node = syntheticNode({ tip: 12, opsAt: [5], finalAt: 5 });
    const sockets: Socket[] = [];
    let away = false;
    let clock = 1_800_000_000_000;
    let shown: (() => void) | undefined;
    class Socket {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onclose: ((event: unknown) => void) | null = null;
      closed = false;
      constructor() {
        sockets.push(this);
      }
      send() {}
      close() {
        this.closed = true;
      }
    }
    const chain = new RpcChain(
      { url: 'http://node.test', chain: 'devnet' },
      {
        fetch: ((url: RequestInfo | URL, init?: RequestInit) => node.fetch(url, init)) as typeof fetch,
        window: 20,
        WebSocket: Socket as never,
        now: () => clock,
        hidden: () => away,
        shown: (fn) => {
          shown = fn;
          return () => (shown = undefined);
        },
      },
    );
    /** The server ends the page's latest socket, as the signet's does after five minutes without a block */
    const end = () => sockets.at(-1)?.onclose?.({ code: 1006 });
    return { chain, sockets, end, later: (ms: number) => (clock += ms), away: (v: boolean) => (away = v), show: () => shown?.() };
  };

  it('is opened again a second after it ends, the page saying meanwhile that it polls', async () => {
    const { chain, sockets, end } = start();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      chain.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(sockets).toHaveLength(1);
      chain.notifyBlock();
      expect(chain.conn.ws).toBe(true);
      end();
      expect(chain.conn.ws).toBe(false);
      await vi.advanceTimersByTimeAsync(999);
      expect(sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(2);
      // The first socket's end said again is no news
      sockets[0]?.onclose?.({ code: 1006 });
      await vi.advanceTimersByTimeAsync(70_000);
      expect(sockets).toHaveLength(2);
      chain.notifyBlock();
      expect(chain.conn.ws).toBe(true);
    } finally {
      chain.stop();
      vi.useRealTimers();
    }
  });

  it('waits twice as long each time one ends as it is opened, up to a minute, and a second again after a notification', async () => {
    const { chain, sockets, end } = start();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      chain.start();
      await vi.advanceTimersByTimeAsync(100);
      for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]) {
        const opened = sockets.length;
        end();
        await vi.advanceTimersByTimeAsync(wait - 1);
        expect(sockets).toHaveLength(opened);
        await vi.advanceTimersByTimeAsync(1);
        expect(sockets).toHaveLength(opened + 1);
      }
      chain.notifyBlock();
      end();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sockets).toHaveLength(10);
    } finally {
      chain.stop();
      vi.useRealTimers();
    }
  });

  it('is opened again a second after one that lasted, however long the waits before it', async () => {
    const { chain, sockets, end, later } = start();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      chain.start();
      await vi.advanceTimersByTimeAsync(100);
      // Three that end as they are opened (the node cannot be reached a while)
      for (const wait of [1_000, 2_000, 4_000]) {
        end();
        await vi.advanceTimersByTimeAsync(wait);
      }
      expect(sockets).toHaveLength(4);
      // The fourth lasts until the server ends it, five minutes without a block
      later(300_000);
      end();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sockets).toHaveLength(5);
    } finally {
      chain.stop();
      vi.useRealTimers();
    }
  });

  it('is opened again as the page comes back into view where it ended out of view', async () => {
    const { chain, sockets, end, away, show } = start();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      chain.start();
      await vi.advanceTimersByTimeAsync(100);
      // A phone's browser in the background loses its connections
      away(true);
      end();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sockets).toHaveLength(1);
      away(false);
      show();
      expect(sockets).toHaveLength(2);
    } finally {
      chain.stop();
      vi.useRealTimers();
    }
  });

  it('is left closed where the page closed it', async () => {
    const { chain, sockets, end } = start();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      chain.start();
      await vi.advanceTimersByTimeAsync(100);
      chain.stop();
      expect(sockets[0]?.closed).toBe(true);
      end();
      await vi.advanceTimersByTimeAsync(70_000);
      expect(sockets).toHaveLength(1);
    } finally {
      chain.stop();
      vi.useRealTimers();
    }
  });
});

describe("A page's lookup whose read gets no answer", () => {
  /** Block #3 is below the 20 blocks the first load reads, so its page looks it up */
  const start = () => {
    const node = syntheticNode({ tip: 40, opsAt: [3], finalAt: 3 });
    let mode: 'answers' | 'lost' | 'down' = 'answers';
    // How many more reads of the tip get an answer
    let tips = Number.POSITIVE_INFINITY;
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(init?.body).includes('"latest"') && tips-- <= 0) throw new TypeError('Load failed');
      if (mode === 'lost') throw new TypeError('Load failed');
      if (mode === 'down') return new Response('Bad Gateway', { status: 502 });
      return node.fetch(url, init);
    }) as typeof fetch;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: fetchFn, manual: true, window: 20, now: () => 1_800_000_000_000 });
    return { chain, set: (m: typeof mode) => (mode = m), tipsAnswered: (n: number) => (tips = n) };
  };
  /** Until `done`, a few milliseconds at a time */
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 200 && !done(); i++) await new Promise((r) => setTimeout(r, 5));
  };

  it('is tried again a second later, the page still loading, and the page draws once that one answers', async () => {
    const { chain, set } = start();
    await chain.sync();
    expect(chain.getBlock('3')).toBeUndefined();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      set('lost');
      chain.request('block', '3');
      await vi.advanceTimersByTimeAsync(990);
      expect(chain.lookup('block', '3')?.state).toBe('loading');
      set('answers');
      await vi.advanceTimersByTimeAsync(20);
    } finally {
      vi.useRealTimers();
    }
    await until(() => chain.lookup('block', '3') === undefined);
    expect(chain.getBlock('3')?.header.height).toBe(3);
  });

  it('says it could not load once that one gets none either, and at once where the node answers with an error', async () => {
    const { chain, set } = start();
    await chain.sync();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      set('lost');
      chain.request('block', '3');
      await vi.advanceTimersByTimeAsync(1_010);
      const failed = chain.lookup('block', '3');
      expect(failed?.state).toBe('error');
      expect(failed?.state === 'error' && noAnswer(failed.error)).toBe(true);
      // a proxy's 502 is an answer
      set('down');
      chain.request('block', '4');
      await vi.advanceTimersByTimeAsync(10);
      const down = chain.lookup('block', '4');
      expect(down?.state).toBe('error');
      expect(down?.state === 'error' && down.error instanceof RpcTransportError && down.error.status).toBe(502);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is read again once the node answers after the page said it was disconnected', async () => {
    const { chain, set } = start();
    await chain.sync();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      set('lost');
      chain.request('block', '3');
      await vi.advanceTimersByTimeAsync(1_010);
      expect(chain.lookup('block', '3')?.state).toBe('error');
    } finally {
      vi.useRealTimers();
    }
    await chain.sync();
    await chain.sync();
    expect(chain.conn.state).toBe('error');
    set('answers');
    await chain.sync();
    expect(chain.conn.state).toBe('live');
    expect(chain.lookup('block', '3')?.state).toBe('loading');
    await until(() => chain.lookup('block', '3') === undefined);
    expect(chain.getBlock('3')?.header.height).toBe(3);
  });

  it('is read again as soon as the node answers, even where the round that follows that answer gets none', async () => {
    const { chain, set, tipsAnswered } = start();
    await chain.sync();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      set('lost');
      chain.request('block', '3');
      await vi.advanceTimersByTimeAsync(1_010);
      expect(chain.lookup('block', '3')?.state).toBe('error');
    } finally {
      vi.useRealTimers();
    }
    await chain.sync();
    await chain.sync();
    expect(chain.conn.state).toBe('error');
    set('answers');
    // The sync's round answers; a block notification meanwhile has another round follow at once, whose read of the tip gets none
    tipsAnswered(1);
    const sync = chain.sync();
    void chain.sync();
    await sync;
    expect(chain.conn.state).toBe('live');
    await until(() => chain.lookup('block', '3') === undefined);
    expect(chain.getBlock('3')?.header.height).toBe(3);
  });
});

describe("What a read came upon shows with its assets' names and decimals, not the placeholder's base units", () => {
  const GOLD = 'ee'.repeat(32);
  /** The operation at `at` moves 10.0000 GOLD, the others KSA; #250 is below the first load's window */
  const options = (at: number) => ({
    tip: 300,
    opsAt: [250, 285, 295],
    finalAt: 290,
    lists: true,
    action: (h: number) => (h === at ? { AssetTransfer: { asset: GOLD, to: '22'.repeat(32), amount: '100000' } } : undefined),
    assets: [{ id: GOLD, name: 'Gold', decimals: 4 }],
  });
  /**
   * A page on a node that holds its answers about assets until `open` (`held` counts the calls it holds); `sightings` says, each time
   * the page draws again once open with block `at` in, whether GOLD was named by then
   */
  const start = (o: Parameters<typeof syntheticNode>[0], at: number) => {
    const node = syntheticNode(o);
    let open = () => {};
    const gate = new Promise<void>((r) => (open = r));
    let held = 0;
    const fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if ((JSON.parse(String(init?.body)) as { method: string }).method === 'ksana_getAsset') {
        held += 1;
        await gate;
      }
      return node.fetch(url, init);
    }) as typeof globalThis.fetch;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    const sightings: boolean[] = [];
    chain.subscribe(() => {
      if (chain.ready && chain.blocks[at]) sightings.push(chain.assets.get(GOLD)?.decimals === 4);
    });
    return { node, chain, sightings, held: () => held, open: () => open() };
  };
  /** A few milliseconds, or less once `done` */
  const meanwhile = async (done: () => boolean) => {
    for (let i = 0; i < 50 && !done(); i++) await new Promise((r) => setTimeout(r, 1));
  };

  it('the page opens once its first sync has named the assets it read', async () => {
    const { chain, sightings, held, open } = start(options(295), 295);
    let done = false;
    const sync = chain.sync().then(() => (done = true));
    await meanwhile(() => done);
    expect(held()).toBe(1);
    expect(done).toBe(false);
    expect(chain.ready).toBe(false);
    open();
    await sync;
    expect(chain.ready).toBe(true);
    expect(chain.assets.get(GOLD)).toMatchObject({ name: 'Gold', decimals: 4 });
    expect(sightings.length).toBeGreaterThan(0);
    expect(sightings.every(Boolean)).toBe(true);
  });

  it('a block opened from a link shows once the assets its operations move are named', async () => {
    const { node, chain, sightings, held, open } = start(options(250), 250);
    await chain.sync();
    const id = node.hash(250);
    expect(chain.getBlock(id)).toBeUndefined();
    chain.request('block', id);
    await meanwhile(() => chain.lookup('block', id)?.state !== 'loading');
    expect(held()).toBe(1);
    expect(chain.getBlock(id)).toBeDefined();
    expect(chain.lookup('block', id)?.state).toBe('loading');
    open();
    await settle(chain, [['block', id]]);
    expect(chain.lookup('block', id)).toBeUndefined();
    expect(sightings.length).toBeGreaterThan(0);
    expect(sightings.every(Boolean)).toBe(true);
  });

  it('an operation opened from a link likewise', async () => {
    const wide = syntheticNode(options(250));
    const seen = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: wide.fetch, manual: true, window: 60, now: () => 1_800_000_000_000 });
    await seen.sync();
    const op = opIdsOf(seen.getBlock(wide.hash(250)) as Block)[0] as string;
    const { chain, sightings, held, open } = start({ ...options(250), opAt: (id: string) => (id === op ? 250 : undefined) }, 250);
    await chain.sync();
    chain.request('op', op);
    await meanwhile(() => chain.lookup('op', op)?.state !== 'loading');
    expect(held()).toBe(1);
    expect(chain.getOp(op)?.height).toBe(250);
    expect(chain.lookup('op', op)?.state).toBe('loading');
    open();
    await settle(chain, [['op', op]]);
    expect(chain.lookup('op', op)).toBeUndefined();
    expect(sightings.length).toBeGreaterThan(0);
    expect(sightings.every(Boolean)).toBe(true);
  });

  it("a listing's page likewise", async () => {
    const { node, chain, sightings, held, open } = start(options(250), 250);
    await chain.sync();
    chain.wantHistory('latest');
    await meanwhile(() => !chain.history('latest').loading);
    expect(held()).toBe(1);
    expect(chain.getBlock(node.hash(250))).toBeDefined();
    expect(chain.history('latest').loading).toBe(true);
    open();
    await idle(chain, 'latest');
    expect(listing(chain, 'latest').listed).toBe(3);
    expect(sightings.length).toBeGreaterThan(0);
    expect(sightings.every(Boolean)).toBe(true);
  });

  it("an account page opened from a link asks for the assets the account holds with the first load's statuses, not a round trip after them", async () => {
    // ALICE holds GOLD, which only #250 moves, below the window
    const node = syntheticNode(options(250));
    const server = batchServer(node.fetch);
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
    chain.listAhead({ key: node.ALICE, rows: 50 });
    await chain.sync();
    expect(chain.assets.get(GOLD)).toMatchObject({ name: 'Gold', decimals: 4 });
    // the network, then the tip with its window, the account and its listing, then the statuses with the listing's blocks and GOLD
    expect(server.methods).toHaveLength(3);
    expect(server.methods[2]).toEqual(expect.arrayContaining(['ksana_getSettlement', 'ksana_getBlock', 'ksana_getAsset']));
  });

  /** How GOLD's amounts show each time the page draws: named, being read, or in base units under its ID */
  const shownAs = (chain: RpcChain) => {
    const a = chain.assets.get(GOLD);
    return !a ? 'unmet' : a.pending ? 'reading' : a.decimals === 4 ? 'named' : 'base units';
  };

  it('until the node answers for an asset, its amounts show as being read; one the node cannot name, in base units under its ID', async () => {
    const { chain, held, open } = start(options(295), 295);
    const shown: string[] = [];
    chain.subscribe(() => shown.push(shownAs(chain)));
    const sync = chain.sync();
    await meanwhile(() => held() > 0);
    expect(chain.assets.get(GOLD)).toMatchObject({ pending: true, decimals: 0 });
    open();
    await sync;
    expect(chain.assets.get(GOLD)).toMatchObject({ name: 'Gold', decimals: 4 });
    expect(chain.assets.get(GOLD)?.pending).toBeUndefined();
    expect(shown).not.toContain('base units');
    expect(shown.at(-1)).toBe('named');

    // A node that does not know the asset: read, then in base units, drawn again once the answer is in
    const unknown = syntheticNode({ ...options(295), assets: [] });
    const other = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: unknown.fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    const after: string[] = [];
    other.subscribe(() => after.push(shownAs(other)));
    await other.sync();
    await meanwhile(() => after.at(-1) === 'base units');
    expect(other.assets.get(GOLD)).toMatchObject({ decimals: 0 });
    expect(other.assets.get(GOLD)?.pending).toBeUndefined();
    expect(after.at(-1)).toBe('base units');
    expect(after.slice(0, after.indexOf('base units'))).not.toContain('named');
  });

  it("the funds a call attaches are named as a transfer's amount is, not shown in base units under the asset's ID (D-073)", async () => {
    const call = { Call: { contract: 'cc'.repeat(32), method: 'swap', args: '', funds: [{ asset: GOLD, amount: '100000' }] } };
    const node = syntheticNode({ ...options(295), action: (h: number) => (h === 295 ? call : undefined) });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    await chain.sync();
    expect(chain.blocks[295]?.entries).toHaveLength(1);
    expect(chain.assets.get(GOLD)).toMatchObject({ name: 'Gold', decimals: 4 });
  });

  it('an asset the node did not answer for stays being read, never in base units, and is asked again with a sync 8 seconds later', async () => {
    const node = syntheticNode(options(295));
    let asked = 0;
    const fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if ((JSON.parse(String(init?.body)) as { method: string }).method === 'ksana_getAsset' && ++asked === 1) return new Response('busy', { status: 503 });
      return node.fetch(url, init);
    }) as typeof globalThis.fetch;
    let clock = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch, manual: true, window: 20, now: () => clock });
    const shown: string[] = [];
    chain.subscribe(() => shown.push(shownAs(chain)));
    await chain.sync();
    expect(asked).toBe(1);
    expect(shownAs(chain)).toBe('reading');
    clock += 7_000;
    await chain.sync();
    expect(asked).toBe(1);
    expect(shownAs(chain)).toBe('reading');
    clock += 1_000;
    await chain.sync();
    expect(asked).toBe(2);
    expect(shownAs(chain)).toBe('named');
    expect(shown).not.toContain('base units');
  });

  it('an account page opened from a link draws once every asset the account holds is named, the answers coming one at a time', async () => {
    // ALICE holds GOLD and SILVER, which the page has not met; the node answers for SILVER first, then for GOLD
    const SILVER = 'dd'.repeat(32);
    const node = syntheticNode({ ...options(250), assets: [{ id: GOLD, name: 'Gold', decimals: 4 }, { id: SILVER, name: 'Silver', decimals: 2 }] });
    const opens = new Map<string, () => void>();
    const gates = new Map([GOLD, SILVER].map((id) => [id, new Promise<void>((r) => opens.set(id, r))]));
    const fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (body.method === 'ksana_getAsset') await gates.get(String(body.params[0]));
      return node.fetch(url, init);
    }) as typeof globalThis.fetch;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    await chain.sync();
    // Each time the page draws again: held by its lookup, or drawn with each asset named or being read
    const shows = () => (lookupShown(chain.lookup('account', node.ALICE), !!chain.peekAccount(node.ALICE)) ? 'held' : [GOLD, SILVER].map((id) => (chain.assets.get(id)?.pending ? 'reading' : chain.assets.get(id)?.name)).join(' '));
    const drawn: string[] = [];
    chain.subscribe(() => drawn.push(shows()));
    chain.request('account', node.ALICE);
    await meanwhile(() => chain.assets.has(GOLD) && chain.assets.has(SILVER));
    expect(chain.peekAccount(node.ALICE)).toBeDefined();
    (opens.get(SILVER) as () => void)();
    await meanwhile(() => chain.assets.get(SILVER)?.name === 'Silver');
    // SILVER named and GOLD still out: the account is in the cache, and its page still waits
    expect(chain.assets.get(SILVER)?.pending).toBeUndefined();
    expect(shows()).toBe('held');
    (opens.get(GOLD) as () => void)();
    await settle(chain, [['account', node.ALICE]]);
    expect(shows()).toBe('Gold Silver');
    expect(drawn.filter((d) => d !== 'held')).toEqual(drawn.slice(drawn.indexOf('Gold Silver')));
    expect(drawn.at(-1)).toBe('Gold Silver');
  });

  it("a wallet connected once the page is open shows a token it holds as being read until it is named, never in base units", async () => {
    // ALICE holds GOLD, which only #250 moves, below the window: the page has not met it
    const { node, chain, held, open } = start(options(250), 250);
    await chain.sync();
    expect(chain.assets.has(GOLD)).toBe(false);
    const shown: string[] = [];
    chain.subscribe(() => {
      if (chain.peekAccount(node.ALICE)?.balances.has(GOLD)) shown.push(shownAs(chain));
    });
    chain.setWallet({ account: node.ALICE });
    await meanwhile(() => held() > 0);
    expect(chain.peekAccount(node.ALICE)?.balances.has(GOLD)).toBe(true);
    expect(shownAs(chain)).toBe('reading');
    open();
    await meanwhile(() => shownAs(chain) === 'named');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.filter((s) => s !== 'reading' && s !== 'named')).toEqual([]);
    expect(shown.at(-1)).toBe('named');
  });

  it("a sync waits for the asset reads it asked for, not for one a block page opened from a link asked for before it", async () => {
    const { node, chain, held, open } = start(options(250), 250);
    await chain.sync();
    const id = node.hash(250);
    chain.request('block', id);
    await meanwhile(() => held() > 0);
    expect(held()).toBe(1);
    // The next poll meets no asset it has not met: it ends with GOLD still out, while the block's page still waits for it
    let synced = false;
    void chain.sync().then(() => (synced = true));
    await meanwhile(() => synced);
    expect(synced).toBe(true);
    expect(chain.lookup('block', id)?.state).toBe('loading');
    open();
    await settle(chain, [['block', id]]);
    expect(chain.lookup('block', id)).toBeUndefined();
    expect(chain.assets.get(GOLD)).toMatchObject({ name: 'Gold', decimals: 4 });
  });

  it('a read waits two seconds at most for an answer about an asset, whose amounts then show as being read until it comes', async () => {
    const { chain, held, open } = start(options(295), 295);
    let synced = false;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      void chain.sync().then(() => (synced = true));
      await vi.advanceTimersByTimeAsync(1_990);
      expect(held()).toBe(1);
      expect(synced).toBe(false);
      await vi.advanceTimersByTimeAsync(20);
      expect(synced).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    expect(chain.ready).toBe(true);
    expect(chain.assets.get(GOLD)?.pending).toBe(true);
    open();
    await meanwhile(() => !chain.assets.get(GOLD)?.pending);
    expect(chain.assets.get(GOLD)).toMatchObject({ name: 'Gold', decimals: 4 });
  });
});

describe('The BTC-final height never goes above the BTC-final tip the node reports (D-114)', () => {
  it('a BTC-final status the node took back stops showing without a reload and is asked again; one it reports again shows at once', async () => {
    // Every block from the genesis block to the tip is loaded; the four with operations are BTC-final
    const o = { tip: 40, opsAt: [5, 10, 20, 30], finalAt: 30 };
    const node = syntheticNode(o);
    let clock = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 50, now: () => clock });
    const count = (method: string) => node.calls.get(method) ?? 0;
    /** A sync, and how many times it asked for the BTC-final tip and for statuses */
    const round = async () => {
      const [tip, statuses] = [count('ksana_getChainInfo'), count('ksana_getSettlement')];
      await chain.sync();
      return { tip: count('ksana_getChainInfo') - tip, statuses: count('ksana_getSettlement') - statuses };
    };
    await round();
    expect(chain.finalHeight).toBe(30);
    const b30 = chain.getBlock(node.hash(30)) as Block;
    expect(blockStage(chain, b30)).toBe('final');
    // While BTC stands still, neither a BTC-final status nor the tip is asked again
    expect(await round()).toEqual({ tip: 0, statuses: 0 });

    // A BTC reorg reaching the BTC block that decided #20 and #30, of BTC_FINALITY_CONFS blocks or more: the node takes them back
    // and reports #10. The page reads the tip once BTC moves, here when a minute has passed, and asks for those statuses again
    o.finalAt = 10;
    clock += 61_000;
    expect(await round()).toEqual({ tip: 1, statuses: 0 });
    expect(chain.finalHeight).toBe(10);
    expect(blockStage(chain, b30)).not.toBe('final');
    expect(await round()).toEqual({ tip: 0, statuses: 2 });
    expect(chain.finalHeight).toBe(10);

    // Reported again: shown in the round whose statuses give it, not held back until BTC moves
    o.finalAt = 30;
    expect(await round()).toEqual({ tip: 1, statuses: 2 });
    expect(chain.finalHeight).toBe(30);
    expect(blockStage(chain, b30)).toBe('final');
  });

  it('a node that restarted reports its decision\'s root until it decides again, with no BTC reorg: BTC-final goes back all the same, and the warning names no cause', async () => {
    const o = { tip: 40, opsAt: [5, 10, 20, 30], finalAt: 30 };
    const node = syntheticNode(o);
    let clock = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 50, now: () => clock });
    await chain.sync();
    const b30 = chain.getBlock(node.hash(30)) as Block;
    expect(blockStage(chain, b30)).toBe('final');
    // Restarted, its first BTC sync failed: until it decides, the node reports the root of its decision, here the genesis block
    o.finalAt = 0;
    clock += 61_000;
    await chain.sync();
    expect(chain.finalHeight).toBe(0);
    expect(blockStage(chain, b30)).toBe('on_btc');
    o.finalAt = 30;
    await chain.sync();
    expect(blockStage(chain, b30)).toBe('final');
    // The page cannot tell this from the BTC reorg of the test above, so the warning says what it saw, in every language: the node no
    // longer reports the op BTC-final. It names no count of BTC blocks, no Bitcoin in any language, and no reorg: in English and Spanish
    // by the word, elsewhere by the note of BTC-final in the same language, which names one ("undoing it takes a Bitcoin reorg of 6+
    // blocks", `finalDone`): the warning shares no run of its letters with it, two long in Chinese and Japanese, whose words run on
    // without spaces, three in Korean, whose words share syllables with the note's ("no longer" and "or more")
    const run: Record<string, number> = { 'zh-CN': 2, 'zh-TW': 2, ja: 2, ko: 3 };
    const letters = (s: string) => s.replace(/[\s\p{P}\p{N}]/gu, '');
    const was = currentLocale();
    try {
      for (const { code } of LOCALES) {
        await setLocale(code, false);
        const m = t().shell.toast;
        const note = letters(t().status.step.finalDone(PARAMS.BTC_FINALITY_CONFS) + t().status.stageHint.final);
        for (const text of [m.finalTakenBack, m.finalTakenBackBody]) {
          expect(text, code).not.toMatch(/reorg|reorganiz|\d/i);
          for (const { bitcoin } of COIN_NAMES) expect(text, code).not.toContain(bitcoin);
          const n = run[code] ?? 0;
          for (let i = 0; n && i + n <= letters(text).length; i++) expect(note, code).not.toContain(letters(text).slice(i, i + n));
        }
      }
    } finally {
      await setLocale(was, false);
    }
  });
});

describe("The cache keeps the blocks of this page's own operations when it drops the blocks far below the tip", () => {
  it('one included far below the tip stays included and BTC-final, not waiting to be sent again', async () => {
    // ALICE's operations every 7th block; this page sent the one at #162, her nonce 23 (a block hash the synthetic node gives in digits
    // only would read as a height)
    const ALICE = '11'.repeat(32);
    const sent = {
      version: 2,
      chain_id: PARAMS.CHAIN_ID,
      account: ALICE,
      nonce: '23',
      fee: { Token: { amount: '1' } },
      max_gas: '50000',
      action: { AssetTransfer: { asset: '00'.repeat(32), to: '22'.repeat(32), amount: '262' } },
      sig: { Bip340: '00'.repeat(64) },
    };
    const own = opIdOf(fromJson('VmOp', sent));
    const o = { tip: 300, opsAt: Array.from({ length: 700 }, (_, i) => 1 + i * 7), finalAt: 200, opAt: (id: string) => (id === own ? 162 : undefined) };
    const node = syntheticNode(o);
    let clock = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, backfillStep: 500, now: () => clock });
    await chain.sync();
    // The sync the submission starts reads its block
    chain.noteSubmitted(fromJson('VmOp', sent), own, clock);
    for (let i = 0; i < 500 && (chain as unknown as { syncing: boolean }).syncing; i++) await new Promise((done) => setTimeout(done, 1));
    const r = () => chain.getOp(own) as OpRecord;
    expect(r().blockHash).toBe(node.hash(162));
    // The chain grows to 3 900 blocks before BTC finality moves, so that the page reads 3 600 of them, then to 4 500, BTC-final up to
    // #4 400: past 4 000 blocks read, it drops those more than 2 000 below the tip
    for (const [tip, finalAt] of [
      [3_900, 250],
      [4_500, 4_400],
    ] as const) {
      o.tip = tip;
      o.finalAt = finalAt;
      clock += 11 * 60_000;
      for (let i = 0; i < 12; i++) await chain.sync();
    }
    expect(chain.getBlock(node.hash(500))).toBeUndefined();
    expect(chain.getBlock(node.hash(162))?.header.height).toBe(162);
    expect(opStatusOf(chain, r())).toBe('btc_final');
    expect(opProgress(chain, r(), clock).suggestNative).toBe(false);
  });
});

describe('The backfill covers the blocks not yet BTC-final down to 3 600 below the tip, which the six confirmations need (D-116)', () => {
  /** An operation every seventh block, BTC-final up to #200 (the last block with one at or below it is #197); syncs until the backfill stops */
  const fill = async (tip: number) => {
    const node = syntheticNode({ tip, opsAt: Array.from({ length: Math.floor(tip / 7) }, (_, i) => 1 + i * 7), finalAt: 200 });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, backfillStep: 500, now: () => 1_800_000_000_000 });
    for (let i = 0; i < 12; i++) await chain.sync();
    expect(chain.finalHeight).toBe(197);
    return chain;
  };

  it('3 000 blocks not yet final are all read (with a block every 5 seconds more than 1 500 are not final about a third of the time)', async () => {
    const chain = await fill(3200);
    expect(chain.loadedFrom).toBe(198);
    expect(chain.finalityLoaded).toBe(true);
  });

  it('their statuses are asked again a batch at a time where calls go out in batches, not six at a time (the review of D-116)', async () => {
    // An operation in every block, BTC-final up to #200: 1 000 statuses not yet final, which the synthetic node keeps waiting (`pending`),
    // so that every sync asks for them again, as the minute's refresh does on a busy chain
    const node = syntheticNode({ tip: 1200, opsAt: Array.from({ length: 1200 }, (_, i) => i + 1), finalAt: 200 });
    const server = batchServer(node.fetch);
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, backfillStep: 500, now: () => 1_800_000_000_000 });
    // the first sync reads the window and the first 500 blocks below it, the second the rest down to the BTC-final boundary
    await chain.sync();
    for (let i = 0; i < 8 && !chain.finalityLoaded; i++) await chain.sync();
    expect(chain.finalityLoaded).toBe(true);
    const from = server.methods.length;
    await chain.sync();
    const statuses = server.methods
      .slice(from)
      .map((m) => m.filter((x) => x === 'ksana_getSettlement').length)
      .filter((n) => n > 0);
    expect(statuses.reduce((a, b) => a + b, 0)).toBe(1000);
    // Sixteen requests of up to 64 statuses each; six at a time took 167
    expect(statuses.length).toBeLessThanOrEqual(16);
  });

  it('more than 3 600 are read down to 3 600 below the tip only: the cache does not reach the BTC-final boundary', async () => {
    const chain = await fill(4000);
    expect(chain.loadedFrom).toBe(400);
    expect(chain.finalityLoaded).toBe(false);
  });
});

describe('A contract page opened from a link finds its deployment, which the node lists under the signer only (D-111)', () => {
  const CODE = '0061736d01000000';
  const ALICE = '11'.repeat(32);
  const call = (contract: string) => ({ Call: { contract, method: 'ping', args: '', funds: [] } });
  const deploy = { Deploy: { code: CODE, init_args: '', funds: [] } };
  /** The page's first window holds heights 281 to 300 only */
  const start = async (opsAt: number[], action: (h: number) => unknown, ok?: (h: number) => boolean, more: Partial<Parameters<typeof syntheticNode>[0]> = {}) => {
    const node = syntheticNode({ tip: 300, opsAt, finalAt: 290, lists: true, action, ...(ok ? { ok } : {}), ...more });
    let clock = 1_800_000_000_000;
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => clock });
    await chain.sync();
    /** The contract page asks, and the search it started finishes */
    const want = async (id: string) => {
      chain.wantDeployment(id);
      const searches = (chain as unknown as { deploySearches: Map<string, { loading: boolean }> }).deploySearches;
      for (let i = 0; i < 500 && searches.get(id)?.loading; i++) await new Promise((r) => setTimeout(r, 1));
      expect(searches.get(id)?.loading).toBeFalsy();
    };
    return { chain, node, want, tick: (ms: number) => (clock += ms) };
  };

  it('from just below its earliest call, newest first, stopping at the deployment', async () => {
    // ALICE's ops, nonces 0 to 5: a transfer at 5, the deployment at 40, a transfer at 100, then the calls
    const contract = contractIdOf(fromHex(ALICE, 32), 1n, sha256(fromHex(CODE)));
    const { chain, node, want } = await start([5, 40, 100, 120, 250, 285], (h) => (h === 40 ? deploy : h >= 120 ? call(contract) : undefined));
    expect(chain.isContract(contract)).toBe(true);
    expect(chain.deployOf(contract)).toBeUndefined();
    await want(contract);
    expect(node.listed).toEqual([
      { method: 'ksana_getAccountOps', params: [contract, null, 500] },
      { method: 'ksana_getLatestOps', params: ['120:0:0', 20] },
    ]);
    expect(chain.deployOf(contract)?.height).toBe(40);
    expect(chain.deployOf(contract)?.op.action).toMatchObject({ kind: 'Deploy', contract });
    expect(node.asked.get(node.hash(40))).toBe(1);
    // found once: asking again keeps its block, and lists nothing
    await want(contract);
    expect(node.listed).toHaveLength(2);
  });

  it("a page that listed the contract's operations to their end has the search start below its earliest call without listing them again", async () => {
    const contract = contractIdOf(fromHex(ALICE, 32), 1n, sha256(fromHex(CODE)));
    const { chain, node, want } = await start([5, 40, 100, 120, 250, 285], (h) => (h === 40 ? deploy : h >= 120 ? call(contract) : undefined));
    chain.wantHistory(contract);
    await idle(chain, contract);
    await want(contract);
    expect(node.listed).toEqual([
      { method: 'ksana_getAccountOps', params: [contract, null, 60] },
      { method: 'ksana_getLatestOps', params: ['120:0:0', 20] },
    ]);
    expect(chain.deployOf(contract)?.height).toBe(40);
  });

  it('a node that takes batches is sent each page of the search and then its blocks at once, a round trip each', async () => {
    // transfers at 1 to 80, among them the deployment at 30 (ALICE's nonce 29), which only the third page of twenty reaches
    const opsAt = Array.from({ length: 80 }, (_, i) => i + 1);
    const contract = contractIdOf(fromHex(ALICE, 32), 29n, sha256(fromHex(CODE)));
    const node = syntheticNode({ tip: 300, opsAt, finalAt: 290, lists: true, action: (h) => (h === 30 ? deploy : undefined) });
    const server = batchServer(node.fetch);
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, now: () => 1_800_000_000_000 });
    await chain.sync();
    const before = server.methods.length;
    chain.wantDeployment(contract);
    const searches = (chain as unknown as { deploySearches: Map<string, { loading: boolean }> }).deploySearches;
    for (let i = 0; i < 500 && searches.get(contract)?.loading; i++) await new Promise((r) => setTimeout(r, 1));
    expect(chain.deployOf(contract)?.height).toBe(30);
    const requests = server.methods.slice(before);
    // the contract's listing, then three pages, each followed by its twenty blocks
    expect(requests.map((m) => [...new Set(m)].join())).toEqual([
      'ksana_getAccountOps',
      'ksana_getLatestOps',
      'ksana_getBlock',
      'ksana_getLatestOps',
      'ksana_getBlock',
      'ksana_getLatestOps',
      'ksana_getBlock',
    ]);
    expect(requests.filter((m) => m.includes('ksana_getBlock')).map((m) => m.length)).toEqual([20, 20, 20]);
  });

  it('the page says it is looking from its first frame until the search ends, whether it found the deployment or not', async () => {
    const contract = contractIdOf(fromHex(ALICE, 32), 1n, sha256(fromHex(CODE)));
    const pair = 'e726c09142ded75d6f6136c169357c9396ac0a631bed8aef6575cc2b5174bca5';
    const { chain, want } = await start([5, 200], (h) => (h === 200 ? deploy : undefined));
    // drawn before its first search starts, which the page's effect starts once it is drawn
    expect(chain.seekingDeployment(contract)).toBe(true);
    chain.wantDeployment(contract);
    expect(chain.seekingDeployment(contract)).toBe(true);
    await want(contract);
    expect(chain.deployOf(contract)?.height).toBe(200);
    expect(chain.seekingDeployment(contract)).toBe(false);
    // a contract another contract created has no deployment: looked for, then not
    expect(chain.seekingDeployment(pair)).toBe(true);
    await want(pair);
    expect(chain.deployOf(pair)).toBeUndefined();
    expect(chain.seekingDeployment(pair)).toBe(false);
  });

  it('a search asked again after it failed goes unsaid, so that the line does not come and go while the node fails', async () => {
    const contract = contractIdOf(fromHex(ALICE, 32), 1n, sha256(fromHex(CODE)));
    // the node fails the first two searches' listings
    const { chain, want, tick } = await start([5, 200], (h) => (h === 200 ? deploy : undefined), undefined, { failLists: 2 });
    const said = [chain.seekingDeployment(contract)];
    await want(contract);
    said.push(chain.seekingDeployment(contract));
    // asked again once RECHECK_MS has passed: under way, failed again, then found
    tick(8_000);
    chain.wantDeployment(contract);
    said.push(chain.seekingDeployment(contract));
    await want(contract);
    said.push(chain.seekingDeployment(contract));
    tick(8_000);
    await want(contract);
    expect(chain.deployOf(contract)?.height).toBe(200);
    said.push(chain.seekingDeployment(contract));
    expect(said).toEqual([true, false, false, false, false]);
  });

  it('a deployment known by its ID but not with its block says it is looking while it is asked for by its ID the first time', async () => {
    const contract = contractIdOf(fromHex(ALICE, 32), 1n, sha256(fromHex(CODE)));
    const { chain, node, want } = await start([5, 40, 120], (h) => (h === 40 ? deploy : h === 120 ? call(contract) : undefined), undefined, { opAt: () => 40 });
    await want(contract);
    const op = chain.deployOf(contract)?.id as string;
    const internals = chain as unknown as { ops: Map<string, unknown>; forget(hash: string): void };
    // Its block dropped, the operation kept without it (as where a parallel block skipped it); then both dropped, as pruning drops them
    const drops = [() => internals.forget(node.hash(40)), () => (internals.forget(node.hash(40)), internals.ops.delete(op))];
    for (const drop of drops) {
      drop();
      expect(chain.deployOf(contract)?.height).toBeUndefined();
      expect(chain.seekingDeployment(contract)).toBe(true);
      chain.wantDeployment(contract);
      expect(chain.lookup('op', op)?.state).toBe('loading');
      expect(chain.seekingDeployment(contract)).toBe(true);
      for (let i = 0; i < 500 && chain.lookup('op', op)?.state === 'loading'; i++) await new Promise((r) => setTimeout(r, 1));
      expect(chain.deployOf(contract)?.height).toBe(40);
      expect(chain.seekingDeployment(contract)).toBe(false);
      // the page draws again with it
      chain.wantDeployment(contract);
    }
    expect(node.calls.get('ksana_getOpStatus')).toBe(2);
  });

  it('below the newest for a contract nothing called yet', async () => {
    const contract = contractIdOf(fromHex(ALICE, 32), 1n, sha256(fromHex(CODE)));
    const { chain, node, want } = await start([5, 200], (h) => (h === 200 ? deploy : undefined));
    await want(contract);
    expect(node.listed.map((c) => c.params)).toEqual([
      [contract, null, 500],
      [null, 20],
    ]);
    expect(chain.deployOf(contract)?.height).toBe(200);
  });

  it('a contract another contract created has none: the search reads three pages and gives up for good', async () => {
    const pair = 'e726c09142ded75d6f6136c169357c9396ac0a631bed8aef6575cc2b5174bca5';
    const transfers = Array.from({ length: 80 }, (_, i) => i + 1);
    const { chain, node, want } = await start([...transfers, 250, 285], (h) => (h >= 250 ? call(pair) : undefined));
    await want(pair);
    expect(node.listed.map((c) => c.params)).toEqual([
      [pair, null, 500],
      ['250:0:0', 20],
      ['61:0:0', 20],
      ['41:0:0', 20],
    ]);
    expect(chain.deployOf(pair)).toBeUndefined();
    await want(pair);
    expect(node.listed).toHaveLength(4);
  });

  it('below the newest for a contract whose calls all failed, as calls to a contract can', async () => {
    // the deployment at 100, a call that traps at 285
    const contract = contractIdOf(fromHex(ALICE, 32), 1n, sha256(fromHex(CODE)));
    const { chain, node, want } = await start([5, 100, 285], (h) => (h === 100 ? deploy : h === 285 ? call(contract) : undefined), (h) => h !== 285);
    expect(chain.isContract(contract)).toBe(false);
    await want(contract);
    expect(node.listed.map((c) => c.params)).toEqual([
      [contract, null, 500],
      [null, 20],
    ]);
    expect(chain.deployOf(contract)?.height).toBe(100);
    expect(chain.isContract(contract)).toBe(true);
  });

  it('a deployment the cache dropped is asked for again by its ID, at most once in a while', async () => {
    const contract = contractIdOf(fromHex(ALICE, 32), 1n, sha256(fromHex(CODE)));
    const { chain, node, want, tick } = await start([5, 40, 120], (h) => (h === 40 ? deploy : h === 120 ? call(contract) : undefined));
    await want(contract);
    expect(chain.deployOf(contract)?.height).toBe(40);
    // dropped while no page showed it, as pruning drops a long-open page's old blocks, and the node fails to answer for it
    (chain as unknown as { ops: Map<string, unknown> }).ops.clear();
    for (let i = 0; i < 50; i++) {
      chain.wantDeployment(contract);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(node.calls.get('ksana_getOpStatus')).toBe(1);
    tick(8_000);
    chain.wantDeployment(contract);
    await new Promise((r) => setTimeout(r, 0));
    expect(node.calls.get('ksana_getOpStatus')).toBe(2);
    expect(node.listed).toHaveLength(2);
  });
});

/**
 * A node with a main chain 0..tip of empty blocks, 5 seconds apart, whose anchor rises by one BTC block every ten blocks (from
 * BTC height 100), on the network of `chainId`. At the heights of `bodies` a block holds one path B op, whose body its own
 * settlement put on BTC at the height given, or not yet (null), with BTC at `btcTip`
 */
function anchoredNode(o: { tip: number; chainId: number; producer?: (h: number) => string; bodies?: Record<number, number | null>; btcTip?: number }) {
  const hash = (h: number) => (h + 1).toString(16).padStart(64, '0');
  const ref = (h: number) => ({ height: String(h), hash: hash(h) });
  const op = (h: number) => ({
    version: 2,
    chain_id: o.chainId,
    account: '11'.repeat(32),
    nonce: String(h),
    fee: { Token: { amount: '1' } },
    max_gas: '50000',
    action: { AssetTransfer: { asset: '00'.repeat(32), to: '22'.repeat(32), amount: '100' } },
    sig: { Bip340: '00'.repeat(64) },
  });
  const body = (h: number) => o.bodies?.[h] !== undefined;
  const block = (h: number) => ({
    hash: hash(h),
    header: {
      version: 2,
      height: String(h),
      parents: h === 0 ? [] : [hash(h - 1)],
      btc_anchor: { height: 100 + Math.floor(h / 10), hash: 'ab'.repeat(32) },
      entries_root: '00'.repeat(32),
      state_root: '00'.repeat(32),
      producer: o.producer?.(h) ?? '33'.repeat(32),
      timestamp: String(1_790_000_000 + h * 5),
      bits: 520448707,
      nonce: '0',
    },
    entries: body(h) ? [{ Sponsored: { op: op(h) } }] : [],
    settlement: null,
    receipts: body(h) ? [{ op_id: null, success: true, error: null, gas_used: '10000', output: '', events: [] }] : [],
    accepted_height: String(h),
    merged: [],
  });
  const answer = (method: string, params: unknown[]): { result?: unknown; error?: { code: number; message: string } } => {
    const id = String(params[0] ?? '');
    // A hash is 64 hex digits, some all decimal (#280's ends in 119)
    const h = id === 'latest' ? o.tip : id.length === 64 ? Number.parseInt(id, 16) - 1 : Number(id);
    switch (method) {
      case 'ksana_getChainInfo':
        return { result: { chain_id: o.chainId, tip: ref(o.tip), daa_score: String(o.tip), protocol_version: 2, next_upgrade: null, max_known_version: 2, finalized: ref(0) } };
      case 'ksana_getBlock':
        return h >= 0 && h <= o.tip ? { result: block(h) } : { error: { code: -32004, message: 'unknown block' } };
      case 'ksana_getSettlement': {
        const at = o.bodies?.[h];
        if (at === undefined) return { error: { code: -32004, message: 'no settlement' } };
        // Settled once the bodies of the block and of every block below it are on BTC
        const settled = Object.entries(o.bodies ?? {}).every(([b, l]) => Number(b) > h || l !== null);
        const txid = carrierTxid(h);
        const shown = txid.match(/../g)?.reverse().join('') ?? '';
        const confirmed = at === null ? null : { txid, height: at, block: 'cd'.repeat(32), confirmations: (o.btcTip ?? at) - at + 1 };
        return {
          result: { block: ref(h), txid, txid_rpc: shown, commit_txid: null, commit_txid_rpc: null, txs: null, carrier_account: null, carrier: null, status: confirmed ? 'confirmed' : 'broadcast', confirmed, settled, btc_final: false },
        };
      }
      case 'ksana_estimateFee':
        return { result: { feerate_sat_vb: '2', path_b: { amount: '1', per_kib: '1' }, at: ref(o.tip) } };
      default:
        return { error: { code: -32004, message: `${method} not answered` } };
    }
  };
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, ...answer(body.method, body.params) }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch };
}

describe('Block weights, which the node does not give (D-084, D-090)', () => {
  const weights = async (tip: number, opsAt: number[]) => {
    const node = syntheticNode({ tip, opsAt, finalAt: 0 });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    await chain.sync();
    return { chain, at: (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => chain.getBlock(from + i)?.weight) };
  };

  it('an empty block weighs by the empty blocks in a row below it along the selected parents: 12, 24, 48, 96, then 120', async () => {
    const { at } = await weights(300, [290]);
    expect(at(290, 297)).toEqual([1, 12, 24, 48, 96, 120, 120, 120]);
  });

  it('the genesis block weighs 1 and counts as no empty block below the first ones', async () => {
    const { at } = await weights(5, []);
    expect(at(0, 5)).toEqual([1, 12, 24, 48, 96, 120]);
  });

  it('is unknown while an empty block below it that decides it is not loaded, and known once four empty ones in a row are', async () => {
    const { chain, at } = await weights(5000, [4990]);
    const from = chain.loadedFrom;
    expect(from).toBeGreaterThan(0);
    expect(from).toBeLessThan(4980);
    expect(at(from, from + 4)).toEqual([undefined, undefined, undefined, undefined, 120]);
    expect(at(4990, 4992)).toEqual([1, 12, 24]);
  });
});

describe('BTC block times, read from the fast-lane blocks around them', () => {
  const start = async (chain: 'devnet' | 'signet') => {
    const node = anchoredNode({ tip: 300, chainId: chain === 'signet' ? 1002 : PARAMS.CHAIN_ID });
    const rpc = new RpcChain({ url: 'http://node.test', chain }, { fetch: node.fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    await rpc.sync();
    return rpc;
  };
  const timeOf = (rpc: RpcChain, h: number) => rpc.getBlock(h)?.time;

  it('a BTC block was mined by the time the first block that saw it was produced (devnet: ANCHOR_DEPTH 0)', async () => {
    const rpc = await start('devnet');
    // ..., blocks 290..299 anchor 129, 300 anchors 130
    expect(rpc.getBtcBlock(129)?.time).toBe(timeOf(rpc, 290));
    expect(rpc.getBtcBlock(130)?.time).toBe(timeOf(rpc, 300));
    expect(rpc.btcTip.height).toBe(130);
    expect(rpc.btcTip.time).toBe(timeOf(rpc, 300));
  });

  it('a block anchored at a saw BTC up to a + ANCHOR_DEPTH (signet: 1), so the anchored block was there one BTC block earlier', async () => {
    const rpc = await start('signet');
    // block 290 anchors 129, so its producer saw BTC 130 when it was produced: BTC 130 is no younger than block 290
    expect(rpc.getBtcBlock(130)?.time).toBe(timeOf(rpc, 290));
  });

  it('no time is given for a BTC block older than every loaded block, rather than the time of the first one loaded', async () => {
    const rpc = await start('devnet');
    // The lowest loaded blocks anchor `first`, which blocks below them saw first: nothing loaded saw less but the genesis block, far away
    const first = 100 + Math.floor(rpc.loadedFrom / 10);
    expect(rpc.loadedFrom % 10).not.toBe(0);
    expect(rpc.getBtcBlock(first)).toBeDefined();
    expect(rpc.getBtcBlock(first)?.time).toBeUndefined();
    expect(rpc.getBtcBlock(100)?.time).toBeUndefined();
    // the next one was first seen by a loaded block, 5 seconds after the one before it
    expect(rpc.getBtcBlock(first + 1)?.time).toBe(timeOf(rpc, (first + 1 - 100) * 10));
  });

  it('every BTC height up to the tip is listed, those no loaded block anchors to with no known Ksana transaction', async () => {
    // Blocks 290..300 anchor 129 and 130; the Bitcoin RPC's tip is 133, read a minute after block 300 (at 1 790 001 500 s)
    const at = 1_790_001_560_000;
    const btc = withBitcoind(anchoredNode({ tip: 300, chainId: PARAMS.CHAIN_ID }), 'regtest', () => 133);
    const rpc = new RpcChain({ url: 'http://node.test', chain: 'devnet', btcUrl: 'http://btc.test' }, { fetch: btc.fetch, manual: true, window: 20, now: () => at });
    await rpc.sync();
    expect(rpc.btcTip.height).toBe(133);
    const listed = rpc.btcBlocks.map((b) => b.height);
    expect(listed.slice(listed.indexOf(128))).toEqual([128, 129, 130, 131, 132, 133]);
    for (const h of [131, 132, 133]) expect(rpc.getBtcBlock(h)).toEqual({ height: h, hash: '', txids: [], time: at });
    expect(rpc.btcTip.time).toBe(at);
  });

  it("the Bitcoin RPC's tip dates a BTC block no fast-lane block has seen yet, by when it was read", async () => {
    let clock = 1_790_001_560_000;
    let tip = 130;
    const btc = withBitcoind(anchoredNode({ tip: 300, chainId: PARAMS.CHAIN_ID }), 'regtest', () => tip);
    const rpc = new RpcChain({ url: 'http://node.test', chain: 'devnet', btcUrl: 'http://btc.test' }, { fetch: btc.fetch, manual: true, window: 20, now: () => clock });
    await rpc.sync();
    // Block 300 saw BTC 130 first (devnet: ANCHOR_DEPTH 0), before the reading
    expect(rpc.btcTip).toMatchObject({ height: 130, time: timeOf(rpc, 300) });
    tip = 131;
    clock += 30_000;
    await rpc.sync();
    expect(rpc.btcTip).toEqual({ height: 131, hash: '', txids: [], time: clock });
    expect(rpc.btcBlocks[rpc.btcBlocks.length - 1]).toBe(rpc.btcTip);
  });
});

describe("A BTC block's page below the blocks the page loaded", () => {
  // Block h anchors BTC 100 + floor(h / 10) (`anchoredNode`), and on signet (ANCHOR_DEPTH 1) a settlement in step lands two BTC blocks
  // above its block's anchor: BTC 117 takes #152's (anchored at 115) in step, #135's (113) two BTC blocks late and #121's (112) three
  // late, which the page does not look for; #160's lands in 118
  const shown = (h: number) => carrierTxid(h).match(/../g)?.reverse().join('') ?? '';
  const open = async (window: number, batch = true) => {
    const node = anchoredNode({ tip: 300, chainId: 1002, bodies: { 121: 117, 135: 117, 152: 117, 160: 118 }, btcTip: 131 });
    const server = batchServer(node.fetch);
    const rpc = new RpcChain({ url: 'http://node.test', chain: 'signet' }, { fetch: server.fetch, batch, manual: true, window, backfillStep: 0, now: () => 1_800_000_000_000 });
    await rpc.sync();
    return { rpc, server };
  };

  it('has the blocks whose settlements land in it read, in step or up to two BTC blocks late, and the ends of those anchored at it', async () => {
    for (const batch of [true, false]) {
      // The twenty blocks from #281 loaded, anchored at 128 to 130
      const { rpc, server } = await open(20, batch);
      expect(rpc.btcPageRead(117)).toBe(false);
      expect(rpc.getBtcBlock(117)?.txids).toEqual([]);
      expect(rpc.anchoredAt(117)).toBeUndefined();
      const before = server.requests.length;
      await settle(rpc, [['btc', '117']]);
      expect(rpc.btcPageRead(117)).toBe(true);
      expect(rpc.getBtcBlock(117)?.txids).toEqual([shown(135), shown(152)]);
      expect(rpc.getBtcBlock(118)?.txids).toEqual([shown(160)]);
      expect(rpc.anchoredAt(117)).toEqual([170, 179]);
      // Its hash from the first block anchored at it, its time from the first block that saw it, #160 (anchored at 116), and the one before
      expect(rpc.getBtcBlock(117)).toMatchObject({ hash: 'ab'.repeat(32), time: rpc.getBlock(160)?.time });
      // In batches, four rounds of the search below three hundred blocks, then the blocks and their settlements
      if (batch) expect(server.requests.length - before).toBeLessThanOrEqual(6);
    }
  });

  it('reads nothing where the loaded blocks reach below the anchors of the settlements landing in it, and gives its blocks from them', async () => {
    // Sixty blocks from #241, anchored at 124 and up: BTC 129 takes the settlements of blocks anchored at 125 to 127
    const { rpc } = await open(60);
    expect(rpc.btcPageRead(129)).toBe(true);
    expect(rpc.anchoredAt(129)).toEqual([290, 299]);
    expect(rpc.anchoredAt(130)).toEqual([300, 300]);
    expect(rpc.anchoredAt(131)).toBeUndefined();
    expect(rpc.btcPageRead(128)).toBe(false);
  });
});

describe('The times of older BTC blocks a page names', () => {
  // Five thousand blocks, block h anchored at BTC 100 + floor(h / 10) (`anchoredNode`), the twenty from #4,981 loaded: on signet
  // (ANCHOR_DEPTH 1) BTC 202, below the 288 BTC heights listed under the tip, was first seen by #1,010, anchored at 201, and took
  // #1,000's settlement
  const NOW = 1_800_000_000_000;
  const open = async () => {
    const node = anchoredNode({ tip: 5000, chainId: 1002, bodies: { 1000: 202 }, btcTip: 601 });
    const server = batchServer(node.fetch);
    const rpc = new RpcChain({ url: 'http://node.test', chain: 'signet' }, { fetch: server.fetch, batch: true, manual: true, window: 20, backfillStep: 0, now: () => NOW });
    await rpc.sync();
    return { rpc, server };
  };

  it('has the first block that saw each read with the one before, in one search, and gives them with their times, not listed', async () => {
    const { rpc, server } = await open();
    expect(rpc.getBtcBlock(202)).toBeUndefined();
    const before = server.requests.length;
    await rpc.askBtcTimes([202, 205]);
    expect(rpc.getBtcBlock(202)).toEqual({ height: 202, hash: '', txids: [], time: rpc.getBlock(1010)?.time });
    expect(rpc.getBtcBlock(205)?.time).toBe(rpc.getBlock(1040)?.time);
    expect(rpc.btcBlocks.some((b) => b.height === 202 || b.height === 205)).toBe(false);
    // A search of seven heights a round from five thousand blocks, then the blocks
    expect(server.requests.length - before).toBeLessThanOrEqual(7);
    // Dated, they are not read again, nor one the loaded blocks date (BTC 600, first seen by #4,990)
    const after = server.requests.length;
    expect(rpc.getBtcBlock(600)?.time).toBe(rpc.getBlock(4990)?.time);
    await rpc.askBtcTimes([202, 205, 600]);
    expect(server.requests.length).toBe(after);
  });

  it("gives an older block's steps on Bitcoin their times, which its progress asks for", async () => {
    const { rpc } = await open();
    await settle(rpc, [['block', '1000']]);
    const b = rpc.getBlock(1000) as Block;
    const ask = blockProgress(rpc, b, NOW).btcAsk ?? [];
    expect(ask).toContain(202);
    await rpc.askBtcTimes(ask);
    expect(blockProgress(rpc, b, NOW).steps.find((s) => s.key === 'on_btc')).toMatchObject({ state: 'done', at: rpc.getBlock(1010)?.time });
    expect(blockProgress(rpc, b, NOW).btcAsk).toBeUndefined();
  });
});

/** The hash `withBitcoind` gives the BTC block at `height` */
const btcBlockHash = (height: number) => (0xb7c0000 + height).toString(16).padStart(64, '0');

/**
 * `node` with a Bitcoin RPC at http://btc.test on BTC network `chain`, whose tip is `tip()`, with its hash (`btcBlockHash`) and the
 * time its block gives in seconds, `time(height)`, where that gives one; `asked` records the methods asked of it
 */
function withBitcoind(node: { fetch: typeof fetch }, chain: string, tip: () => number, time?: (height: number) => number | undefined) {
  const asked: string[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('http://btc.test')) return node.fetch(url, init);
    const body = JSON.parse(String(init?.body)) as { id: number; method: string };
    asked.push(body.method);
    const height = tip();
    const at = time?.(height);
    const result = body.method === 'getblockchaininfo' ? { chain, blocks: height, bestblockhash: btcBlockHash(height), ...(at !== undefined ? { time: at } : {}) } : null;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, asked };
}

describe("The settlement backlog, as the node's next block counts it (D-046)", () => {
  // Block h anchors BTC 100 + floor(h / 10): the tip, #300, anchors 130. With BTC at 131 the node's next block on signet anchors at
  // 130 (ANCHOR_DEPTH 1), and counts a body as landed only at or below it
  const backlog = async (bodies: Record<number, number | null>) => {
    const btc = withBitcoind(anchoredNode({ tip: 300, chainId: 1002, bodies, btcTip: 131 }), 'signet', () => 131);
    const rpc = new RpcChain({ url: 'http://node.test', chain: 'signet', btcUrl: 'http://btc.test' }, { fetch: btc.fetch, manual: true, window: 60, now: () => 1_800_000_000_000 });
    await rpc.sync();
    expect(rpc.currentBtcHeight()).toBe(131);
    const b = rpc.backlogStatus();
    return { oldest: b.oldest?.header.height, waited: b.waited, triggered: b.triggered, landed: b.landed };
  };

  it('counts the BTC blocks since the oldest body still off BTC was anchored from the next anchor, not from the BTC tip', async () => {
    // #250 anchors 125: five BTC blocks to the next anchor, one short of the limit of six, where the BTC tip would give six
    expect(await backlog({ 250: null, 280: 131 })).toEqual({ oldest: 250, waited: 5, triggered: false });
    // #245 anchors 124: six to the next anchor, so the next block may hold forced inclusions only
    expect(await backlog({ 245: null, 280: 131 })).toEqual({ oldest: 245, waited: 6, triggered: true });
  });

  it('a body that landed in the newest BTC block, above the next anchor, still counts; one at the anchor does not', async () => {
    // It is on Bitcoin all the same, and leaves the backlog at its second confirmation, when the anchor reaches it: the overview read
    // "Oldest not on Bitcoin: #1,890" under the status strip's "Settled #1,890"
    expect(await backlog({ 250: 131 })).toEqual({ oldest: 250, waited: 5, triggered: false, landed: { btcHeight: 131, confs: 2 } });
    expect(await backlog({ 250: 130 })).toEqual({ oldest: undefined, waited: 0, triggered: false });
    // One still off Bitcoin is not on it
    expect((await backlog({ 250: null, 280: 131 })).landed).toBeUndefined();
  });

  it('is none before the first block is in, as the page draws its frame while it connects', () => {
    const rpc = new RpcChain({ url: 'http://node.test', chain: 'signet' }, { fetch: anchoredNode({ tip: 300, chainId: 1002 }).fetch, manual: true });
    expect(rpc.backlogStatus()).toEqual({ waited: 0, limit: PARAMS.SETTLEMENT_TIMEOUT, triggered: false });
  });
});

describe('The BTC tip, read from the Bitcoin RPC sparingly and followed between readings', () => {
  it("a page in view asks the Bitcoin RPC for it at most once in 30 seconds, a hidden page not at all, and a top-up's chain check reads it", async () => {
    let clock = 1_800_000_000_000;
    let hidden = false;
    let tip = 140;
    const btc = withBitcoind(anchoredNode({ tip: 300, chainId: 1002 }), 'signet', () => tip);
    const rpc = new RpcChain({ url: 'http://node.test', chain: 'signet', btcUrl: 'http://btc.test' }, { fetch: btc.fetch, manual: true, window: 20, now: () => clock, hidden: () => hidden });
    await rpc.sync();
    expect(btc.asked).toEqual(['getblockchaininfo']);
    expect(rpc.currentBtcHeight()).toBe(140);
    // The data source polls every 2.5 seconds (before, each poll asked the Bitcoin RPC for its tip)
    for (let i = 0; i < 11; i++) {
      clock += 2_500;
      await rpc.sync();
    }
    expect(btc.asked).toEqual(['getblockchaininfo']);
    clock += 2_500;
    tip = 141;
    await rpc.sync();
    expect(btc.asked).toEqual(['getblockchaininfo', 'getblockchaininfo']);
    expect(rpc.currentBtcHeight()).toBe(141);
    hidden = true;
    clock += 10 * 60_000;
    await rpc.sync();
    expect(btc.asked).toHaveLength(2);
    // Before a top-up is signed the page asks for the Bitcoin RPC's chain, and takes the tip from that answer
    tip = 142;
    await rpc.checkBtcChain();
    expect(btc.asked.slice(2)).toEqual(['getblockchaininfo']);
    expect(rpc.currentBtcHeight()).toBe(142);
    hidden = false;
    clock += 2_500;
    await rpc.sync();
    expect(btc.asked).toHaveLength(3);
  });

  it('between readings the BTC height follows what the producers of new blocks saw', async () => {
    // Block h anchors BTC 100 + floor(h / 10); on signet a block anchored at a was produced once BTC a + 1 was there (ANCHOR_DEPTH 1)
    const node = { tip: 300, chainId: 1002 };
    let clock = 1_800_000_000_000;
    const btc = withBitcoind(anchoredNode(node), 'signet', () => 129);
    const rpc = new RpcChain({ url: 'http://node.test', chain: 'signet', btcUrl: 'http://btc.test' }, { fetch: btc.fetch, manual: true, window: 20, now: () => clock });
    await rpc.sync();
    expect([rpc.btcHeight, rpc.currentBtcHeight()]).toEqual([129, 131]);
    // Block 310 anchors BTC 131: BTC 132 is there, seen at the next poll without asking the Bitcoin RPC
    node.tip = 310;
    clock += 2_500;
    await rpc.sync();
    expect(btc.asked).toEqual(['getblockchaininfo']);
    expect(rpc.currentBtcHeight()).toBe(132);
    // Without a Bitcoin RPC the same
    const alone = new RpcChain({ url: 'http://node.test', chain: 'signet' }, { fetch: anchoredNode(node).fetch, manual: true, window: 20, now: () => clock });
    await alone.sync();
    expect([alone.btcHeight, alone.currentBtcHeight()]).toEqual([undefined, 132]);
  });
});

describe('BTC block times, which the node does not give', () => {
  // Block h is produced at 1 790 000 000 + 5h seconds and anchors BTC 100 + floor(h / 10); on signet (ANCHOR_DEPTH 1) its producer saw
  // BTC 101 + floor(h / 10), so #300 is the first to see BTC 131, at 1 790 001 500, and #299 the last to see BTC 130, 5 seconds before
  const memory = () => {
    const saved = new Map<string, unknown>();
    return { saved, load: (key: string) => saved.get(key) ?? null, save: (key: string, value: unknown) => void saved.set(key, JSON.parse(JSON.stringify(value)) as unknown) };
  };
  const open = async (store: ReturnType<typeof memory>, btc?: { tip: number; time?: (height: number) => number | undefined }) => {
    const node = anchoredNode({ tip: 300, chainId: 1002 });
    const bitcoind = btc && withBitcoind(node, 'signet', () => btc.tip, btc.time);
    const rpc = new RpcChain(
      { url: 'http://node.test', chain: 'signet', ...(bitcoind ? { btcUrl: 'http://btc.test' } : {}) },
      { fetch: bitcoind?.fetch ?? node.fetch, manual: true, window: 20, now: () => 1_790_001_510_000, btcTimes: store },
    );
    await rpc.sync();
    return rpc;
  };
  const timeOf = (rpc: RpcChain, height: number) => {
    const b = rpc.getBtcBlock(height);
    return { time: b?.time, exact: b?.timeExact === true };
  };

  it("a block read as the Bitcoin RPC's tip gives its own time; any other the blocks around it estimate", async () => {
    // BTC 131 was mined 40 seconds before #300 saw it
    const rpc = await open(memory(), { tip: 131, time: (h) => (h === 131 ? 1_790_001_460 : undefined) });
    expect(timeOf(rpc, 131)).toEqual({ time: 1_790_001_460_000, exact: true });
    expect(timeOf(rpc, 130)).toEqual({ time: 1_790_001_450_000, exact: false });
    // bitcoind before Core 23 gives no time: BTC 131 is then when #300 first saw it
    expect(timeOf(await open(memory(), { tip: 131 }), 131)).toEqual({ time: 1_790_001_500_000, exact: false });
  });

  it('is remembered on the device: after a reload the block keeps its own time, with or without a Bitcoin RPC', async () => {
    const store = memory();
    const first = await open(store, { tip: 131, time: () => 1_790_001_460 });
    const genesis = first.getBlock(0)?.hash;
    expect(store.saved.get('btcTimes:signet')).toEqual({ genesis, blocks: [[131, 1_790_001_460_000, btcBlockHash(131)]] });
    expect(timeOf(await open(store), 131)).toEqual({ time: 1_790_001_460_000, exact: true });
    // A Bitcoin RPC now at BTC 132 adds its block
    const later = await open(store, { tip: 132, time: () => 1_790_001_505 });
    expect(store.saved.get('btcTimes:signet')).toEqual({
      genesis,
      blocks: [
        [132, 1_790_001_505_000, btcBlockHash(132)],
        [131, 1_790_001_460_000, btcBlockHash(131)],
      ],
    });
    expect([timeOf(later, 131), timeOf(later, 132)]).toEqual([{ time: 1_790_001_460_000, exact: true }, { time: 1_790_001_505_000, exact: true }]);
  });

  it('a block a BTC reorg replaced loses its time, where the page knows the block now at its height', async () => {
    const store = memory();
    const genesis = (await open(store)).getBlock(0)?.hash;
    // BTC 130 and 129 kept as read; the latest blocks of the loaded main chain anchored at them, #300 and #299, name 'ab…ab' at both
    store.saved.set('btcTimes:signet', {
      genesis,
      blocks: [
        [130, 1_790_001_400_000, btcBlockHash(130)],
        [129, 1_790_001_300_000, 'ab'.repeat(32)],
      ],
    });
    const rpc = await open(store, { tip: 131, time: () => 1_790_001_460 });
    expect([timeOf(rpc, 130).exact, timeOf(rpc, 129)]).toEqual([false, { time: 1_790_001_300_000, exact: true }]);
    expect(store.saved.get('btcTimes:signet')).toEqual({
      genesis,
      blocks: [
        [131, 1_790_001_460_000, btcBlockHash(131)],
        [129, 1_790_001_300_000, 'ab'.repeat(32)],
      ],
    });
  });

  it("passes over what is kept for another network's genesis block, and keeps no height 1 008 or more below the BTC tip, nor more than 1 008", async () => {
    const store = memory();
    store.saved.set('btcTimes:signet', { genesis: 'ff'.repeat(32), blocks: [[131, 1_790_001_000_000, btcBlockHash(131)]] });
    const other = await open(store);
    expect(timeOf(other, 131)).toEqual({ time: 1_790_001_500_000, exact: false });
    const genesis = other.getBlock(0)?.hash;
    // BTC block h kept as mined at 1 790 000 000 + 600h seconds
    const kept = (h: number) => [h, 1_790_000_000_000 + h * 600_000, btcBlockHash(h)];
    const run = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => kept(from + i));
    const saved = () => (store.saved.get('btcTimes:signet') as { blocks: [number, number, string][] }).blocks;
    // With the tip at BTC 2 000: the heights from 900 to 1 899, one above the tip, and entries malformed or of another form
    store.saved.set('btcTimes:signet', { genesis, blocks: [...run(900, 1_899), kept(2_001), [5, 1_005], [6, 'soon', btcBlockHash(6)], [7, 1_007, 'AB'.repeat(32)], 'tip'] });
    const later = await open(store, { tip: 2_000, time: () => 1_791_200_000 });
    // 992 and below are 1 008 or more below the tip
    expect([saved().length, saved()[0]?.[0], saved()[1], saved().at(-1)?.[0]]).toEqual([909, 2_001, kept(2_000), 993]);
    expect([timeOf(later, 1_899), timeOf(later, 950).exact]).toEqual([{ time: 1_791_139_400_000, exact: true }, false]);
    // A block above the tip, which another tab may have read, gives its time once the tip reaches it
    expect(timeOf(later, 2_001).exact).toBe(false);
    // Of more than 1 008 heights, those above the tip among them, the highest 1 008
    store.saved.set('btcTimes:signet', { genesis, blocks: [...run(993, 1_999), ...run(2_001, 2_010)] });
    await open(store, { tip: 2_000, time: () => 1_791_200_000 });
    expect([saved().length, saved()[0]?.[0], saved().at(-1)?.[0]]).toEqual([1_008, 2_010, 1_003]);
  });

  it('a Bitcoin RPC on another BTC network gives no tip and no time to keep, and the page says why', async () => {
    const store = memory();
    const node = anchoredNode({ tip: 300, chainId: 1002 });
    const bitcoind = withBitcoind(node, 'main', () => 917_000, () => 1_790_001_460);
    const rpc = new RpcChain(
      { url: 'http://node.test', chain: 'signet', btcUrl: 'http://btc.test' },
      { fetch: bitcoind.fetch, manual: true, window: 20, now: () => 1_790_001_510_000, btcTimes: store },
    );
    await rpc.sync();
    expect([rpc.btcHeight, rpc.currentBtcHeight(), store.saved.size]).toEqual([undefined, 131, 0]);
    expect(rpc.events.at(-1)?.text).toBe(t().rpc.btcRpcDown(t().rpc.btcRpcWrongChain('http://btc.test', 'main', 'signet')));
  });
});

describe('Producer names', () => {
  it('number the producers in the order of their accounts, the same whichever block a load starts from', async () => {
    // Two producers take turns; a load of 20 blocks starts with an odd block, one of 21 with an even one
    const producer = (h: number) => (h % 2 ? 'aa' : '55').repeat(32);
    const load = async (window: number) => {
      const rpc = new RpcChain({ url: 'http://node.test', chain: 'signet' }, { fetch: anchoredNode({ tip: 300, chainId: 1002, producer }).fetch, manual: true, window, now: () => 1_800_000_000_000 });
      await rpc.sync();
      return rpc;
    };
    const names = (rpc: RpcChain) => [rpc.labels.get('55'.repeat(32)), rpc.labels.get('aa'.repeat(32)), rpc.producers.map((p) => p.name).join(', ')];
    const first = await load(20);
    expect(names(first)).toEqual([t().rpc.producer(1), t().rpc.producer(2), `${t().rpc.producer(1)}, ${t().rpc.producer(2)}`]);
    expect(names(await load(21))).toEqual(names(first));
    // Such a name says what the account is, so it needs no "Producer" label before it, unless the account shows as the wallet's own ("You")
    const a = '55'.repeat(32);
    expect([namedProducer(first, a, null), namedProducer(first, a, a), namedProducer(first, '77'.repeat(32), null)]).toEqual([true, false, false]);
  });
});

describe("A contract's asset named like KSA or bitcoin (the review of M33)", () => {
  it('keeps the symbol its ID gives and says so, names every contract asset with its issuer, and lists it after the others', async () => {
    const fake = 'f1'.repeat(32);
    const plain = 'a7'.repeat(32);
    const sats = '5a'.repeat(32);
    // a zero-width space inside "KSA", a direction override before a name, and "sats" in Cyrillic letters but for the T
    const node = syntheticNode({
      tip: 40,
      opsAt: [],
      finalAt: 30,
      assets: [
        { id: fake, name: 'K\u{200b}SA' },
        { id: plain, name: '\u{202e} Wizards  Gold ' },
        { id: sats, name: '\u{455}\u{430}t\u{455}' },
      ],
    });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    chain.peekAccount(node.ALICE);
    await chain.sync();
    for (let i = 0; i < 100 && [fake, plain, sats].some((id) => chain.assets.get(id)?.issuer === null); i++) await new Promise((r) => setTimeout(r, 1));
    const fakeMeta = chain.assets.get(fake);
    expect(fakeMeta).toMatchObject({ name: 'KSA', lookalike: 'KSA', issuer: 'cc'.repeat(32), symbol: t().rpc.assetSymbol(fake.slice(0, 6)) });
    expect(chain.assets.get(sats)).toMatchObject({ lookalike: 'BTC', symbol: t().rpc.assetSymbol(sats.slice(0, 6)) });
    expect(chain.assets.get(plain)).toMatchObject({ name: 'Wizards Gold', symbol: 'Wizards', issuer: 'cc'.repeat(32) });
    expect(chain.assets.get(plain)?.lookalike).toBeUndefined();
    // KSA first, then the tokens, and the two named like a native coin last, by the symbols their IDs give
    expect(balancesOf(chain, node.ALICE).map((b) => b.asset.id)).toEqual([KSA_ASSET_ID, plain, sats, fake]);
  });
});

describe('Asset changes and token events name the accounts an operation is about (D-122, D-123)', () => {
  const POOL = '66'.repeat(32);
  const GOLD = '77'.repeat(32);
  const TOKEN = '88'.repeat(32);
  const CAROL = '99'.repeat(32);
  const DAVE = 'aa'.repeat(32);
  const token = { standard: 'KS-20', extensions: ['KS-20-burnable'], name: 'Tutorial Token', symbol: 'TUT', decimals: 8, supply: '1000', holders: '2', declared: '1:0:0', irregular: false };
  /** ALICE swaps in POOL at 295: it pays her GOLD out of its own, and moves TOKEN from itself to CAROL */
  const start = async (index: boolean) => {
    const transfer = toHex(encodeKs20Event({ kind: 'Transfer', from: fromHex(POOL, 32), to: fromHex(CAROL, 32), amount: 7n }));
    const node = syntheticNode({
      tip: 300,
      opsAt: [295],
      finalAt: 290,
      action: () => ({ Call: { contract: POOL, method: 'swap', args: '', funds: [] } }),
      events: () => [{ contract: TOKEN, data: transfer }],
      changes: () => [
        { kind: 'payout', asset: GOLD, from: POOL, to: DAVE, amount: '40', events: 0 },
        { kind: 'transfer', asset: '00'.repeat(32), from: POOL, to: DAVE, amount: '1', events: 1 },
      ],
      assets: [{ id: GOLD, name: 'Gold', decimals: 2 }],
      ...(index ? { index: { contracts: { [TOKEN]: ['KS-20', 'KS-20-burnable'], [POOL]: [] }, tokens: { [TOKEN]: token }, holdings: { [CAROL]: [{ kind: 'token', contract: TOKEN, balance: '7' }] } } } : {}),
    });
    const chain = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: node.fetch, manual: true, window: 20, now: () => 1_800_000_000_000 });
    for (const id of [DAVE, CAROL, GOLD, TOKEN]) chain.peekAccount(id);
    await chain.sync();
    const op = chain.getBlock(295)?.entries[0]?.entry;
    const id = op && 'opId' in op ? op.opId : '';
    return { chain, node, id };
  };
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 200 && !done(); i++) await new Promise((r) => setTimeout(r, 1));
  };

  it('the accounts and the assets its changes name, as the node lists it: never KSA’s ID, which the KSA movement names', async () => {
    const { chain, id } = await start(false);
    expect(chain.getOp(id)?.result?.changes).toHaveLength(2);
    expect(chain.peekAccount(DAVE)?.opIds).toEqual([id]);
    // the asset's own history, and its name in the change's units
    expect(chain.peekAccount(GOLD)?.opIds).toEqual([id]);
    await until(() => chain.assets.get(GOLD)?.decimals === 2);
    expect(chain.assets.get(GOLD)).toMatchObject({ name: 'Gold', decimals: 2, capabilities: [], paused: false });
    // a node without the index: the token's transfer names no one, and no holdings are read
    expect(chain.peekAccount(CAROL)?.opIds).toEqual([]);
    expect(chain.tokenBook.indexed).toBe(false);
    expect(chain.peekAccount(CAROL)?.tokens).toBeUndefined();
  });

  it('a token transfer names its two sides once the token’s declaration is in, and the account’s tokens are read from the index', async () => {
    const { chain, id } = await start(true);
    await until(() => chain.tokenBook.declarations.has(TOKEN) && chain.tokenBook.assets.get(TOKEN)?.symbol === 'TUT');
    expect(chain.tokenBook.standardOf(TOKEN)).toBe('KS-20');
    expect(chain.peekAccount(CAROL)?.opIds).toEqual([id]);
    // the contract that emitted it lists it too
    expect(chain.peekAccount(TOKEN)?.opIds).toEqual([id]);
    await until(() => chain.peekAccount(CAROL)?.tokens !== undefined);
    expect(chain.peekAccount(CAROL)?.tokens).toEqual(new Map([[TOKEN, 7n]]));
    expect(chain.tokenBook.assets.get(TOKEN)).toMatchObject({ name: 'Tutorial Token', symbol: 'TUT', decimals: 8, standard: 'KS-20', issuer: TOKEN });
    // a token is no built-in asset: an AssetTransfer naming its ID names no token
    expect(chain.assets.has(TOKEN)).toBe(false);
  });

  it('an asset’s page reads a built-in asset anew, else a token the index knows, else says neither is there', async () => {
    const { chain, node } = await start(true);
    chain.request('asset', GOLD);
    chain.request('asset', TOKEN);
    chain.request('asset', DAVE);
    await until(() => ['asset:' + GOLD, 'asset:' + TOKEN, 'asset:' + DAVE].every((k) => chain.lookup('asset', k.slice(6))?.state !== 'loading'));
    expect(chain.lookup('asset', GOLD)).toBeUndefined();
    expect(chain.assets.get(GOLD)?.name).toBe('Gold');
    expect(chain.lookup('asset', TOKEN)).toBeUndefined();
    expect(chain.tokenBook.facts.get(TOKEN)).toMatchObject({ standard: 'KS-20', extensions: ['KS-20-burnable'], supply: 1000n, declared: '1:0:0' });
    expect(chain.lookup('asset', DAVE)).toMatchObject({ state: 'missing', message: t().rpc.missing.asset });
    expect(node.calls.get('ksana_getAsset')).toBeGreaterThanOrEqual(3);
  });
});
