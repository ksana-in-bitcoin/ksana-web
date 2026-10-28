/**
 * Derives UI state from chain data.
 *
 * The ksana_getOpStatus statuses are pending, fast_confirmed, btc_final, failed and skipped (core/docs/RPC.md).
 * Within fast_confirmed the UI further distinguishes three stages, "settlement broadcast", "written to Bitcoin" and the data's
 * BTC_FINALITY_CONFS Bitcoin confirmations (D-116); all three can be derived from the state of blocks and settlement transactions
 * without the node providing anything extra.
 */

import { type BtcNetwork, decodeAddress, fromHex, isValidXOnlyPublicKey, toHex } from '@ksana/sdk';
import { fmtDuration, fmtInt, halfWidth, hrpOf, shortHash } from '../lib/format';
import { localized, t } from '../i18n';
import { BTC_FINAL_DATA_CONFS, KSA_ASSET_ID, PARAMS, anchorDepthOf, emptyBlockWeight } from './params';
import { checkOk } from './model';
import type { Chain } from './source';
import type { Action, AssetMeta, Block, BtcBlock, BtcTx, CollectionMeta, Hex, LockedFee, OpRecord, Path, Utxo } from './types';

/**
 * The certainty stage of a block (and of entries), matching the three ink colors: qing (cyan) → mo (ink black) → zhu (vermilion).
 * `deep`: its data has BTC_FINALITY_CONFS Bitcoin confirmations, the milestone the page shows first, with BTC-final the seal that
 * follows once the node reports it (D-114, D-116)
 */
export type Stage = 'pending' | 'unmerged' | 'fast' | 'broadcast' | 'on_btc' | 'deep' | 'final' | 'failed' | 'skipped' | 'dropped';

/** The chain block that accepts this block (a chain block is its own; a parallel block not yet merged has none) */
export function acceptingBlock(sim: Chain, b: Block): Block | undefined {
  return b.acceptedHeight === undefined ? undefined : sim.blocks[b.acceptedHeight];
}

/** BTC network name: regtest for the simulator and devnet, per the settings for the node data source (signet) */
export function btcNetworkOf(sim: Chain): string {
  return sim.kind === 'rpc' ? sim.network : 'regtest';
}

/**
 * The BTC block a page shows at a height. The node data source knows only the BTC blocks its loaded fast-lane blocks anchor to or
 * settle in, about every other one on the signet; the others exist all the same, and from the genesis anchor up to the BTC tip each
 * is a block with no Ksana transaction known, so that the status strip's BTC tip, a BTC block's pager and the search reach a page
 */
export function btcBlockAt(sim: Chain, height: number): BtcBlock | undefined {
  const b = sim.getBtcBlock(height);
  if (b || sim.kind !== 'rpc' || height < sim.btcBase || height > sim.btcTip.height) return b;
  return { height, hash: '', txids: [] };
}

/**
 * The first and the last main-chain block anchored at a BTC height, where the page knows them all (with a node, read for the BTC
 * block's page below the stretch loaded from the tip, `RpcChain.anchoredAt`); undefined for none
 */
export function anchoredAt(sim: Chain, height: number): [number, number] | undefined {
  if (sim.kind === 'rpc') return sim.anchoredAt(height);
  const heights = sim.blocks.filter((b) => b.header.height > 0 && b.header.btcAnchor.height === height).map((b) => b.header.height);
  const first = heights[0];
  const last = heights[heights.length - 1];
  return first !== undefined && last !== undefined ? [first, last] : undefined;
}

/**
 * A public Bitcoin explorer's page for a BTC transaction, block or address (display byte order; a block may also be named by its
 * height): only the signet runs on a public BTC network (D-107), and an address is linked only where it is the signet's, a bech32 one
 * in lower case as explorers spell it
 */
export function btcExplorerUrl(sim: Chain, kind: 'tx' | 'block' | 'address', id: string): string | undefined {
  if (sim.kind !== 'rpc' || sim.config.chain !== 'signet') return undefined;
  if (kind === 'address') {
    const address = /^tb1/i.test(id) ? id.toLowerCase() : id;
    let networks: BtcNetwork[] = [];
    try {
      ({ networks } = decodeAddress(address));
    } catch {
      // Not an address
    }
    return networks.includes('signet') ? `https://mempool.space/signet/address/${address}` : undefined;
  }
  const named = /^[0-9a-f]{64}$/i.test(id) || (kind === 'block' && /^\d+$/.test(id));
  return named ? `https://mempool.space/signet/${kind}/${id}` : undefined;
}

/**
 * The BTC confirmations a path C op has before the fast lane must include it: the window counts NATIVE_CONFIRMATIONS back from a
 * block's anchor, which stays ANCHOR_DEPTH below the BTC tip its producer saw (D-036, D-056), so 1 on devnet and 2 on signet
 */
export function nativeConfsOf(sim: Chain): number {
  return PARAMS.NATIVE_CONFIRMATIONS + anchorDepth(sim);
}

/** ANCHOR_DEPTH of the chain the page shows: the node's network, or the simulator's (D-056) */
function anchorDepth(sim: Chain): number {
  return sim.kind === 'rpc' ? anchorDepthOf(sim.config.chain) : PARAMS.ANCHOR_DEPTH;
}

/**
 * Whether the settlement backlog reads later than settlements in step with Bitcoin take it: a body that lands in the next BTC block
 * is counted once the anchor reaches it, ANCHOR_DEPTH blocks on, and one a later settlement carries waits a BTC block more (D-056,
 * D-077), so up to 1 + ANCHOR_DEPTH is the normal course; on signet that is 2, which the status strip showed as a warning
 */
export function backlogLate(sim: Chain, backlog: { waited: number }): boolean {
  return backlog.waited >= 2 + anchorDepth(sim);
}

/**
 * The account's path C operation that `r` waits behind: signed before it with a lower nonce, its BTC transaction broadcast and the
 * operation not included yet. The node learns of a path C operation only once its transaction has the confirmations forced
 * inclusion needs, and until then holds the operations signed after it behind the nonce gap (§7.4): they wait for that one, not
 * for a producer. Of several, the last to be included
 */
export function nativeAhead(sim: Chain, r: OpRecord): OpRecord | undefined {
  return r.blockHash ? undefined : nativeWaiting(sim, r.op.account, r.op.nonce);
}

/** The account's last path C operation whose BTC transaction is broadcast and which no block has included yet, of those below `nonce` when given */
export function nativeWaiting(sim: Chain, account: Hex, nonce = Infinity): OpRecord | undefined {
  let last: OpRecord | undefined;
  for (const x of sim.pendingOf(account)) {
    if (x.path === 'C' && !x.blockHash && x.op.nonce < nonce && (!last || x.op.nonce > last.op.nonce)) last = x;
  }
  return last;
}

/** How long until a path C operation's BTC transaction has the confirmations forced inclusion needs, 0 once it has them; `btcEta` is the wait for the next BTC block */
function nativeEta(sim: Chain, tx: BtcTx | undefined, btcEta: number): number {
  const need = nativeConfsOf(sim);
  const confs = sim.btcConfs(tx?.confirmedHeight);
  return confs >= need ? 0 : btcEta + (need - confs - 1) * sim.btcIntervalMs;
}

/**
 * The KSA a top-up claim (D-085) credited to `me`: the claim is signed with a one-time key, so the op is someone else's and only its
 * event names the beneficiary. On a node, the exchange's claim event as the page reads it (`eventFields`), emitted by the contract
 * the op calls: the exchange whose lock the top-up read and paid, which reports both
 */
export function claimedFor(sim: Chain, r: OpRecord, me: Hex): { value: bigint; asset: AssetMeta } | undefined {
  if (!r.result?.ok) return undefined;
  const a = r.op.action;
  let value: bigint | undefined;
  for (const e of r.result.events) {
    const f = e.fields;
    if (e.name !== 'claim' || f.beneficiary !== me || f.ksa_paid === undefined || !/^\d+$/.test(f.ksa_paid)) continue;
    if (f.contract !== undefined && (a.kind !== 'Call' || f.contract !== a.contract)) continue;
    value = (value ?? 0n) + BigInt(f.ksa_paid);
  }
  const ksa = sim.assets.get(KSA_ASSET_ID);
  return value !== undefined && ksa ? { value, asset: ksa } : undefined;
}

/**
 * What else reached an account in someone else's op (D-123): the built-in assets its receipt records moving to the account (a payout,
 * an issuance, funds a contract attached for it; D-122) and the KS-20 tokens a known token's transfer events credit it with. One asset's
 * total, or undefined when nothing reached it, or more than one asset did
 */
export function receivedBy(sim: Chain, r: OpRecord, me: Hex): { value: bigint; asset: AssetMeta } | undefined {
  if (!r.result?.ok) return undefined;
  const got = new Map<Hex, bigint>();
  const add = (asset: Hex, v: bigint) => got.set(asset, (got.get(asset) ?? 0n) + v);
  for (const c of r.result.changes ?? []) {
    if ((c.kind === 'transfer' || c.kind === 'funds' || c.kind === 'payout') && c.to === me && c.from !== me) add(c.asset, c.amount);
    if (c.kind === 'issue' && c.to === me) add(c.asset, c.amount);
  }
  if (sim.kind === 'rpc') {
    for (const e of r.result.events) {
      const te = sim.tokenBook.eventOf(e);
      if (te?.standard !== 'KS-20' || te.event.kind !== 'Transfer') continue;
      if (toHex(te.event.to) === me && toHex(te.event.from) !== me) add(te.contract, te.event.amount);
    }
  }
  const [only, ...more] = got;
  if (!only || more.length) return undefined;
  const asset = assetOf(sim, only[0]);
  return asset ? { value: only[1], asset } : undefined;
}

/**
 * What a successful op moved in or out of `me`'s balances by what the node recorded: its receipt's changes to built-in assets (D-122),
 * then the transfers a known KS-20 token's events record (D-120). False when the receipt did not record its changes, which are then
 * left to the op's own action and the contracts' events (`contractMoves`); a token's transfers are counted either way
 */
export function recordedMoves(sim: Chain, r: OpRecord, me: Hex, add: (asset: Hex, value: bigint) => void): boolean {
  const changes = r.result?.ok ? r.result.changes : undefined;
  for (const c of changes ?? []) {
    if (c.kind === 'transfer' || c.kind === 'funds' || c.kind === 'payout') {
      if (c.from === c.to) continue;
      if (c.from === me) add(c.asset, -c.amount);
      if (c.to === me) add(c.asset, c.amount);
    } else if (c.kind === 'issue' && c.to === me) add(c.asset, c.amount);
    else if (c.kind === 'burn' && c.from === me) add(c.asset, -c.amount);
  }
  if (sim.kind === 'rpc' && r.result?.ok) {
    for (const e of r.result.events) {
      const te = sim.tokenBook.eventOf(e);
      if (te?.standard !== 'KS-20' || te.event.kind !== 'Transfer') continue;
      const from = toHex(te.event.from);
      const to = toHex(te.event.to);
      if (from === to) continue;
      if (from === me) add(te.contract, -te.event.amount);
      if (to === me) add(te.contract, te.event.amount);
    }
  }
  return Array.isArray(changes);
}

