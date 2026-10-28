/**
 * The node JSON-RPC data source: reads `ksana-node` (and the optional `ksana-indexer`) through the `@ksana/sdk` clients and
 * arranges the result into the same data model as the simulator, so the pages and the derivations (views.ts, wallet/model.ts)
 * do not distinguish between data sources.
 *
 * The node only offers per-block, per-object queries (core/docs/RPC.md), so here we:
 * - subscribe to new blocks (WebSocket, polling when it cannot connect), walk the main chain back along the selected parents
 *   and detect main-chain switches; fetch the most recent stretch of the main chain and the parallel blocks it merges, and
 *   while a page lists history, the blocks of the operations the node lists for it (`ksana_getAccountOps` /
 *   `ksana_getLatestOps`, D-111; from a node without them, older blocks one by one, D-110);
 * - infer the settled / BTC-final heights from the `settled` / `btc_final` of each block's `ksana_getSettlement` (only for
 *   blocks with a settlement transaction, D-069), the BTC-final one never above the BTC-final tip the node reports (`finalized` of
 *   `ksana_getChainInfo`, D-114);
 * - on the BTC side know only the anchor blocks and the blocks holding settlement confirmations, not the other transactions in
 *   those blocks, nor input amounts and fees;
 * - in the entry pool know only the operations submitted by this page and not yet included (the node has no interface that
 *   lists the entry pool).
 * Quantities that cannot be inferred are marked "not provided by this data source" in the UI instead of guessed.
 *
 * The node's chain ID must be that of the network the page is set to (A2-11, D-106): it is read before the first sync shows
 * anything and again before anything is signed (`checkChain`); a node on another network, on mainnet (which this page does not
 * support yet) or on none is refused with the SDK's `ChainMismatchError`.
 */

import {
  type AccountInfo,
  type AssetInfo,
  type BlockInfo,
  type BtcNetwork,
  type ChainInfo,
  DEVNET,
  type FeeEstimate as SdkFeeEstimate,
  type Funds as SdkFunds,
  IndexerRpcClient,
  type IndexerStatus,
  KsanaRpcClient,
  MAX_OPS_LIMIT,
  type OpList,
  type OpListOptions,
  type OpPosition,
  type OpStatus as SdkOpStatus,
  type Params,
  RPC_ERROR_CODES,
  RpcError,
  RpcTransportError,
  SIGNET,
  type SettlementInfo,
  VMOP_VERSION,
  type VmOp as SdkVmOp,
  accountFromAddress,
  accountOf,
  accountToAddress,
  emptyEntriesRoot,
  encodeVmOp,
  feeFor,
  fromHex,
  getLock,
  nativeOpFromTx,
  opCost,
  p2trScriptFromOutputKey,
  paramsForChainId,
  subscribeBlocks,
  toHex,
  vmopSighash,
} from '@ksana/sdk';
import { KSA_ASSET_ID, KSA_DECIMALS, NODE_POLICY, PARAMS, anchorDepthOf, emptyBlockWeight } from '../params';
import { lazy, onLocaleChange, t, withText } from '../../i18n';
import { clipText } from '../../lib/format';
import { cleanAssetName, nativeLookalike } from '../assetNames';
import { pathCFee } from '../fees';
import { tallyCheck, type BacklogStatus, type ExchangeLockView, type FeeEstimate, type IndexerTally } from '../model';
import { BtcRpc } from '../../wallet/btc';
import { BtcTipReader, type TipChannel, pageHidden, tabsChannel, whenShown } from './btcTip';
import { type BatchingFetch, MAX_BATCH, batchingFetch } from './batch';
import { TokenBook, eventAccounts } from './tokens';
import type {
  AccountState,
  Action,
  AssetChange,
  AssetMeta,
  Funds,
  Block,
  BtcBlock,
  BtcTx,
  ChainEvent,
  ContractMeta,
  EntryRecord,
  Hex,
  IndexerCheck,
  LockedFee,
  OnBtc,
  OpRecord,
  OutPoint,
  Path,
  Producer,
  Utxo,
  VmOp,
} from '../types';
import {
  type FundingOut,
  addressOfScript,
  blockDataBytes,
  btcHex,
  entryDataBytes,
  entryOp,
  opBytesOf,
  opIdOf,
  parseFunding,
  parseNativeTx,
  parseSettlement,
  pathOf,
  toEntry,
  toHeader,
  toResult,
  toVmOp,
} from './convert';

export interface RpcConfig {
  /** The node's JSON-RPC (HTTP), e.g. `http://127.0.0.1:18545`; may also be a same-origin reverse-proxy path, e.g. `/rpc` */
  url: string;
  /** The indexer's JSON-RPC (optional, D-048); ksana-indexer has no cross-origin setting, so a browser can only reach it through a same-origin proxy */
  indexerUrl?: string;
  /** The fast-lane network: devnet (BTC regtest) or signet (D-055); determines the chain ID and the address prefix */
  chain: 'devnet' | 'signet';
  /**
   * bitcoind's JSON-RPC (optional, through a same-origin proxy such as `/btc`): the wallet uses it to list UTXOs, broadcast
   * transactions and read the BTC height for path C or a top-up; without it the Unisat extension's interface is used, and
   * failing that manual entry and manual broadcast (wallet/btc.ts)
   */
  btcUrl?: string;
}

/**
 * What a page asks the node for when the cache lacks it: a block, an operation, an account, an asset (a built-in one, or a token or a
 * collection the node's index knows, D-123), or what a BTC block's page shows (`readBtcBlock`)
 */
export type LookupKind = 'block' | 'op' | 'account' | 'asset' | 'btc';

/** What a history view lists: an account's operations, or the latest operations of the whole chain */
export type HistoryKey = Hex | 'latest';

/**
 * How far a history view's list reaches (`history`): through the node's operation listing (D-111): `listed` operations so far,
 * `complete` once it reached the genesis block, `paused` when more are left but the view's budget is used up (the button below
 * the list raises it); or, from a node without the listings, by reading blocks down from the tip, `from` being the lowest
 * height read (D-110)
 */
export type HistoryState =
  | { source: 'listing'; loading: boolean; complete: boolean; paused: boolean; listed: number; error?: string }
  | { source: 'blocks'; loading: boolean; from: number };

/** A history view's listing of the node (D-111) */
interface Listing {
  /** Where the next page starts: undefined before the first page, null once the listing reached the genesis block */
  next: OpPosition | null | undefined;
  /** Operations listed so far, and how many the view may have listed before it waits for the button (`loadEarlier`) */
  listed: number;
  budget: number;
  loading: boolean;
  /** When a view last asked: the listing lapses HISTORY_MS later */
  at: number;
  /** The blocks of the listed operations, kept from pruning while a view asks */
  blocks: Set<Hex>;
  /** The earliest operation listed that neither failed nor was skipped, which a contract's deployment comes before (`searchDeployment`) */
  floor?: OpPosition;
  /** The last failure: asked again after RECHECK_MS, or at once by the button */
  error?: { message: string; at: number };
}

/** A contract page's search for its deployment (`wantDeployment`): `done` once it found it or gave up */
interface DeploySearch {
  loading: boolean;
  done: boolean;
  /** When a page last asked: the search lapses HISTORY_MS later */
  at: number;
  /** The last failure: searched again after RECHECK_MS */
  error?: { message: string; at: number };
  /** When the deployment, found but dropped from the cache since, was last asked for by its ID */
  refetchAt?: number;
  /** Asked for by its ID again after a first time, which the page does not say (`seekingDeployment`) */
  retried?: boolean;
}

/** The state of an on-demand lookup; removed from the table once found, with the object itself going into the cache */
export type Lookup = { state: 'loading' } | { state: 'missing'; message: string; at?: number } | { state: 'error'; message: string; error?: unknown };

export interface Connection {
  state: 'connecting' | 'live' | 'error';
  message?: string;
  /** The error itself, for the UI to explain (a `ChainMismatchError` is explained differently from an unreachable node) */
  error?: unknown;
  /** New-block notifications come over WebSocket (otherwise polling) */
  ws: boolean;
  lastSync?: number;
}

/** Extra information about the operations submitted by this page (the node does not record submission times) */
interface Submitted {
  at: number;
  origin: 'wallet';
}

/**
 * Where the page remembers what it learned on this device, across reloads:
 *
 * - the top-up claims it broadcast (`RpcChainOptions.claims`): a claim is signed with a one-time key (D-085), and the node lists it
 *   under that key and the exchange it calls (D-111), never under the account it pays, so after a reload nothing else would find it
 *   for the wallet;
 * - the times of the BTC blocks it read as the Bitcoin RPC's tip (`RpcChainOptions.btcTimes`), which the node does not give: an
 *   operation's steps on Bitcoin keep the times they showed when it watched them
 */
export interface DeviceStore {
  load(key: string): unknown;
  save(key: string, value: unknown): void;
}

/** A top-up claim as remembered: what `noteNative` took, the payment transaction that carries the claim as broadcast among it */
interface RememberedClaim {
  id: Hex;
  /** The wallet account the claim pays, and its output script, which takes the change */
  owner: Hex;
  script: string;
  tx: string;
  /** The amounts of the transaction's inputs (sats), for its fee */
  inputs: number[];
  at: number;
  /** Handed back to be broadcast by hand: nothing on the page could broadcast it (`noteNative`) */
  byHand?: boolean;
}

/** The top-up claims remembered on each network: the latest 10, for 30 days at most */
const CLAIMS_KEPT = 10;
const CLAIM_MEMORY_MS = 30 * 86_400_000;
/** A claim the node still does not know a day after its broadcast is forgotten: its payment never confirmed, or a block would have force-included it */
const CLAIM_PATIENCE_MS = 86_400_000;
/** How often the coins of the page's own path C transactions are read again while the BTC tip stays (`followNatives`) */
const NATIVE_FOLLOW_MS = 60_000;
/** The `entries_root` of an empty block, one with no entries (`Params::is_empty_block`) */
const EMPTY_ENTRIES_ROOT = toHex(emptyEntriesRoot());
/** The selected parent's empty-block streak from which an empty block weighs MAX_EMPTY_BLOCK_WEIGHT (4: 12 × 2⁴ is past 120) */
const STREAK_AT_CAP = (() => {
  let streak = 0;
  while (streak < 10 && emptyBlockWeight(streak) < PARAMS.MAX_EMPTY_BLOCK_WEIGHT) streak++;
  return streak;
})();

/**
 * The times of the BTC blocks read as the tip kept on this device (`btcStamps`): those of the heights up to a week below the BTC tip,
 * so that an operation's steps on Bitcoin keep their times when it is opened again
 */
const STAMPS_KEPT = 1008;

/** A BTC block read as the Bitcoin RPC's tip: the time it gives (its header's), and its hash (RPC byte order), which a BTC reorg changes */
interface BtcStamp {
  time: number;
  hash: Hex;
}

/**
 * The BTC block times a store kept for the network whose genesis block is `genesis`, each `[height, time, hash]` and checked: anything
 * else in it is passed over
 */
function rememberedStamps(value: unknown, genesis: Hex): [number, BtcStamp][] {
  if (typeof value !== 'object' || value === null) return [];
  const kept = value as { genesis?: unknown; blocks?: unknown };
  if (kept.genesis !== genesis || !Array.isArray(kept.blocks)) return [];
  const valid = (v: unknown, min: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
  const stamps: [number, BtcStamp][] = [];
  for (const e of kept.blocks as unknown[]) {
    if (!Array.isArray(e) || e.length !== 3 || !valid(e[0], 0) || !valid(e[1], 1) || typeof e[2] !== 'string' || !/^[0-9a-f]{64}$/.test(e[2])) continue;
    stamps.push([e[0] as number, { time: e[1] as number, hash: e[2] }]);
  }
  return stamps;
}

/** The claims a store kept, each checked: anything else in it is passed over */
function rememberedClaims(value: unknown): RememberedClaim[] {
  const hex = (v: unknown, len?: number) => typeof v === 'string' && /^(?:[0-9a-f]{2})+$/.test(v) && (len === undefined || v.length === len * 2);
  if (!Array.isArray(value)) return [];
  return value.filter((c: unknown): c is RememberedClaim => {
    if (typeof c !== 'object' || c === null) return false;
    const r = c as Record<string, unknown>;
    const amounts = Array.isArray(r.inputs) && r.inputs.every((v) => Number.isSafeInteger(v) && (v as number) >= 0);
    const byHand = r.byHand === undefined || typeof r.byHand === 'boolean';
    return hex(r.id, 32) && hex(r.owner, 32) && hex(r.script) && hex(r.tx) && amounts && typeof r.at === 'number' && Number.isFinite(r.at) && byHand;
  });
}

const WINDOW = 60;
/** When more blocks than this are cached, drop the blocks that are BTC-final and far below the tip, along with their operations */
const PRUNE_ABOVE = 4000;
const KEEP_BELOW_TIP = 2000;
/**
 * To cover every block not yet BTC-final, backfill downwards to at most this many blocks below the tip: five hours of 5-second blocks.
 * The six confirmations need the whole stretch (D-116). With a block every 5 seconds it spans the landing of the data and its 11
 * confirmations (D-114), about 12 Bitcoin blocks: some 1 400 blocks on average, more than 1 500 about a third of the time, more than
 * 3 600 less than once in 10 000
 */
const MAX_DEPTH = 3600;
/** Minimum interval between bisection probes when the settled / BTC-final boundary is below the cache */
const PROBE_MS = 30_000;
/** How long to wait before asking again when the details of an operation in the entry pool cannot be found */
const RECHECK_MS = 8_000;
/** How long a sync, a lookup or a listing's page waits for the names of the assets it came upon: an answer slower than that comes in after it shows */
const ASSET_PATIENCE_MS = 2_000;
const CONCURRENCY = 6;
const POLL_MS = 2500;
/** A sync whose reads got no answer is tried again this long after it, before the page says the node is disconnected (`noAnswer`) */
const NO_ANSWER_RETRY_MS = 1_000;
/** The wait before subscribing again to block notifications after a socket ended (`socketEnded`), and the longest it grows to */
const RESUBSCRIBE_MS = 1_000;
const RESUBSCRIBE_MAX_MS = 60_000;
/** An account being viewed is refreshed with new blocks for this long */
const WATCH_MS = 60_000;
/** The accounts whose addresses are kept worked out (`addressOf`): far more than a visit shows */
const ADDRESS_CACHE = 4096;
/** Operations per page of the node's listings (D-111): at least as many as a history view shows */
const LIST_PAGE = 60;
/** How many operations a history view has the node list before it waits for the button below it (a filter may match few of them) */
const LIST_BUDGET = 600;
/**
 * A contract page's search for the deployment that created the contract (`wantDeployment`): at most DEPLOY_FLOOR_PAGES pages of
 * the contract's own listing for its earliest call, then at most DEPLOY_PAGES pages of DEPLOY_PAGE operations of the whole chain
 * below it
 */
const DEPLOY_FLOOR_PAGES = 4;
const DEPLOY_PAGE = 20;
const DEPLOY_PAGES = 3;
/**
 * A node without the operation listings (older than D-111) has no index of an account's operations (D-069, D-110): a page
 * listing history (an account's operations, the latest operations, the wallet's activity) then has the chain read block by
 * block, by default down to this many blocks below the tip
 */
const HISTORY_DEPTH = 2000;
/** Blocks read per round, and requests in flight, while a history view waits; the rounds follow one another without waiting for the poll */
const HISTORY_STEP = 120;
/**
 * Requests in flight while a history view waits: blocks read (D-110) or the blocks of a listing page (D-111); and on the first
 * load, which the page waits for before it shows anything
 */
const HISTORY_CONCURRENCY = 12;
/** Where calls go out in batches, the heights a round of the search for the settled and BTC-final boundaries probes at once */
const PROBE_POINTS = 7;
/**
 * Where calls go out in batches, a probe asks its candidates a tier at a time, each only where the ones before were all empty blocks:
 * the first alone, then up to the fourth, then the rest. An empty block's answer costs the node a read; one with a settlement, its finality.
 * The first sync asks them all at once: the page waits for it, and a tier is a round trip more where most blocks are empty
 */
const PROBE_TIERS = [1, 4];
/**
 * The most main-chain blocks a BTC block's page reads for the settlements that land in it (`readBtcBlock`), those that land in step
 * first: two BTC blocks' worth from a lane that makes a block every 5 seconds
 */
const BTC_PAGE_BLOCKS = 240;
/**
 * How far below a commit transaction's block the page looks for the transaction its input spends (`askCommitFees`): a producer funds
 * its commits from the change of earlier ones (D-081), on signet 123 of the last 129 (read on 2026-10-20) from an earlier
 * settlement's, 4 to 136 blocks below, 39 in the middle, and the other six from a wallet's payment to the node's funding address
 * (five) or a republish's or a rescue's commit (one), which no settlement status gives; the page's first screen holds 60 blocks
 */
const FUNDING_DEPTH = 240;
/**
 * How far above a block that needs no body and carries no settlement of its own the page looks for the settlement that carried its
 * header (`askHeaderCarrier`): on signet (read on 2026-10-20, blocks 553 to 2,552) the next block to carry settlement transactions
 * was a median 3 blocks above, 95% within 8 and at most 53
 */
const HEADER_CARRIER_DEPTH = 240;
/** The heights that search reads first, alone, before a batch at a time */
const HEADER_CARRIER_FIRST = 8;
/**
 * A BTC block whose time a page asked for and did not get (`askBtcTimes`: a failed read, or no two blocks close enough around it) is
 * read again when a page asks for it this long after, and so is what a commit transaction spends whose fee a page asked for
 * (`askCommitFees`), which a page that shows the commit asks for again as it draws the chain anew
 */
const BTC_TIME_RETRY = 60_000;
/** A history request lapses this long after a page last asked; pruning may then drop what it read */
const HISTORY_MS = 10 * 60_000;
/**
 * A BTC block's time is read from the fast-lane blocks on either side of the moment it was seen (`btcTimes`): only when they are
 * this close, as consecutive blocks of an idle chain are (the two-speed difficulty's empty blocks come minutes apart)
 */
const BTC_TIME_SPAN = 20 * 60_000;
/**
 * The BTC blocks of this many heights below the BTC tip are listed (`btcBlocks`), also where the page knows nothing of them: two
 * days of them, more than the rail's widest window
 */
const BTC_FILL_SPAN = 288;

/** KSA: the protocol's built-in asset, with no issuing contract; the node does not provide the total supply */
const KSA_META: AssetMeta = { id: KSA_ASSET_ID, symbol: 'KSA', name: 'Ksana', decimals: KSA_DECIMALS, issuer: null };

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * A read that got no answer at all, not an answer that is an error (a status, the node's error, another network's chain ID): as when
 * a phone's browser comes back from the background without the connections it had, a phone's network changes under a read, or no
 * network answers. The SDK words it "<method>: request failed: ..." (`explainRpcError`). Not one that waited out its time (the
 * SDK's `timeoutMs` aborts it): reading again would double a wait that is long enough already
 */
export function noAnswer(e: unknown): boolean {
  return e instanceof RpcTransportError && e.status === undefined && /: request failed: /.test(e.message) && !/abort/i.test(e.message);
}

/** A read that waited out its time with no answer, which the SDK's `timeoutMs` aborts */
function timedOut(e: unknown): boolean {
  return e instanceof RpcTransportError && e.status === undefined && /: request failed: /.test(e.message) && /abort/i.test(e.message);
}

/** `fn` over the items, `limit` at a time; once one fails no further item is started, as the round fails with it */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i] as T);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/** A read made ahead of the step that uses it: a failure waits for that step, rather than being reported as unhandled meanwhile */
function readEarly<T>(read: Promise<T>): () => Promise<T> {
  read.catch(() => undefined);
  return () => read;
}

/** The reads a first sync ends with that need no block, made with its call for the tip (`RpcChain.readAhead`) */
interface ReadAhead {
  /** The fee estimate and the Bitcoin tip, read in full */
  readonly done: Promise<unknown>;
  readonly indexer?: () => Promise<IndexerStatus>;
  readonly accounts: ReadonlyMap<Hex, () => Promise<AccountInfo>>;
  /** The first page of the listing the page shows first (`RpcChain.listAhead`) */
  readonly listing?: { readonly key: HistoryKey; readonly page: () => Promise<OpList> };
}

/** http(s)://host/path → ws(s)://host/path; a relative path resolves against the current page's URL */
export function wsUrlOf(url: string, base?: string): string {
  const resolved = new URL(url, base ?? (typeof location !== 'undefined' ? location.href : 'http://localhost/'));
  resolved.protocol = resolved.protocol === 'https:' ? 'wss:' : 'ws:';
  return resolved.toString();
}

/**
 * The node answers `ksana_getSettlement` for a block with a settlement transaction, and for one with a body to land, which a later
 * block's settlement may carry (D-077); a block of forced entries alone or of none needs no body, and it has nothing for one
 * without a settlement transaction (-32004, D-043)
 */
function settles(info: BlockInfo): boolean {
  return !!info.settlement || info.entries.some((e) => e.kind !== 'Forced');
}

/**
 * An asset the node has not named: its ID stands for its symbol and name, and its amounts are base units. `pending` while the node's
 * answer is awaited, when they show as being read instead (`AssetMeta.pending`)
 */
function unnamedAsset(id: Hex, pending: boolean): AssetMeta {
  const meta = withText(withText({ id, decimals: 0, issuer: null }, 'symbol', lazy((m) => m.rpc.assetSymbol, id.slice(0, 6))), 'name', lazy((m) => m.rpc.assetName, id.slice(0, 8), id.slice(-4)));
  return pending ? Object.assign(meta, { pending }) : meta;
}

/** The UI transaction status from the settlement's status */
function statusOf(info: SettlementInfo, txid: Hex): Pick<BtcTx, 'status' | 'confirmedHeight' | 'replacedBy'> {
  if (info.status === 'confirmed' && info.confirmed) {
    const winner = btcHex(info.confirmed.txid);
    if (winner === txid) return { status: 'confirmed', confirmedHeight: info.confirmed.height };
    return { status: 'replaced', replacedBy: winner };
  }
  return { status: info.status === 'broadcast' ? 'broadcast' : 'built' };
}

export interface RpcChainOptions {
  /** Number of chain blocks on the first load (default 60) */
  window?: number;
  /** Number of blocks backfilled downwards per sync (default 40) */
  backfillStep?: number;
  /** From a node without the operation listings (D-110): how far below the tip a history view has the chain read, and how much further each `loadEarlier` reads (default 2000) */
  historyDepth?: number;
  /** From a node without the operation listings (D-110): number of blocks read per round while a history view waits (default 120) */
  historyStep?: number;
  /** Operations per page of the node's listings (default 60), and how many a history view has listed before it waits for the button (default 600), D-111 */
  listPage?: number;
  listBudget?: number;
  fetch?: typeof fetch;
  /**
   * Calls made together go to the node and the indexer as one JSON-RPC batch (`batch.ts`), and the reads the page waits for (the
   * first load, the blocks of a listing's page, a round of history) go out at once, not twelve at a time
   */
  batch?: boolean;
  WebSocket?: new (url: string) => { send(data: string): void; close(): void; onopen: unknown; onmessage: unknown; onerror: unknown; onclose: unknown };
  /** Neither subscribe nor poll (tests call sync manually) */
  manual?: boolean;
  now?: () => number;
  /**
   * Whether the page is out of view: then it does not read the BTC tip, or the coins of its path C transactions, and leaves its polls
   * and block notifications until it is in view again (default: the document's visibility)
   */
  hidden?: () => boolean;
  /** Calls its argument each time the page comes into view again, and gives what stops it (default: the document's `visibilitychange`) */
  shown?: (fn: () => void) => () => void;
  /** Where the page's tabs share their readings of the BTC tip (default: a BroadcastChannel, none when manual; null for none) */
  tabs?: TipChannel | null;
  /** Where the top-up claims the page broadcast are remembered across reloads (`DeviceStore`; none by default) */
  claims?: DeviceStore;
  /** Where the times of the BTC blocks the page read as the tip are remembered across reloads (`DeviceStore`; none by default) */
  btcTimes?: DeviceStore;
  /**
   * Called once the node's chain turns out to begin at another genesis block than the one the page read, a network that started over
   * (`anotherGenesis`): the chain has stopped, and the page reads the node anew (app/store.ts)
   */
  startedOver?: () => void;
}