/**
 * Whether an account shows under a name that already says it produces blocks: the node data source names each producer it has
 * seen "Producer N" (`rpc.producer`, its only names), so a "Producer" label before the name would say it twice. The simulator's
 * producers are named after their nodes (devnet-1), and the wallet's own account shows as "You": those keep the label.
 */
export function namedProducer(sim: Chain, id: Hex, me: Hex | null): boolean {
  return sim.kind === 'rpc' && id !== me && sim.labels.has(id);
}

/** Any valid x-only key (the generator's x): its Taproot address shows the network's address prefix */
const SAMPLE_KEY = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

/** How an account's Taproot address starts on the page's network (bcrt1p, tb1p) */
export function addressPrefix(sim: Chain): string {
  return hrpOf(sim.addressOf(SAMPLE_KEY)) || 'bcrt1p';
}

/** The "height" in a block header is the selected-chain depth, the same for a parallel block and the chain block at that height; the UI tells them apart by adding a "parallel block" marker */
export function blockTitle(b: Block): string {
  return b.side ? t().status.sideBlock(fmtInt(b.header.height)) : `#${fmtInt(b.header.height)}`;
}

export function blockStage(sim: Chain, b: Block): Stage {
  if (b.acceptedHeight === undefined) return 'unmerged';
  const a = b.acceptedHeight;
  if (a <= sim.finalHeight) return 'final';
  if (a <= sim.settledHeight) return dataDeep(sim, a) ? 'deep' : 'on_btc';
  if (b.needsSettlement) {
    // The body goes in the block's own settlement, or in a later block's when it waited in the backlog (D-077)
    const s = bodySettlement(sim, b)?.status;
    return s === 'broadcast' || s === 'confirmed' || b.settlementOnBtc ? 'broadcast' : 'fast';
  }
  // Blocks without a settlement transaction of their own: the header lands on-chain with another settlement or republish transaction; one only built and not yet broadcast does not count
  return sim.carriersOf(b.hash).some((t) => t.status === 'broadcast' || t.status === 'confirmed') ? 'broadcast' : 'fast';
}

/**
 * The settled closure of the chain block at height `a` has BTC_FINALITY_CONFS Bitcoin confirmations: every node can decide it final
 * then (D-082), and BTC-final follows once the BTC block of that decision has as many (D-114)
 */
function dataDeep(sim: Chain, a: number): boolean {
  const closure = sim.blocks[a]?.closureBtc;
  return closure !== undefined && sim.btcConfs(closure) >= PARAMS.BTC_FINALITY_CONFS;
}

export const STAGE_LABEL: Record<Stage, string> = localized(() => t().status.stage);

export const STAGE_HINT: Record<Stage, string> = localized(() => t().status.stageHint);

/** The transaction and BTC height at which this block's own data landed on BTC (data(b), D-038) */
export function dataOnBtc(b: Block): { txid: Hex; btcHeight: number } | undefined {
  return b.needsSettlement ? b.settlementOnBtc : b.headerOnBtc;
}

/** The block's currently "live" settlement transaction: the confirmed one, or the one being broadcast, or the one waiting to be broadcast */
export function currentSettlement(sim: Chain, b: Block): BtcTx | undefined {
  const txs = b.settlements.map((id) => sim.getBtcTx(id)).filter((t): t is BtcTx => !!t);
  return (
    txs.find((t) => t.status === 'confirmed') ??
    txs.find((t) => t.status === 'broadcast') ??
    txs.find((t) => t.status === 'built') ??
    txs[txs.length - 1]
  );
}

/**
 * What a settlement, rescue or republish paid Bitcoin's miners: its commit and reveal transactions together (D-081; SPEC §7.2 asks
 * each for its own fee), or the reveal transaction's fee alone (`revealOnly`) where the page does not know the commit's, whose
 * funding input it has not seen. A transaction that is not half of a pair (a path C transaction, a CPFP child) is its own fee
 */
export function pairFee(sim: Chain, tx: BtcTx): { feeSat?: number; feeRate?: number; vsize: number; parts?: { commit: number; reveal: number }; revealOnly: boolean } {
  const commit = tx.commitTxid ? sim.getBtcTx(tx.commitTxid) : undefined;
  if (!tx.commitTxid || tx.feeSat === undefined || commit?.feeSat === undefined) {
    return { feeSat: tx.feeSat, feeRate: tx.feeRate, vsize: tx.vsize, revealOnly: !!tx.commitTxid && tx.feeSat !== undefined };
  }
  const feeSat = commit.feeSat + tx.feeSat;
  const vsize = commit.vsize + tx.vsize;
  return { feeSat, feeRate: Math.round((feeSat / vsize) * 100) / 100, vsize, parts: { commit: commit.feeSat, reveal: tx.feeSat }, revealOnly: false };
}

/**
 * The block whose settlement carries this block's body: the block itself, or, for a block that carries none because its body waited
 * in the backlog while another settlement was in flight, the later block that carried it (D-077); undefined until one does
 */
export function bodyCarrierBlock(sim: Chain, b: Block): Block | undefined {
  if (b.settlements.length) return b;
  return b.carrier && b.carrier !== b.hash ? sim.getBlock(b.carrier) : undefined;
}

/** The height of the later block whose settlement carried this block's body (D-077), also where the page has not loaded that block */
export function carrierHeight(sim: Chain, b: Block): number | undefined {
  if (b.settlements.length || !b.carrier || b.carrier === b.hash) return undefined;
  return sim.getBlock(b.carrier)?.header.height ?? b.carrierHeight;
}

/** The settlement transaction carrying this block's body: its own, or that of the later block that carried it (D-077) */
export function bodySettlement(sim: Chain, b: Block): BtcTx | undefined {
  const by = bodyCarrierBlock(sim, b);
  return by ? currentSettlement(sim, by) : undefined;
}

/**
 * The settlement step of a block's data that waits for a broadcast: a settlement goes SETTLEMENT_DEPTH blocks after the block whose
 * settlement it is (D-037), which for data another block's settlement carries (a header, or a body from the backlog, D-077) is that
 * block, not this one; while no settlement carries the data yet nothing can be counted, and the step gives neither ticks nor a time
 */
function settlementWait(sim: Chain, by: Block | undefined, now: number): Pick<StepView, 'ticks' | 'eta'> {
  if (by?.acceptedHeight === undefined) return {};
  const depth = Math.min(sim.tip.header.height - by.acceptedHeight, PARAMS.SETTLEMENT_DEPTH);
  return {
    ticks: { done: depth, total: PARAMS.SETTLEMENT_DEPTH },
    // The blocks still to come; at its depth already, the next one, where the page has not seen the settlement go out
    eta: blocksEta(sim, Math.max(1, PARAMS.SETTLEMENT_DEPTH - depth), now),
  };
}

/** An empty block's weight after a chain block of weight `w` (D-090): 12 after one with entries, then twice the last, up to 120 */
function emptyWeightAfter(w: number): number {
  return w <= 1 ? emptyBlockWeight(0) : Math.min(2 * w, PARAMS.MAX_EMPTY_BLOCK_WEIGHT);
}

/**
 * The expected gaps of the `n` chain blocks after one of weight `w`. A block takes about its weight in target times, an empty one
 * the weight of its streak, 12, 24, 48, 96, then 120 (D-084, D-090), so on an idle lane the two blocks after an operation's come
 * about 1 and 2 minutes apart, where the interval of the latest blocks, mostly slow ones at the cap, read minutes each. They are
 * taken as empty, each at most that interval, which blocks with entries keep short on a busy lane; a weight the page does not know
 * (a node's tip with too few blocks loaded below it) leaves the interval
 */
function blockGaps(sim: Chain, w: number | undefined, n: number): number[] {
  const gaps: number[] = [];
  for (let i = 0; i < n; i++) {
    w = w === undefined ? undefined : emptyWeightAfter(w);
    gaps.push(w === undefined ? sim.fastIntervalMs : Math.min(sim.fastIntervalMs, w * PARAMS.TARGET_BLOCK_TIME * 1000));
  }
  return gaps;
}

/** The expected gap from the tip to the next chain block: what the status strip's block clock fills over */
export function nextBlockGap(sim: Chain): number {
  return blockGaps(sim, sim.tip.weight, 1)[0] ?? sim.fastIntervalMs;
}

/** When the `n`-th chain block after the tip is expected (n ≥ 1), as a wait from now: the first counts from the tip's time */
export function blocksEta(sim: Chain, n: number, now: number): number {
  const [first = 0, ...rest] = blockGaps(sim, sim.tip.weight, n);
  return Math.max(0, sim.tip.time + first - now) + rest.reduce((a, b) => a + b, 0);
}

/**
 * When data whose settlement goes out `sent` from now lands on Bitcoin: in the first BTC block after that, the next being expected
 * `btcEta` from now and each after it an interval later. A settlement that misses the next BTC block waits for the one after it
 */
function landsIn(sim: Chain, sent: number, btcEta: number): number {
  return btcEta + Math.ceil(Math.max(0, sent - btcEta) / sim.btcIntervalMs) * sim.btcIntervalMs;
}

/**
 * The time a BTC transaction's page gives it: a confirmed one its BTC block's, as a Bitcoin explorer does (a settlement read "54 min
 * ago", when its Ksana block was produced, beside the BTC block it confirmed in, which came 45 minutes after it), and one not confirmed
 * when it was built. None for a confirmed one whose block's time the page does not know or whose height is only a bound, nor for one
 * the node gives by its ID only
 */
export function txTime(sim: Chain, tx: BtcTx): number | undefined {
  if (tx.confirmedHeight !== undefined) return tx.heightAtMost ? undefined : sim.getBtcBlock(tx.confirmedHeight)?.time;
  return tx.partial ? undefined : tx.createdAt;
}

/** The transaction carrying this block's header (empty blocks and blocks with only forced inclusions have no settlement of their own) */
export function headerCarrier(sim: Chain, b: Block): BtcTx | undefined {
  if (b.headerOnBtc) return sim.getBtcTx(b.headerOnBtc.txid);
  const txs = sim.carriersOf(b.hash);
  return txs.find((t) => t.status === 'broadcast') ?? txs.find((t) => t.status === 'built');
}

/**
 * A block without a body whose header goes to Bitcoin in a settlement it sent itself, carrying bodies from the backlog (D-077): its
 * pages name that transaction as the block's own, not as the settlement of its own height
 */
export function ownHeaderCarrier(b: Block, carrier: BtcTx | undefined): boolean {
  return !b.needsSettlement && !!carrier && carrier.kind !== 'headers' && carrier.forBlock === b.hash;
}

/** A block a payload carries: its hash and height, and whether it is a parallel block, which only a block the page has loaded tells */
export interface CarriedBlock {
  hash: Hex;
  height: number;
  side: boolean;
}

/**
 * The blocks among `ids`, some of `tx`'s headers or bodies, in that order: by the block where the page has loaded it, and otherwise by
 * the height its header in the payload gives (`BtcTx.headerHeights`, node data source), so that an older payload still names every
 * block it carries; a block known neither way is left out
 */
export function carriedBlocks(sim: Chain, tx: BtcTx, ids: Hex[] = tx.headers): CarriedBlock[] {
  const given = tx.headerHeights ? new Map(tx.headers.map((hash, i) => [hash, tx.headerHeights?.[i]] as const)) : undefined;
  const out: CarriedBlock[] = [];
  for (const hash of ids) {
    const b = sim.getBlock(hash);
    const height = b ? b.header.height : given?.get(hash);
    if (height !== undefined) out.push({ hash, height, side: !!b?.side });
  }
  return out;
}

/** Blocks a payload carries, summarized from the first to the last by height, with parallel blocks counted apart */
export function carriedSpan(blocks: CarriedBlock[]): string {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last) return '';
  const title = (b: CarriedBlock) => (b.side ? t().status.sideBlock(fmtInt(b.height)) : `#${fmtInt(b.height)}`);
  const side = blocks.filter((x) => x.side).length;
  const range = blocks.length > 1 ? t().status.span(title(first), title(last)) : title(first);
  return side ? t().status.spanWithSide(range, side) : range;
}

/** The headers in a payload: summarized by height, with parallel blocks marked separately */
export function headerSpan(sim: Chain, tx: BtcTx): string {
  return carriedSpan(carriedBlocks(sim, tx));
}

/**
 * What the Ksana transactions in a BTC block carry (D-077): the headers since each payload's previous settlement and the bodies of the
 * blocks that waited for one, each block once, by height. A transaction the node gives by its ID only carries at least the body it
 * was found for, and that body's header
 */
export function btcBlockCarried(sim: Chain, b: BtcBlock): { headers: CarriedBlock[]; bodies: CarriedBlock[] } {
  const txs = b.txids.map((id) => sim.getBtcTx(id)).filter((x): x is BtcTx => !!x);
  const carried = (ids: (tx: BtcTx) => Hex[]) => {
    const all = new Map<Hex, CarriedBlock>();
    for (const tx of txs) for (const c of carriedBlocks(sim, tx, ids(tx))) all.set(c.hash, c);
    return [...all.values()].sort((x, y) => x.height - y.height || Number(x.side) - Number(y.side));
  };
  return { headers: carried((tx) => (tx.partial ? tx.bodies : tx.headers)), bodies: carried((tx) => tx.bodies) };
}

/**
 * BTC-final confirmations: counted from the BTC height at which the chain block accepting this block entered the settled closure
 * (D-038, D-063), not from this block's own settlement: the last transaction in the closure to land on-chain decides when it
 * becomes final.
 */
export function finalityConfs(sim: Chain, b: Block): { closure?: number; confs: number } {
  const chain = acceptingBlock(sim, b);
  if (!chain || chain.header.height > sim.settledHeight || chain.closureBtc === undefined) return { confs: 0 };
  return { closure: chain.closureBtc, confs: sim.btcConfs(chain.closureBtc) };
}

/**
 * Whether a BTC block gets the vermilion seal: it has BTC_FINAL_DATA_CONFS confirmations, and every Ksana block it carries data for
 * that a chain block accepts is BTC-final, by the final height that gives the blocks their stage, so with a node by what the node
 * reports (D-114). Its data is the headers and bodies of its settlement and republish payloads and the block each settlement is for;
 * a block the page does not have, or that no chain block accepts, does not hold the seal back, and a path C op it carries shows its
 * own stage. So the seal comes after the 11th confirmation while the determination waits, and, for a parallel block's settlement,
 * once the chain block accepting that block is BTC-final
 */
export function btcBlockSealed(sim: Chain, b: BtcBlock): boolean {
  if (sim.btcConfs(b.height) < BTC_FINAL_DATA_CONFS) return false;
  for (const id of b.txids) {
    const tx = sim.getBtcTx(id);
    if (!tx) continue;
    const carried = [...tx.headers, ...tx.bodies];
    if (tx.forBlock) carried.push(tx.forBlock);
    for (const hash of carried) {
      const at = sim.getBlock(hash)?.acceptedHeight;
      if (at !== undefined && at > sim.finalHeight) return false;
    }
  }
  return true;
}

// =====================================================================
// Op progress
// =====================================================================

export type Ink = 'qing' | 'mo' | 'zhu' | 'neutral' | 'warn';

/** A page a step's note names, given as the route of the same name: a block, a BTC block, a transaction or an account */
export type StepRef =
  | { name: 'block'; id: string }
  | { name: 'btc'; height: number }
  | { name: 'tx'; id: string; block?: string }
  | { name: 'account'; id: string }
  | { name: 'op'; id: string };

/** A block a note names by its height ("#301"), linked by its hash where the page has one, which also tells a parallel block apart */
function blockRef(id: string, height: number): NonNullable<StepView['ref']> {
  return { to: { name: 'block', id }, text: `#${fmtInt(height)}` };
}

/** A BTC block a note names by its height ("BTC #326,327") */
function btcRef(height: number): NonNullable<StepView['ref']> {
  return { to: { name: 'btc', height }, text: `BTC #${fmtInt(height)}` };
}

/** A transaction a note names by its shortened ID */
function txRef(sim: Chain, txid: string): NonNullable<StepView['ref']> {
  return { to: txRoute(sim, txid), text: shortHash(txid, 6, 4) };
}

/**
 * The route to a BTC transaction's page with the block that names it: the node looks a transaction up only by its block, so a page
 * opened anew below the blocks loaded from the tip (a reload, a link shared or opened in a new tab) reads that block for it. The block
 * whose settlement it is, commit or reveal (D-081), whose settlement status names it (a rescue settlement or a republish, D-044,
 * D-047), or that included the path C operation it carries (D-036): by height where it is on the main chain, which reads better in an
 * address, by hash otherwise. None for one the page knows no block for (a path C transaction not included yet)
 */
export function txRoute(sim: Chain, txid: Hex): Extract<StepRef, { name: 'tx' }> {
  const tx = sim.getBtcTx(txid);
  const hash = tx?.forBlock ?? (tx?.opId !== undefined ? sim.getOp(tx.opId)?.blockHash : undefined);
  if (!hash) return { name: 'tx', id: txid };
  const b = sim.getBlock(hash);
  return { name: 'tx', id: txid, block: b && !b.side ? String(b.header.height) : hash };
}

function withRef(ref: StepView['ref']): Pick<StepView, 'ref'> {
  return ref ? { ref } : {};
}

export interface StepView {
  key: string;
  label: string;
  sub?: string;
  /** The page the note names, and the words of the note that name it (the whole note when they are not given): they link to it */
  ref?: { to: StepRef; text?: string };
  state: 'done' | 'active' | 'todo' | 'failed' | 'skipped';
  ink: Ink;
  at?: number;
  ticks?: { done: number; total: number };
  eta?: number;
  /** The ETA is no longer reliable (e.g. the transaction's fee rate is below the fee floor) */
  stuck?: boolean;
  /** Which marker to use when state is failed: execution failed, skipped, or dropped */
  failMark?: 'failed' | 'skipped' | 'dropped';
  /** The status mark a done step shows in place of its shape: the six-confirmation milestone (D-116) */
  mark?: Stage;
}

export type OpStatus = 'pending' | 'fast_confirmed' | 'btc_final' | 'failed' | 'skipped' | 'dropped';

export interface OpProgress {
  /** The ksana_getOpStatus status, plus dropped from the entry pool (the node returns -32004 for it) */
  status: OpStatus;
  stage: Stage;
  steps: StepView[];
  block?: Block;
  settlement?: BtcTx;
  fastConfs: number;
  btcConfs: number;
  /** Fast path: blocks elapsed since submission */
  waitedBlocks: number;
  /** Waited too long; suggest switching to path C */
  suggestNative: boolean;
  /** Time from submission to fast-lane confirmation */
  fastLatency?: number;
  /** Skipped: whether it will be included again */
  skipNote?: string;
  /** The BTC heights of its steps done on Bitcoin whose time the page does not know, which a page has the node read (`useBtcTimes`) */
  btcAsk?: number[];
}

/**
 * The times of the BTC blocks a progress's steps done on Bitcoin give, gathering the heights the page has no time for (`btcAsk`: an
 * operation days old gave none)
 */
function btcStepTimes(sim: Chain): { at: (height: number | undefined) => number | undefined; ask: number[] } {
  const ask: number[] = [];
  return {
    ask,
    at: (height) => {
      if (height === undefined) return undefined;
      const time = sim.getBtcBlock(height)?.time;
      if (time === undefined && !ask.includes(height)) ask.push(height);
      return time;
    },
  };
}

/** When the next BTC block is expected: a BTC interval after the tip, or after now when the tip's time is not known */
export function expectedBtcBlockAt(sim: Chain, now: number): number {
  return (sim.btcTip.time ?? now) + sim.btcIntervalMs;
}

/**
 * How many blocks the indexer trails the tip by, and how many of them, the newest, are not yet written to Bitcoin. The indexer runs a
 * block once the block and the SETTLEMENT_DEPTH blocks after it are written (D-063, D-082), so the others wait for the blocks after them
 */
export function indexerLag(sim: Pick<Chain, 'tip' | 'settledHeight' | 'indexerHeight'>): { blocks: number; unwritten: number } {
  const tip = sim.tip.header.height;
  const blocks = Math.max(0, tip - sim.indexerHeight);
  return { blocks, unwritten: Math.min(blocks, Math.max(0, tip - sim.settledHeight)) };
}

/** BTC blocks the indexer's scan must be past a block's data before the page counts the block as one it could have run: a round of the
 * indexer publishes the BTC height it scanned before it runs what that height brought */
const INDEXER_GRACE = 2;

/**
 * The node's chain block the indexer has not run though it could have: the one above the indexer's height whose settled closure, and
 * the headers of the SETTLEMENT_DEPTH chain blocks after it, were on Bitcoin INDEXER_GRACE blocks below the BTC height the indexer has
 * scanned (it runs a block then, D-063, D-082), with `since` the BTC height they were all on by. The indexer publishes no state_root
 * its re-execution did not give (D-101): it passes over a block it finds invalid and takes the chain without it (D-098), so such a block
 * shows only as the indexer staying below it or on another chain. Catching up after a restart, or a local fault, holds it back too.
 * None where the page does not know where those landed
 */