export class RpcChain {
  readonly kind = 'rpc' as const;
  readonly params = PARAMS;
  readonly network: BtcNetwork;
  readonly sdkParams: Params;
  readonly node: KsanaRpcClient;
  readonly indexer: IndexerRpcClient | null;
  /** bitcoind's JSON-RPC (the wallet's BTC side); null when not configured */
  readonly btc: BtcRpc | null;
  /** The BTC tip as read from the Bitcoin RPC, sparingly (`BtcTipReader`); null without a Bitcoin RPC */
  private readonly btcReads: BtcTipReader | null;
  /** Whether the page is out of view */
  private readonly hidden: () => boolean;
  private readonly shown: (fn: () => void) => () => void;

  version = 0;
  conn: Connection = { state: 'connecting', ws: false };

  /** Chain blocks, indexed by height; only the most recent stretch and the blocks fetched on demand are cached, the other slots are empty */
  blocks: Block[] = [];
  /** The parallel blocks fetched (merged and not yet merged) */
  sideBlocks: Block[] = [];
  btcBlocks: BtcBlock[] = [];
  btcBase = 0;
  opOrder: Hex[] = [];
  /** Operations submitted by this page and not yet included */
  mempool: OpRecord[] = [];
  nativePending: OpRecord[] = [];
  accounts = new Map<Hex, AccountState>();
  assets = new Map<Hex, AssetMeta>([[KSA_ASSET_ID, KSA_META]]);
  /**
   * The node's index of the token standards' events (D-120): the KS-20 tokens and KS-721 collections the page came upon, the contracts'
   * declarations and the accounts' holdings (D-123). A token is kept apart from `assets`: an `AssetTransfer` naming a token contract's ID
   * names no built-in asset
   */
  readonly tokenBook = new TokenBook({ node: () => this.node, now: () => this.now(), changed: (c) => this.tokensChanged(c) });
  /** The operations with events of a contract whose declaration is being read, attributed to the accounts the events name once it is in */
  private readonly undeclared = new Map<Hex, Set<Hex>>();
  /** The simulator's contract metadata; the node gives none (D-015), so this stays empty and `contractEvidence` holds what the page learned */
  contracts = new Map<Hex, ContractMeta>();
  /**
   * What tells the page an account is a contract, settled as each receipt is read so that it outlasts the blocks the cache drops:
   * the deployment that created it (`deploy`; `failed` once its receipt says it created none), a call to it that succeeded (a call
   * to an account with no code fails, so a failed one tells nothing) or an asset it issued, either of which makes it `known`. A
   * contract ID is a hash, not a key: it has no Taproot address, even when its 32 bytes happen to be a point on the curve
   */
  private readonly contractEvidence = new Map<Hex, { deploy?: Hex; failed?: boolean; known?: boolean }>();
  /** The locked portions the node lists for the accounts looked up, keyed by "block hash:account" (a block's producer and its carrier each have one, D-095) */
  lockedFees = new Map<string, LockedFee>();
  labels = new Map<Hex, string>();
  /** Names such as the producers' are generated in the current language and regenerated when the language changes */
  private readonly labelText = new Map<Hex, () => string>();
  private readonly unsubscribeLocale = onLocaleChange(() => {
    for (const [id, text] of this.labelText) this.labels.set(id, text());
  });
  producers: Producer[] = [];
  /** Whether a producer censors an account cannot be known from the node */
  censored = new Set<Hex>();
  settledHeight = 0;
  finalHeight = 0;
  indexerHeight = 0;
  indexerBtcHeight = 0;
  indexerChecks: IndexerCheck[] = [];
  indexerTally: IndexerTally = { count: 0, failed: 0, lastFailed: null };
  indexerHalted: string | null = null;
  /** Why the indexer's status could not be read the last time it was asked; null once it answers */
  indexerError: string | null = null;
  events: ChainEvent[] = [];
  /** The settlement transactions' fee rate (the node's --settlement-feerate, via ksana_estimateFee) */
  feeRate: number = NODE_POLICY.SETTLEMENT_FEERATE;
  /** The BTC mempool's threshold for getting into a block: not provided by the node */
  btcMinFeeRate = 1;
  feeSpike = false;
  producerOffline: Hex | null = null;
  /** The simulator's demo contracts and assets; absent on a real network */
  readonly tokenAsset = '';
  readonly passAsset = '';
  readonly tokenContract = '';
  readonly ammContract = '';
  readonly triggerContract = '';
  fastIntervalMs = 5000;
  /** BTC block interval: estimated from the times at which the anchor advances; about 10 minutes on signet */
  btcIntervalMs: number;
  /** The connected wallet account: it is the only one whose P2WPKH address can be computed (that needs the compressed pubkey) */
  walletKey: { account: Hex } | null = null;

  private readonly byHash = new Map<Hex, Block>();
  private readonly raw = new Map<Hex, BlockInfo>();
  private readonly sideByHeight = new Map<number, Block[]>();
  private readonly settlementInfo = new Map<Hex, SettlementInfo>();
  private readonly ops = new Map<Hex, OpRecord>();
  private readonly submitted = new Map<Hex, Submitted>();
  private readonly accOps = new Map<Hex, Set<Hex>>();
  private readonly btcTxs = new Map<Hex, BtcTx>();
  private readonly carriers = new Map<Hex, Set<Hex>>();
  /** Which settlement / republish transactions carry a block's body (D-077): block hash → reveal transaction IDs */
  private readonly bodyCarriers = new Map<Hex, Set<Hex>>();
  /** The block that forced each path C transaction in, by the transaction's ID: its BTC height is read from that block's window (`placeForced`) */
  private readonly forcedIn = new Map<Hex, Hex>();
  /** When the coins of the page's own path C transactions were last read, and the BTC height then (`followNatives`) */
  private nativesRead: { tip: number; at: number } | undefined;
  private readonly btcKnown = new Map<number, BtcBlock>();
  /** The BTC blocks listed between the known ones up to the tip (`BTC_FILL_SPAN`), each with no known Ksana transaction (`btcBlockAt`) */
  private readonly btcFilled = new Map<number, BtcBlock>();
  /**
   * Older BTC blocks the loaded blocks date (those an operation, a block or a transaction below the stretch loaded from the tip names,
   * `askBtcTimes`), with their time: `getBtcBlock` gives them, the list does not
   */
  private readonly btcTimed = new Map<number, BtcBlock>();
  /**
   * What the loaded fast-lane blocks saw of BTC: a block anchored at a was produced once its producer saw BTC up to a + ANCHOR_DEPTH
   * (D-056). Per BTC height seen, the earliest and the latest time of a block that saw that height and no more, and of a reading of
   * the Bitcoin RPC's tip (`noteTipRead`); BTC block times are read from these (`btcTimes`), since the node does not give them
   */
  private readonly btcSeen = new Map<number, { first: number; last: number }>();
  /**
   * The BTC blocks read as the Bitcoin RPC's tip, by this tab or another (`BtcTipReader`) or on an earlier visit (`btcTimeStore`),
   * with the time each block gives (its header's): such a block's time is its own, as a Bitcoin explorer shows it (`btcTimes`), where
   * the fast-lane blocks could only bound it, a few minutes apart on an idle lane. Each keeps its block's hash, so that one a BTC reorg
   * replaced is dropped where the page knows the block now at its height (`noteTipRead`)
   */
  private readonly btcStamps = new Map<number, BtcStamp>();
  /** The times of these the page gives as their blocks' own: those at or below the BTC tip (`noteTipRead`) */
  private btcExact = new Map<number, number>();
  private readonly lookups = new Map<string, Lookup>();
  private readonly watched = new Map<Hex, number>();
  private readonly listeners = new Set<() => void>();
  private fee: SdkFeeEstimate | null = null;
  private syncing = false;
  private again = false;
  /** The last sync failed: the next that gets no answer says the node is disconnected (`sync`) */
  private failing = false;
  /** The sync that tries again after one that got no answer */
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** A sync has ended: until the first one does, the cache holds blocks whose statuses it has not worked out yet (`ready`) */
  private synced = false;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** A poll or a block notification came while the page was out of view (`tick`) */
  private missed = false;
  private unshown: (() => void) | null = null;
  private socket: { close(): void } | null = null;
  /** The sockets opened for block notifications, counted: the end of one the page has since left or closed is no news (`socketEnded`) */
  private sockets = 0;
  /** When the latest socket was opened */
  private socketAt = 0;
  private resubscribeTimer: ReturnType<typeof setTimeout> | null = null;
  private resubscribeMs = RESUBSCRIBE_MS;
  /** A socket ended while the page was out of view: it subscribes again as it comes back into view */
  private resubscribeShown = false;
  private lastAnchor = -1;
  private lastFullRefresh = 0;
  private anchorTimes: number[] = [];
  private readonly now: () => number;
  private readonly manual: boolean;
  private readonly wsCtor: RpcChainOptions['WebSocket'];
  private readonly window: number;
  private readonly backfillStep: number;
  private readonly historyDepth: number;
  private readonly historyStep: number;
  private readonly listPage: number;
  private readonly listBudget: number;
  /** The node's and the indexer's calls go out in batches (`RpcChainOptions.batch`) */
  private readonly batching: BatchingFetch | null;
  /** From a node without the operation listings (D-110): the lowest height a history view asked for, and when one last asked */
  private historyFloor = Number.POSITIVE_INFINITY;
  private historyAt = 0;
  /** The node's operation listings the history views asked for (D-111) */
  private readonly listings = new Map<HistoryKey, Listing>();
  /** Whether the node lists operations (D-111): unknown until a listing answers, false for a node without them (D-110) */
  private listsOps: boolean | undefined = undefined;
  /** The contract pages' searches for a deployment, by contract */
  private readonly deploySearches = new Map<Hex, DeploySearch>();
  private closureCache = new Map<Hex, number | undefined>();
  private readonly sawPending = new Set<Hex>();
  /** Merged block → the chain block that merges it (the one it was fetched for) */
  private readonly mergedBy = new Map<Hex, Hex>();
  /** How many times in a row an operation submitted by this page could not be found: only two count as dropped from the entry pool (one may just be a reorg gap) */
  private readonly missCount = new Map<Hex, number>();
  /** When the node was last asked about an operation of another's that this page saw skipped (`refreshSkippedOps`) */
  private readonly skipAsked = new Map<Hex, number>();
  /**
   * Operations of the blocks a round read again (`syncOnce`) that a branch took out of them and no block the page holds has since:
   * the node is asked where each is now, round after round until it answers (`placeAgain`)
   */
  private readonly unplaced = new Set<Hex>();
  /** Blocks fetched by on-demand lookups: the page is viewing them, so pruning keeps them */
  private readonly pinned = new Map<Hex, number>();
  /**
   * The BTC blocks whose page had the main-chain blocks around them read (`readBtcBlock`): the first and the last height anchored at
   * each (null for none), and when; an entry lapses with its blocks' pins, once the cache is pruned
   */
  private readonly btcPages = new Map<number, { anchored: [number, number] | null; at: number }>();
  /** The anchors of BTC-final main-chain heights a search read without keeping their blocks (`anchorBounds`): they do not change */
  private readonly finalAnchors = new Map<number, number>();
  /** The BTC heights a page asked the time of (`askBtcTimes`), and when */
  private readonly btcTimeAsked = new Map<number, number>();
  /**
   * The commit transactions of the settlements read below the blocks the page has, for the commit transactions a page asked the fee
   * of (`askCommitFees`): the outputs of each, by its ID, which any commit that spends one takes its fee from (`fillCommitFees`),
   * not only the one asked about; the heights read; and the commits asked about, and when
   */
  private readonly fundingOuts = new Map<Hex, FundingOut[]>();
  private readonly fundingRead = new Set<number>();
  private readonly fundingAsked = new Map<Hex, number>();
  /** The search for what commits spend under way (`readFunding`): one at a time, so that two asked together read no height twice */
  private fundingSearch: Promise<void> = Promise.resolve();
  /**
   * The blocks a page asked what carried the header of (`askHeaderCarrier`): when, and whether the search ended; one that failed is
   * asked again after BTC_TIME_RETRY
   */
  private readonly carrierAsked = new Map<Hex, { at: number; done: boolean }>();
  /**
   * The search for what carried a header under way (`readHeaderCarrier`): one at a time, so that those asked together read no height
   * twice. How many have been asked, and how many had been when one last waited out its reads' time with no answer: those of them
   * still waiting end without reading, as each would wait out the same reads in turn, and are asked again as one that failed is
   */
  private carrierSearch: Promise<void> = Promise.resolve();
  private carrierQueued = 0;
  private carrierStalled = 0;
  /** The bottom of the stretch loaded contiguously by height (the first-screen window and the backfill): the linkage check does not go below it, and earlier blocks fetched individually on demand are not bridged */
  private linkFloor = Number.POSITIVE_INFINITY;
  /**
   * The tip the last round ended on, its links walked (-1 before the first): the next round reads by height what the tip moved on by
   * since, which a block a lookup read above it meanwhile, a link or a listing's, does not make fewer
   */
  private heldTip = -1;
  /** The boundaries found by bisection (settled, BTC-final), and the highest acceptance height among the pruned blocks (long final) */
  private probedSettled = 0;
  private probedFinal = 0;
  private prunedFloor = 0;
  private lastProbe = 0;
  /**
   * The BTC-final tip the node reports (`finalized` of ksana_getChainInfo, D-114; infinite until first read), which caps the BTC-final
   * height; that height as the statuses give it, before the cap; and whether BTC moved since the tip was last read
   */
  private reportedFinal = Number.POSITIVE_INFINITY;
  private inferredFinal = 0;
  private reportDue = false;
  /** The node's chain ID has been checked against the page's network (`checkChain`) */
  private chainChecked = false;
  /** The listing the page shows first once the first sync is in, and how many of its operations (`listAhead`) */
  private landing: { key: HistoryKey; rows: number } | undefined;
  /**
   * The node's reads of assets' names and decimals in flight (`noteAsset`), each with its number in the order they were asked
   * (`assetsAsked`), which the reads that came upon the assets wait for (`assetsRead`)
   */
  private readonly assetReads = new Map<Promise<unknown>, number>();
  private assetsAsked = 0;
  /** The assets whose read got no answer (the node unreachable, a timeout), and when: asked again RECHECK_MS later (`retryAssets`) */
  private readonly assetRetry = new Map<Hex, number>();
  /** Where the top-up claims the page broadcast are remembered (`DeviceStore`), and whether those it remembered were registered (`restoreClaims`) */
  private readonly claimStore: DeviceStore | null;
  private claimsRestored = false;
  /**
   * Where the times of the BTC blocks read as the tip are remembered (`DeviceStore`), whether those it remembered were taken
   * (`takeStamps`), and whether one read is not yet remembered (before the genesis block names the network, `stampsKey`)
   */
  private readonly btcTimeStore: DeviceStore | null;
  private stampsTaken = false;
  private stampsUnsaved = false;
  private readonly startedOver: (() => void) | undefined;

  constructor(
    readonly config: RpcConfig,
    options: RpcChainOptions = {},
  ) {
    this.network = config.chain === 'signet' ? 'signet' : 'regtest';
    this.sdkParams = config.chain === 'signet' ? SIGNET : DEVNET;
    this.btcIntervalMs = config.chain === 'signet' ? 600_000 : 10_000;
    this.batching = options.batch ? batchingFetch(options.fetch ?? fetch) : null;
    const transport = this.batching ?? options.fetch;
    const clientOpts = { timeoutMs: 15_000, ...(transport ? { fetch: transport } : {}) };
    this.node = new KsanaRpcClient(config.url, clientOpts);
    this.indexer = config.indexerUrl ? new IndexerRpcClient(config.indexerUrl, clientOpts) : null;
    this.btc = config.btcUrl ? new BtcRpc(config.btcUrl, this.network, options.fetch) : null;
    this.now = options.now ?? (() => Date.now());
    this.manual = options.manual ?? false;
    this.wsCtor = options.WebSocket;
    this.window = options.window ?? WINDOW;
    this.backfillStep = options.backfillStep ?? 40;
    this.historyDepth = options.historyDepth ?? HISTORY_DEPTH;
    this.historyStep = options.historyStep ?? HISTORY_STEP;
    this.listPage = options.listPage ?? LIST_PAGE;
    this.listBudget = options.listBudget ?? LIST_BUDGET;
    this.claimStore = options.claims ?? null;
    this.btcTimeStore = options.btcTimes ?? null;
    this.startedOver = options.startedOver;
    const btc = this.btc;
    this.hidden = options.hidden ?? pageHidden;
    this.shown = options.shown ?? whenShown;
    this.btcReads = btc
      ? new BtcTipReader(() => btc.checkChain(), {
          now: this.now,
          hidden: this.hidden,
          channel: options.tabs !== undefined ? options.tabs : this.manual ? null : tabsChannel(`ksana-btc-tip ${this.network} ${config.btcUrl}`),
          changed: () => this.bump(),
        })
      : null;
  }

  // =====================================================================
  // Subscription and sync
  // =====================================================================

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  /**
   * The page can only render after the first sync ends with a tip: not when its tip is in, which is before the statuses are worked
   * out and its listing read, where anything that told the page to render (an asset's name, a lookup) would show them unfinished
   */
  get ready(): boolean {
    return this.synced && this.blocks.length > 0 && this.blocks[this.blocks.length - 1] !== undefined;
  }

  get hasIndexer(): boolean {
    return this.indexer !== null;
  }

  /** The cache reaches the BTC-final boundary: the wallet's "BTC-final balance" is complete (otherwise backfill is still in progress) */
  get finalityLoaded(): boolean {
    return this.loadedFrom <= this.finalHeight + 1;
  }

  /** The lowest height cached contiguously down from the tip (0 once the whole chain is) */
  get loadedFrom(): number {
    let h = this.blocks.length - 1;
    while (h > 0 && this.blocks[h - 1]) h--;
    return h;
  }

  /**
   * A history view (an account's operations, the latest operations, the wallet's activity) shows its list: called on every
   * render, with `more` while the list is not full. The node lists the operations of `key` page by page, newest first (D-111),
   * and the blocks holding them come into the cache, up to the view's budget (`loadEarlier` raises it); the blocks stay while a
   * view asks, and the listing lapses HISTORY_MS after the last call. A node without the listings has the chain read block by
   * block instead (D-110), unless `readBlocks` is false: a view that only adds to what the loaded blocks hold (the overview's
   * latest operations) then does without.
   */
  wantHistory(key: HistoryKey, more = true, { readBlocks = true }: { readBlocks?: boolean } = {}) {
    if (!this.ready) return;
    if (this.listsOps === false) {
      if (more && readBlocks) this.wantBlocks();
      return;
    }
    const now = this.now();
    const l = this.listing(key, now);
    for (const hash of l.blocks) this.pinned.set(hash, now);
    if (!more || l.loading || l.next === null || l.listed >= l.budget) return;
    if (l.error && now - l.error.at < RECHECK_MS) return;
    void this.pullListing(key, l, readBlocks);
  }

  /** The button below a history view: list further down (or read further down, D-110), or try again after a failure */
  loadEarlier(key: HistoryKey) {
    if (!this.ready) return;
    if (this.listsOps === false) {
      this.readEarlier();
      return;
    }
    const l = this.listing(key, this.now());
    l.budget = Math.max(l.budget, l.listed + this.listBudget);
    delete l.error;
    this.wantHistory(key);
  }

  /**
   * The listing the page shows first once the first sync is in (the overview's latest operations, the operations page's, an account's
   * or a contract's), and how many of its operations it shows: the first sync reads that many with its call for the tip, and the
   * account of an account's or a contract's listing, and their blocks with its settlements, so that the operations show with the
   * blocks, not a round trip or two after them. Said before the first sync gets that far, and kept until the page first shows,
   * however long it waits for its node; a view that finds the page short asks for more as it would have (D-111)
   */
  listAhead(list: { key: HistoryKey; rows: number } | undefined) {
    this.landing = list;
  }

  /** How far a history view's list reaches */
  history(key: HistoryKey): HistoryState {
    if (this.listsOps === false) return { source: 'blocks', loading: this.readingBlocks, from: this.loadedFrom };
    const l = this.listings.get(key);
    if (!l) return { source: 'listing', loading: false, complete: false, paused: false, listed: 0 };
    return {
      source: 'listing',
      loading: l.loading,
      complete: l.next === null,
      paused: l.next !== null && l.next !== undefined && l.listed >= l.budget,
      listed: l.listed,
      ...(l.error ? { error: l.error.message } : {}),
    };
  }

  private listing(key: HistoryKey, now: number): Listing {
    let l = this.listings.get(key);
    if (!l) {
      l = { next: undefined, listed: 0, budget: this.listBudget, loading: false, at: now, blocks: new Set() };
      this.listings.set(key, l);
    }
    l.at = now;
    return l;
  }

  /** Reads the next page of a listing (D-111) and the blocks of its operations the cache lacks */
  private async pullListing(key: HistoryKey, l: Listing, readBlocks: boolean) {
    l.loading = true;
    this.bump();
    const asked = this.assetsAsked;
    try {
      let page: OpList;
      try {
        page = await this.listOps(key, { before: l.next ?? null, limit: this.listPage });
      } catch (e) {
        // A node without the listings (older than D-111, or one whose index is not built): history views read blocks instead
        // (D-110), starting with this one unless it does without. Any other error fails this page only, which is asked again
        if (!(e instanceof RpcError && e.code === RPC_ERROR_CODES.METHOD_NOT_FOUND)) throw e;
        this.listsOps = false;
        this.listings.clear();
        if (readBlocks) this.wantBlocks();
        return;
      }
      this.listsOps = true;
      await this.takePage(key, l, page);
      await this.assetsRead(asked);
    } catch (e) {
      l.error = { message: errMessage(e), at: this.now() };
    } finally {
      l.loading = false;
      this.derive();
      this.bump();
    }
  }

  /** A page of the node's listing: the latest operations, or an account's (D-111) */
  private listOps(key: HistoryKey, options: OpListOptions): Promise<OpList> {
    return key === 'latest' ? this.node.getLatestOps(options) : this.node.getAccountOps(key, options);
  }

  /**
   * A listing's page comes in: the blocks of its operations that the cache lacks are read, and the listing goes on below it. An
   * account's operations go under it as listed: the node lists there what the page cannot tell from the blocks it read before their
   * contracts' declarations were in, an operation whose token events name the account or an asset's movements (D-120, D-122)
   */
  private async takePage(key: HistoryKey, l: Listing, page: OpList) {
    const hashes = [...new Set(page.ops.map((o) => toHex(o.block.hash)))];
    const infos = await mapLimit(
      hashes.filter((h) => !this.raw.has(h)),
      this.wide,
      (h) => this.node.getBlock(h),
    );
    for (const info of infos) this.ingest(info);
    const now = this.now();
    for (const hash of hashes) {
      l.blocks.add(hash);
      this.pinned.set(hash, now);
    }
    for (const o of page.ops) if (o.status !== 'failed' && o.status !== 'skipped') l.floor = o.position;
    if (key !== 'latest') {
      for (const o of page.ops) {
        const id = toHex(o.op_id);
        if (this.ops.has(id)) addTo(this.accOps, key, id);
      }
    }
    l.listed += page.ops.length;
    l.next = page.next;
    delete l.error;
  }