export function indexerStall(sim: Chain): { height: number; since: number } | undefined {
  if (!sim.indexerBtcHeight) return undefined;
  const height = sim.indexerHeight + 1;
  let since = sim.blocks[height]?.closureBtc;
  for (let h = height + 1; h <= height + PARAMS.SETTLEMENT_DEPTH && since !== undefined; h++) {
    const at = sim.blocks[h]?.headerOnBtc?.btcHeight;
    since = at === undefined ? undefined : Math.max(since, at);
  }
  return since !== undefined && since <= sim.indexerBtcHeight - INDEXER_GRACE ? { height, since } : undefined;
}

/**
 * What the page can say of the indexer now: none connected (`off`), halted, not answering (`unreachable`, also where it answered
 * before), no check made yet (`none`), whether the recent checks (`indexerChecks`) all matched: `forked` where one found the two on
 * different chain blocks, `mismatch` where one found other state roots (the indexer gives none, see `indexerStall`); and, where they
 * did, `stalled` when the indexer has not run a block it could have. Nothing is said to match before a check has
 */
export type IndexerState = 'off' | 'halted' | 'unreachable' | 'none' | 'ok' | 'stalled' | 'mismatch' | 'forked';

export function indexerState(sim: Chain): IndexerState {
  if (sim.kind === 'rpc' && !sim.hasIndexer) return 'off';
  if (sim.indexerHalted) return 'halted';
  if (sim.indexerError) return 'unreachable';
  if (!sim.indexerChecks.length) return 'none';
  const failed = sim.indexerChecks.filter((c) => !checkOk(c));
  if (failed.length) return failed.some((c) => c.nodeHash) ? 'forked' : 'mismatch';
  return indexerStall(sim) ? 'stalled' : 'ok';
}

/**
 * Whether the indexer vouches for chain block b: its latest check is at or above b's height, on the block the node's chain still
 * has there, and matched. The same block at that height means the same chain below it, b included
 */
export function indexerVouches(sim: Chain, b: Block): boolean {
  const last = sim.indexerChecks[sim.indexerChecks.length - 1];
  if (b.side || !last || last.height < b.header.height || !checkOk(last)) return false;
  return sim.blocks[last.height]?.hash === last.hash && sim.blocks[b.header.height]?.hash === b.hash;
}

/**
 * The share of empty blocks among the last `n` main-chain blocks (0 when none is loaded). Two-speed difficulty spaces empty blocks
 * out, the weight doubling with the streak up to MAX_EMPTY_BLOCK_WEIGHT times the target time (D-084, D-090): an idle chain's
 * blocks come minutes apart, while an entry still gets into a block in about the target time.
 */
export function emptyShare(sim: Chain, n = 20): number {
  let seen = 0;
  let empty = 0;
  for (let i = sim.blocks.length - 1; i > 0 && seen < n; i--) {
    const b = sim.blocks[i];
    if (!b) break;
    seen++;
    if (b.entries.length === 0) empty++;
  }
  return seen ? empty / seen : 0;
}

/**
 * The block list's counts over the main-chain blocks the page holds (the whole chain in the simulator, the loaded ones on the node data
 * source): how many are empty, and the parallel blocks beside them. The simulator has every one, and their share is of all blocks, on the
 * chain or parallel. The node gives no count of the chain's: the page counts those the loaded blocks merged (`merged` is the merge set
 * without the selected parent), which a share of the whole chain would divide by blocks it never read
 */
export function blockCounts(sim: Chain): { loaded: number; empty: number; parallel: number; share: number } {
  const chain = sim.blocks.filter((b) => b.header.height > 0);
  const parallel = sim.kind === 'rpc' ? chain.reduce((s, b) => s + b.merged.length, 0) : sim.sideBlocks.length;
  return { loaded: chain.length, empty: chain.filter((b) => b.entries.length === 0).length, parallel, share: parallel / Math.max(1, chain.length + parallel) };
}

/** How many of the latest gaps between main-chain blocks the block time takes, on the overview and the blocks page alike */
export const BLOCK_TIME_GAPS = 36;

/**
 * The block time: the latest gaps between main-chain blocks the page holds, at most `BLOCK_TIME_GAPS`, oldest first and stopping at
 * the first block it does not hold, their mean, and the parallel blocks the later block of each merged. The overview draws the gaps and
 * gives their mean, and the blocks page gives the same mean: it averaged every block it held, 59 gaps on signet, and read 4 min 44 s
 * beside the overview's 4 min 33 s
 */
export function blockTime(sim: Chain): { gaps: number[]; mean: number; merged: number } {
  const gaps: number[] = [];
  let merged = 0;
  for (let i = sim.blocks.length - 1; i > 1 && gaps.length < BLOCK_TIME_GAPS; i--) {
    const b = sim.blocks[i];
    const prev = sim.blocks[i - 1];
    if (!b || !prev) break;
    gaps.push(b.time - prev.time);
    merged += b.merged.length;
  }
  gaps.reverse();
  return { gaps, mean: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0, merged };
}

/**
 * The fast lane is idle: most of its recent blocks are empty, or its latest two are, so they come far slower than the target time.
 * The latest blocks tell it as soon as a burst of operations ends, which leaves most of the last 20 busy for an hour on signet
 */
export function laneIdle(sim: Chain): boolean {
  return emptyShare(sim) > 0.5 || laneQuiet(sim);
}

/** The latest two main-chain blocks are empty: the lane has no operations to include and has started to slow down */
export function laneQuiet(sim: Chain): boolean {
  return emptyShare(sim, 2) === 1;
}

export function opStatusOf(sim: Chain, r: OpRecord): OpStatus {
  if (r.blockHash) {
    if (r.result && !r.result.ok) return 'failed';
    const b = sim.getBlock(r.blockHash);
    return b && blockStage(sim, b) === 'final' ? 'btc_final' : 'fast_confirmed';
  }
  if (r.skippedIn?.length) return 'skipped';
  if (r.dropped) return 'dropped';
  return 'pending';
}

export function opProgress(sim: Chain, r: OpRecord, now: number): OpProgress {
  const block = r.blockHash ? sim.getBlock(r.blockHash) : undefined;
  const status = opStatusOf(sim, r);
  const stage: Stage = status === 'skipped' ? 'skipped' : status === 'dropped' ? 'dropped' : !block ? 'pending' : blockStage(sim, block);
  const gone = status === 'skipped' || status === 'dropped';
  const failed = status === 'failed';
  const settlement = block ? bodySettlement(sim, block) : undefined;
  // The block whose settlement takes the op to Bitcoin: its own, or a later one that carried its body from the backlog (D-077)
  const by = block ? bodyCarrierBlock(sim, block) : undefined;
  const carriedAt = block ? carrierHeight(sim, block) : undefined;
  const carriedBy = carriedAt !== undefined ? t().status.step.carriedBy(fmtInt(carriedAt)) : undefined;
  const carriedRef = carriedAt !== undefined && block?.carrier ? blockRef(block.carrier, carriedAt) : undefined;
  const accepted = block?.acceptedHeight;
  const fastConfs = accepted !== undefined ? sim.tip.header.height - accepted + 1 : 0;
  const onBtc = block ? dataOnBtc(block) : undefined;
  const fin = block ? finalityConfs(sim, block) : { confs: 0 };
  const btcConfs = fin.confs;
  // The block that includes an op: one with an entry is mined at weight 1, about TARGET_BLOCK_TIME once the producers take the op into
  // their template, however slow the empty blocks of an idle lane before it (D-084, D-090), which the interval of the latest blocks counts
  const opBlockEta = Math.max(0, Math.max(sim.tip.time, r.submittedAt) + PARAMS.TARGET_BLOCK_TIME * 1000 - now);
  const btcEta = Math.max(0, expectedBtcBlockAt(sim, now) - now);
  let waitedBlocks = 0;
  if (!block && !gone) {
    for (let i = sim.blocks.length - 1; i > 0 && (sim.blocks[i]?.time ?? 0) > r.submittedAt; i--) waitedBlocks++;
  }
  // Behind a path C operation still waiting for BTC: the blocks that pass without it say nothing about the producers
  const ahead = !block && !gone ? nativeAhead(sim, r) : undefined;
  const aheadTx = ahead?.nativeTxid ? sim.getBtcTx(ahead.nativeTxid) : undefined;
  const aheadStuck = !!aheadTx && aheadTx.status === 'broadcast' && !sim.canConfirm(aheadTx);
  // A path C transaction handed back to be broadcast by hand (`noteNative`): when it is broadcast and confirms is not known
  const byHand = (tx: BtcTx | undefined) => tx?.kind === 'native' && tx.status === 'built';
  // Not included after waiting 3 blocks: suggest switching to path C (send your own BTC transaction, no dependence on a producer)
  const suggestNative = !block && !gone && !ahead && r.path !== 'C' && waitedBlocks >= 3;
  const skip = r.skippedIn?.[r.skippedIn.length - 1];
  const m = t().status;
  const st = m.step;
  const btc = btcStepTimes(sim);
  // Whether a skipped op will be included again, once known: with a node, as the node answers for it (D-063)
  const skipNote = status === 'skipped' ? (r.dropped ? m.skipFinal(r.dropped.reason) : r.requeued ? m.skipRetry : undefined) : undefined;

  // When the transaction's fee rate is below the BTC fee floor, the ETA is unreliable
  const nativeTx = r.nativeTxid ? sim.getBtcTx(r.nativeTxid) : undefined;
  const nativeStuck = !!nativeTx && nativeTx.status === 'broadcast' && !sim.canConfirm(nativeTx);
  const settleStuck = !!settlement && settlement.status === 'broadcast' && !sim.canConfirm(settlement);

  // Ops the node data source read from blocks: the node does not record the submission time, so neither the submission moment nor the latency is shown
  const knownSubmit = r.origin !== 'chain';
  const steps: StepView[] = [];
  steps.push({
    key: 'signed',
    label: r.path === 'C' ? (byHand(nativeTx) ? st.signedByHand : st.signedNative) : st.signed,
    state: 'done',
    ink: 'neutral',
    ...(knownSubmit ? { at: r.submittedAt } : {}),
  });

  // Give a rough estimate even before it is on BTC: the data lands in the first BTC block after its settlement goes out, then the
  // confirmations after it. The settlement goes SETTLEMENT_DEPTH blocks after the op's block (D-037): on an idle lane minutes, which
  // the next BTC block may not wait for. A path C op's block waits for its transaction's confirmations, a body in the backlog for the
  // settlement in flight to land and a later block's to go (D-077), and an op behind a waiting path C op for that op's block
  const stalled = (!block && (ahead ? aheadStuck || byHand(aheadTx) : waitedBlocks >= 3)) || nativeStuck || settleStuck || byHand(nativeTx);
  const blockEta = ahead
    ? nativeEta(sim, aheadTx, btcEta) + 2 * PARAMS.TARGET_BLOCK_TIME * 1000
    : r.path === 'C'
      ? nativeEta(sim, nativeTx, btcEta) + PARAMS.TARGET_BLOCK_TIME * 1000
      : opBlockEta;
  const sum = (gaps: number[]) => gaps.reduce((a, b) => a + b, 0);
  const sentEta = !block
    ? blockEta + sum(blockGaps(sim, 1, PARAMS.SETTLEMENT_DEPTH))
    : stage !== 'fast'
      ? 0
      : by
        ? (settlementWait(sim, by, now).eta ?? 0)
        : btcEta + sum(blockGaps(sim, sim.tip.weight, 1 + PARAMS.SETTLEMENT_DEPTH));
  const etaAt = (confs: number) =>
    btcConfs > 0
      ? btcEta + Math.max(0, confs - Math.min(btcConfs, confs) - 1) * sim.btcIntervalMs
      : stalled
        ? undefined
        : landsIn(sim, sentEta, btcEta) + (confs - 1) * sim.btcIntervalMs;

  // The data's BTC_FINALITY_CONFS-th confirmation: the milestone the page shows first, counted like a Bitcoin wallet's (D-116)
  const deepStep = (): StepView => {
    const total = PARAMS.BTC_FINALITY_CONFS;
    const label = st.deep(total);
    if (gone) return { key: 'deep', label, state: 'skipped', ink: 'mo' };
    if (stage === 'deep' || stage === 'final') {
      const at = btc.at(fin.closure !== undefined ? fin.closure + total - 1 : undefined);
      return { key: 'deep', label, state: 'done', ink: 'mo', mark: 'deep', ticks: { done: total, total }, ...(at ? { at } : {}) };
    }
    const done = Math.min(btcConfs, total);
    const eta = etaAt(total);
    return {
      key: 'deep',
      label,
      sub: btcConfs > 0 ? st.deepProgress(done, total) : st.deepTodo(total),
      state: btcConfs > 0 ? 'active' : 'todo',
      ink: 'mo',
      ticks: { done, total },
      ...(eta !== undefined ? { eta } : {}),
      ...(stalled && block ? { stuck: true } : {}),
    };
  };

  // BTC-final, the seal that follows: reported once the BTC block that decided the block has BTC_FINALITY_CONFS confirmations too, so at the
  // data's BTC_FINAL_DATA_CONFS-th at the earliest (D-114). It counts nothing of its own (D-116). With the confirmations all there and
  // BTC-final not reported yet (the determination waited), the next BTC block is the next chance, and the note says what it waits for
  const finalStep = (): StepView => {
    const n = PARAMS.BTC_FINALITY_CONFS;
    if (gone) return { key: 'final', label: st.final, state: 'skipped', ink: 'zhu' };
    if (stage === 'final') {
      const at = btc.at(fin.closure !== undefined ? fin.closure + BTC_FINAL_DATA_CONFS - 1 : undefined);
      return { key: 'final', label: st.final, sub: st.finalDone(n), state: 'done', ink: 'zhu', ...(at ? { at } : {}) };
    }
    const eta = etaAt(BTC_FINAL_DATA_CONFS);
    return {
      key: 'final',
      label: st.final,
      sub: btcConfs >= BTC_FINAL_DATA_CONFS ? st.finalWaiting : stage === 'deep' ? st.finalSecuring : st.finalTodo(n),
      state: stage === 'deep' ? 'active' : 'todo',
      ink: 'zhu',
      ...(eta !== undefined ? { eta } : {}),
      ...(stalled && block ? { stuck: true } : {}),
    };
  };

  const onBtcStep = (label: string): StepView => {
    if (gone) return { key: 'on_btc', label, state: 'skipped', ink: 'mo' };
    if (stage === 'on_btc' || stage === 'deep' || stage === 'final') {
      const at = btc.at(onBtc?.btcHeight);
      return {
        key: 'on_btc',
        label,
        sub: onBtc ? `BTC #${fmtInt(onBtc.btcHeight)}` : undefined,
        ...(onBtc ? { ref: btcRef(onBtc.btcHeight) } : {}),
        state: 'done',
        ink: 'mo',
        ...(at ? { at } : {}),
      } as StepView;
    }
    const waitingPast = !!onBtc;
    return {
      key: 'on_btc',
      label,
      ...(onBtc ? { ref: btcRef(onBtc.btcHeight) } : {}),
      sub: waitingPast
        ? st.waitingPast(fmtInt(onBtc.btcHeight))
        : settleStuck
          ? st.stuck(String(settlement?.feeRate ?? '?'), sim.btcMinFeeRate)
          : stage === 'broadcast'
            ? st.nextBtcBlock
            : undefined,
      state: stage === 'broadcast' ? 'active' : 'todo',
      ink: 'mo',
      ...(stage === 'broadcast' && !settleStuck ? { eta: btcEta } : {}),
      ...(settleStuck ? { stuck: true } : {}),
    } as StepView;
  };

  // Ops in a parallel block execute in the chain block that merges it: the moment of fast-lane confirmation is that block's time
  const execAt = block ? (block.side && accepted !== undefined ? (sim.blocks[accepted]?.time ?? block.time) : block.time) : undefined;
  const includedSub = (b: Block) =>
    b.side
      ? st.mergedSide(fmtInt(accepted ?? 0))
      : knownSubmit
        ? `#${fmtInt(b.header.height)} · ${fmtDuration(b.time - r.submittedAt)}`
        : `#${fmtInt(b.header.height)}`;
  // The block the note names: the op's own, or for a parallel block the chain block that merged it
  const includedRef = (b: Block): StepView['ref'] => {
    if (!b.side) return blockRef(b.hash, b.header.height);
    const by = accepted !== undefined ? sim.blocks[accepted] : undefined;
    return by ? blockRef(by.hash, by.header.height) : undefined;
  };

  if (r.path !== 'C') {
    // Ksana: fast-lane confirmation
    if (status === 'skipped') {
      steps.push({ key: 'included', label: st.skipped, sub: skip?.reason, state: 'failed', failMark: 'skipped', ink: 'warn', ...(skip ? { at: skip.at } : {}) });
    } else if (status === 'dropped') {
      steps.push({ key: 'included', label: st.dropped, sub: r.dropped?.reason, state: 'failed', failMark: 'dropped', ink: 'warn', ...(r.dropped ? { at: r.dropped.at } : {}) });
    } else if (!block && ahead) {
      steps.push({
        key: 'included',
        label: st.fast,
        sub: st.behindNative(String(ahead.op.nonce)),
        ref: { to: { name: 'op', id: ahead.id } },
        state: 'active',
        ink: 'qing',
        // The block forcing the path C op in, then the next one; not known while that op's transaction waits to be broadcast by hand
        ...(aheadStuck ? { stuck: true } : byHand(aheadTx) ? {} : { eta: nativeEta(sim, aheadTx, btcEta) + 2 * PARAMS.TARGET_BLOCK_TIME * 1000 }),
      } as StepView);
    } else if (!block) {
      steps.push({
        key: 'included',
        label: st.fast,
        sub: waitedBlocks >= 1 ? st.waited(waitedBlocks) : st.nextFastBlock,
        state: 'active',
        ink: 'qing',
        ...(waitedBlocks < 3 ? { eta: opBlockEta } : { stuck: true }),
      } as StepView);
    } else {
      steps.push({
        key: 'included',
        label: failed ? st.includedFailed : st.fast,
        sub: includedSub(block),
        ...withRef(includedRef(block)),
        state: failed ? 'failed' : 'done',
        ink: 'qing',
        at: execAt ?? block.time,
      });
    }
    // Settlement broadcast: SETTLEMENT_DEPTH more blocks after the chain block that accepts the block whose settlement carries the op
    const depth = accepted !== undefined ? Math.min(sim.tip.header.height - accepted, PARAMS.SETTLEMENT_DEPTH) : 0;
    const broadcastAt = settlement?.broadcastAt;
    if (gone) steps.push({ key: 'broadcast', label: st.broadcast, state: 'skipped', ink: 'mo' });
    else if (!block) steps.push({ key: 'broadcast', label: st.broadcast, state: 'todo', ink: 'mo', ticks: { done: 0, total: PARAMS.SETTLEMENT_DEPTH } });
    else if (stage === 'fast')
      steps.push({
        key: 'broadcast',
        label: st.broadcast,
        sub: carriedBy
          ? carriedBy + (settlement?.status === 'built' ? st.notYetBroadcast : '')
          : by
            ? st.depth(depth, PARAMS.SETTLEMENT_DEPTH)
            : // The block's body waits in the backlog for a later block's settlement (D-077)
              st.awaitingCarrier,
        ...withRef(carriedRef),
        state: 'active',
        ink: 'mo',
        ...settlementWait(sim, by, now),
      });
    else
      steps.push({
        key: 'broadcast',
        label: st.broadcast,
        sub: carriedBy ?? (settlement ? (settlement.kind === 'rescue' ? st.rebuilt(shortHash(settlement.txid, 6, 4)) : shortHash(settlement.txid, 6, 4)) : undefined),
        ...withRef(carriedBy ? carriedRef : settlement ? txRef(sim, settlement.txid) : undefined),
        state: 'done',
        ink: 'mo',
        // The ticks count the blocks the settlement waits for; once it is broadcast they say nothing more
        ...(broadcastAt ? { at: broadcastAt } : {}),
      } as StepView);
    steps.push(onBtcStep(st.onBtc));
    steps.push(deepStep(), finalStep());
  } else {
    const tx = nativeTx;
    const confs = sim.btcConfs(tx?.confirmedHeight);
    const need = nativeConfsOf(sim);
    // Its confirmations all there by its need-th BTC block (with a node, which records no confirmation time)
    const nativeAt = confs >= need && tx?.confirmedHeight !== undefined && !tx.heightAtMost ? (btc.at(tx.confirmedHeight + need - 1) ?? tx.confirmedAt) : undefined;
    steps.push({
      key: 'native',
      label: st.native,
      sub: tx?.confirmedHeight
        ? `${tx.heightAtMost ? '≤\u00a0' : ''}BTC #${fmtInt(tx.confirmedHeight)}`
        : nativeStuck
          ? st.stuck(String(tx?.feeRate ?? '?'), sim.btcMinFeeRate)
          : st.nativeNeed(need),
      ...(tx?.confirmedHeight ? { ref: btcRef(tx.confirmedHeight) } : {}),
      state: confs >= need ? 'done' : 'active',
      ink: 'mo',
      ticks: { done: Math.min(confs, need), total: need },
      ...(confs >= need && nativeAt !== undefined
        ? { at: nativeAt }
        : nativeStuck
          ? { stuck: true }
          : byHand(tx)
            ? {}
            : { eta: btcEta + Math.max(0, need - confs - 1) * sim.btcIntervalMs }),
    } as StepView);
    if (status === 'skipped' || status === 'dropped') {
      steps.push({ key: 'included', label: status === 'skipped' ? st.skipped : st.dropped, sub: skip?.reason ?? r.dropped?.reason, state: 'failed', failMark: status, ink: 'warn' });
    } else if (!block) {
      steps.push({
        key: 'included',
        label: st.forced,
        sub: confs >= need ? st.forcedNext : st.forcedAfterConf,
        state: confs >= need ? 'active' : 'todo',
        ink: 'qing',
        ...(confs >= need ? { eta: opBlockEta } : {}),
      } as StepView);
    } else {
      steps.push({
        key: 'included',
        label: failed ? st.forcedFailed : st.forced,
        sub: block.side ? includedSub(block) : st.forcedAt(fmtInt(block.header.height), r.entryIndex ?? 0),
        ...withRef(includedRef(block)),
        state: failed ? 'failed' : 'done',
        ink: 'qing',
        at: execAt ?? block.time,
      });
    }
    steps.push(onBtcStep(st.headerOnBtc));
    steps.push(deepStep(), finalStep());
  }

  const out: OpProgress = { status, stage, steps, fastConfs, btcConfs, waitedBlocks, suggestNative };
  if (block) {
    out.block = block;
    if (knownSubmit) out.fastLatency = Math.max(0, (execAt ?? block.time) - r.submittedAt);
  }
  if (settlement) out.settlement = settlement;
  if (skipNote) out.skipNote = skipNote;
  if (btc.ask.length) out.btcAsk = btc.ask;
  return out;
}