  /**
   * The first page of the listing the page shows first (`listAhead`), read with the first sync's call for the tip: its blocks go out
   * with the window's settlements. A node without the listings is noted as the view's first page would note it (D-110); a page that
   * fails is left to the view, which asks for it once it shows
   */
  private async takeListing({ key, page }: { key: HistoryKey; page: () => Promise<OpList> }) {
    const l = this.listing(key, this.now());
    if (l.loading || l.next !== undefined) return;
    l.loading = true;
    try {
      let first: OpList;
      try {
        first = await page();
      } catch (e) {
        if (!(e instanceof RpcError && e.code === RPC_ERROR_CODES.METHOD_NOT_FOUND)) throw e;
        this.listsOps = false;
        this.listings.clear();
        return;
      }
      this.listsOps = true;
      await this.takePage(key, l, first);
    } catch {
      this.listings.delete(key);
    } finally {
      l.loading = false;
    }
  }

  /**
   * From a node without the operation listings (D-110), a history view asks for the blocks below the cache: the chain is read
   * block by block, down to `historyDepth` blocks below the tip unless `readEarlier` asked for more. The sync loop reads them;
   * the request lapses HISTORY_MS after the last call, so a page keeps asking while it shows the list.
   */
  private wantBlocks() {
    const now = this.now();
    const fresh = !this.historyLive(now);
    if (fresh) this.historyFloor = Math.max(1, this.tip.header.height - this.historyDepth + 1);
    this.historyAt = now;
    if (!fresh || !this.readingBlocks) return;
    // Called after a render: the list says at once that older blocks are coming
    this.bump();
    if (!this.manual) void this.sync();
  }

  /** Read another `historyDepth` blocks below what the history views reach (the button below them, D-110) */
  private readEarlier() {
    const reach = this.historyLive() ? Math.min(this.historyFloor, this.loadedFrom) : this.loadedFrom;
    this.historyFloor = Math.max(1, reach - this.historyDepth);
    this.historyAt = this.now();
    this.bump();
    if (!this.manual) void this.sync();
  }

  /** A history view's request for blocks is still being read: the cache does not reach the height it asked for yet (D-110) */
  private get readingBlocks(): boolean {
    return this.historyLive() && this.loadedFrom > this.historyFloor;
  }

  private historyLive(now = this.now()): boolean {
    return Number.isFinite(this.historyFloor) && now - this.historyAt <= HISTORY_MS;
  }

  /** The lowest height the backfill reaches: the BTC-final boundary within MAX_DEPTH of the tip, or lower while a history view asks */
  private backfillFloor(tipH: number): number {
    const finality = Math.max(1, this.finalHeight + 1, tipH - MAX_DEPTH);
    return this.historyLive() ? Math.min(finality, this.historyFloor) : finality;
  }

  start() {
    if (this.manual) return;
    void this.sync();
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.unshown = this.shown(() => this.cameIntoView());
    this.followBlocks();
  }

  /**
   * Subscribe to block notifications. Counted as polling until the subscription is confirmed; marked as WebSocket when the first block
   * notification arrives. The socket's end is followed (the SDK leaves `onclose` to its caller): a server or a proxy before it ends a
   * socket that carried nothing for a while (the signet's after five minutes without a block), a node restarts, and a phone's browser
   * in the background loses its connections. The page went on saying "WebSocket push" and polled alone for as long as it stayed open
   */
  private followBlocks() {
    const Base = this.wsCtor ?? (globalThis as { WebSocket?: RpcChainOptions['WebSocket'] }).WebSocket;
    if (this.stopped || this.socket || !Base) return;
    const ended = this.socketEnded.bind(this, ++this.sockets);
    this.socketAt = this.now();
    // The SDK's socket with its end followed
    class Followed extends Base {
      constructor(url: string) {
        super(url);
        this.onclose = ended;
      }
    }
    try {
      this.socket = subscribeBlocks(wsUrlOf(this.config.url), () => this.notifyBlock(), {
        WebSocket: Followed as never,
        onError: () => {
          if (this.conn.ws) {
            this.conn = { ...this.conn, ws: false };
            this.bump();
          }
        },
      });
    } catch {
      this.socket = null;
    }
  }

  /**
   * A socket for block notifications ended, the page not having closed it: the page says it polls, and subscribes again a second later.
   * Where sockets end as they are opened, carrying nothing (a node that takes no WebSocket, or cannot be reached), each wait is twice the
   * last, up to a minute. Out of view, the page subscribes again as it comes back into view
   */
  private socketEnded(socket: number) {
    if (this.stopped || socket !== this.sockets) return;
    this.socket = null;
    if (this.conn.ws) {
      this.conn = { ...this.conn, ws: false };
      this.bump();
    }
    if (this.now() - this.socketAt >= RESUBSCRIBE_MAX_MS) this.resubscribeMs = RESUBSCRIBE_MS;
    const wait = this.resubscribeMs;
    this.resubscribeMs = Math.min(wait * 2, RESUBSCRIBE_MAX_MS);
    if (this.resubscribeTimer) clearTimeout(this.resubscribeTimer);
    this.resubscribeTimer = setTimeout(() => {
      this.resubscribeTimer = null;
      if (this.hidden()) this.resubscribeShown = true;
      else this.followBlocks();
    }, wait);
  }