/** A block's life: produced (Ksana) → (parallel block: merged) → settlement broadcast → written to Bitcoin → BTC_FINALITY_CONFS Bitcoin confirmations → BTC final (eternity) */
export function blockProgress(sim: Chain, b: Block, now: number): OpProgress {
  const stage = blockStage(sim, b);
  const settlement = b.needsSettlement ? bodySettlement(sim, b) : headerCarrier(sim, b);
  // The block whose settlement takes the data to Bitcoin: this one, or a later one carrying a body from the backlog or a header (D-077)
  const by = b.needsSettlement ? bodyCarrierBlock(sim, b) : settlement?.kind === 'settlement' && settlement.forBlock ? sim.getBlock(settlement.forBlock) : undefined;
  const carriedAt = b.needsSettlement ? carrierHeight(sim, b) : undefined;
  const onBtc = dataOnBtc(b);
  const accepted = b.acceptedHeight;
  const settled = accepted !== undefined && accepted <= sim.settledHeight;
  const fin = finalityConfs(sim, b);
  const btcConfs = fin.confs;
  const depth = accepted !== undefined ? Math.min(sim.tip.header.height - accepted, PARAMS.SETTLEMENT_DEPTH) : 0;
  const btcEta = Math.max(0, expectedBtcBlockAt(sim, now) - now);
  const total = BTC_FINAL_DATA_CONFS;
  const n = PARAMS.BTC_FINALITY_CONFS;
  const stuck = !!settlement && settlement.status === 'broadcast' && !sim.canConfirm(settlement);
  const m = t().status;
  const st = m.step;
  const btc = btcStepTimes(sim);
  const steps: StepView[] = [
    {
      key: 'mined',
      label: b.side ? st.minedSide : st.mined,
      sub: sim.labels.get(b.header.producer) ?? m.producer,
      ref: { to: { name: 'account', id: b.header.producer } },
      state: 'done',
      ink: 'qing',
      at: b.time,
    },
  ];
  if (b.side) {
    const by = accepted !== undefined ? sim.blocks[accepted] : undefined;
    steps.push({
      key: 'merged',
      label: st.merged,
      sub: by ? st.mergedBy(fmtInt(by.header.height)) : st.mergeWaiting,
      ...withRef(by ? blockRef(by.hash, by.header.height) : undefined),
      state: by ? 'done' : 'active',
      ink: 'qing',
      ...(by ? { at: by.time } : { eta: blocksEta(sim, 1, now) }),
    });
  }
  const isBroadcast = stage === 'broadcast' || stage === 'on_btc' || stage === 'deep' || stage === 'final';
  // A settlement the block sent itself, named by its ID: a block with a body, or a block without one whose settlement carries bodies
  // from the backlog and with them its own header (D-077), which its page would otherwise name by its own height
  const ownTx = (s: BtcTx) => (s.kind === 'rescue' ? st.rebuilt(shortHash(s.txid, 6, 4)) : shortHash(s.txid, 6, 4));
  const ownCarrier = ownHeaderCarrier(b, settlement);
  steps.push({
    key: 'broadcast',
    label: b.needsSettlement ? st.broadcast : st.headerCarried,
    sub: b.needsSettlement
      ? carriedAt !== undefined
        ? st.carriedBy(fmtInt(carriedAt)) + (!isBroadcast && settlement?.status === 'built' ? st.notYetBroadcast : '')
        : isBroadcast
          ? settlement
            ? ownTx(settlement)
            : undefined
          : accepted === undefined
            ? st.afterMerge
            : by
              ? st.depth(depth, PARAMS.SETTLEMENT_DEPTH)
              : // Its body waits in the backlog for a later block's settlement (D-077)
                st.awaitingCarrier
      : settlement
        ? (settlement.kind === 'headers'
            ? st.carriedByHeaders
            : ownCarrier
              ? ownTx(settlement)
              : settlement.forHeight !== undefined
                ? st.carriedBy(fmtInt(settlement.forHeight))
                : st.carriedByOther) + (settlement.status === 'built' ? st.notYetBroadcast : '')
        : // A header on Bitcoin went with a transaction the page has not read (a later block's settlement, a republish): it waits for nothing
          isBroadcast
          ? undefined
          : st.awaitingCarrier,
    // The note names the block whose settlement carries the data, or else the transaction itself
    ...withRef(
      b.needsSettlement
        ? carriedAt !== undefined && b.carrier
          ? blockRef(b.carrier, carriedAt)
          : isBroadcast && settlement
            ? txRef(sim, settlement.txid)
            : undefined
        : settlement
          ? ownCarrier
            ? txRef(sim, settlement.txid)
            : settlement.kind !== 'headers' && settlement.forHeight !== undefined
              ? blockRef(settlement.forBlock ?? String(settlement.forHeight), settlement.forHeight)
              : { to: txRoute(sim, settlement.txid) }
          : undefined,
    ),
    state: isBroadcast ? 'done' : accepted === undefined ? 'todo' : 'active',
    ink: 'mo',
    // The ticks count the blocks the settlement waits for; once it is broadcast they say nothing more
    ...(isBroadcast
      ? settlement?.broadcastAt
        ? { at: settlement.broadcastAt }
        : {}
      : accepted === undefined
        ? { ticks: { done: 0, total: PARAMS.SETTLEMENT_DEPTH } }
        : settlementWait(sim, by, now)),
  } as StepView);
  const onBtcAt = settled && onBtc ? btc.at(onBtc.btcHeight) : undefined;
  steps.push({
    key: 'on_btc',
    label: st.onBtc,
    sub: settled && onBtc
      ? `BTC #${fmtInt(onBtc.btcHeight)}`
      : onBtc
        ? st.waitingPast(fmtInt(onBtc.btcHeight))
        : stuck
          ? st.stuck(String(settlement?.feeRate ?? '?'), sim.btcMinFeeRate)
          : undefined,
    ...(onBtc ? { ref: btcRef(onBtc.btcHeight) } : {}),
    state: settled ? 'done' : isBroadcast ? 'active' : 'todo',
    ink: 'mo',
    ...(settled && onBtcAt ? { at: onBtcAt } : isBroadcast && !stuck ? { eta: btcEta } : {}),
    ...(stuck ? { stuck: true } : {}),
  } as StepView);
  // The data's BTC_FINALITY_CONFS-th confirmation, the milestone shown first, then BTC-final, the seal that counts nothing of its own (D-116)
  const deep = stage === 'deep' || stage === 'final';
  const deepAt = deep && fin.closure !== undefined ? btc.at(fin.closure + n - 1) : undefined;
  const etaAt = (confs: number) => btcEta + Math.max(0, confs - Math.min(btcConfs, confs) - 1) * sim.btcIntervalMs;
  steps.push({
    key: 'deep',
    label: st.deep(n),
    sub: deep ? undefined : settled ? st.deepProgress(Math.min(btcConfs, n), n) : st.deepTodo(n),
    state: deep ? 'done' : settled ? 'active' : 'todo',
    ink: 'mo',
    ...(deep ? { mark: 'deep' } : {}),
    // A final block's confirmations are all there, also where the page does not know the BTC height that counts them (an older block)
    ticks: { done: deep ? n : Math.min(btcConfs, n), total: n },
    ...(deepAt ? { at: deepAt } : settled && !deep ? { eta: etaAt(n) } : {}),
  } as StepView);
  const finalAt = stage === 'final' && fin.closure !== undefined ? btc.at(fin.closure + total - 1) : undefined;
  steps.push({
    key: 'final',
    label: st.final,
    sub: stage === 'final' ? st.finalDone(n) : btcConfs >= total ? st.finalWaiting : stage === 'deep' ? st.finalSecuring : st.finalTodo(n),
    state: stage === 'final' ? 'done' : stage === 'deep' ? 'active' : 'todo',
    ink: 'zhu',
    ...(finalAt ? { at: finalAt } : settled ? { eta: etaAt(total) } : {}),
  } as StepView);
  const out: OpProgress = {
    status: stage === 'final' ? 'btc_final' : stage === 'unmerged' ? 'pending' : 'fast_confirmed',
    stage,
    steps,
    block: b,
    fastConfs: accepted !== undefined ? sim.tip.header.height - accepted + 1 : 0,
    btcConfs,
    waitedBlocks: 0,
    suggestNative: false,
  };
  if (settlement) out.settlement = settlement;
  if (btc.ask.length) out.btcAsk = btc.ask;
  return out;
}

/** The single status marker used in lists, which the notifications about an operation sent from the wallet follow (`opNews`) */
export function opStage(sim: Chain, r: OpRecord): Stage {
  const status = opStatusOf(sim, r);
  if (status === 'skipped' || status === 'dropped' || status === 'failed' || status === 'pending') return status;
  const b = r.blockHash ? sim.getBlock(r.blockHash) : undefined;
  return b ? blockStage(sim, b) : 'pending';
}

/** How far toward Bitcoin a stage has come: Bitcoin's stages are announced on the way up only */
const BTC_RANK: Record<Stage, number> = { pending: 0, unmerged: 0, failed: 0, skipped: 0, dropped: 0, fast: 1, broadcast: 2, on_btc: 3, deep: 4, final: 5 };

/** What a notification about an operation sent from the wallet announces (`opMilestone`) */
export type Milestone = 'taken_back' | 'failed' | 'dropped' | 'skipped' | 'fast' | 'on_btc' | 'deep' | 'final';

/**
 * The news in an operation's move from the mark last seen (`prev`, undefined when first seen) to `stage`, its mark as the lists show
 * it (`opStage`), one notification a milestone, in the order they are announced. Its inclusion is announced as fast confirmation, or
 * as the failure when its execution failed: a failed operation's mark is its failure, whatever its block's stage, so none of Bitcoin's
 * stages is announced for it (they would read as its transfer or call written to Bitcoin and BTC-final), nor their taking back.
 * Bitcoin's stages only on the way up: a BTC reorg taking one back is no progress to announce, and one reached again is announced
 * again, as is an inclusion in another block. BTC-final taken back is news of its own: the node no longer reports the block final,
 * after a BTC reorg of BTC_FINALITY_CONFS blocks or more reached the BTC block that decided it (D-114), or while a node that restarted
 * has yet to decide again (it reports the decision's root until then), which the page cannot tell apart. An operation that falls from
 * BTC-final straight to its end (executed again in another block after such a reorg, and failed there, or skipped or dropped) gets
 * both, the warning first
 */
export function opMilestone(prev: Stage | undefined, stage: Stage): Milestone[] {
  if (prev === stage) return [];
  // Its end: its failure, announced when it is included, its skip or its drop
  const end: Milestone[] = stage === 'failed' || stage === 'skipped' || stage === 'dropped' ? [stage] : [];
  if (prev === 'final') return ['taken_back', ...end];
  if (end.length) return end;
  if (prev !== undefined && BTC_RANK[stage] <= BTC_RANK[prev]) return [];
  // Included, seen first fast-confirmed or with its settlement already broadcast
  if (stage === 'fast' || (stage === 'broadcast' && (prev === undefined || BTC_RANK[prev] === 0))) return ['fast'];
  return stage === 'on_btc' || stage === 'deep' || stage === 'final' ? [stage] : [];
}

/**
 * What a look of the wallet's watcher (`OpWatcher`) finds to announce about an operation sent from the wallet: the news in its move
 * from the mark announced last (`seen`, by operation ID, which this keeps) to its mark as the lists show it (`opStage`), as
 * `opMilestone` reads it, with the summary its notifications name it by. None while its block has left the page's cache (long
 * BTC-final, far below the tip: it would read as pending) or while its amount is in an asset the node has yet to name (a toast keeps
 * the words it was given): the mark announced stays until then
 */
export function opNews(sim: Chain, r: OpRecord, seen: Map<Hex, Stage>): { news: Milestone[]; sum: OpSummary } | undefined {
  if (r.blockHash && !sim.getBlock(r.blockHash)) return undefined;
  const stage = opStage(sim, r);
  const prev = seen.get(r.id);
  if (prev === stage) return undefined;
  const sum = summarizeOp(sim, r);
  if (sum.amount?.asset.pending) return undefined;
  seen.set(r.id, stage);
  return { news: opMilestone(prev, stage), sum };
}

/**
 * An operation as the wallet's notifications name it, in the words of the lists: its verb and its amount, and after them what a swap
 * gives or what a claim proves ("Swap 90,000 TKN → KSA"); `shown` writes the amount, or hides it with the balances
 */
export function opWhat(sum: OpSummary, shown: (value: bigint, decimals: number) => string): string {
  const tail = sum.detail ? ` ${sum.detail}` : '';
  return sum.amount ? t().shell.toast.what(sum.verb, shown(sum.amount.value, sum.amount.asset.decimals), sum.amount.asset.symbol + tail) : sum.verb + tail;
}

// =====================================================================
// Plain-language descriptions of operations
// =====================================================================

export interface OpSummary {
  verb: string;
  amount?: { value: bigint; asset: AssetMeta };
  counterparty?: Hex;
  contract?: Hex;
  detail?: string;
}

export function summarizeOp(sim: Chain, r: OpRecord): OpSummary {
  const a = r.op.action;
  const v = t().status.verb;
  // A transfer of a built-in asset, or of a KS-20 token the page knows, which is a call to the token (D-123)
  const sent = transferOf(sim, a);
  if (sent) return sent.asset ? { verb: v.transfer, amount: { value: sent.amount, asset: sent.asset }, counterparty: sent.to } : { verb: v.transfer, counterparty: sent.to };
  if (a.kind === 'AssetTransfer') return { verb: v.transfer, counterparty: a.to };
  // The simulator names its demo contracts; the node data source shows the contract a deployment created by its ID (a failed one created none)
  if (a.kind === 'Deploy') return a.contract && r.result?.ok !== false ? { verb: v.deploy, contract: a.contract } : { verb: v.deploy, detail: a.name };
  // A swap of the simulator's pool: the amount names what goes in, the detail what comes out ("Swap 90,000 TKN → KSA")
  if (a.contract === sim.ammContract && a.method === 'swap') {
    const inKsa = a.args.asset_in === 'KSA';
    const asset = sim.assets.get(inKsa ? KSA_ASSET_ID : sim.tokenAsset);
    return asset ? { verb: v.swap, amount: { value: BigInt(a.args.amount_in ?? 0), asset }, contract: a.contract, detail: inKsa ? '→ TKN' : '→ KSA' } : { verb: v.swap, contract: a.contract };
  }
  if (a.contract === sim.triggerContract && a.method === 'claim') return { verb: v.claim, contract: a.contract, detail: v.claimDetail(String(a.args.btc_height)) };
  // A contract without a name here (the node data source knows none) is shown by its ID, not called unknown
  return { verb: v.call(a.method), contract: a.contract };
}

export const PATH_LABEL: Record<Path, string> = localized(() => t().status.path);
export const PATH_DESC: Record<Path, string> = localized(() => t().status.pathDesc);

export const FAIL_LABEL: Record<string, string> = localized(() => t().status.fail);

// =====================================================================
// Accounts
// =====================================================================

export interface BalanceRow {
  asset: AssetMeta;
  available: bigint;
}

/**
 * Whether the account has any record on-chain (nonce, balance or related ops). The node returns an empty account for any public
 * key, so whether the lookup found something is not enough; when the node data source has not fetched this account yet, returns
 * undefined and draws no conclusion.
 */
export function accountHasRecord(sim: Chain, id: Hex): boolean | undefined {
  const a = sim.peekAccount(id);
  if (!a) return sim.kind === 'rpc' ? undefined : false;
  return a.nonce > 0 || a.opIds.length > 0 || [...a.balances.values()].some((v) => v > 0n);
}

/**
 * A built-in asset or a KS-20 token by its ID (D-123), as a balance names it: a token is its contract, whose ID names no built-in asset
 * (an asset's ID is a hash of its issuer's and a sub-ID, D-121). An `AssetTransfer` names a built-in asset only: read it from `assets`
 */
export function assetOf(sim: Chain, id: Hex): AssetMeta | undefined {
  return sim.assets.get(id) ?? (sim.kind === 'rpc' ? sim.tokenBook.assets.get(id) : undefined);
}

/** What a transfer moves (D-123): an `AssetTransfer` of a built-in asset, or a known KS-20 token's `transfer(to, amount)` call */
export interface TransferView {
  /** Undefined while the page does not know the asset */
  asset: AssetMeta | undefined;
  /** The built-in asset's ID, or the token contract's */
  id: Hex;
  to: Hex;
  amount: bigint;
  token: boolean;
}

export function transferOf(sim: Chain, a: Action): TransferView | undefined {
  if (a.kind === 'AssetTransfer') return { asset: sim.assets.get(a.asset), id: a.asset, to: a.to, amount: a.amount, token: false };
  if (a.kind !== 'Call' || sim.kind !== 'rpc' || sim.tokenBook.standardOf(a.contract) !== 'KS-20') return undefined;
  const args = ks20TransferArgs(a);
  return args && { asset: sim.tokenBook.assets.get(a.contract), id: a.contract, ...args, token: true };
}

/**
 * The arguments of a call of `transfer(to, amount)` with no funds, the KS-20 transfer if the contract is a token: its Borsh (STANDARDS
 * §3.1), the recipient's 32 bytes, then the amount, a u128 in little-endian
 */
export function ks20TransferArgs(a: Action): { to: Hex; amount: bigint } | undefined {
  if (a.kind !== 'Call' || a.method !== 'transfer' || a.funds?.length) return undefined;
  const raw = a.args.borsh;
  if (typeof raw !== 'string' || !/^[0-9a-f]{96}$/.test(raw)) return undefined;
  let amount = 0n;
  for (let i = 94; i >= 64; i -= 2) amount = (amount << 8n) | BigInt(Number.parseInt(raw.slice(i, i + 2), 16));
  return { to: raw.slice(0, 64), amount };
}

export function balancesOf(sim: Chain, id: Hex): BalanceRow[] {
  const acc = sim.peekAccount(id);
  if (!acc) return [];
  const rows: BalanceRow[] = [];
  for (const [assetId, v] of acc.balances) {
    const asset = sim.assets.get(assetId);
    if (asset && (v > 0n || assetId === KSA_ASSET_ID)) rows.push({ asset, available: v });
  }
  // The KS-20 tokens the node's index adds up for it (D-123), among the built-in assets
  if (sim.kind === 'rpc') {
    for (const [contract, v] of acc.tokens ?? []) {
      const asset = sim.tokenBook.assets.get(contract);
      if (asset && v > 0n) rows.push({ asset, available: v });
    }
  }
  // The node only returns non-zero balances: KSA is always listed
  const ksa = sim.assets.get(KSA_ASSET_ID);
  if (ksa && !acc.balances.has(KSA_ASSET_ID)) rows.push({ asset: ksa, available: 0n });
  // KSA first, then the tokens by symbol in natural order ("Token 9" before "Token 10"); two of one symbol by name, then by ID. A token
  // named like a native coin comes last (the review of M33)
  const natural = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
  const last = (a: AssetMeta) => (a.lookalike ? 1 : 0);
  rows.sort((x, y) =>
    x.asset.id === KSA_ASSET_ID
      ? -1
      : y.asset.id === KSA_ASSET_ID
        ? 1
        : last(x.asset) - last(y.asset) || natural(x.asset.symbol, y.asset.symbol) || natural(x.asset.name, y.asset.name) || (x.asset.id < y.asset.id ? -1 : x.asset.id > y.asset.id ? 1 : 0),
  );
  return rows;
}