  stop() {
    this.stopped = true;
    this.unsubscribeLocale();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unshown?.();
    this.unshown = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.resubscribeTimer) clearTimeout(this.resubscribeTimer);
    this.resubscribeTimer = null;
    this.socket?.close();
    this.socket = null;
    this.btcReads?.close();
  }

  /** Fetch the tip and fill in the cache; concurrent calls are merged into one */
  async sync(): Promise<void> {
    if (this.stopped) return;
    if (this.syncing) {
      this.again = true;
      return;
    }
    this.syncing = true;
    // Where the page said the node was disconnected, what pages could not read meanwhile is read again as soon as it answers, before any
    // further round, which might get no answer again (`readFailedAgain`)
    let wasDown = this.conn.state === 'error';
    // A sync that gets no answer, the one before it not failed, says nothing yet: it is tried again a second later, and only where that
    // gets none either does the page say the node is disconnected. A phone's browser coming back from the background has lost the
    // connections it had, and a phone's network that changes loses the reads on their way, where the next read goes through. An answer
    // that is an error is said at once
    let held = false;
    try {
      do {
        this.again = false;
        await this.syncOnce();
        // A network that started over stopped the chain (`anotherGenesis`): the page reads the node anew with another, and this one
        // starts nothing more, not even the lookups that failed before
        if (this.stopped) return;
        this.synced = true;
        this.failing = false;
        if (wasDown) {
          wasDown = false;
          this.readFailedAgain();
        }
        // Another round follows at once (a history view waits, or a sync was asked for meanwhile): show this one's result first
        if (this.again && !this.stopped) {
          this.conn = { state: 'live', ws: this.conn.ws, lastSync: this.now() };
          this.bump();
        }
      } while (this.again && !this.stopped);
      this.conn = { state: 'live', ws: this.conn.ws, lastSync: this.now() };
    } catch (e) {
      held = !this.failing && noAnswer(e);
      this.failing = true;
      if (held) this.retrySoon();
      else this.conn = { state: 'error', ws: false, message: errMessage(e), error: e, ...(this.conn.lastSync ? { lastSync: this.conn.lastSync } : {}) };
    } finally {
      this.syncing = false;
      // A first sync that failed shows what it read, with its failure; one held back shows nothing new until it is tried again
      if (!held) {
        this.synced = true;
        this.bump();
      }
    }
  }

  /** A sync that got no answer is tried again NO_ANSWER_RETRY_MS later, not at the next poll */
  private retrySoon() {
    if (this.manual || this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, NO_ANSWER_RETRY_MS);
  }

  /** A block notification over WebSocket: mark the subscription as working and sync */
  notifyBlock() {
    if (!this.conn.ws) this.conn = { ...this.conn, ws: true };
    this.resubscribeMs = RESUBSCRIBE_MS;
    this.tick();
  }

  /**
   * A poll, or a block notification. A page out of view (another tab, a minimised window, a phone's browser in the background) leaves
   * the node alone: no one reads what it would draw, and an open tab forgotten for the day asked the node every 2.5 s. It reads the node
   * as soon as it is in view again, rather than up to a poll later
   */
  private tick() {
    if (this.hidden()) {
      this.missed = true;
      return;
    }
    void this.sync();
  }

  /**
   * The page in view again: what it left meanwhile is read at once, the next poll a whole interval later. So is a last read a poll old
   * or more where no poll came meanwhile: a phone's browser holds the timers of a page in the background
   */
  private cameIntoView() {
    if (this.stopped) return;
    if (this.resubscribeShown) {
      this.resubscribeShown = false;
      this.followBlocks();
    }
    const old = this.conn.lastSync !== undefined && this.now() - this.conn.lastSync >= POLL_MS;
    if (!this.missed && !old) return;
    this.missed = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), POLL_MS);
    }
    void this.sync();
  }

  /** The node's calls go out in batches: asked for (`RpcChainOptions.batch`), and its server has not refused one */
  private get batched(): boolean {
    return this.batching?.batches(this.config.url) ?? false;
  }

  /** Calls in flight for the reads the page waits for: a batch's worth where the node's calls go out in batches, `HISTORY_CONCURRENCY` otherwise */
  private get wide(): number {
    return this.batched ? MAX_BATCH : HISTORY_CONCURRENCY;
  }

  /**
   * The node must be on the network the page is set to (A2-11, D-106): reads its chain ID (`ksana_getChainInfo`) and throws the
   * SDK's `ChainMismatchError` when it is another network's, mainnet's (not supported by this page yet) or none's. Called before
   * the first sync and before anything is signed: an operation signed for another network would still be force-included there
   * when it comes as path C, and fail while its BTC payment confirms. Its answer names the tip, below which the first sync reads
   * its window.
   */
  async checkChain(): Promise<ChainInfo> {
    const info = await this.node.getChainInfo();
    paramsForChainId(info.chain_id, this.sdkParams);
    this.chainChecked = true;
    return info;
  }

  /**
   * The Bitcoin RPC, when there is one, must be on the BTC network of the page's network (A2-11, D-106; `BtcRpc.checkChain`):
   * called before anything is signed for path C or a top-up, whose transaction is broadcast there. Listing coins and broadcasting
   * check it by themselves too. Its answer carries the tip, which the top-up's expiry check then uses.
   */
  async checkBtcChain(): Promise<void> {
    const tip = await this.btc?.checkChain();
    if (tip) this.btcReads?.note(tip);
  }

  private async syncOnce() {
    const asked = this.assetsAsked;
    // The node's network is read before anything else (A2-11), and its answer names the tip
    const checked = this.chainChecked ? undefined : await this.checkChain();
    this.retryAssets();
    // First load: fetch the most recent stretch by height concurrently, the genesis block among them, and more at a time, since the
    // page shows nothing until they are in; afterwards check the linkage along the selected parents and fetch only what changed
    const first = this.blocks.length <= 1;
    // The tip of the round before (`heldTip`)
    const held = this.heldTip >= 0 ? this.heldTip : this.blocks.length - 1;
    // What the first sync ends with that needs no block goes out with its call for the tip, not a round trip after its blocks
    const ahead = first ? this.readAhead() : undefined;
    // The heights read by number: the genesis block while the cache lacks it; on the first load the window below the tip, and afterwards
    // the blocks the tip moved on by since the round before, up to a window of them unless `whole`. A page back in view after hours, on a
    // lane where a block comes every few minutes, read them along the parents a round trip each: 300 blocks on took 302 requests, one
    // after another
    const below = (tip: number, whole = false) => {
      const heights: number[] = this.blocks[0] ? [] : [0];
      for (let h = Math.max(first ? 1 : held + 1, whole ? 1 : tip - this.window + 1); h < tip; h++) heights.push(h);
      return heights;
    };
    // The window below the tip the chain check named goes out with the call for the tip, not a round trip after it; what the tip
    // moved on by meanwhile is read once its height is known
    const guessed = checked ? below(Number(checked.tip.height)) : [];
    const [latest, early] = await Promise.all([this.node.getBlock('latest'), this.readHeights(guessed)]);
    const tipH = Number(latest.header.height);
    // The tip moved on by more than a window since the round before, a `gap` of heights lying between the window and the tip held.
    // Below the window, nothing would check the links to the chain of the blocks the page holds above the BTC-final boundary, as for
    // the blocks a first load guesses (below); those BTC-final stay, as the chain keeps them. Either those blocks are read again by
    // height with the window (`far`), or the heights between, the walk along the parents then checking them as every round does,
    // whichever are fewer: back after a day on the signet, some 30 blocks were held above the boundary and 280 heights lay between,
    // where on a devnet whose boundary trails by a thousand blocks the heights between are fewer
    const gap = first ? 0 : tipH - this.window - held;
    const unchecked: number[] = [];
    if (gap > 0) for (let h = Math.max(1, this.finalHeight + 1); h <= Math.min(tipH - this.window, this.blocks.length - 1); h++) if (this.blocks[h]) unchecked.push(h);
    const far = gap > unchecked.length;
    const again = new Set(far ? unchecked : []);
    // A network that started over may stand behind such a tip, one lower than the page held, or a chain the page held only the genesis
    // block of: the genesis block is read with them
    const recheck = this.blocks[0] && (first || gap > 0 || tipH < held) ? [0] : [];
    const late = await this.readHeights([...below(tipH, gap > 0 && !far).filter((h) => !guessed.includes(h)), ...again, ...recheck]);
    if (this.anotherGenesis(late.find(([h]) => h === 0)?.[1])) return;
    // The guess reaches the window below the tip unless the tip moved on by a window or more meanwhile. Its blocks are then dropped, the
    // genesis block aside: below the gap nothing would check their links to the chain until a backfill step reached them, which never
    // comes where the BTC-final boundary is above the gap, so a branch the chain left there would stay, BTC-final. The backfill reads the
    // gap by height, not `linkRange` a block a round trip along the parents
    const joined = checked !== undefined && Number(checked.tip.height) >= tipH - this.window + 1;
    const read = [...(joined ? early : early.filter(([h]) => h === 0)), ...late];
    // The links are walked down to the window below the tip, or to the lowest block a first load guessed
    if (first || far) this.linkFloor = Math.min(Math.max(1, tipH - this.window + 1), ...read.flatMap(([h]) => (h > 0 && !again.has(h) ? [h] : [])));
    // The page waits for everything the first sync reads, and for a round that reads more than a window: their calls go out wide (at
    // once, where calls go out in batches)
    const limit = first || gap > 0 ? this.wide : CONCURRENCY;
    // The operations of the blocks read again, and of the parallel blocks they merged: where a branch replaced such a block, the block
    // holding an operation now may lie among the heights between, which the round does not read
    const displaced = far ? this.opsOfBlocksAt(again) : [];
    for (const [h, info] of read) {
      this.ingest(info);
      if (h === 0) this.btcBase = info.header.btc_anchor.height;
    }
    this.ingest(latest);
    // The tip got lower (the selected chain switched to a shorter branch): the blocks above it are no longer chain blocks
    for (let h = tipH + 1; h < this.blocks.length; h++) {
      const b = this.blocks[h];
      if (b) this.forget(b.hash);
    }
    this.blocks.length = tipH + 1;
    if (!(await this.linkRange(recheck.length === 0))) return;
    this.heldTip = tipH;
    await this.fetchMerged(limit, [...again]);
    for (const id of displaced) if (!this.ops.get(id)?.blockHash) this.unplaced.add(id);
    if (this.unplaced.size) await this.placeAgain(limit);
    // The first page of the listing the page shows first came with the tip: the blocks of its operations go out with the settlements,
    // in their batches, or after them to a node that takes no batch, which each keeps to `limit` calls in flight
    const listing = ahead?.listing;
    if (this.batched) await Promise.all([this.fetchSettlements(limit), listing && this.takeListing(listing)]);
    else {
      await this.fetchSettlements(limit);
      if (listing) await this.takeListing(listing);
    }
    this.derive();
    await this.probeBoundaries(first || gap > 0);
    // Back after more than a window, the node's BTC-final report is read after the round's statuses, as at the end of a round, and
    // caps them before the backfill: the report of hours before had it read a step of blocks below the boundary for nothing
    if (gap > 0) {
      await this.refreshReported();
      this.derive();
    }
    // Backfill downwards until the cache reaches the BTC-final boundary: the wallet's balance split (the two kinds of confirmation)
    // and the six confirmations (D-116) need every block not yet final. With a block every 5 seconds this stretch is some 1 400
    // blocks (MAX_DEPTH), so each sync fills in only a small piece and the rest is completed slowly in the background. A history
    // view asks for more from a node without the operation listings (wantBlocks, D-110): then the pieces are bigger and the rounds
    // follow one another
    const from = this.loadedFrom;
    const floor = this.backfillFloor(tipH);
    if (from > floor) {
      const history = this.readingBlocks;
      const to = Math.max(floor, from - (history ? this.historyStep : this.backfillStep));
      this.linkFloor = Math.min(this.linkFloor, to);
      const heights: number[] = [];
      for (let h = to; h < from; h++) heights.push(h);
      const inFlight = history ? this.wide : limit;
      const infos = await mapLimit(heights, inFlight, (h) => this.node.getBlock(h));
      for (const info of infos) this.ingest(info);
      // The step may join the blocks held below it, those a round read again past the heights between: the walk goes on through them
      this.linkFloor = Math.min(this.linkFloor, this.loadedFrom);
      await this.linkRange();
      await this.fetchMerged(inFlight);
      await this.fetchSettlements(inFlight);
      this.derive();
      // Only while the round got further down: a chain that changed under it is left to the next poll
      if (history && this.loadedFrom < from && this.readingBlocks) this.again = true;
    }
    await Promise.all([
      this.refreshOwnOps(),
      this.refreshAccounts(ahead?.accounts),
      ahead?.done ?? Promise.all([this.refreshFee(), this.refreshBtc()]),
      this.refreshIndexer(ahead?.indexer),
      this.refreshMissingOps(),
      this.refreshSkippedOps(),
      this.refreshReported(checked),
      this.restoreClaims(),
    ]);
    // With the BTC tip just read and the claims restored
    await this.followNatives();
    // The assets the round came upon, in its blocks, its listing or its accounts' balances, are named before it shows
    await this.assetsRead(asked);
    this.prune();
    this.derive();
  }

  /**
   * Blocks by height, `wide` at a time, each with its height. A height the node has no block at is left out: guessed below a tip that a
   * shorter branch then replaced, it is above the chain's tip (and `linkRange` fills any gap below the tip)
   */
  private async readHeights(heights: readonly number[]): Promise<[number, BlockInfo][]> {
    const infos = await mapLimit(heights, this.wide, (h) =>
      this.node.getBlock(h).catch((e: unknown) => {
        if (e instanceof RpcError && e.code === -32004) return null;
        throw e;
      }),
    );
    return infos.flatMap((info, i) => (info ? [[heights[i] as number, info] as [number, BlockInfo]] : []));
  }

  /**
   * The reads a first sync ends with that need no block: the fee estimate and the Bitcoin tip in full, and the indexer's status and the
   * watched accounts as the node answers them, which the end of the sync works out with its blocks (the indexer's check and an
   * account's locked rows name blocks); and the first page of the listing the page shows first, whose blocks the sync reads with its
   * settlements (`takeListing`)
   */
  private readAhead(): ReadAhead {
    // What the page opens on (`listAhead`), until it first shows: an account's or a contract's account is watched from the read on,
    // which a watch from when the connecting screen said so would not be after a minute's wait for the node
    const opened = this.ready ? undefined : this.landing;
    if (opened && opened.key !== 'latest') this.watched.set(opened.key, this.now());
    // The listing the page shows first, unless the node has none or a view has it already
    const landing = this.listsOps !== false && opened && !this.listings.has(opened.key) ? opened : undefined;
    return {
      done: Promise.all([this.refreshFee(), this.refreshBtc()]),
      ...(this.indexer ? { indexer: readEarly(this.indexer.status()) } : {}),
      // The assets an account holds are asked for as its balances come in: with the window's settlements, not a round trip after them
      accounts: new Map(this.watchedAccounts().map((id) => [id, readEarly(this.node.getAccount(id).then((info) => this.noteBalances(info)))])),
      ...(landing ? { listing: { key: landing.key, page: readEarly(this.listOps(landing.key, { before: null, limit: Math.min(this.listPage, Math.max(1, landing.rows)) })) } } : {}),
    };
  }

  /**
   * The BTC-final tip the node reports caps the BTC-final height the statuses give (D-114): a block the node reported and then took
   * back, which takes a BTC reorg of BTC_FINALITY_CONFS blocks or more reaching the BTC block that decided it, stops showing as final
   * without a reload, and its status is asked again (`fetchSettlements`). Read after the round's statuses, when BTC moved or when the
   * statuses give more than the tip last read, so that it never holds back what the node reports. The first sync's network check
   * (`checked`) read it at the start of the round: that report stands where the statuses read since give no more, rather than a round
   * trip more at the end of the first load; where they give more it is older than them, and only a report read after them caps them
   */
  private async refreshReported(checked?: ChainInfo) {
    if (checked && this.inferredFinal <= Number(checked.finalized.height)) {
      this.noteReported(checked);
      return;
    }
    if (!checked && !this.reportDue && this.inferredFinal <= this.reportedFinal) return;
    let info: ChainInfo;
    try {
      info = await this.node.getChainInfo();
    } catch {
      return; // asked again next round
    }
    this.noteReported(info);
  }

  private noteReported(info: ChainInfo) {
    const reported = Number(info.finalized.height);
    this.reportDue = false;
    this.reportedFinal = reported;
    this.probedFinal = Math.min(this.probedFinal, reported);
  }

  /** A page left open for a long time: a cache that only grows would fill the memory, so drop blocks that are long BTC-final and far below the tip (except the ones the page is viewing) */
  private prune() {
    const now = this.now();
    for (const [id, at] of this.watched) if (now - at > WATCH_MS) this.watched.delete(id);
    for (const [hash, at] of this.pinned) if (now - at > 10 * 60_000) this.pinned.delete(hash);
    for (const [h, at] of this.btcTimeAsked) if (now - at > BTC_TIME_RETRY) this.btcTimeAsked.delete(h);
    for (const [id, at] of this.fundingAsked) if (now - at > BTC_TIME_RETRY) this.fundingAsked.delete(id);
    // The commits read go only with the heights read for them: a height taken as read would hide its commit
    if (this.fundingRead.size > PRUNE_ABOVE) {
      this.fundingRead.clear();
      this.fundingOuts.clear();
    }
    for (const [key, l] of this.lookups) if (l.state === 'missing' && now - (l.at ?? now) > 10 * 60_000) this.lookups.delete(key);
    for (const [key, l] of this.listings) if (!l.loading && now - l.at > HISTORY_MS) this.listings.delete(key);
    for (const [id, d] of this.deploySearches) if (!d.loading && now - d.at > HISTORY_MS) this.deploySearches.delete(id);
    if (this.byHash.size <= PRUNE_ABOVE) return;
    for (const [h, page] of this.btcPages) if (now - page.at > 10 * 60_000) this.btcPages.delete(h);
    // What a history view still asks for is kept (D-110)
    const floor = Math.min(this.finalHeight, this.blocks.length - 1 - KEEP_BELOW_TIP, this.historyLive(now) ? this.historyFloor : Number.POSITIVE_INFINITY);
    this.linkFloor = Math.max(this.linkFloor, floor);
    // The blocks of this page's own operations, which it keeps, stay with them: without its block one would read as waiting to be included
    const own = new Set<Hex>();
    for (const id of this.submitted.keys()) {
      const hash = this.ops.get(id)?.blockHash;
      if (hash) own.add(hash);
    }
    const gone = new Set<Hex>();
    for (const b of this.byHash.values()) {
      const at = b.acceptedHeight ?? b.header.height;
      if (b.header.height > 0 && at < floor && !this.pinned.has(b.hash) && !own.has(b.hash)) {
        gone.add(b.hash);
        // Pruned blocks are all BTC-final: remember this as a floor when inferring the boundaries
        if (b.acceptedHeight !== undefined) this.prunedFloor = Math.max(this.prunedFloor, b.acceptedHeight);
      }
    }
    const goneTxs = new Set<Hex>();
    for (const hash of gone) {
      const b = this.byHash.get(hash);
      if (!b) continue;
      if (this.blocks[b.header.height]?.hash === hash) delete this.blocks[b.header.height];
      this.byHash.delete(hash);
      this.raw.delete(hash);
      this.settlementInfo.delete(hash);
      this.carriers.delete(hash);
      this.bodyCarriers.delete(hash);
      this.carrierAsked.delete(hash);
      this.mergedBy.delete(hash);
      for (const id of b.settlements) goneTxs.add(id);
    }
    this.sideBlocks = this.sideBlocks.filter((b) => !gone.has(b.hash));
    for (const [h, level] of this.sideByHeight) {
      const kept = level.filter((b) => !gone.has(b.hash));
      if (kept.length) this.sideByHeight.set(h, kept);
      else this.sideByHeight.delete(h);
    }
    const goneOps = new Set<Hex>();
    for (const [id, r] of this.ops) {
      if (r.blockHash && gone.has(r.blockHash) && !this.submitted.has(id)) {
        this.ops.delete(id);
        goneOps.add(id);
      }
    }
    if (goneOps.size) for (const set of this.accOps.values()) for (const id of goneOps) set.delete(id);
    // A transaction known only from the settlement answer of a block it carries (partial) goes with that block, even one made for another
    // block (a carrier's settlement)
    for (const [txid, tx] of this.btcTxs) if ((tx.opId && goneOps.has(tx.opId)) || (tx.forBlock && gone.has(tx.forBlock)) || (tx.partial && tx.bodies.some((h) => gone.has(h)))) goneTxs.add(txid);
    for (const txid of goneTxs) {
      this.btcTxs.delete(txid);
      this.sawPending.delete(txid);
    }
    // A block kept whose carriers went names none of them: one whose header carrier went is searched for again as a page asks
    for (const [map, header] of [
      [this.carriers, true],
      [this.bodyCarriers, false],
    ] as const) {
      for (const [hash, ids] of map) {
        for (const txid of ids) if (goneTxs.has(txid)) ids.delete(txid);
        if (ids.size) continue;
        map.delete(hash);
        if (header) this.carrierAsked.delete(hash);
      }
    }
    for (const [txid, hash] of this.forcedIn) if (!this.btcTxs.has(txid) || !this.byHash.has(hash)) this.forcedIn.delete(txid);
    for (const id of this.skipAsked.keys()) if (!this.ops.has(id)) this.skipAsked.delete(id);
    const btcFloor = (this.blocks[floor]?.header.btcAnchor.height ?? 0) - 12;
    for (const h of [...this.btcKnown.keys()]) if (h < btcFloor) this.btcKnown.delete(h);
    for (const h of [...this.btcSeen.keys()]) if (h < btcFloor) this.btcSeen.delete(h);
    // The blocks kept below it, which a page views, still name and date the BTC blocks they saw (`readBtcBlock`, `askBtcTimes`)
    for (const b of this.byHash.values()) if (b.header.btcAnchor.height < btcFloor) this.noteAnchor(b.header.btcAnchor.height, b.header.btcAnchor.hash, b.time);
    this.closureCache.clear();
  }

  /**
   * Check the cached main chain along parents[0]: from the tip downwards, wherever a height does not link up (a main-chain
   * switch, or the chain changed while blocks were being fetched by height concurrently), fetch the correct parent by hash and
   * replace it; gaps inside this stretch (a former chain block that was merged as a parallel block) are filled by hash too.
   * Only the stretch loaded contiguously by height is checked: gaps between earlier blocks fetched individually on demand
   * (viewing #3, the block holding some operation) are not filled. With `ask`, the first switch it meets has the genesis block read
   * with the parent, as a network that started over switched all the way down: false where it did (`anotherGenesis`)
   */
  private async linkRange(ask = false): Promise<boolean> {
    let h = this.blocks.length - 1;
    const floor = Math.max(1, h - MAX_DEPTH, this.linkFloor);
    let switched = !ask;
    while (h > floor) {
      const b = this.blocks[h];
      if (!b) break;
      const parent = b.header.parents[0];
      if (!parent) break;
      const p = this.blocks[h - 1];
      if (!p || p.hash !== parent) {
        const genesis = p && !switched && this.blocks[0] ? this.node.getBlock(0) : undefined;
        if (p) {
          switched = true;
          this.forget(p.hash);
        }
        const [info, start] = await Promise.all([this.node.getBlock(parent), genesis]);
        if (this.anotherGenesis(start)) return false;
        this.ingest(info);
        // The node's answer says it is no longer on the main chain (the chain changed again): leave it for the next sync
        if (this.blocks[h - 1]?.hash !== parent) break;
      }
      h--;
    }
    // No switch replaces the genesis block: block 1 naming another as its parent is a network that started over, where the walk met no
    // switch to show it, the page having held no block above the height the new chain was first read at (a devnet a block high)
    const one = this.blocks[1];
    if (h === 1 && one && this.blocks[0] && one.header.parents[0] !== this.blocks[0].hash && this.anotherGenesis(await this.node.getBlock(0))) return false;
    return true;
  }

  /**
   * A genesis block read that is not the one the page holds: the node's network started over (a devnet at will; the signet, restarted
   * from genesis for a consensus change before mainnet). All the page read belongs to the chain before, its blocks, operations,
   * balances and the statuses worked out from them, so the chain stops, and the page reads the node anew (`startedOver`)
   */
  private anotherGenesis(info: BlockInfo | undefined): boolean {
    const held = this.blocks[0];
    if (!info || !held || toHex(info.hash) === held.hash) return false;
    if (!this.stopped) {
      this.stop();
      this.startedOver?.();
    }
    return true;
  }

  /**
   * Remove a block from the cache entirely (it is no longer a chain block): the positions of the operations pointing to it are
   * invalidated with it, and the blocks it merged (whose acceptance lapses with it) are removed too; if a new chain block merges
   * the same blocks, they are fetched again through merged, with receipts from the new execution.
   */
  private forget(hash: Hex, cascade = true) {
    const b = this.byHash.get(hash);
    if (!b) return;
    if (this.blocks[b.header.height]?.hash === hash) {
      delete this.blocks[b.header.height];
      // Another block's settlement may stand at its height now, read for what commits spend (`readFunding`) where the backfill loaded
      // it later, and at the heights read further down where the chain switched at the bottom of the stretch walked (`linkRange`) or
      // below it: they are read again
      this.fundingRead.delete(b.header.height);
      if (b.header.height <= this.linkFloor) this.fundingRead.clear();
    }
    this.removeSide(b);
    this.byHash.delete(hash);
    this.raw.delete(hash);
    this.settlementInfo.delete(hash);
    this.mergedBy.delete(hash);
    this.closureCache.clear();
    for (const r of this.ops.values()) {
      if (r.blockHash === hash) {
        delete r.blockHash;
        delete r.entryIndex;
        delete r.result;
        delete r.height;
      }
      if (r.skippedIn?.some((x) => x.block === hash)) r.skippedIn = r.skippedIn.filter((x) => x.block !== hash);
    }
    if (!cascade) return;
    const merged = [...this.mergedBy].filter(([, by]) => by === hash).map(([side]) => side);
    for (const side of merged) if (this.byHash.get(side)?.side) this.forget(side, false);
  }

  /**
   * Parallel blocks merged by chain blocks: those never fetched, or whose merging chain block changed, are (re)fetched by hash. The
   * chain blocks are those loaded contiguously from the tip, and those at `also` (the blocks a round read again past the heights between)
   */
  private async fetchMerged(limit = CONCURRENCY, also: readonly number[] = []) {
    const want = new Map<Hex, Hex>();
    const merges = (b: Block) => {
      for (const id of b.merged) {
        const known = this.byHash.get(id);
        if (!known || this.mergedBy.get(id) !== b.hash || known.acceptedHeight !== b.header.height) want.set(id, b.hash);
      }
    };
    for (let h = this.blocks.length - 1; h > 0; h--) {
      const b = this.blocks[h];
      if (!b) break;
      merges(b);
    }
    for (const h of also) {
      const b = this.blocks[h];
      if (b) merges(b);
    }
    if (!want.size) return;
    const ids = [...want.keys()];
    const infos = await mapLimit(ids, limit, (id) => this.node.getBlock(id));
    infos.forEach((info, i) => {
      const id = ids[i] as Hex;
      this.ingest(info);
      this.mergedBy.set(id, want.get(id) as Hex);
    });
  }

  /**
   * When the settled / BTC-final boundary is below the cache (on signet the BTC-final boundary can be seven or eight hundred
   * blocks below the tip), bisect by height: the settled / btc_final of ksana_getSettlement form a prefix on the main chain.
   * Empty blocks have no settlement transaction (-32004), so look for a nearby block that has one. `wide` while the page waits for
   * it (the first sync): each probe asks all its candidates at once
   */
  private async probeBoundaries(wide = false) {
    const bottom = this.loadedFrom;
    const needSettled = this.settledHeight + 1 < bottom;
    const needFinal = this.finalHeight + 1 < bottom;
    if (!needSettled && !needFinal) return;
    if (this.now() - this.lastProbe < PROBE_MS) return;
    this.lastProbe = this.now();
    if (needSettled) this.probedSettled = Math.max(this.probedSettled, await this.bisect('settled', this.settledHeight, bottom, wide));
    if (needFinal) this.probedFinal = Math.max(this.probedFinal, await this.bisect('btc_final', this.finalHeight, Math.min(bottom, Math.max(this.settledHeight, this.probedSettled) + 1), wide));
    this.derive();
  }

  /**
   * Find the highest main-chain height in (lo, hi) where flag holds: lo is known to hold (or is 0), hi is treated as not holding.
   * Where calls go out in batches, each round probes `PROBE_POINTS` heights at once (a search over a thousand blocks then takes
   * four rounds, not ten); otherwise one, halving the range. A height is asked once a search (`asked`)
   */
  private async bisect(flag: 'settled' | 'btc_final', lo: number, hi: number, wide: boolean): Promise<number> {
    const points = this.batched ? PROBE_POINTS : 1;
    const asked = new Map<number, Promise<() => SettlementInfo>>();
    for (let tries = 0; hi - lo > 1 && tries < 40; tries++) {
      const mids = new Set<number>();
      for (let i = 1; i <= points; i++) mids.add(lo + Math.floor(((hi - lo) * i) / (points + 1)));
      const found = await Promise.all([...mids].filter((mid) => mid > lo && mid < hi).map((mid) => this.probeAt(mid, lo, hi, asked, wide)));
      let moved = false;
      for (const r of found) {
        if (!r) continue;
        moved = true;
        if (r[flag]) lo = Math.max(lo, r.height);
        else hi = Math.min(hi, r.height);
      }
      if (!moved) break;
    }
    return lo;
  }

  /**
   * The settled / btc_final of the first chain block with a settlement transaction near height mid (between lo and hi, searching 8
   * blocks downwards first, then 8 upwards). Where calls go out in batches the candidates are asked a tier at a time (`PROBE_TIERS`),
   * or all at once where `wide`, each height once a search (`asked`), and read in that order as if asked one by one: at most three
   * round trips, not one per empty block, and on a chain whose blocks mostly have a settlement, one call a probe
   */
  private async probeAt(mid: number, lo: number, hi: number, asked: Map<number, Promise<() => SettlementInfo>>, wide: boolean): Promise<{ height: number; settled: boolean; btc_final: boolean } | null> {
    const order: number[] = [];
    for (let k = mid; k > lo && mid - k < 8; k--) order.push(k);
    for (let k = mid + 1; k < hi && k - mid <= 8; k++) order.push(k);
    const ask = (from: number, to: number) => {
      for (const k of order.slice(from, to)) {
        if (asked.has(k)) continue;
        const answer = this.node.getSettlement(k).then(
          (s) => () => s,
          (e: unknown) => () => {
            throw e;
          },
        );
        asked.set(k, answer);
      }
    };
    const tiers = wide ? [] : PROBE_TIERS;
    for (const [i, k] of order.entries()) {
      if (this.batched && (i === 0 || tiers.includes(i))) ask(i, tiers.find((t) => t > i) ?? order.length);
      try {
        const early = asked.get(k);
        const s = early ? (await early)() : await this.node.getSettlement(k);
        return { height: Number(s.block.height), settled: s.settled, btc_final: s.btc_final };
      } catch (e) {
        if (e instanceof RpcError && e.code === -32004) continue;
        throw e;
      }
    }
    return null;
  }

  /**
   * Fetch each block's settlement status: new blocks and blocks not yet broadcast every time; broadcast and confirming blocks
   * only when BTC advances (the anchor height changed, or a minute has passed since the last full refresh), as the confirmation
   * count and settled / btc_final only change then. Where calls go out in batches, a batch's worth at a time: the refresh asks
   * again for every block not yet BTC-final, down to MAX_DEPTH below the tip, and `limit` at a time it took a round trip for every
   * few blocks (some 600 at that depth on a busy chain), holding the next sync back.
   */
  private async fetchSettlements(limit = CONCURRENCY) {
    const tip = this.blocks[this.blocks.length - 1];
    const anchor = tip?.header.btcAnchor.height ?? -1;
    let btcMoved = anchor !== this.lastAnchor;
    if (btcMoved && tip) {
      if (this.lastAnchor >= 0) this.anchorTimes.push(tip.time);
      if (this.anchorTimes.length > 8) this.anchorTimes.shift();
      this.lastAnchor = anchor;
    }
    if (this.now() - this.lastFullRefresh > 60_000) btcMoved = true;
    if (btcMoved) {
      this.lastFullRefresh = this.now();
      this.reportDue = true;
    }
    const want: Hex[] = [];
    for (const [hash, info] of this.raw) {
      if (!settles(info)) continue;
      const s = this.settlementInfo.get(hash);
      if (!s) want.push(hash);
      // BTC-final stays so, unless it is above the BTC-final tip the node reports (taken back, D-114)
      else if (s.btc_final) {
        if ((this.byHash.get(hash)?.acceptedHeight ?? Number(s.block.height)) > this.reportedFinal) want.push(hash);
      } else if (s.status === 'pending' || btcMoved) want.push(hash);
    }
    if (!want.length) return;
    await mapLimit(want, this.batched ? this.wide : limit, (hash) => this.readSettlement(hash));
  }

  /** A block's settlement status, by hash or by height; none where the node has none for the block (-32004: it needs no body, D-043) */
  private async settlementOf(id: Hex | number): Promise<SettlementInfo | undefined> {
    try {
      return await this.node.getSettlement(id);
    } catch (e) {
      if (e instanceof RpcError && e.code === -32004) return undefined;
      throw e;
    }
  }

  /** Keeps a block's settlement status, where the node has one */
  private async readSettlement(hash: Hex) {
    const s = await this.settlementOf(hash);
    if (s) this.settlementInfo.set(hash, s);
  }

  private async refreshOwnOps() {
    const pending = [...this.submitted.keys()].filter((id) => !this.ops.get(id)?.blockHash);
    await mapLimit(pending, CONCURRENCY, async (id) => {
      try {
        const st = await this.node.getOpStatus(id);
        this.missCount.delete(id);
        const r = this.ops.get(id);
        // Back in the entry pool (put back after a reorg): undo "dropped"
        if (r && st.status === 'pending' && r.dropped) {
          delete r.dropped;
          if (!this.mempool.some((x) => x.id === id)) this.mempool = [...this.mempool, r];
        }
        await this.applyOpStatus(id, st);
      } catch (e) {
        if (e instanceof RpcError && e.code === -32004) {
          const r = this.ops.get(id);
          const misses = (this.missCount.get(id) ?? 0) + 1;
          this.missCount.set(id, misses);
          // Only two consecutive misses count as dropped from the entry pool (D-068): one may just mean the operation has not
          // been put back into the pool yet during a reorg. Path C operations never enter the entry pool: the node does not
          // know them before the BTC transaction confirms and they are force-included
          if (misses >= 2 && r && !r.dropped && !r.blockHash && r.path !== 'C') {
            r.dropped = withText({ at: this.now() }, 'reason', lazy((m) => m.rpc.dropped));
            this.removePending(id);
          }
          return;
        }
        throw e;
      }
    });
  }

  /** Operations in the entry pool: the node returns only the status, not the content. Ask again after a while; the detail page appears by itself once included */
  private async refreshMissingOps() {
    const now = this.now();
    const due: Hex[] = [];
    for (const [key, l] of this.lookups) if (key.startsWith('op:') && l.state === 'missing' && now - (l.at ?? 0) > RECHECK_MS) due.push(key.slice(3));
    await mapLimit(due, CONCURRENCY, async (id) => {
      try {
        const st = await this.node.getOpStatus(id);
        if (st.status !== 'pending') await this.applyOpStatus(id, st);
        if (this.ops.has(id)) this.lookups.delete(`op:${id}`);
        else this.lookups.set(`op:${id}`, missing(st.status === 'pending' ? PENDING_MSG : missingText('op', this.config.chain), now));
      } catch (e) {
        if (!(e instanceof RpcError && e.code === -32004)) throw e;
        this.lookups.set(`op:${id}`, missing(missingText('op', this.config.chain), now));
      }
    });
  }

  /**
   * Operations of others this page saw skipped (D-063) and nowhere executed: whether the node holds one in its entry pool again, as it
   * does while the op is still valid, to include it again, or executed it in a block the page has not read. Asked every RECHECK_MS
   * until the node says it does neither; this page's own are asked at every sync (`refreshOwnOps`)
   */
  private async refreshSkippedOps() {
    const now = this.now();
    const due: Hex[] = [];
    for (const [id, r] of this.ops) {
      if (r.blockHash || !r.skippedIn?.length || r.dropped || this.submitted.has(id)) continue;
      if (now - (this.skipAsked.get(id) ?? 0) > RECHECK_MS) due.push(id);
    }
    await mapLimit(due, CONCURRENCY, async (id) => {
      this.skipAsked.set(id, now);
      try {
        await this.applyOpStatus(id, await this.node.getOpStatus(id));
      } catch {
        // Not known meanwhile, and the page says nothing of it either way: asked again after RECHECK_MS, without failing the sync
      }
    });
  }

  /** The operations placed in the blocks at `heights` and in the parallel blocks those merged, this page's own aside (`refreshOwnOps`) */
  private opsOfBlocksAt(heights: Iterable<number>): Hex[] {
    const held = new Set<Hex>();
    for (const h of heights) {
      const b = this.blocks[h];
      if (b) held.add(b.hash);
    }
    for (const [side, by] of this.mergedBy) if (held.has(by)) held.add(side);
    return [...this.ops].flatMap(([id, r]) => (r.blockHash && held.has(r.blockHash) && !this.submitted.has(id) ? [id] : []));
  }

  /**
   * The operations a branch took out of the blocks a round read again (`unplaced`): the node says where each is now, and the block
   * holding it is read (`applyOpStatus`), one the node holds in its entry pool again waiting there. One the node does not know is left
   * as the page has it; one whose read fails is asked again the next round
   */
  private async placeAgain(limit: number) {
    const ids = [...this.unplaced].filter((id) => {
      const r = this.ops.get(id);
      if (r && !r.blockHash) return true;
      this.unplaced.delete(id);
      return false;
    });
    await mapLimit(ids, limit, async (id) => {
      try {
        await this.applyOpStatus(id, await this.node.getOpStatus(id));
        this.unplaced.delete(id);
      } catch (e) {
        if (e instanceof RpcError && e.code === -32004) this.unplaced.delete(id);
      }
    });
  }

  /** The accounts a sync reads: those a page showed lately, and the wallet's */
  private watchedAccounts(): Hex[] {
    const now = this.now();
    const ids = [...this.watched].filter(([, at]) => now - at < WATCH_MS).map(([id]) => id);
    if (this.walletKey && !ids.includes(this.walletKey.account)) ids.push(this.walletKey.account);
    return ids;
  }

  /** `ahead`: the answers read with the first sync's call for the tip */
  private async refreshAccounts(ahead?: ReadonlyMap<Hex, () => Promise<AccountInfo>>) {
    await mapLimit(this.watchedAccounts(), CONCURRENCY, (id) => this.fetchAccount(id, ahead?.get(id)));
  }

  private async refreshFee() {
    try {
      this.fee = await this.node.estimateFee();
      this.feeRate = Number(this.fee.feerate_sat_vb);
    } catch {
      /* Older nodes have no estimateFee: use the node policy's default */
    }
  }

  /** Bitcoin RPC (optional): the tip height, read sparingly (`BtcTipReader`), for the top-up expiry check and the wallet page */
  private async refreshBtc() {
    try {
      await this.btcReads?.poll();
    } catch (e) {
      this.emit('alert', t().rpc.btcRpcDown(errMessage(e)));
    }
  }

  /** `ahead`: the status read with the first sync's call for the tip */
  private async refreshIndexer(ahead?: () => Promise<IndexerStatus>) {
    if (!this.indexer) return;
    let st: IndexerStatus;
    try {
      st = await (ahead ? ahead() : this.indexer.status());
    } catch (e) {
      this.indexerError = errMessage(e);
      this.emit('alert', t().rpc.indexerDown(errMessage(e)));
      return;
    }
    this.indexerError = null;
    try {
      this.indexerHalted = st.halted;
      if (st.btc_height !== null) this.indexerBtcHeight = st.btc_height;
      const height = Number(st.height);
      if (height === this.indexerHeight && this.indexerChecks.length) return;
      this.indexerHeight = height;
      let nodeBlock = this.blocks[height];
      if (!nodeBlock && height > 0) nodeBlock = this.ingest(await this.node.getBlock(height));
      if (!nodeBlock) return;
      const hash = toHex(st.hash);
      // The indexer only executes settled chain blocks with SETTLEMENT_DEPTH confirmations: differing from the node's chain block that deep means the two have diverged; record it as is
      const check: IndexerCheck = {
        height,
        hash,
        ...(nodeBlock.hash !== hash ? { nodeHash: nodeBlock.hash } : {}),
        nodeRoot: nodeBlock.header.stateRoot,
        indexerRoot: toHex(st.state_root),
        at: this.now(),
      };
      this.indexerChecks.push(check);
      tallyCheck(this.indexerTally, check);
      if (this.indexerChecks.length > 40) this.indexerChecks.shift();
    } catch (e) {
      this.emit('alert', t().rpc.indexerDown(errMessage(e)));
    }
  }

  private emit(kind: ChainEvent['kind'], text: string, ref?: string) {
    const last = this.events[this.events.length - 1];
    if (last?.text === text) return;
    this.events.push({ id: this.events.length + 1, at: this.now(), kind, text, ...(ref ? { ref } : {}) });
    if (this.events.length > 100) this.events.shift();
  }

  // =====================================================================
  // Ingest
  // =====================================================================

  private ingest(info: BlockInfo): Block {
    const hash = toHex(info.hash);
    const header = toHeader(info.header);
    const accepted = info.accepted_height === null ? undefined : Number(info.accepted_height);
    const isChain = accepted === header.height;
    const time = header.timestamp * 1000;
    const entries: EntryRecord[] = info.entries.map((e, i) => ({ entry: toEntry(e), result: toResult(info.receipts[i]), dataBytes: entryDataBytes(e) }));
    const block: Block = {
      hash,
      header,
      entries,
      time,
      dataBytes: blockDataBytes(info),
      gasUsed: info.receipts.reduce((s, r) => s + Number(r.gas_used), 0),
      maxGasSum: info.entries.reduce((s, e) => {
        const op = entryOp(e);
        if (!op) return s;
        return s + (e.kind === 'Forced' ? Math.min(Number(op.max_gas), PARAMS.NATIVE_MAX_GAS) : Number(op.max_gas));
      }, 0),
      needsSettlement: info.entries.some((e) => e.kind !== 'Forced'),
      settlements: [],
      merged: info.merged.map(toHex),
      ...(isChain ? {} : { side: true }),
      ...(accepted !== undefined ? { acceptedHeight: accepted } : {}),
    };
    const prev = this.byHash.get(hash);
    if (prev) {
      this.removeSide(prev);
      // Formerly a chain block, now coming back as a parallel block (it was merged): this height of the main chain becomes empty and the linkage check fills it
      if (!isChain && this.blocks[prev.header.height]?.hash === hash) delete this.blocks[prev.header.height];
    }
    if (isChain) {
      const there = this.blocks[header.height];
      if (there && there.hash !== hash) this.forget(there.hash);
      // Formerly merged, now a chain block: no longer discarded together with the block that merged it
      this.mergedBy.delete(hash);
    }
    this.raw.set(hash, info);
    this.byHash.set(hash, block);
    this.closureCache.clear();
    if (isChain) {
      this.blocks[header.height] = block;
    } else {
      this.sideBlocks.push(block);
      const level = this.sideByHeight.get(header.height) ?? [];
      level.push(block);
      this.sideByHeight.set(header.height, level);
    }
    if (info.settlement) {
      const parsed = parseSettlement(info.settlement, { hash, height: header.height, producer: header.producer, time }, this.sdkParams, this.network);
      if (parsed) {
        block.settlementTxid = parsed.reveal.txid;
        block.settlements = [parsed.reveal.txid];
        for (const tx of [parsed.reveal, parsed.commit]) {
          const old = this.btcTxs.get(tx.txid);
          this.btcTxs.set(
            tx.txid,
            old
              ? {
                  ...tx,
                  status: old.status,
                  ...(old.confirmedHeight !== undefined ? { confirmedHeight: old.confirmedHeight } : {}),
                  ...(old.broadcastAt !== undefined ? { broadcastAt: old.broadcastAt } : {}),
                }
              : tx,
          );
        }
        for (const h of parsed.headers) addTo(this.carriers, h, parsed.reveal.txid);
        for (const h of parsed.bodies) addTo(this.bodyCarriers, h, parsed.reveal.txid);
      }
    }
    info.entries.forEach((e, i) => this.ingestEntry(e, i, block));
    // The genesis block's producer is the all-zero pubkey, not a real producer
    if (header.height > 0) this.noteProducer(header.producer);
    this.noteAnchor(header.btcAnchor.height, header.btcAnchor.hash, time);
    return block;
  }

  private removeSide(b: Block) {
    this.sideBlocks = this.sideBlocks.filter((x) => x.hash !== b.hash);
    const level = this.sideByHeight.get(b.header.height);
    if (level) this.sideByHeight.set(b.header.height, level.filter((x) => x.hash !== b.hash));
  }

  private ingestEntry(e: BlockInfo['entries'][number], index: number, b: Block) {
    const op = entryOp(e);
    const rec = b.entries[index] as EntryRecord;
    if (e.kind === 'Forced') {
      const txid = btcHex(e.btc_txid);
      if (!this.btcTxs.has(txid)) {
        this.btcTxs.set(txid, partialTx(txid, 'native', b.time, { opId: opIdOf(e.op), author: toHex(e.op.account) }));
      }
      this.forcedIn.set(txid, b.hash);
    }
    if (!op) return;
    const id = opIdOf(op);
    let r = this.ops.get(id);
    if (!r) {
      const sub = this.submitted.get(id);
      r = { id, op: toVmOp(op), path: pathOf(op), size: opBytesOf(op), submittedAt: sub?.at ?? b.time, origin: sub?.origin ?? 'chain' };
      this.ops.set(id, r);
      this.indexOp(r);
    }
    if (e.kind === 'Forced') {
      r.nativeTxid = btcHex(e.btc_txid);
      const tx = this.btcTxs.get(r.nativeTxid);
      if (tx) tx.status = 'confirmed';
    }
    const result = rec.result;
    if (result.reason === 'unaccepted') return;
    if (result.reason === 'skipped') {
      const at = b.acceptedHeight !== undefined ? (this.blocks[b.acceptedHeight]?.time ?? b.time) : b.time;
      const list = (r.skippedIn ?? []).filter((s) => s.block !== b.hash);
      list.push(result.message !== undefined ? { block: b.hash, index, reason: result.message, at } : withText({ block: b.hash, index, at }, 'reason', lazy((m) => m.rpc.skipped)));
      r.skippedIn = list;
      return;
    }
    r.blockHash = b.hash;
    r.entryIndex = index;
    r.result = result;
    this.settleContract(r);
    this.indexResult(r);
    if (b.acceptedHeight !== undefined) r.height = b.acceptedHeight;
    else delete r.height;
    this.removePending(id);
    if (this.nativePending.some((x) => x.id === id)) this.nativePending = this.nativePending.filter((x) => x.id !== id);
  }

  private indexOp(r: OpRecord) {
    const touch = (acc: Hex) => addTo(this.accOps, acc, r.id);
    touch(r.op.account);
    if (r.op.action.kind === 'AssetTransfer') touch(r.op.action.to);
    if (r.op.action.kind === 'Call') touch(r.op.action.contract);
    if (r.op.action.kind === 'Deploy' && r.op.action.contract) this.noteContract(r.op.action.contract).deploy = r.id;
    if (r.op.action.kind === 'AssetTransfer') this.noteAsset(r.op.action.asset);
    // The funds a call or a deployment attaches (D-073) show in their assets' units too
    if (r.op.action.kind !== 'AssetTransfer') for (const f of r.op.action.funds ?? []) this.noteAsset(f.asset);
  }

  /**
   * What an executed operation's receipt names, as the node's listings list it (D-122, D-123): the accounts its changes to built-in
   * assets name and the assets themselves, KSA's aside; and the accounts the events of a token standard name, with the contract that
   * emitted them, once the page knows that contract's declaration (read here the first time an event of it comes)
   */
  private indexResult(r: OpRecord) {
    for (const c of r.result?.changes ?? []) {
      for (const acc of changeAccounts(c)) this.listUnder(r, acc);
      if (c.asset === KSA_ASSET_ID) continue;
      this.listUnder(r, c.asset);
      this.noteAsset(c.asset);
      // A pause or a capability given up changes the asset's rules (D-121): its page reads them again when it next shows it
      const known = this.assets.get(c.asset);
      if (known && (c.kind === 'pause' || c.kind === 'renounce')) delete known.capabilities;
    }
    this.indexEvents(r);
  }

  private indexEvents(r: OpRecord) {
    for (const ev of r.result?.events ?? []) {
      const contract = ev.fields.contract;
      if (!contract) continue;
      const te = this.tokenBook.eventOf(ev);
      if (te === undefined) {
        addTo(this.undeclared, contract, r.id);
        this.tokenBook.wantDeclaration(contract);
      } else if (te) for (const acc of [contract, ...eventAccounts(te)]) this.listUnder(r, acc);
    }
  }

  /** An operation goes under an account as the node lists it: never under the zero account (KSA's ID), nor a deployment under the contract it creates (D-111) */
  private listUnder(r: OpRecord, acc: Hex) {
    if (acc === KSA_ASSET_ID || (r.op.action.kind === 'Deploy' && r.op.action.contract === acc)) return;
    addTo(this.accOps, acc, r.id);
  }

  /** What the index told came in: an account's holdings go into its state, and the operations that waited on a contract's declaration are attributed */
  private tokensChanged({ account, contract }: { account?: Hex; contract?: Hex }) {
    const acc = account === undefined ? undefined : this.accounts.get(account);
    const held = account === undefined ? undefined : this.tokenBook.holdings.get(account);
    if (acc && held) {
      acc.tokens = held.tokens;
      acc.collections = held.collections;
    }
    const waiting = contract === undefined ? undefined : this.undeclared.get(contract);
    if (contract !== undefined && waiting && this.tokenBook.standardOf(contract) !== undefined) {
      this.undeclared.delete(contract);
      for (const id of waiting) {
        const r = this.ops.get(id);
        if (r) this.indexEvents(r);
      }
      for (const a of this.accounts.values()) a.opIds = this.opIdsOf(a.id);
    }
    this.bump();
  }

  private noteContract(id: Hex) {
    let e = this.contractEvidence.get(id);
    if (!e) this.contractEvidence.set(id, (e = {}));
    return e;
  }

  /**
   * What an executed operation tells of a contract: a call that succeeded or a deployment's outcome, and the contracts that emitted
   * its events, which only a contract does (a pool's token moved by its add_liquidity read as an account, by a Taproot address)
   */
  private settleContract(r: OpRecord) {
    const a = r.op.action;
    if (a.kind === 'Call' && r.result?.ok) this.noteContract(a.contract).known = true;
    if (a.kind === 'Deploy' && a.contract) {
      const e = this.noteContract(a.contract);
      if (r.result?.ok) e.known = true;
      else e.failed = true;
    }
    if (r.result?.ok) {
      for (const ev of r.result.events) {
        const by = ev.fields.contract;
        if (by && /^[0-9a-f]{64}$/.test(by)) this.noteContract(by).known = true;
      }
    }
  }

  /**
   * Whether the page knows the account to be a contract: an asset it issued or a call to it that succeeded settles it, and its
   * deployment counts unless it failed (a failed deployment creates none)
   */
  isContract(id: Hex): boolean {
    const e = this.contractEvidence.get(id);
    return !!e && (!!e.known || (e.deploy !== undefined && !e.failed));
  }

  /** The contracts the page knows of */
  knownContracts(): Hex[] {
    return [...this.contractEvidence.keys()].filter((id) => this.isContract(id));
  }

  /** The operation that deployed the contract, where the page has seen it */
  deployOf(id: Hex): OpRecord | undefined {
    const op = this.contractEvidence.get(id)?.deploy;
    const r = op ? this.ops.get(op) : undefined;
    return r?.result?.ok === false ? undefined : r;
  }

  /**
   * A contract page's first search for the deployment has not ended (`wantDeployment`, about to start on its first frame), or the
   * deployment, known by its ID but not in the cache with its block, is being asked for the first time: the page says it is looking.
   * Asked again after a failure, it does not, so that the line does not come and go every RECHECK_MS while the node fails
   */
  seekingDeployment(id: Hex): boolean {
    if (this.listsOps === false) return false;
    const s = this.deploySearches.get(id);
    const deploy = this.contractEvidence.get(id)?.deploy;
    if (deploy === undefined) return !s || (!s.done && !s.error);
    if (this.ops.get(deploy)?.blockHash !== undefined) return false;
    const state = this.lookup('op', deploy)?.state;
    return state === 'loading' ? !s?.retried : state === undefined && s?.refetchAt === undefined;
  }

  /**
   * A contract page shows the deployment that created the contract: called on every render. The node lists a deployment under its
   * signer only (D-111), so a page opened from a link has not seen it, and it is searched for (`searchDeployment`) once; the block
   * holding it is kept while the page asks, and fetched again when the cache dropped it while no page showed it.
   */
  wantDeployment(id: Hex) {
    if (!this.ready || this.listsOps === false) return;
    const now = this.now();
    let s = this.deploySearches.get(id);
    if (!s) this.deploySearches.set(id, (s = { loading: false, done: false, at: now }));
    s.at = now;
    const deploy = this.contractEvidence.get(id)?.deploy;
    if (deploy !== undefined) {
      const r = this.ops.get(deploy);
      if (r?.blockHash) {
        this.pinned.set(r.blockHash, now);
        // In the cache with its block: should it lose them, it is asked for as a first time
        delete s.refetchAt;
        delete s.retried;
      } else {
        // Dropped from the cache, or known only without the block that executed it (seen where a parallel block skipped it, or its
        // block dropped): asked for by its ID, at most once in RECHECK_MS, whatever the lookup's outcome (each ends in a render,
        // which asks again)
        const state = this.lookup('op', deploy)?.state;
        if (state === 'loading' || state === 'missing' || (s.refetchAt !== undefined && now - s.refetchAt < RECHECK_MS)) return;
        if (s.refetchAt !== undefined) s.retried = true;
        s.refetchAt = now;
        this.retry('op', deploy);
      }
      return;
    }
    if (s.loading || s.done || (s.error && now - s.error.at < RECHECK_MS)) return;
    void this.findDeployment(id, s);
  }

  private async findDeployment(id: Hex, s: DeploySearch) {
    s.loading = true;
    try {
      await this.searchDeployment(id);
      s.done = true;
      delete s.error;
    } catch (e) {
      // A node without the listings (D-110) has none to search
      if (e instanceof RpcError && e.code === RPC_ERROR_CODES.METHOD_NOT_FOUND) s.done = true;
      else s.error = { message: errMessage(e), at: this.now() };
    } finally {
      s.loading = false;
      this.derive();
      this.bump();
    }
  }

  /**
   * A deployment comes before the first call to the contract that succeeded: the contract's own listing gives the position of its
   * earliest operation that did not fail (only the positions, without the blocks), and the operations of the whole chain below it
   * are read a page at a time with their blocks, newest first, until the deployment turns up. A contract with no such operation
   * (none at all, or calls that all failed, as calls to a contract can as well as calls to an account with no code) is looked for
   * below the newest. A transfer to the ID before the deployment, which needs the ID worked out ahead, would put the deployment
   * above where the search starts; and a contract another contract created (`create_contract`, D-073) has no deployment op: both
   * searches end empty.
   */
  private async searchDeployment(id: Hex) {
    let floor: OpPosition | undefined;
    let before: OpPosition | null = null;
    // The contract's listing a view read to its end gives that operation without listing it again
    const listed = this.listings.get(id);
    if (listed?.next === null) floor = listed.floor;
    else {
      for (let page = 0; ; page++) {
        if (page === DEPLOY_FLOOR_PAGES) return;
        const list = await this.node.getAccountOps(id, { before, limit: MAX_OPS_LIMIT });
        for (const o of list.ops) if (o.status !== 'failed' && o.status !== 'skipped') floor = o.position;
        if (list.next === null) break;
        before = list.next;
      }
    }
    before = floor ?? null;
    const found = () => this.contractEvidence.get(id)?.deploy !== undefined;
    for (let page = 0; page < DEPLOY_PAGES && !found(); page++) {
      const list = await this.node.getLatestOps({ before, limit: DEPLOY_PAGE });
      const hashes = [...new Set(list.ops.map((o) => toHex(o.block.hash)))].filter((h) => !this.raw.has(h));
      // A few blocks at a time, newest first, so that the search stops at the block holding the deployment; a node that takes batches
      // is sent the page's blocks at once, a round trip for the page rather than one for every few blocks
      const step = this.batched ? Math.max(1, hashes.length) : CONCURRENCY;
      for (let i = 0; i < hashes.length && !found(); i += step) {
        const infos = await mapLimit(hashes.slice(i, i + step), step, (h) => this.node.getBlock(h));
        for (const info of infos) this.ingest(info);
      }
      if (list.next === null) return;
      before = list.next;
    }
  }

  private noteAsset(id: Hex) {
    if (this.assets.has(id)) return;
    this.assets.set(id, unnamedAsset(id, true));
    this.readAsset(id);
  }

  /**
   * Ask the node for the name, symbol, decimals, total supply and issuing contract (ksana_getAsset, D-074, D-121). Until it answers, the asset's
   * amounts show as being read. An asset the node says it does not have (-32004) keeps its ID for a name, and its amounts show in
   * base units, which is all there is; one it did not answer for stays being read, which the send page does not offer, and is asked
   * again RECHECK_MS later: its decimals would turn its base units into another number
   */
  private readAsset(id: Hex) {
    const read = this.node
      .getAsset(fromHex(id, 32))
      .then((info) => this.takeAsset(id, info))
      .catch((e: unknown) => {
        if (e instanceof RpcError && e.code === RPC_ERROR_CODES.NOT_FOUND) this.assets.set(id, unnamedAsset(id, false));
        else this.assetRetry.set(id, this.now());
      })
      .finally(() => {
        this.assetReads.delete(read);
        this.bump();
      });
    this.assetReads.set(read, this.assetsAsked++);
  }

  private takeAsset(id: Hex, info: AssetInfo) {
    const name = cleanAssetName(info.name) || unnamedAsset(id, false).name;
    const issuer = toHex(info.issuer);
    const known = { id, name, decimals: info.decimals, totalSupply: info.total_supply, issuer, capabilities: [...info.capabilities], paused: info.paused };
    // The symbol the asset records (D-121), cut to 8 characters. A name or symbol that reads as KSA's or bitcoin's never stands for
    // its symbol: the symbol stays the one the asset's ID gives (the review of M33)
    const symbol = clipText(cleanAssetName(info.symbol) || name, 8);
    const lookalike = nativeLookalike(name) ?? nativeLookalike(symbol);
    if (id === KSA_ASSET_ID) {
      // KSA keeps the page's own name for it; the node adds its supply, the block rewards paid out so far (D-079)
      this.assets.set(id, { ...KSA_META, totalSupply: info.total_supply });
      return;
    }
    this.assets.set(id, lookalike ? withText({ ...known, lookalike }, 'symbol', lazy((m) => m.rpc.assetSymbol, id.slice(0, 6))) : { ...known, symbol });
    // Any asset but KSA is issued by a contract
    this.noteContract(issuer).known = true;
  }

  /** The assets whose read got no answer are asked again with the next sync RECHECK_MS after it failed */
  private retryAssets() {
    const now = this.now();
    for (const [id, at] of this.assetRetry) {
      if (now - at < RECHECK_MS) continue;
      this.assetRetry.delete(id);
      this.readAsset(id);
    }
  }

  /**
   * The asset reads asked since `asked` (the count of `assetsAsked` then) are in: what a sync, a lookup or a listing's page read then
   * shows with its assets' names and decimals, not as being read. Each waits for the reads asked since it began, not for those another
   * began before it (a sync that met no new asset is not held up by a block page's), and for at most `ASSET_PATIENCE_MS`: the amounts of
   * a slower answer show as being read until it comes in
   */
  private async assetsRead(asked: number) {
    const reads = [...this.assetReads].filter(([, n]) => n >= asked).map(([read]) => read.catch(() => undefined));
    if (!reads.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const patience = new Promise<void>((resolve) => (timer = setTimeout(resolve, ASSET_PATIENCE_MS)));
    try {
      await Promise.race([Promise.all(reads), patience]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Producers are numbered in the order of their accounts, so that a producer keeps its number from one page load to the next:
   * numbered as they turned up, one was producer 1 or producer 2 by which block the first load reached down to
   */
  private noteProducer(id: Hex) {
    if (this.producers.some((p) => p.id === id)) return;
    this.producers.push({ id, name: '', weight: 1, minTokenFee: NODE_POLICY.MIN_TOKEN_FEE });
    this.producers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.producers.forEach((p, i) => {
      const name = lazy((m) => m.rpc.producer, i + 1);
      withText(p, 'name', name);
      this.labelText.set(p.id, name);
      this.labels.set(p.id, name());
    });
  }

  private noteAnchor(height: number, hash: Hex, time: number) {
    const known = this.btcKnown.get(height);
    if (!known) this.btcKnown.set(height, { height, hash, txids: [] });
    else if (!known.hash) known.hash = hash;
    this.noteSighting(height + anchorDepthOf(this.config.chain), time);
  }

  /** At `time` BTC was at height `seen`: by a fast-lane block's producer, or by a reading of the Bitcoin RPC's tip */
  private noteSighting(seen: number, time: number) {
    const s = this.btcSeen.get(seen);
    if (!s) this.btcSeen.set(seen, { first: time, last: time });
    else {
      s.first = Math.min(s.first, time);
      s.last = Math.max(s.last, time);
    }
  }

  /**
   * The Bitcoin RPC's tip, at the time it was read (by this tab or another): the BTC tip's block was there by then, which dates the
   * tip before a fast-lane block has seen it, a block of an idle lane being minutes apart; and the time its block gives, where the
   * reading gave it with the block's hash, which dates it exactly (`btcStamps`), remembered on this device. A block kept so that a
   * BTC reorg replaced, as the page knows the block now at its height, is dropped, and so is one a week below the tip (`stampHolds`);
   * the times given as the blocks' own are those at or below the tip (`btcExact`)
   */
  private noteTipRead() {
    this.takeStamps();
    const reads = this.btcReads;
    const height = reads?.height;
    const at = reads?.readAt;
    if (reads && height !== undefined && at !== undefined) {
      this.noteSighting(height, at);
      const { hash, time } = reads;
      const kept = this.btcStamps.get(height);
      if (hash !== undefined && time !== undefined && (kept?.hash !== hash || kept.time !== time)) {
        this.btcStamps.set(height, { time, hash });
        this.stampsUnsaved = true;
      }
    }
    const tip = this.currentBtcHeight();
    const holds = this.stampHolds(tip);
    for (const [h, stamp] of this.btcStamps) {
      if (holds(h, stamp)) continue;
      this.btcStamps.delete(h);
      this.stampsUnsaved = true;
    }
    if (this.stampsUnsaved) this.saveStamps(holds);
    this.btcExact = new Map([...this.btcStamps].filter(([h]) => h <= tip).map(([h, s]) => [h, s.time]));
  }

  /**
   * Whether a BTC block kept as read still stands with the BTC tip at `tip`: less than STAMPS_KEPT below it, and the block the page
   * knows at its height, where it knows one (`btcHashesFrom`)
   */
  private stampHolds(tip: number): (height: number, stamp: BtcStamp) => boolean {
    const floor = tip - STAMPS_KEPT;
    const named = this.btcHashesFrom(floor + 1);
    return (height, stamp) => height > floor && (named.get(height) ?? stamp.hash) === stamp.hash;
  }

  /**
   * The BTC block at each height from `from` up, as the page knows it now: the one a loaded block's settlement confirmed in, as the
   * node gives it, and otherwise the one the latest block of the loaded main chain anchored there names
   */
  private btcHashesFrom(from: number): Map<number, Hex> {
    const named = new Map<number, Hex>();
    for (const s of this.settlementInfo.values()) if (s.confirmed && s.confirmed.height >= from) named.set(s.confirmed.height, btcHex(s.confirmed.block));
    // From the tip down to the first block anchored below `from`: anchors never go down along the main chain
    for (let h = this.blocks.length - 1; h > 0; h--) {
      const anchor = this.blocks[h]?.header.btcAnchor;
      if (!anchor || anchor.height < from) break;
      if (!named.has(anchor.height)) named.set(anchor.height, anchor.hash);
    }
    return named;
  }

  /** Where the BTC block times of this network are remembered: under its name, with its genesis block's hash once read */
  private stampsKey(): { key: string; genesis: Hex } | undefined {
    const genesis = this.blocks[0];
    return genesis ? { key: `btcTimes:${this.config.chain}`, genesis: genesis.hash } : undefined;
  }

  /** The BTC block times remembered on this device, once the genesis block names the network: a time read on this visit stands */
  private takeStamps() {
    const where = this.stampsKey();
    if (this.stampsTaken || !where || !this.btcTimeStore) return;
    this.stampsTaken = true;
    for (const [height, stamp] of rememberedStamps(this.btcTimeStore.load(where.key), where.genesis)) {
      if (!this.btcStamps.has(height)) this.btcStamps.set(height, stamp);
    }
  }

  /** Remembers the BTC block times read, with those another tab remembered meanwhile that still stand (`holds`): at most STAMPS_KEPT */
  private saveStamps(holds: (height: number, stamp: BtcStamp) => boolean) {
    const where = this.stampsKey();
    const store = this.btcTimeStore;
    if (!where || !store) return;
    this.stampsUnsaved = false;
    const kept = new Map(rememberedStamps(store.load(where.key), where.genesis).filter(([h, s]) => holds(h, s)));
    for (const [height, stamp] of this.btcStamps) kept.set(height, stamp);
    const blocks = [...kept].sort((a, b) => b[0] - a[0]).slice(0, STAMPS_KEPT);
    store.save(where.key, { genesis: where.genesis, blocks: blocks.map(([h, s]) => [h, s.time, s.hash]) });
  }

  /**
   * When BTC blocks were mined, by height: the time a block gives, where the page read it as the tip (`btcExact`); otherwise as far as
   * the loaded fast-lane blocks tell: it was there when the first block that saw it was produced, and not yet when the last block that
   * saw less was. The first of these times, when the two are at most `BTC_TIME_SPAN` apart; otherwise (a long gap in what is loaded,
   * or no loaded block from before it) the time is not known. For many heights at once: the sightings sorted once, with the earliest
   * from each one up and the latest up to each.
   */
  private btcTimes(): (height: number) => number | undefined {
    // A block's own time is a sighting too: BTC was at its height then, which bounds the blocks around it
    const sightings = new Map(this.btcSeen);
    for (const [height, time] of this.btcExact) {
      const s = sightings.get(height);
      sightings.set(height, s ? { first: Math.min(s.first, time), last: Math.max(s.last, time) } : { first: time, last: time });
    }
    const seen = [...sightings].sort((a, b) => a[0] - b[0]);
    const heights = seen.map(([h]) => h);
    const firstFrom = seen.map(([, s]) => s.first);
    for (let i = firstFrom.length - 2; i >= 0; i--) firstFrom[i] = Math.min(firstFrom[i] as number, firstFrom[i + 1] as number);
    const lastTo = seen.map(([, s]) => s.last);
    for (let i = 1; i < lastTo.length; i++) lastTo[i] = Math.max(lastTo[i] as number, lastTo[i - 1] as number);
    return (height) => {
      const own = this.btcExact.get(height);
      if (own !== undefined) return own;
      // The first sighting at or above the height
      let lo = 0;
      let hi = heights.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((heights[mid] as number) < height) lo = mid + 1;
        else hi = mid;
      }
      const after = firstFrom[lo];
      const before = lo > 0 ? lastTo[lo - 1] : undefined;
      return after !== undefined && before !== undefined && after - before <= BTC_TIME_SPAN ? after : undefined;
    };
  }

  private removePending(id: Hex) {
    if (this.mempool.some((r) => r.id === id)) this.mempool = this.mempool.filter((r) => r.id !== id);
  }

  private async applyOpStatus(id: Hex, st: SdkOpStatus) {
    if (st.block) {
      const hash = toHex(st.block.hash);
      if (!this.raw.has(hash)) this.ingest(await this.node.getBlock(hash));
    }
    const r = this.ops.get(id);
    if (r && st.status === 'skipped' && !r.skippedIn?.length) {
      const block = st.block ? toHex(st.block.hash) : '';
      const index = st.index ?? 0;
      const error = st.receipt?.error;
      r.skippedIn = [error ? { block, index, reason: error, at: this.now() } : withText({ block, index, at: this.now() }, 'reason', lazy((m) => m.rpc.skipped))];
    }
    if (!r || r.blockHash || !r.skippedIn?.length) return;
    // Skipped, the node holds it in its entry pool again while it is still valid, answering pending then, and skipped once it does
    // not: it will not be included again, nor holds its nonce (D-063)
    if (st.status === 'pending') {
      r.requeued = true;
      delete r.dropped;
    } else if (st.status === 'skipped') {
      delete r.requeued;
      r.dropped ??= withText({ at: this.now() }, 'reason', lazy((m) => m.rpc.notRequeued));
      this.removePending(id);
    }
  }

  /** The assets an account's balances name are asked for (`noteAsset`) */
  private noteBalances(info: AccountInfo): AccountInfo {
    for (const b of info.balances) this.noteAsset(toHex(b.asset));
    return info;
  }

  private async fetchAccount(id: Hex, ahead?: () => Promise<AccountInfo>) {
    const info = this.noteBalances(await (ahead ? ahead() : this.node.getAccount(id)));
    const balances = new Map<Hex, bigint>();
    for (const b of info.balances) balances.set(toHex(b.asset), b.amount);
    const acc: AccountState = { id, nonce: Number(info.nonce), balances, opIds: this.opIdsOf(id) };
    // Its tokens and collections, as the index last added them up, read again once more operations name it (D-123)
    const held = this.tokenBook.holdings.get(id);
    if (held) {
      acc.tokens = held.tokens;
      acc.collections = held.collections;
    }
    this.accounts.set(id, acc);
    this.tokenBook.wantHoldings(id, acc.opIds.length);
    // The node lists only those not yet unlocked: one listed before and gone now has been unlocked (the unlock height is unknown)
    const listed = new Set<Hex>();
    for (const f of info.locked_fees) {
      const blockHash = toHex(f.block_hash);
      listed.add(blockHash);
      const b = this.byHash.get(blockHash);
      // A producer's portion of another producer's block is its share as that block's carrier, which landed the block's data on
      // Bitcoin (D-095); the block share (D-089), the only other portion, goes to the block share account the genesis config names,
      // which produces no blocks. (The node does not answer ksana_getSettlement for an empty block, the most of them on an idle chain, so its
      // carrier_account cannot tell; an account that takes republish rewards without producing blocks, --carrier-payee, goes unmarked.)
      const asCarrier = !!b && b.header.producer !== id && this.producers.some((p) => p.id === id);
      this.lockedFees.set(`${blockHash}:${id}`, { blockHash, height: b?.acceptedHeight ?? b?.header.height ?? 0, producer: id, amount: f.amount, unlocked: false, ...(asCarrier ? { asCarrier } : {}) });
    }
    for (const f of this.lockedFees.values()) if (f.producer === id && !f.unlocked && !listed.has(f.blockHash)) f.unlocked = true;
  }

  /**
   * The operations the page has seen listed under an account, a contract or an asset (D-111, D-122, D-123), oldest first, without
   * watching it as an account would be: an asset's page lists its history so
   */
  opsUnder(key: Hex): Hex[] {
    return this.opIdsOf(key);
  }

  private opIdsOf(account: Hex): Hex[] {
    const ids = [...(this.accOps.get(account) ?? [])];
    return ids.sort((a, b) => this.opOrderKey(a) - this.opOrderKey(b));
  }

  private opOrderKey(id: Hex): number {
    const r = this.ops.get(id);
    if (!r) return Number.MAX_SAFE_INTEGER;
    if (r.height !== undefined) return r.height * 4096 + (r.entryIndex ?? 0);
    // Skipped only: where it was first skipped, as the node lists it (D-111); one not yet included above every included one
    let key = Number.MAX_SAFE_INTEGER - 1;
    for (const s of r.skippedIn ?? []) {
      const at = this.byHash.get(s.block)?.acceptedHeight;
      if (at !== undefined) key = Math.min(key, at * 4096 + s.index);
    }
    return key;
  }

  // =====================================================================
  // Derivation: settlement status, settled / BTC-final heights, BTC tip and closures
  // =====================================================================

  /**
   * A commit transaction's fee, where the page has parsed every transaction its inputs spend, or read them below the blocks it has
   * (`askCommitFees`): on signet a producer funds almost every commit from the change of an earlier one (D-081). The transactions do not
   * carry their inputs' amounts, so a commit funded from elsewhere keeps no fee, and a settlement's fee is then its reveal
   * transaction's alone (`pairFee`). Its inputs then also take the addresses, and any owner, of the outputs they spend
   */
  private fillCommitFees() {
    for (const tx of this.btcTxs.values()) {
      if (tx.kind !== 'commit' || tx.feeSat !== undefined || !tx.inputs.length) continue;
      const spent = tx.inputs.map((i) => this.btcTxs.get(i.prevout.txid)?.outputs[i.prevout.vout] ?? this.fundingOut(tx, i.prevout));
      const values = spent.map((o) => o?.valueSat);
      if (!values.every((v): v is number => v !== undefined)) continue;
      const fee = values.reduce((s, v) => s + v, 0) - tx.outputs.reduce((s, o) => s + o.valueSat, 0);
      if (fee < 0) continue;
      tx.inputs = tx.inputs.map((i, k) => {
        const o = spent[k];
        return { ...i, valueSat: values[k], owner: o?.owner ?? i.owner, ...(o?.address ? { address: o.address } : {}) };
      });
      tx.feeSat = fee;
      tx.feeRate = Math.round((fee / tx.vsize) * 100) / 100;
    }
  }

  /**
   * An output the commit transaction `by` spends of a commit read below the blocks the page has (`readFunding`): owned by the
   * producer of `by`'s block where it pays that account's key, as `parseSettlement` names a settlement's own outputs, a producer's
   * settlement spending its own coins alone (D-078)
   */
  private fundingOut(by: BtcTx, at: OutPoint): { valueSat: number; owner: Hex | null; address?: string } | undefined {
    const o = this.fundingOuts.get(at.txid)?.[at.vout];
    if (!o) return undefined;
    const producer = by.forBlock ? this.byHash.get(by.forBlock)?.header.producer : undefined;
    return { valueSat: o.valueSat, owner: producer !== undefined && o.key === producer ? producer : null, ...(o.address ? { address: o.address } : {}) };
  }

  /**
   * The BTC height of each path C transaction a loaded block forced in, where the page has not read it otherwise: the block names
   * only its ID, and it confirmed within the block's window, the BTC heights (h(p), h(B)] with h(x) = x's anchor − NATIVE_CONFIRMATIONS
   * + 1 and p the parent anchored highest (D-036). Exact when the parents are loaded and the window is one height wide, as it mostly
   * is; otherwise the window's top, marked `heightAtMost`
   */
  private placeForced() {
    const h = (b: Block) => b.header.btcAnchor.height - PARAMS.NATIVE_CONFIRMATIONS + 1;
    for (const [txid, hash] of this.forcedIn) {
      const tx = this.btcTxs.get(txid);
      const b = this.byHash.get(hash);
      if (!tx || !b || (tx.confirmedHeight !== undefined && !tx.heightAtMost)) continue;
      const parents = b.header.parents.map((p) => this.byHash.get(p));
      const below = parents.length && parents.every((p) => p !== undefined) ? Math.max(...parents.map((p) => h(p as Block))) : undefined;
      tx.confirmedHeight = h(b);
      if (below === h(b) - 1) delete tx.heightAtMost;
      else tx.heightAtMost = true;
    }
  }

  /**
   * Each loaded block's weight (D-084, D-090), which the node does not give: 1 for a block with entries and for the genesis block;
   * for an empty block the weight of its streak, the empty blocks in a row below it along the selected parents (`parents[0]`),
   * counted down to one with entries, the genesis block or the fourth, past which the weight stays at MAX_EMPTY_BLOCK_WEIGHT.
   * Unknown while one of those is not loaded
   */
  private fillWeights() {
    for (const b of this.byHash.values()) {
      if (b.weight !== undefined) continue;
      if (b.header.height === 0 || b.header.entriesRoot !== EMPTY_ENTRIES_ROOT) {
        b.weight = 1;
        continue;
      }
      let streak = 0;
      let p = this.byHash.get(b.header.parents[0] ?? '');
      while (p && streak < STREAK_AT_CAP && p.header.height > 0 && p.header.entriesRoot === EMPTY_ENTRIES_ROOT) {
        streak++;
        p = this.byHash.get(p.header.parents[0] ?? '');
      }
      if (p || streak >= STREAK_AT_CAP) b.weight = emptyBlockWeight(streak);
    }
  }

  private derive() {
    this.fillCommitFees();
    this.placeForced();
    this.fillWeights();
    // Status and on-chain position of the settlement transactions
    for (const [hash, s] of this.settlementInfo) {
      const b = this.byHash.get(hash);
      if (!b) continue;
      const own = b.settlementTxid;
      if (own) {
        const tx = this.btcTxs.get(own);
        if (tx) {
          // Recomputed every time from the node's current answer (a confirmation can disappear after a BTC reorg)
          const st = statusOf(s, own);
          tx.status = st.status;
          if (st.confirmedHeight !== undefined) tx.confirmedHeight = st.confirmedHeight;
          else delete tx.confirmedHeight;
          if (st.replacedBy) tx.replacedBy = st.replacedBy;
          else delete tx.replacedBy;
          // The node does not record broadcast times: the moment is noted only when this page sees it go from "pending broadcast" to broadcast
          if (s.status === 'pending') this.sawPending.add(own);
          else if (tx.broadcastAt === undefined && this.sawPending.has(own)) tx.broadcastAt = this.now();
          // The commit and reveal transactions are broadcast together and confirmed together (D-081)
          const commit = tx.commitTxid ? this.btcTxs.get(tx.commitTxid) : undefined;
          if (commit) {
            commit.status = tx.status;
            if (tx.confirmedHeight !== undefined) commit.confirmedHeight = tx.confirmedHeight;
            else delete commit.confirmedHeight;
            if (tx.broadcastAt !== undefined) commit.broadcastAt = tx.broadcastAt;
          }
        }
      }
      // The body is carried by another block's settlement payload (D-077)
      if (s.carrier) {
        b.carrier = toHex(s.carrier.hash);
        b.carrierHeight = Number(s.carrier.height);
      } else {
        delete b.carrier;
        delete b.carrierHeight;
      }
      if (s.confirmed) {
        const winner = btcHex(s.confirmed.txid);
        const btcBlock = btcHex(s.confirmed.block);
        if (winner !== own) {
          const carrierOwn = b.carrier ? this.byHash.get(b.carrier)?.settlementTxid : undefined;
          if (winner !== carrierOwn && !this.btcTxs.has(winner)) {
            // The node gives only the transaction ID and the position: the carrier's own settlement, which it names with the carrier,
            // where the page has not loaded that block (D-077); otherwise a rescue settlement or a republish (D-044, D-047). It takes
            // the block's time, so that a list puts it beside the block and not above the transactions built since
            const tx =
              s.carrier && s.txid && btcHex(s.txid) === winner
                ? partialTx(winner, 'settlement', b.time, { forBlock: toHex(s.carrier.hash), forHeight: Number(s.carrier.height), bodies: [hash] })
                : partialTx(winner, own ? 'rescue' : 'headers', b.time, { forBlock: hash, forHeight: b.header.height, bodies: [hash] });
            tx.status = 'confirmed';
            tx.confirmedHeight = s.confirmed.height;
            this.btcTxs.set(winner, tx);
          }
          if (own && winner !== carrierOwn && !b.settlements.includes(winner)) b.settlements.push(winner);
          addTo(this.bodyCarriers, hash, winner);
        }
        b.settlementOnBtc = { txid: winner, btcHeight: s.confirmed.height };
        // The BTC block's own hash; its transactions are listed below, from the transactions themselves
        const known = this.btcKnown.get(s.confirmed.height);
        if (!known) this.btcKnown.set(s.confirmed.height, { height: s.confirmed.height, hash: btcBlock, txids: [] });
        else if (!known.hash) known.hash = btcBlock;
      } else {
        delete b.settlementOnBtc;
      }
    }
    // The earliest transaction to put the header and the body on chain: the earliest confirmed among the block's own settlement and the settlement / republish transactions carrying it (D-077)
    const earliest = (ids: Iterable<Hex>, start?: OnBtc): OnBtc | undefined => {
      let best = start;
      for (const txid of ids) {
        const tx = this.btcTxs.get(txid);
        if (tx?.status === 'confirmed' && tx.confirmedHeight !== undefined && (!best || tx.confirmedHeight < best.btcHeight)) best = { txid, btcHeight: tx.confirmedHeight };
      }
      return best;
    };
    for (const b of this.byHash.values()) {
      const header = earliest(this.carriers.get(b.hash) ?? [], b.settlementOnBtc);
      if (header) b.headerOnBtc = header;
      else delete b.headerOnBtc;
      if (b.needsSettlement && !this.settlementInfo.has(b.hash)) {
        // When the node did not answer its settlement status, look in the parsed payloads for a transaction that carried its body
        const body = earliest(this.bodyCarriers.get(b.hash) ?? []);
        if (body) b.settlementOnBtc = body;
        else delete b.settlementOnBtc;
      }
    }
    // Settled / BTC-final: by the height of the chain block accepting the block (settled and btc_final can only be queried for
    // blocks with a settlement transaction). Recomputed every time from the node's current answer, so it can fall back after a
    // BTC reorg; the floor is the bisection results and the pruned blocks (all long final). BTC-final is capped by the tip the node
    // reports, which also takes back what the node took back before its statuses are asked again (D-114)
    let final = Math.max(this.probedFinal, this.prunedFloor);
    let settled = Math.max(final, this.probedSettled);
    for (const [hash, s] of this.settlementInfo) {
      const at = this.byHash.get(hash)?.acceptedHeight ?? Number(s.block.height);
      if (s.settled && at > settled) settled = at;
      if (s.btc_final && at > final) final = at;
    }
    const tipH = this.blocks.length - 1;
    this.settledHeight = Math.min(settled, tipH);
    this.inferredFinal = Math.min(final, this.settledHeight);
    this.finalHeight = Math.min(this.inferredFinal, this.reportedFinal);
    // Acceptor: a parallel block only recognizes a chain block in the cache that actually merges it
    for (const b of this.sideBlocks) {
      const by = b.acceptedHeight !== undefined ? this.blocks[b.acceptedHeight] : undefined;
      if (by && by.merged.includes(b.hash)) b.acceptedBy = by.hash;
      else delete b.acceptedBy;
    }
    for (const b of this.byHash.values()) if (!b.side) b.acceptedBy = b.hash;
    // Closure (D-063): the maximum of the BTC height at which this block's data landed and the closures of its parents. A parent outside the
    // cache counts as final only once the cache holds every chain block above the BTC-final tip, and only when none of them merges it (the
    // blocks they merge are fetched after them): it is then accepted at or below that tip. Otherwise it may be a block not yet final whose data
    // landed after this block's (a settlement bumped or rescued late), and the closure is not known: while a page load backfills, no block
    // shows the six confirmations until the cache reaches the BTC-final boundary (D-116).
    // Lowest first, so that the parents are already known and the recursion stays shallow however much history is loaded
    this.closureCache.clear();
    const merging = new Set<Hex>();
    const loaded = this.finalityLoaded;
    if (loaded) for (let h = tipH; h > this.finalHeight; h--) for (const id of this.blocks[h]?.merged ?? []) merging.add(id);
    const outsideFinal = (p: Hex) => loaded && !merging.has(p);
    for (const b of [...this.byHash.values()].sort((x, y) => x.header.height - y.header.height)) {
      const c = this.closureOf(b, outsideFinal);
      if (c === undefined) delete b.closureBtc;
      else b.closureBtc = c;
    }
    // Block interval: the median over the last 20 chain blocks
    const gaps: number[] = [];
    for (let h = tipH; h > 1 && gaps.length < 20; h--) {
      const a = this.blocks[h];
      const p = this.blocks[h - 1];
      if (!a || !p) break;
      gaps.push(a.time - p.time);
    }
    if (gaps.length >= 3) {
      gaps.sort((x, y) => x - y);
      this.fastIntervalMs = Math.max(500, gaps[Math.floor(gaps.length / 2)] as number);
    }
    if (this.anchorTimes.length >= 3) {
      const diffs = this.anchorTimes.slice(1).map((t, i) => t - (this.anchorTimes[i] as number));
      diffs.sort((x, y) => x - y);
      this.btcIntervalMs = Math.max(1000, diffs[Math.floor(diffs.length / 2)] as number);
    }
    // The op lists of the accounts
    for (const acc of this.accounts.values()) acc.opIds = this.opIdsOf(acc.id);
    // Op order: by acceptance height and entry index
    this.opOrder = [...this.ops.keys()].sort((a, b) => this.opOrderKey(a) - this.opOrderKey(b));
    // What the page knows Ksana put in each BTC block, from the transactions themselves, so that one a BTC reorg moved is listed where it
    // is now: every settlement, rescue or republish confirmed there, a settlement's commit transaction before its reveal (they confirm
    // together, D-081), and a path C transaction at its own height, not one known only to be at or below a height (D-036)
    for (const k of this.btcKnown.values()) k.txids = [];
    const confirmed = [...this.btcTxs.values()].filter((tx) => tx.status === 'confirmed' && tx.confirmedHeight !== undefined && !tx.heightAtMost);
    for (const tx of confirmed.sort(inBlockOrder)) {
      const height = tx.confirmedHeight as number;
      let k = this.btcKnown.get(height);
      if (!k) this.btcKnown.set(height, (k = { height, hash: '', txids: [] }));
      k.txids.push(tx.txid);
    }
    // The BTC block list, with the times the loaded blocks tell: every height of the last BTC_FILL_SPAN up to the tip, those the page
    // knows nothing of as blocks with no known Ksana transaction, and the known ones below
    this.noteTipRead();
    const timeOf = this.btcTimes();
    for (const k of this.btcKnown.values()) {
      delete k.time;
      delete k.timeExact;
      Object.assign(k, this.btcTimeFields(k.height, timeOf));
    }
    this.btcFilled.clear();
    const tip = this.currentBtcHeight();
    let low = tip + 1;
    for (const h of this.btcKnown.keys()) low = Math.min(low, h);
    for (let h = Math.max(low, this.btcBase, tip - BTC_FILL_SPAN + 1); h <= tip; h++) {
      if (!this.btcKnown.has(h)) this.btcFilled.set(h, { height: h, hash: '', txids: [], ...this.btcTimeFields(h, timeOf) });
    }
    // Below them, those the loaded blocks date: the heights above one a block saw, up to the next one a block saw, take its time when
    // that is known (`btcTimes`); and those read as the tip, with their own
    this.btcTimed.clear();
    const seen = [...new Set([...this.btcSeen.keys(), ...this.btcExact.keys()])].sort((a, b) => a - b);
    for (let i = 0; i < seen.length; i++) {
      const at = seen[i] as number;
      if (at > tip) break;
      const from = Math.max(i > 0 ? (seen[i - 1] as number) + 1 : at, at - BTC_FILL_SPAN);
      // The heights below it, none read as the tip, share the time the same two sightings give
      const below = from < at ? timeOf(from) : undefined;
      for (let h = below === undefined ? at : from; h <= at; h++) {
        const dated = h === at ? this.btcTimeFields(at, timeOf) : { time: below };
        if (dated.time !== undefined && !this.btcKnown.has(h) && !this.btcFilled.has(h)) this.btcTimed.set(h, { height: h, hash: '', txids: [], ...dated });
      }
    }
    this.btcBlocks = [...this.btcKnown.values(), ...this.btcFilled.values()].sort((a, b) => a.height - b.height);
  }

  /** BTC block `height`'s time as `timeOf` gives it, marked as its block's own where the page read it as the tip (`btcExact`) */
  private btcTimeFields(height: number, timeOf: (height: number) => number | undefined): Pick<BtcBlock, 'time' | 'timeExact'> {
    const time = timeOf(height);
    return time === undefined ? {} : this.btcExact.has(height) ? { time, timeExact: true } : { time };
  }

  /** `outsideFinal`: whether a parent outside the cache counts as final; one that does not leaves the closure unknown */
  private closureOf(b: Block, outsideFinal: (parent: Hex) => boolean): number | undefined {
    if (this.closureCache.has(b.hash)) return this.closureCache.get(b.hash);
    this.closureCache.set(b.hash, undefined);
    const data = b.needsSettlement ? b.settlementOnBtc?.btcHeight : b.headerOnBtc?.btcHeight;
    let c = b.header.height === 0 ? this.btcBase : data;
    if (c !== undefined) {
      for (const p of b.header.parents) {
        const pb = this.byHash.get(p);
        if (!pb) {
          if (outsideFinal(p)) continue;
          c = undefined;
          break;
        }
        const pc = this.closureOf(pb, outsideFinal);
        if (pc === undefined) {
          c = undefined;
          break;
        }
        c = Math.max(c, pc);
      }
    }
    this.closureCache.set(b.hash, c);
    return c;
  }

  // =====================================================================
  // Queries (same names and meanings as the simulator)
  // =====================================================================

  get tip(): Block {
    return this.blocks[this.blocks.length - 1] as Block;
  }

  /** The BTC tip at the page's BTC height (`currentBtcHeight`): the block itself where the page knows it, else the height, with the time the page can tell */
  get btcTip(): BtcBlock {
    const height = this.currentBtcHeight();
    return this.getBtcBlock(height) ?? { height, hash: '', txids: [], ...this.btcTimeFields(height, this.btcTimes()) };
  }

  getBlock(id: string | number): Block | undefined {
    if (typeof id === 'number') return this.blocks[id];
    if (/^\d+$/.test(id)) return this.blocks[Number(id)];
    return this.byHash.get(id.toLowerCase());
  }

  sideAt(height: number): Block[] {
    return this.sideByHeight.get(height) ?? [];
  }

  mergedOf(b: Block): Block[] {
    return b.merged.map((id) => this.byHash.get(id)).filter((x): x is Block => !!x);
  }

  getOp(id: Hex): OpRecord | undefined {
    return this.ops.get(id.toLowerCase());
  }

  allOps(): IterableIterator<OpRecord> {
    return this.ops.values();
  }

  getBtcTx(id: Hex): BtcTx | undefined {
    return this.btcTxs.get(id.toLowerCase());
  }

  allBtcTxs(): IterableIterator<BtcTx> {
    return this.btcTxs.values();
  }

  /**
   * The settlements waiting in the BTC mempool, each once: by its reveal transaction (a rescue's, a republish's), not again by its
   * commit, which goes with it (D-081), as the simulator counts them
   */
  get pendingSettlements(): BtcTx[] {
    return [...this.btcTxs.values()].filter((t) => t.status === 'broadcast' && (t.kind === 'settlement' || t.kind === 'rescue' || t.kind === 'headers'));
  }

  /**
   * A BTC block the page knows, one it lists up to the tip with no known Ksana transaction (`btcFilled`), or an older one the loaded
   * blocks date (`btcTimed`)
   */
  getBtcBlock(height: number): BtcBlock | undefined {
    return this.btcKnown.get(height) ?? this.btcFilled.get(height) ?? this.btcTimed.get(height);
  }

  /**
   * Have the node read when BTC blocks a page names were mined, where the page does not know and the stretch loaded from the tip does
   * not reach below them (an operation days old gave no time for its steps on Bitcoin): for each, the first main-chain block that saw
   * it and the one before (`btcTimes`), found by bisection on the anchors, all of them in one search. One still not dated (a failed
   * read, or no two blocks close enough around it) is asked again after BTC_TIME_RETRY
   */
  askBtcTimes(heights: readonly number[]): Promise<void> {
    const now = this.now();
    const from = this.loadedFrom;
    const saw = (this.blocks[from]?.header.btcAnchor.height ?? Number.POSITIVE_INFINITY) + anchorDepthOf(this.config.chain);
    const due = [...new Set(heights)].filter(
      (h) => from > 0 && h <= saw && this.getBtcBlock(h)?.time === undefined && (this.btcTimeAsked.get(h) ?? Number.NEGATIVE_INFINITY) < now - BTC_TIME_RETRY,
    );
    if (!due.length) return Promise.resolve();
    for (const h of due) this.btcTimeAsked.set(h, now);
    return this.readBtcTimes(due)
      .catch(() => undefined)
      .finally(() => {
        this.derive();
        this.bump();
      });
  }

  /**
   * Have the node read what the commit transactions a page shows spend, where the page does not know it and so not their fee: a
   * settlement's would be its reveal transaction's alone (`pairFee`). A producer funds almost every commit from the change of an
   * earlier one (D-081), on signet below the blocks loaded from the tip for about half of those on the first screen: the settlements
   * of the heights below each commit's block are read, nearest first, until every transaction its inputs spend is found or
   * FUNDING_DEPTH blocks lie below (`readFunding`), one search at a time. A commit funded otherwise (a wallet's coins, a CPFP
   * child's change, a republish's, a parallel block's settlement, which a height's status does not give) keeps no fee; one asked
   * about is asked again after BTC_TIME_RETRY, which reads only the heights not read before
   */
  askCommitFees(txids: readonly Hex[]): Promise<void> {
    const now = this.now();
    const due = [...new Set(txids)].flatMap((id) => {
      const tx = this.btcTxs.get(id);
      const asked = this.fundingAsked.get(id) ?? Number.NEGATIVE_INFINITY;
      return tx?.kind === 'commit' && tx.feeSat === undefined && tx.forHeight !== undefined && tx.inputs.length && asked < now - BTC_TIME_RETRY ? [tx] : [];
    });
    if (!due.length) return Promise.resolve();
    for (const tx of due) this.fundingAsked.set(tx.txid, now);
    // After the search under way: what it read is not read again, and what it kept may be all this one needs
    const search = this.fundingSearch.then(() => this.readFunding(due)).catch(() => undefined);
    this.fundingSearch = search;
    return search;
  }

  /**
   * Have the node read the settlement that carried the header of a block that needs no body (empty, or of forced entries alone) and
   * so carries no settlement of its own (D-043), where the page knows of none: one below the stretch loaded from the tip, opened from
   * a link, a BTC block's page or a history list. A settlement payload carries the headers not yet on BTC up to its own block's
   * (D-075), so the first main-chain block above the one that accepted it to carry settlement transactions carries its header too,
   * unless another transaction landed it first: a republish (D-047) or a parallel block's settlement, which no main-chain block names
   * (`readHeaderCarrier`). One whose search failed is asked again after BTC_TIME_RETRY. The searches go one after another: those of
   * the blocks a page lists below the stretch, asked together, read the same heights above them, which each reads only once the
   * search before it has kept what it read; those waiting behind one whose reads waited out their time with no answer end with it
   */
  askHeaderCarrier(hash: Hex): Promise<void> {
    const b = this.byHash.get(hash);
    const info = this.raw.get(hash);
    const asked = this.carrierAsked.get(hash);
    const now = this.now();
    if (!b || !info || b.header.height === 0 || settles(info) || this.headerCarrierRead(hash) || (asked && now - asked.at < BTC_TIME_RETRY)) return Promise.resolve();
    const search = { at: now, done: false };
    this.carrierAsked.set(hash, search);
    const queued = ++this.carrierQueued;
    const run = this.carrierSearch.then(async () => {
      if (queued <= this.carrierStalled) return false;
      try {
        await this.readHeaderCarrier(b);
        return true;
      } catch (e) {
        if (timedOut(e)) this.carrierStalled = this.carrierQueued;
        return false;
      }
    });
    this.carrierSearch = run.then(() => undefined);
    return run
      .then((done) => {
        search.done = done;
      })
      .finally(() => {
        this.derive();
        this.bump();
      });
  }

  /**
   * Whether the page has what carried a block's header, or has nothing more to read for it: the stretch loaded from the tip holds
   * every block above one in it, and the search for one below it ended (`askHeaderCarrier`)
   */
  headerCarrierRead(hash: Hex): boolean {
    const b = this.byHash.get(hash);
    if (!b) return false;
    return this.carriersOf(hash).length > 0 || (b.acceptedHeight ?? b.header.height) >= this.loadedFrom || this.carrierAsked.get(hash)?.done === true;
  }

  /**
   * Whether a BTC block's page has what the main-chain blocks around it tell: read for it (`readBtcBlock`), or in the stretch loaded
   * from the tip, once that reaches below the anchors of the blocks whose settlements land in it in step or up to two BTC blocks late
   */
  btcPageRead(height: number): boolean {
    if (this.btcPages.has(height)) return true;
    const from = this.loadedFrom;
    const bottom = this.blocks[from];
    return from === 0 || (bottom !== undefined && bottom.header.btcAnchor.height < height - anchorDepthOf(this.config.chain) - 3);
  }

  /**
   * The first and the last main-chain height anchored at a BTC height, where the page knows them all: in the stretch loaded from the
   * tip once that reaches below them (as the tip grows), else as read for its page; undefined for none, or while they are not known
   */
  anchoredAt(height: number): [number, number] | undefined {
    const from = this.loadedFrom;
    if (from > 0 && (this.blocks[from]?.header.btcAnchor.height ?? height) >= height) return this.btcPages.get(height)?.anchored ?? undefined;
    // Anchors never go down along the main chain (§6.3): the first height of the stretch anchored at or above each
    const firstAt = (target: number) => {
      let lo = Math.max(1, from);
      let hi = this.blocks.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((this.blocks[mid]?.header.btcAnchor.height ?? target) < target) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const first = firstAt(height);
    const end = firstAt(height + 1);
    return first < end ? [first, end - 1] : undefined;
  }

  /** A transaction's confirmations: one at least once it has a BTC height, should a coin listing name the block before the page's BTC height reaches it */
  btcConfs(height: number | undefined): number {
    if (height === undefined) return 0;
    return Math.max(1, this.currentBtcHeight() - height + 1);
  }

  /** The node cannot see the BTC mempool, so whether a transaction can get into a block is unknown */
  canConfirm(_tx: BtcTx): boolean {
    return true;
  }

  carriersOf(blockHash: Hex): BtcTx[] {
    return [...(this.carriers.get(blockHash) ?? [])].map((id) => this.btcTxs.get(id)).filter((t): t is BtcTx => !!t);
  }

  conflictSpending(_o: OutPoint): BtcTx | undefined {
    return undefined;
  }

  closureOfBlock(b: Block): number | undefined {
    return b.closureBtc;
  }

  producerInfo(id: Hex): Producer | undefined {
    return this.producers.find((p) => p.id === id);
  }

  /** The node does not provide BTC balances or UTXOs (that needs a BTC indexing service) */
  getUtxos(_id: Hex): Utxo[] {
    return [];
  }

  /**
   * The addresses worked out so far, by account: whether 32 bytes are an x-only pubkey takes a modular square root, a few
   * milliseconds on a phone, and every account a list shows was asked for again whenever the page drew it, at every sync. Emptied
   * past `ADDRESS_CACHE` accounts
   */
  private addresses = new Map<Hex, string>();

  /**
   * The account's Taproot address (D-092): empty for 32 bytes that are not a valid x-only pubkey, and for the ID of a contract
   * the page knows of or of a deployment's (failed or not), a hash that no key stands behind
   */
  addressOf(id: Hex): string {
    if (this.contractEvidence.get(id)?.deploy !== undefined || this.isContract(id)) return '';
    let a = this.addresses.get(id);
    if (a === undefined) {
      try {
        a = accountToAddress(fromHex(id, 32), this.network);
      } catch {
        a = '';
      }
      if (this.addresses.size >= ADDRESS_CACHE) this.addresses.clear();
      this.addresses.set(id, a);
    }
    return a;
  }

  /** Taproot address → account (D-092); empty when it is not a P2TR address of this network */
  accountOfAddress(address: string): Hex | undefined {
    try {
      return toHex(accountFromAddress(address, this.network));
    } catch {
      return undefined;
    }
  }

  /** The account state; registers the account as "being viewed", refreshed with new blocks */
  peekAccount(id: Hex): AccountState | undefined {
    this.watched.set(id, this.now());
    return this.accounts.get(id);
  }

  balance(id: Hex, asset: Hex): bigint {
    return this.accounts.get(id)?.balances.get(asset) ?? 0n;
  }

  /**
   * The nonce for a new submission: after the state nonce, following this page's operations still waiting, those in the node's
   * mempool and the path C ones whose BTC transaction it broadcast: the node learns of a path C operation only once its transaction
   * has the confirmations forced inclusion needs, and an operation signed meanwhile with the same nonce would leave one of the two
   * failed (§7.4)
   */
  nextNonce(id: Hex): number {
    let n = this.accounts.get(id)?.nonce ?? 0;
    for (const r of this.mempool) if (r.op.account === id && r.op.nonce >= n) n = r.op.nonce + 1;
    for (const r of this.nativePending) if (r.op.account === id && r.op.nonce >= n) n = r.op.nonce + 1;
    return n;
  }

  pendingOf(id: Hex): OpRecord[] {
    return [...this.mempool, ...this.nativePending].filter((r) => r.op.account === id);
  }

  /**
   * The settlement backlog limit (D-046, D-077) as the node's next block applies it: anchored at the higher of the tip's anchor and
   * ANCHOR_DEPTH below the BTC tip (§6.2), it counts a body as landed only where it landed at or below that anchor. Below the BTC-final
   * tip every body landed long before; up to the settled height the node says each landed, and where the page knows at what height,
   * one that landed above the anchor still counts
   */
  backlogStatus(anchorHeight = Math.max(this.blocks[this.blocks.length - 1]?.header.btcAnchor.height ?? 0, this.currentBtcHeight() - anchorDepthOf(this.config.chain))): BacklogStatus {
    const limit = PARAMS.SETTLEMENT_TIMEOUT;
    let oldest: Block | undefined;
    for (let h = this.finalHeight + 1; h < this.blocks.length; h++) {
      const c = this.blocks[h];
      if (!c) continue;
      for (const b of [c, ...this.mergedOf(c)]) {
        if (!b.needsSettlement) continue;
        if (b.settlementOnBtc ? b.settlementOnBtc.btcHeight <= anchorHeight : h <= this.settledHeight) continue;
        if (!oldest || b.header.btcAnchor.height < oldest.header.btcAnchor.height) oldest = b;
      }
    }
    if (!oldest) return { waited: 0, limit, triggered: false };
    const waited = anchorHeight - oldest.header.btcAnchor.height;
    // A body the count passes over only for being above the anchor is on Bitcoin all the same: the page says so, not "not on Bitcoin"
    const landed = oldest.settlementOnBtc && { btcHeight: oldest.settlementOnBtc.btcHeight, confs: anchorDepthOf(this.config.chain) + 1 };
    return { oldest, ...(landed ? { landed } : {}), waited, limit, triggered: waited >= limit };
  }

  estimateFee(): FeeEstimate {
    const feerate = this.fee ? Number(this.fee.feerate_sat_vb) : Math.max(PARAMS.MIN_SETTLEMENT_FEERATE, NODE_POLICY.SETTLEMENT_FEERATE);
    const amount = this.fee ? this.fee.path_b.amount : NODE_POLICY.MIN_TOKEN_FEE;
    // The node's suggestion is for its reference transfer; an op of another cost scales by its own cost at the node's rate (RPC.md)
    const perKib = this.fee ? this.fee.path_b.per_kib : 0n;
    const params = this.sdkParams;
    return {
      feerateSatVb: feerate,
      pathB: {
        amount,
        nodeMin: NODE_POLICY.MIN_TOKEN_FEE,
        producerMins: [],
        forOp: (opBytes, maxGas) => feeFor(perKib, opCost(params, opBytes, BigInt(maxGas)), amount),
        basis: perKib > 0n ? 'rate' : 'minimum',
      },
      market: { feeRate: feerate, minFeeRate: this.btcMinFeeRate },
      pathC: (opBytes, rate = feerate) => pathCFee(opBytes, rate),
    };
  }

  /** VmOp encoded length: encode a draft in the real format with the SDK (the signature at the maximum length of that scheme) */
  opSize(path: Path, action: Action, scheme: 'Bip340' | 'Bip322Simple' = 'Bip340'): number {
    const draft = draftOp(path, action, this.sdkParams.chain_id);
    if (!draft) return 0;
    // A BIP322 simple signature is the serialized witness stack: for the account address's P2TR key-path, one 64-byte signature (1 + 1 + 64 bytes, D-052, D-092)
    const bytes = new Uint8Array(scheme === 'Bip322Simple' ? 66 : 64);
    return encodeVmOp({ ...draft, sig: { kind: scheme, bytes } }).length;
  }

  /** The sighash; a path C operation binds the first input of the carrying transaction (D-086), so without a carrying transaction it cannot be given and '' is returned */
  sigHash(op: VmOp): Hex {
    const draft = sdkOpOf(op);
    if (!draft || op.fee.kind === 'BtcNative') return '';
    try {
      return toHex(vmopSighash(draft));
    } catch {
      return '';
    }
  }

  // =====================================================================
  // On-demand lookups
  // =====================================================================

  lookup(kind: LookupKind, id: string): Lookup | undefined {
    return this.lookups.get(`${kind}:${id.toLowerCase()}`);
  }

  /** Query the node when the cache lacks it (pages call this in an effect); recorded as missing when not found */
  request(kind: LookupKind, id: string) {
    if (this.stopped) return;
    const key = `${kind}:${id.toLowerCase()}`;
    const cur = this.lookups.get(key);
    if (cur && cur.state === 'loading') return;
    if (cur && cur.state === 'missing') return;
    this.lookups.set(key, { state: 'loading' });
    this.bump();
    this.askLookup(kind, id.toLowerCase(), key, true);
  }

  /**
   * A lookup's read. One that gets no answer (`noAnswer`) is tried again NO_ANSWER_RETRY_MS later, the page still loading, before
   * the page says it could not load: a link opened as a phone's browser comes back from the background, or as its network changes
   */
  private askLookup(kind: LookupKind, id: string, key: string, again: boolean) {
    this.fetchLookup(kind, id)
      .then((res) => {
        if (res === true) this.lookups.delete(key);
        else this.lookups.set(key, missing(res, this.now()));
      })
      .catch((e) => {
        if (e instanceof RpcError && e.code === -32004) this.lookups.set(key, missing(missingText(kind, this.config.chain), this.now()));
        else if (e instanceof RpcError && e.code === -32602) this.lookups.set(key, missing(lazy((m) => m.rpc.badBlockId), this.now()));
        else if (again && noAnswer(e)) {
          setTimeout(() => {
            if (!this.stopped && this.lookups.get(key)?.state === 'loading') this.askLookup(kind, id, key, false);
          }, NO_ANSWER_RETRY_MS);
        } else this.lookups.set(key, { state: 'error', message: errMessage(e), error: e });
      })
      .finally(() => {
        this.derive();
        this.bump();
      });
  }

  /** The node answers again after the page said it was disconnected: what pages could not read is read again */
  private readFailedAgain() {
    for (const [key, l] of [...this.lookups]) {
      if (l.state !== 'error') continue;
      const at = key.indexOf(':');
      this.lookups.delete(key);
      this.request(key.slice(0, at) as LookupKind, key.slice(at + 1));
    }
  }

  /** Retry a failed lookup */
  retry(kind: LookupKind, id: string) {
    this.lookups.delete(`${kind}:${id.toLowerCase()}`);
    this.request(kind, id);
  }

  /** Returns true when found, once the assets it came upon are named or the wait for them is over (`assetsRead`); otherwise the explanation (shown on the "not found" page) */
  private async fetchLookup(kind: LookupKind, id: string): Promise<true | (() => string)> {
    const asked = this.assetsAsked;
    const found = await this.readLookup(kind, id);
    await this.assetsRead(asked);
    return found;
  }

  private async readLookup(kind: LookupKind, id: string): Promise<true | (() => string)> {
    if (kind === 'block') {
      // The block and its settlement status in one round trip, which the page shows with it: its own settlement's, or that of the
      // later block whose settlement carried its body (D-077). The node answers both by height too, naming the main chain's block
      // at that height as each is answered: a status that names another block (the chain switched between them) is asked again
      const ref = /^\d+$/.test(id) ? Number(id) : id;
      const [info, status] = await Promise.all([this.node.getBlock(ref), this.settlementOf(ref)]);
      const b = this.ingest(info);
      this.pinned.set(b.hash, this.now());
      if (status && toHex(status.block.hash) === b.hash) this.settlementInfo.set(b.hash, status);
      const again = settles(info) && !this.settlementInfo.has(b.hash) ? this.readSettlement(b.hash) : undefined;
      // One that needs no body has what carried its header found with it, which its page gives from its first frame
      const carried = settles(info) ? undefined : this.askHeaderCarrier(b.hash);
      const [merged] = await Promise.all([Promise.all(b.merged.filter((m) => !this.byHash.has(m)).map((m) => this.node.getBlock(m))), again, carried]);
      for (const m of merged) this.ingest(m);
      return true;
    }
    if (kind === 'op') {
      const st = await this.node.getOpStatus(id);
      // The node returns only the status, not the content of an operation in the entry pool: record it as "not found" with the reason and ask again periodically
      if (st.status === 'pending' && !this.ops.has(id)) return PENDING_MSG;
      // Its block and the block's settlement status in one round trip, the status asked before the block is in: the node has none
      // for a block of forced entries alone
      const hash = st.block ? toHex(st.block.hash) : undefined;
      const info = hash === undefined ? undefined : this.raw.get(hash);
      const status = hash !== undefined && !this.settlementInfo.has(hash) && (!info || settles(info)) ? this.readSettlement(hash) : undefined;
      await Promise.all([this.applyOpStatus(id, st), status]);
      return this.ops.has(id) ? true : missingText('op', this.config.chain);
    }
    if (kind === 'btc') {
      await this.readBtcBlock(Number(id));
      return true;
    }
    if (kind === 'asset') return this.readAssetPage(id);
    await this.fetchAccount(id);
    return true;
  }

  /**
   * An asset's page reads it anew, its rules being what may have changed since (D-121): a built-in asset, or else a token or a
   * collection the node's index knows (D-120), whose declaration the page shows too
   */
  private async readAssetPage(id: Hex): Promise<true | (() => string)> {
    try {
      this.takeAsset(id, await this.node.getAsset(fromHex(id, 32)));
      return true;
    } catch (e) {
      if (!(e instanceof RpcError && e.code === RPC_ERROR_CODES.NOT_FOUND)) throw e;
    }
    if (!(await this.tokenBook.readFacts(id))) return missingText('asset', this.config.chain);
    this.tokenBook.wantDeclaration(id);
    return true;
  }

  /**
   * What a BTC block's page shows from the main-chain blocks around it, for one below the stretch loaded from the tip: the blocks
   * anchored ANCHOR_DEPTH + 1 below it, whose settlements land in it in step (D-056), then those anchored up to two BTC blocks lower,
   * whose settlements land in it late, at most BTC_PAGE_BLOCKS of these, with the parallel blocks they merge and the settlement
   * statuses of all of them; the first block that saw it mined and the one before (its time) and the first block anchored at it (its
   * hash); and the first and the last height anchored at it, which need no more read
   */
  private async readBtcBlock(height: number) {
    const depth = anchorDepthOf(this.config.chain);
    const { bounds, read } = await this.anchorBounds([height - depth - 3, height - depth, height, height + 1]);
    const [start = 0, seen = 0, first = 0, end = 0] = bounds;
    const want = [seen, first < end ? first : 0];
    for (let h = seen - 1; h >= Math.max(1, start) && want.length < BTC_PAGE_BLOCKS + 2; h--) want.push(h);
    const heights = [...new Set(want)].filter((h) => h > 0 && h < this.blocks.length && !this.blocks[h]);
    const fresh = await this.readHeights(heights.filter((h) => !read.has(h)));
    const infos = [...heights.flatMap((h) => read.get(h) ?? []), ...fresh.map(([, info]) => info)];
    const blocks = new Map(infos.map((info) => [toHex(info.hash), this.ingest(info)]));
    // Their settlement payloads may carry the bodies of the parallel blocks they merge, which have settlements of their own
    const ids = [...new Set([...blocks.values()].flatMap((b) => b.merged))].filter((id) => !this.byHash.has(id));
    const merged = await mapLimit(ids, this.wide, (id) =>
      this.node.getBlock(id).catch((e: unknown) => {
        if (e instanceof RpcError && e.code === -32004) return null;
        throw e;
      }),
    );
    for (const info of merged) if (info) blocks.set(toHex(info.hash), this.ingest(info));
    // The blocks of the range the cache held already, whose statuses a lookup may not have read
    for (let h = Math.max(1, start); h <= first && h < this.blocks.length; h++) {
      const b = this.blocks[h];
      if (b) blocks.set(b.hash, b);
    }
    const now = this.now();
    for (const hash of blocks.keys()) this.pinned.set(hash, now);
    const due = [...blocks.keys()].filter((hash) => {
      const info = this.raw.get(hash);
      return info !== undefined && settles(info) && !this.settlementInfo.has(hash);
    });
    await mapLimit(due, this.wide, (hash) => this.readSettlement(hash));
    this.btcPages.set(height, { anchored: first > 0 && first < end ? [first, end - 1] : null, at: now });
  }

  /**
   * The search `askHeaderCarrier` makes: the heights above `b` (from the block that accepted it, for a parallel block), the first
   * HEADER_CARRIER_FIRST alone, then a batch at a time, at most HEADER_CARRIER_DEPTH, up to the first block that carries settlement
   * transactions, whose settlement status gives when the header landed. It ends there whether or not that block's payload names
   * `b`'s header. The blocks it goes through, read now or by a search before it, are kept as a lookup keeps a block, with their
   * settlement statuses and the parallel blocks they merge, so that a page stepping up from `b` opens them at once, and a search asked
   * again after one that failed reads what that one did not get
   */
  private async readHeaderCarrier(b: Block) {
    const from = Math.max(b.header.height + 1, b.acceptedHeight ?? 0);
    const end = from + HEADER_CARRIER_DEPTH;
    const walked: Block[] = [];
    let carrier: Block | undefined;
    for (let h = from, step = HEADER_CARRIER_FIRST; !carrier && h < end && h < this.blocks.length && !this.stopped; h += step, step = this.wide) {
      const heights = Array.from({ length: Math.min(step, end - h, this.blocks.length - h) }, (_, k) => h + k);
      const fresh = await this.readHeights(heights.filter((x) => !this.blocks[x]));
      for (const [, info] of fresh) this.ingest(info);
      for (const x of heights) {
        const c = this.blocks[x];
        if (!c) continue;
        walked.push(c);
        if (this.raw.get(c.hash)?.settlement) {
          carrier = c;
          break;
        }
      }
    }
    if (this.stopped) return;
    const now = this.now();
    for (const c of [b, ...walked]) this.pinned.set(c.hash, now);
    const ids = [...new Set(walked.flatMap((c) => c.merged))].filter((id) => !this.byHash.has(id));
    const due = walked.filter((c) => {
      const info = this.raw.get(c.hash);
      return info !== undefined && settles(info) && !this.settlementInfo.has(c.hash);
    });
    const [merged] = await Promise.all([
      mapLimit(ids, this.wide, (id) =>
        this.node.getBlock(id).catch((e: unknown) => {
          if (e instanceof RpcError && e.code === -32004) return null;
          throw e;
        }),
      ),
      mapLimit(due, this.wide, (c) => this.readSettlement(c.hash)),
    ]);
    for (const info of merged) if (info) this.ingest(info);
  }

  /** The blocks that date BTC heights (`askBtcTimes`): the first main-chain block that saw each and the one before, pinned */
  private async readBtcTimes(heights: readonly number[]) {
    const depth = anchorDepthOf(this.config.chain);
    const { bounds, read } = await this.anchorBounds(heights.map((h) => h - depth));
    const want = [...new Set(bounds.flatMap((seen) => [seen, seen - 1]))].filter((h) => h > 0 && h < this.blocks.length && !this.blocks[h]);
    const fresh = await this.readHeights(want.filter((h) => !read.has(h)));
    const now = this.now();
    for (const info of [...want.flatMap((h) => read.get(h) ?? []), ...fresh.map(([, info]) => info)]) this.pinned.set(this.ingest(info).hash, now);
  }

  /**
   * The transactions `commits` spend that the page does not have (`askCommitFees`), from the settlements (`ksana_getSettlement`) of the
   * heights below their blocks that the page has no block at and has not read before, nearest first, `wide` at a time, until each is
   * found. Every commit transaction read is kept, not only those `commits` spend: a block opened later, as the page goes down the
   * chain, spends one read already, and a commit the page shows that spends one has its fee as the search ends. A height whose read
   * failed is read again by a later search
   */
  private async readFunding(commits: readonly BtcTx[]) {
    const wanted = new Set<Hex>();
    const heights = new Set<number>();
    for (const tx of commits) {
      const unknown = tx.inputs.filter((i) => !this.btcTxs.has(i.prevout.txid) && !this.fundingOuts.has(i.prevout.txid));
      for (const i of unknown) wanted.add(i.prevout.txid);
      const at = tx.forHeight ?? 0;
      if (unknown.length) for (let h = at - 1; h >= Math.max(1, at - FUNDING_DEPTH); h--) if (!this.blocks[h] && !this.fundingRead.has(h)) heights.add(h);
    }
    const order = [...heights].sort((a, b) => b - a);
    let kept = false;
    // A chain stopped (`anotherGenesis`) reads no further
    for (let k = 0; k < order.length && wanted.size && !this.stopped; ) {
      const chunk = order.slice(k, k + this.wide);
      k += chunk.length;
      const answers = await mapLimit(chunk, this.wide, (h) => this.settlementOf(h).then((s) => ({ s }), () => null));
      let found = false;
      answers.forEach((a, j) => {
        if (!a) return;
        this.fundingRead.add(chunk[j] as number);
        const commit = a.s?.txs ? parseFunding(a.s.txs.commit, this.network) : null;
        if (!commit) return;
        this.fundingOuts.set(commit.txid, commit.outputs);
        kept = true;
        if (wanted.delete(commit.txid)) found = true;
      });
      // The fees found show while the search goes on for the rest
      if (found) {
        this.derive();
        this.bump();
        kept = false;
      }
    }
    // What it kept for the other commits the page shows, or for one asked while it read, gives their fees as it ends
    if (kept && !this.stopped) {
      this.derive();
      this.bump();
    }
  }

  /**
   * For each of `targets` (BTC heights), the lowest main-chain height whose anchor is at or above it (the tip's height + 1 for none
   * yet), and the blocks read to find it, by height. Anchors never go down along the main chain (§6.3), so the cached blocks and the
   * anchors of final heights read before bound each search; then each round reads `PROBE_POINTS` heights spread over every range
   * still open where calls go out in batches (four rounds below two thousand blocks), the middle one otherwise
   */
  private async anchorBounds(targets: readonly number[]): Promise<{ bounds: number[]; read: Map<number, BlockInfo> }> {
    const read = new Map<number, BlockInfo>();
    if (this.finalAnchors.size > PRUNE_ABOVE) this.finalAnchors.clear();
    const anchorOf = (h: number) => this.blocks[h]?.header.btcAnchor.height ?? read.get(h)?.header.btc_anchor.height ?? this.finalAnchors.get(h);
    const ranges = targets.map((target) => ({ target, lo: -1, hi: this.blocks.length }));
    const narrow = (h: number) => {
      const a = anchorOf(h);
      if (a === undefined) return;
      for (const r of ranges) {
        if (a < r.target) r.lo = Math.max(r.lo, h);
        else r.hi = Math.min(r.hi, h);
      }
    };
    this.blocks.forEach((_, h) => narrow(h));
    for (const h of this.finalAnchors.keys()) narrow(h);
    const points = this.batched ? PROBE_POINTS : 1;
    for (let round = 0; round < 40; round++) {
      const probes = new Set<number>();
      for (const r of ranges) for (let i = 1; i <= points && r.hi - r.lo > 1; i++) probes.add(r.lo + Math.max(1, Math.floor(((r.hi - r.lo) * i) / (points + 1))));
      const heights = [...probes].filter((h) => anchorOf(h) === undefined);
      if (!heights.length) break;
      const infos = await this.readHeights(heights);
      if (!infos.length) break;
      for (const [h, info] of infos) {
        read.set(h, info);
        if (h <= this.finalHeight) this.finalAnchors.set(h, info.header.btc_anchor.height);
        narrow(h);
      }
    }
    return { bounds: ranges.map((r) => r.hi), read };
  }

  // =====================================================================
  // Wallet: register the operations submitted by this page
  // =====================================================================

  /**
   * Register after the wallet submits successfully: the operation appears immediately under "awaiting inclusion" and in the
   * wallet's in-progress list. `at` is when the submission started (the node does not record submission times); a block
   * notification may arrive before this, in which case the operation has already been read from the block and only the
   * submission time and origin are filled in.
   */
  noteSubmitted(op: SdkVmOp, opId: Hex, at = this.now()) {
    const id = opId.toLowerCase();
    this.submitted.set(id, { at, origin: 'wallet' });
    const known = this.ops.get(id);
    if (known) {
      known.origin = 'wallet';
      known.submittedAt = Math.min(at, known.submittedAt);
    } else {
      const r: OpRecord = { id, op: toVmOp(op), path: pathOf(op), size: opBytesOf(op), submittedAt: at, origin: 'wallet' };
      this.ops.set(id, r);
      this.indexOp(r);
      this.mempool = [...this.mempool, r];
    }
    this.derive();
    this.bump();
    void this.sync();
  }

  /**
   * Register after the wallet broadcasts a path C native transaction (or a top-up payment transaction): the operation enters
   * "awaiting BTC confirmation" and the transaction appears in the native transactions column of the settlements page.
   * `inputValues` are the amounts of the inputs (for computing the fee). The node does not know this operation before the
   * transaction confirms and it is force-included. `byHand`: nothing on the page could broadcast it, and its raw form was handed
   * back to be broadcast by hand, which the page does not see: the transaction reads as built, not broadcast, until a block forces
   * its op in or the coin listing shows it confirmed.
   */
  noteNative(op: SdkVmOp, rawTx: Uint8Array, args: { owner: Hex; ownerScript: Uint8Array; inputValues: readonly number[]; at?: number; byHand?: boolean }) {
    const at = args.at ?? this.now();
    const id = this.registerNative(op, rawTx, { ...args, at });
    if (id === undefined) return;
    // A top-up's claim, which the node never lists under the wallet account, is remembered on this device (`restoreClaims`)
    if (args.owner !== toHex(op.account)) {
      const key = this.claimsKey();
      if (key && this.claimStore) {
        const c: RememberedClaim = { id, owner: args.owner, script: toHex(args.ownerScript), tx: toHex(rawTx), inputs: [...args.inputValues], at, ...(args.byHand ? { byHand: true } : {}) };
        const kept = rememberedClaims(this.claimStore.load(key)).filter((x) => x.id !== id);
        this.claimStore.save(key, [c, ...kept].sort((x, y) => y.at - x.at).slice(0, CLAIMS_KEPT));
      }
    }
    this.derive();
    this.bump();
  }

  /** What `noteNative` registers, without remembering a claim or deriving: the operation's ID, or undefined when the transaction does not parse */
  private registerNative(
    op: SdkVmOp,
    rawTx: Uint8Array,
    args: { owner: Hex; ownerScript: Uint8Array; inputValues: readonly number[]; at: number; byHand?: boolean },
  ): Hex | undefined {
    const at = args.at;
    const id = opIdOf(op);
    const tx = parseNativeTx(rawTx, { owner: args.owner, ownerScript: args.ownerScript, inputValues: args.inputValues, opId: id, at, params: this.sdkParams, network: this.network });
    if (!tx) return undefined;
    // A block read before may have shown it confirmed (`partialTx`)
    const seen = this.btcTxs.get(tx.txid);
    if (seen?.status === 'confirmed') {
      tx.status = 'confirmed';
      if (seen.confirmedHeight !== undefined) tx.confirmedHeight = seen.confirmedHeight;
      if (seen.heightAtMost) tx.heightAtMost = true;
    } else if (args.byHand) {
      // Its raw form was handed back: when it is broadcast, if ever, is not seen here
      tx.status = 'built';
    }
    this.btcTxs.set(tx.txid, tx);
    this.submitted.set(id, { at, origin: 'wallet' });
    let r = this.ops.get(id);
    if (!r) {
      r = { id, op: toVmOp(op), path: 'C', size: opBytesOf(op), submittedAt: at, origin: 'wallet', nativeTxid: tx.txid };
      this.ops.set(id, r);
      this.indexOp(r);
    } else {
      r.nativeTxid = tx.txid;
      r.origin = 'wallet';
      r.submittedAt = Math.min(at, r.submittedAt);
    }
    // A top-up's claim operation is signed by a one-time account: count it under the wallet account's records too
    if (args.owner !== r.op.account) {
      const set = this.accOps.get(args.owner) ?? new Set<Hex>();
      set.add(id);
      this.accOps.set(args.owner, set);
    }
    if (!r.blockHash && !this.nativePending.some((x) => x.id === id)) this.nativePending = [...this.nativePending, r];
    return id;
  }

  /** The key the top-up claims of this network are remembered under: its genesis block's hash, once read */
  private claimsKey(): string | undefined {
    const genesis = this.blocks[0];
    return genesis ? `topups:${genesis.hash}` : undefined;
  }

  /**
   * The top-up claims the page broadcast on this network, as it remembers them (`ClaimStore`), registered as when they were
   * broadcast (`noteNative`) with the node's answer for each: the block of one included is read first, so that it never shows as
   * waiting. One the node still does not know a day after its broadcast is forgotten. Once, after a sync has read the genesis block
   */
  private async restoreClaims() {
    const key = this.claimsKey();
    const store = this.claimStore;
    if (!key || !store || this.claimsRestored) return;
    this.claimsRestored = true;
    try {
      const now = this.now();
      const stored = store.load(key);
      const claims = rememberedClaims(stored).filter((c) => now - c.at < CLAIM_MEMORY_MS);
      const statuses = await mapLimit(claims, CONCURRENCY, (c) =>
        this.node.getOpStatus(c.id).catch((e: unknown) => {
          if (e instanceof RpcError && e.code === -32004) return null;
          throw e;
        }),
      );
      const hashes = [...new Set(statuses.flatMap((st) => (st?.block ? [toHex(st.block.hash)] : [])))].filter((h) => !this.raw.has(h));
      const infos = await mapLimit(hashes, CONCURRENCY, (h) => this.node.getBlock(h));
      const kept: RememberedClaim[] = [];
      claims.forEach((c, i) => {
        const op = nativeOpFromTx(fromHex(c.tx), this.sdkParams);
        if (!op || opIdOf(op) !== c.id || (statuses[i] === null && now - c.at > CLAIM_PATIENCE_MS)) return;
        if (this.registerNative(op, fromHex(c.tx), { owner: c.owner, ownerScript: fromHex(c.script), inputValues: c.inputs, at: c.at, byHand: c.byHand === true }) !== undefined) kept.push(c);
      });
      for (const info of infos) this.ingest(info);
      // Their blocks are read: only a skip is noted
      await Promise.all(
        claims.map((c, i) => {
          const st = statuses[i];
          return st ? this.applyOpStatus(c.id, st) : undefined;
        }),
      );
      if (Array.isArray(stored) && kept.length !== stored.length) store.save(key, kept);
    } catch (e) {
      this.claimsRestored = false;
      throw e;
    }
  }

  /**
   * The page's own path C transactions waiting for their BTC confirmations, a top-up's payment among them: the node knows nothing of
   * one until a block forces it in (§7.4), and the page's Bitcoin RPC looks up no transaction. The change each pays back to the
   * wallet's address is listed with the height of its BTC block, once confirmed, by the coin listing the wallet uses (Esplora on
   * signet, D-108, a scan on devnet), read while one waits at each new BTC tip, and once a minute besides for a listing that lags the
   * tip, by a page in view. A signet page without an Esplora does not scan for it. One handed back to be broadcast by hand is followed
   * too: its coin shows it once broadcast and confirmed
   */
  private async followNatives() {
    const btc = this.btc;
    const tip = this.currentBtcHeight();
    const now = this.now();
    if (!btc || this.hidden() || (this.nativesRead?.tip === tip && now - this.nativesRead.at < NATIVE_FOLLOW_MS)) return;
    const byOwner = new Map<Hex, { tx: BtcTx; vout: number }[]>();
    for (const r of this.nativePending) {
      const tx = r.nativeTxid ? this.btcTxs.get(r.nativeTxid) : undefined;
      const vout = tx ? tx.outputs.findIndex((o) => o.role === 'change') : -1;
      const owner = tx?.outputs[vout]?.owner;
      if (!tx || (tx.status !== 'broadcast' && tx.status !== 'built') || !owner) continue;
      byOwner.set(owner, [...(byOwner.get(owner) ?? []), { tx, vout }]);
    }
    if (!byOwner.size) return;
    this.nativesRead = { tip, at: now };
    for (const [owner, txs] of byOwner) {
      const coins = await btc.listedUtxos(p2trScriptFromOutputKey(fromHex(owner, 32))).catch(() => undefined);
      for (const { tx, vout } of txs) {
        const height = coins?.find((c) => c.txid === tx.txid && c.vout === vout)?.height;
        if (height === undefined) continue;
        tx.status = 'confirmed';
        tx.confirmedHeight = height;
      }
    }
  }

  /** The tip height last read from the Bitcoin RPC, by this tab or another; unknown without one. The page's BTC height is `currentBtcHeight` */
  get btcHeight(): number | undefined {
    return this.btcReads?.height;
  }

  /**
   * The current BTC height: the highest the page knows of, from the Bitcoin RPC's tip (read every 30 seconds at most, and before a
   * top-up is signed), the indexer's BTC height, the settlements' confirmations and what the producers of the loaded blocks saw
   * (their anchor plus ANCHOR_DEPTH). Between readings of the tip these show a new BTC block at the next poll; without a Bitcoin
   * RPC the height can lag the tip, which makes the top-up expiry check looser.
   */
  currentBtcHeight(): number {
    let height = Math.max(this.indexerBtcHeight, this.btcBase, this.btcHeight ?? 0);
    for (const s of this.settlementInfo.values()) if (s.confirmed) height = Math.max(height, s.confirmed.height + s.confirmed.confirmations - 1);
    for (const k of this.btcKnown.keys()) height = Math.max(height, k);
    for (const seen of this.btcSeen.keys()) height = Math.max(height, seen);
    return height;
  }

  /**
   * Read one lock of an exchange contract (the SDK's getLock, through a read-only call on the node); undefined when the lock does not
   * exist or the contract is not an exchange contract. When the node does not answer, or answers with an error, whether the lock
   * exists is not known: that is thrown, for the page to say what failed
   */
  async fetchLock(exchange: Hex, lockId: bigint): Promise<ExchangeLockView | undefined> {
    try {
      const lock = await getLock(this.node, fromHex(exchange, 32), lockId);
      const address = addressOfScript(lock.script, this.network);
      return {
        id: lockId,
        exchange,
        seller: toHex(lock.seller),
        beneficiary: toHex(lock.beneficiary),
        script: toHex(lock.script),
        ...(address ? { address } : {}),
        price: lock.price,
        ksa: lock.ksa,
        expiry: lock.expiry,
        state: lock.state.kind,
        ...(lock.state.kind === 'Claimed' ? { paidSats: Number(lock.state.paidSats), ksaPaid: lock.state.ksaPaid } : {}),
      };
    } catch (e) {
      if (e instanceof RpcError || e instanceof RpcTransportError) throw e;
      // The call failed (no such lock, or no such method), or what it returned is no lock
      return undefined;
    }
  }

  setWallet(key: { account: Hex } | null) {
    this.walletKey = key;
    if (key) void this.fetchAccount(key.account).then(() => {
      this.derive();
      this.bump();
    }, () => undefined);
    this.bump();
  }
}

/** The explanation when not found: generated in the current language when read */
function missing(text: () => string, at: number): Lookup {
  return withText({ state: 'missing' as const, at }, 'message', text);
}

const PENDING_MSG = lazy((m) => m.rpc.pending);

/**
 * Why the node has no such block, operation or account. An operation's names the BTC confirmations a path C one waits for on `chain`
 * before a block forces it in: the node knows nothing of it until then (SPEC §7.4, D-036, D-056)
 */
function missingText(kind: LookupKind, chain: RpcConfig['chain']): () => string {
  if (kind === 'op') return lazy((m) => m.rpc.missing.op, PARAMS.NATIVE_CONFIRMATIONS + anchorDepthOf(chain));
  if (kind === 'asset') return lazy((m) => m.rpc.missing.asset);
  return kind === 'account' ? lazy((m) => m.rpc.missing.account) : lazy((m) => m.rpc.missing.block);
}

/**
 * The order a BTC block's Ksana transactions are listed in, which the node does not give: settlements by the block they are for, each
 * commit transaction before its reveal, then republishes, then path C transactions
 */
function inBlockOrder(a: BtcTx, b: BtcTx): number {
  const rank = (tx: BtcTx) => (tx.kind === 'native' ? 2 : tx.kind === 'headers' ? 1 : 0);
  const text = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return (
    rank(a) - rank(b) ||
    (a.forHeight ?? 0) - (b.forHeight ?? 0) ||
    text(a.forBlock ?? '', b.forBlock ?? '') ||
    (a.kind === 'commit' ? 0 : 1) - (b.kind === 'commit' ? 0 : 1) ||
    text(a.txid, b.txid)
  );
}

function partialTx(txid: Hex, kind: BtcTx['kind'], at: number, extra: Partial<BtcTx>): BtcTx {
  return {
    txid,
    kind,
    status: 'confirmed',
    headers: [],
    bodies: [],
    entryCount: 0,
    inputs: [],
    outputs: [],
    vsize: 0,
    payloadBytes: 0,
    createdAt: at,
    partial: true,
    ...extra,
  };
}

/** The accounts a change to a built-in asset names (D-122): the two sides of a movement, and the account a freeze or an allowlist change names */
function changeAccounts(c: AssetChange): Hex[] {
  switch (c.kind) {
    case 'transfer':
    case 'funds':
    case 'payout':
      return [c.from, c.to];
    case 'issue':
      return [c.to];
    case 'burn':
      return [c.from];
    case 'freeze':
    case 'allow':
      return [c.account];
    default:
      return [];
  }
}

function addTo(map: Map<Hex, Set<Hex>>, key: Hex, value: Hex) {
  const set = map.get(key) ?? new Set<Hex>();
  set.add(value);
  map.set(key, set);
}

/** UI VmOp → SDK VmOp (only operations fetched from the node can be restored: the args are kept as hex as-is) */
export function sdkOpOf(op: VmOp): SdkVmOp | null {
  const draft = draftOp(op.fee.kind === 'Token' ? 'B' : 'C', op.action, op.chainId, op);
  if (!draft) return null;
  return { ...draft, sig: { kind: op.sig.kind, bytes: fromHex(op.sig.sig) } };
}

const sdkFunds = (funds: Funds[] | undefined): SdkFunds[] => (funds ?? []).map((f) => ({ asset: fromHex(f.asset, 32), amount: f.amount }));

function draftOp(path: Path, action: Action, chainId: number, from?: VmOp): Omit<SdkVmOp, 'sig'> | null {
  let act: SdkVmOp['action'];
  if (action.kind === 'AssetTransfer') act = { kind: 'AssetTransfer', asset: fromHex(action.asset, 32), to: fromHex(action.to, 32), amount: action.amount };
  else if (action.kind === 'Call') {
    const raw = action.args.borsh;
    act = {
      kind: 'Call',
      contract: fromHex(action.contract, 32),
      method: action.method,
      args: typeof raw === 'string' ? fromHex(raw) : new Uint8Array(),
      funds: sdkFunds(action.funds),
    };
  } else return null;
  const fee: SdkVmOp['fee'] = path === 'B' ? { kind: 'Token', amount: from?.fee.kind === 'Token' ? from.fee.amount : 0n } : { kind: 'BtcNative' };
  return {
    version: from?.version ?? VMOP_VERSION,
    chain_id: chainId,
    account: from ? fromHex(from.account, 32) : new Uint8Array(32),
    nonce: BigInt(from?.nonce ?? 0),
    fee,
    max_gas: BigInt(from?.maxGas ?? 0),
    action: act,
  };
}

/** The wallet account from a private key (tests and the local devnet's mock wallet): account = the BIP86-tweaked Taproot output key (D-092) */
export function walletKeyOf(secret: Uint8Array): { account: Hex } {
  return { account: toHex(accountOf(secret)) };
}