/** The KS-721 collections an account holds NFTs of, as the node's index counts them (D-123), by symbol, a collection named like a native coin last */
export function collectionsOf(sim: Chain, id: Hex): { collection: CollectionMeta; count: bigint }[] {
  if (sim.kind !== 'rpc') return [];
  const acc = sim.peekAccount(id);
  const rows: { collection: CollectionMeta; count: bigint }[] = [];
  for (const [contract, count] of acc?.collections ?? []) {
    const collection = sim.tokenBook.collections.get(contract);
    if (collection && count > 0n) rows.push({ collection, count });
  }
  const natural = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
  rows.sort(
    (x, y) =>
      (x.collection.lookalike ? 1 : 0) - (y.collection.lookalike ? 1 : 0) ||
      natural(x.collection.symbol, y.collection.symbol) ||
      (x.collection.id < y.collection.id ? -1 : x.collection.id > y.collection.id ? 1 : 0),
  );
  return rows;
}

export function lockedFeesOf(sim: Chain, producer: Hex): { locked: bigint; unlocked: bigint; rows: LockedFee[] } {
  let locked = 0n;
  let unlocked = 0n;
  const rows: LockedFee[] = [];
  for (const f of sim.lockedFees.values()) {
    if (f.producer !== producer) continue;
    rows.push(f);
    if (f.unlocked) unlocked += f.amount;
    else locked += f.amount;
  }
  rows.sort((a, b) => b.height - a.height);
  return { locked, unlocked, rows };
}

export type UtxoState = 'available' | 'unconfirmed' | 'spent';

export function utxoState(u: Utxo): UtxoState {
  if (u.spentBy) return 'spent';
  if (u.confirmedHeight === null) return 'unconfirmed';
  return 'available';
}

// =====================================================================
// Search
// =====================================================================

export type SearchKind = 'block' | 'op' | 'account' | 'contract' | 'asset' | 'tx' | 'btc_block';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  sub?: string;
}

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = localized(() => t().status.searchKind);

/** Whether it is a BTC address. An account's Taproot address is the bech32m spelling of the account itself (D-092); sim.accountOfAddress converts it back to the account */
export function isBtcAddress(q: string): boolean {
  try {
    decodeAddress(q.trim());
    return true;
  } catch {
    return false;
  }
}

export function search(sim: Chain, raw: string, limit = 8): SearchHit[] {
  // What an input method typed full width (a height, a name) is read as typed half width, as the names it is matched against
  const q = halfWidth(raw).trim();
  if (!q || !sim.ready) return [];
  const hits: SearchHit[] = [];
  const push = (h: SearchHit) => {
    if (hits.length < limit && !hits.some((x) => x.kind === h.kind && x.id === h.id)) hits.push(h);
  };

  const m = t().status;
  const num = q.replace(/^#/, '').replace(/,/g, '');
  if (/^\d+$/.test(num)) {
    const n = Number(num);
    if (n <= sim.tip.header.height) push({ kind: 'block', id: String(n), title: m.fastBlock(fmtInt(n)) });
    for (const s of sim.sideAt(n)) push({ kind: 'block', id: s.hash, title: m.sideBlock(fmtInt(n)), sub: shortHash(s.hash) });
    if (btcBlockAt(sim, n)) push({ kind: 'btc_block', id: String(n), title: m.btcBlock(fmtInt(n)), sub: sim.kind === 'rpc' ? sim.network : 'regtest' });
    return hits;
  }

  if (isBtcAddress(q)) {
    // A Taproot address is the account (D-092): convert it back; other address types (bc1q, 1..., 3...) correspond to no account
    const id = sim.accountOfAddress(q);
    if (id) {
      const known = sim.labels.has(id) || sim.peekAccount(id) !== undefined;
      push({ kind: 'account', id, title: sim.labels.get(id) ?? (known || sim.kind === 'sim' ? m.search.account : m.search.byAccount), sub: known || sim.kind === 'sim' ? shortHash(q, 10, 6) : m.search.askNode });
    }
    return hits;
  }

  const hex = q.toLowerCase().replace(/^0x/, '');
  if (/^[0-9a-f]{4,64}$/.test(hex)) {
    const exact = hex.length === 64;
    const match = (id: string) => (exact ? id === hex : id.startsWith(hex));
    for (let i = sim.blocks.length - 1; i >= 0 && hits.length < limit; i--) {
      const b = sim.blocks[i];
      if (b && match(b.hash)) push({ kind: 'block', id: b.hash, title: m.fastBlock(fmtInt(b.header.height)), sub: shortHash(b.hash) });
    }
    for (const b of sim.sideBlocks) if (match(b.hash)) push({ kind: 'block', id: b.hash, title: m.sideBlock(fmtInt(b.header.height)), sub: shortHash(b.hash) });
    for (let i = sim.opOrder.length - 1; i >= 0 && hits.length < limit; i--) {
      const id = sim.opOrder[i] as string;
      if (match(id)) push({ kind: 'op', id, title: m.search.op, sub: shortHash(id) });
    }
    for (const a of knownAssets(sim)) if (match(a.id)) push({ kind: 'asset', id: a.id, title: a.symbol, sub: shortHash(a.id) });
    for (const id of sim.kind === 'rpc' ? sim.knownContracts() : sim.contracts.keys()) {
      if (match(id)) push({ kind: 'contract', id, title: sim.contracts.get(id)?.name ?? m.search.contract, sub: shortHash(id) });
    }
    for (const id of sim.accounts.keys()) {
      if (sim.isContract(id)) continue;
      if (match(id)) push({ kind: 'account', id, title: sim.labels.get(id) ?? m.search.account, sub: shortHash(id) });
    }
    for (const tx of sim.allBtcTxs()) if (match(tx.txid)) push({ kind: 'tx', id: tx.txid, title: TX_KIND_LABEL[tx.kind], sub: shortHash(tx.txid) });
    // Node data source: a full hash missing from the cache is left to the detail page to ask the node (block hashes, op_ids and account public keys look alike, so list them all)
    if (exact && hits.length === 0 && sim.kind === 'rpc') {
      push({ kind: 'block', id: hex, title: m.search.byBlockHash, sub: m.search.askNode });
      push({ kind: 'op', id: hex, title: m.search.byOpId, sub: m.search.askNode });
      if (isValidXOnlyPublicKey(fromHex(hex, 32))) push({ kind: 'account', id: hex, title: m.search.byAccount, sub: m.search.askNode });
      push({ kind: 'asset', id: hex, title: m.search.byAsset, sub: m.search.askNode });
    }
    return hits;
  }

  const lower = q.toLowerCase();
  // Assets by symbol or name: anyone can name an asset anything, so each shows by its symbol, its ID beside it (STANDARDS §7)
  for (const a of knownAssets(sim)) {
    if (a.symbol.toLowerCase().includes(lower) || a.name.toLowerCase().includes(lower)) push({ kind: 'asset', id: a.id, title: a.symbol, sub: shortHash(a.id) });
  }
  // Names in their order ("Producer 1" before "Producer 2"), not in the order the page came across them
  const named = [...sim.labels].sort(([, x], [, y]) => x.localeCompare(y, undefined, { numeric: true }));
  for (const [id, label] of named) {
    if (halfWidth(label).toLowerCase().includes(lower)) {
      push({ kind: sim.isContract(id) ? 'contract' : 'account', id, title: label, sub: shortHash(id) });
    }
  }
  return hits;
}

/**
 * Why a search finds nothing, where the query says it (the search page, an account's page for an address): a height no block is at
 * yet, or a Bitcoin address that is no account here, being of another Bitcoin network, not a Taproot one (D-092), or a Taproot one
 * that no key stands behind (its program is no valid x-only key)
 */
export type SearchMiss =
  | { kind: 'aboveTip'; tip: number; btcTip?: number }
  | { kind: 'otherNetwork'; networks: BtcNetwork[] }
  | { kind: 'notTaproot'; address: string }
  | { kind: 'noKey'; address: string };

export function searchMiss(sim: Chain, raw: string): SearchMiss | undefined {
  const q = halfWidth(raw).trim();
  if (!q || !sim.ready) return undefined;
  const num = q.replace(/^#/, '').replace(/,/g, '');
  if (/^\d+$/.test(num)) {
    const n = Number(num);
    const tip = sim.tip.header.height;
    // A main-chain block, a parallel one or one of Bitcoin's at it, which the search lists
    if (n <= tip || sim.sideAt(n).length || btcBlockAt(sim, n)) return undefined;
    // Past Bitcoin's tip too, no block of either chain is at it; below the BTC blocks the page covers, one of Bitcoin's may be
    return n > sim.btcTip.height ? { kind: 'aboveTip', tip, btcTip: sim.btcTip.height } : { kind: 'aboveTip', tip };
  }
  let networks: BtcNetwork[];
  let script: Uint8Array;
  try {
    ({ networks, script } = decodeAddress(q));
  } catch {
    return undefined;
  }
  if (!networks.includes(btcNetworkOf(sim) as BtcNetwork)) return { kind: 'otherNetwork', networks };
  if (script.length !== 34 || script[0] !== 0x51 || script[1] !== 0x20) return { kind: 'notTaproot', address: q };
  // A Taproot address of the page's network is an account, which the search lists, unless no key stands behind it
  return sim.accountOfAddress(q) ? undefined : { kind: 'noKey', address: q };
}

/** Why an account's page for `raw` has no account (`searchMiss`): an address that is none here; a height says nothing of an account */
export function accountMiss(sim: Chain, raw: string): SearchMiss | undefined {
  const miss = searchMiss(sim, raw);
  return miss?.kind === 'aboveTip' ? undefined : miss;
}

/**
 * The tip a block's page gives where the node has no block at its height: a height above the main chain's tip that no parallel block
 * the page knows is at either, which is why there is none yet; undefined for a hash or any other height
 */
export function blockAhead(sim: Chain, id: string): number | undefined {
  if (!/^\d+$/.test(id)) return undefined;
  const n = Number(id);
  const tip = sim.tip.header.height;
  return n > tip && !sim.sideAt(n).length ? tip : undefined;
}

/** The Bitcoin networks an address is for, in the page's language: "mainnet", "testnet or signet", "testnet, signet or regtest" */
export function networksText(nets: readonly string[]): string {
  const m = t().search.miss;
  const last = nets[nets.length - 1] ?? '';
  return nets.length < 2 ? last : m.or(nets.slice(0, -1).join(m.comma), last);
}

/** The assets, tokens and collections the page knows, by symbol: those it has yet to name left out */
function knownAssets(sim: Chain): { id: Hex; symbol: string; name: string }[] {
  const all: { id: Hex; symbol: string; name: string; pending?: boolean }[] = [...sim.assets.values()];
  if (sim.kind === 'rpc') all.push(...sim.tokenBook.assets.values(), ...sim.tokenBook.collections.values());
  return all.filter((a) => !a.pending).sort((x, y) => x.symbol.localeCompare(y.symbol, undefined, { numeric: true }));
}

export const TX_KIND_LABEL: Record<BtcTx['kind'], string> = localized(() => t().status.txKind);

export const TX_STATUS_LABEL: Record<BtcTx['status'], string> = localized(() => t().status.txStatus);
