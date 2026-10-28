/**
 * devnet simulator
 *
 * An in-browser discrete-event simulator whose rules follow the implementation on main (core/docs/DECISIONS.md D-063, D-073 to D-092,
 * core/docs/RPC.md): PoW block production and the GHOSTDAG block DAG: parallel blocks are merged by the next chain block, the entries of
 * merged blocks are executed in lenient mode, and duplicate or conflicting entries are skipped; two-speed difficulty: with no entries
 * to include, block production slows down by the weight of the empty-block streak (D-084, D-090); regtest BTC block production
 * (about 30 seconds by default); path B (sponsored) and path C (native transactions, forced inclusion; path A has been deleted,
 * D-078); settlement batching: while a settlement transaction is in flight, block bodies back up first and are carried by a later
 * settlement payload (D-077); a settlement is a commit / reveal pair with the payload in the reveal transaction's witness envelope
 * (D-081); the settlement broadcast depth; the settled closure and BTC finality; sponsored fees and block rewards (including the block
 * share) are locked first and unlocked in one go by a cursor-style unlock entry (D-074, D-079, D-089); rebuilding when a producer is
 * offline; header and body republishing; the settlement backlog limit; the top-up demo: the seller locks KSA in the exchange
 * contract, the buyer pays with one BTC transaction and claims (D-078, D-085).
 *
 * Accounts are the Taproot output keys of real keys, and an address is the bech32m spelling of the same bytes (D-092); block hashes,
 * op_ids, signatures and BTC transaction IDs are illustrative values. All randomness comes from the seed: the same seed plus the same
 * time sequence yields the same chain, which keeps tests reproducible.
 */

import { accountFromAddress, accountOf, accountToAddress, fromHex, isValidSecretKey, toHex } from '@ksana/sdk';
import { Rng } from '../../lib/rng';
import { fmtAmount, fmtInt } from '../../lib/format';
import { lazy, onLocaleChange, t, withText } from '../../i18n';
import { phash } from '../../lib/phash';
import { BTC_FINAL_DATA_CONFS, KSA_ASSET_ID, NODE_POLICY, P2A_VALUE_SAT, PARAMS, emptyBlockWeight, headerBytes } from '../params';
import { VB, chunkCount, envelopeVbytes, opReturnVbytes, pathCFee } from '../fees';
import { tallyCheck, type BacklogStatus, type ExchangeLockView, type FeeEstimate, type IndexerTally } from '../model';
import type {
  AccountState,
  Action,
  AssetMeta,
  Block,
  BtcBlock,
  BtcTx,
  ChainEvent,
  ContractMeta,
  Entry,
  EntryRecord,
  ExecResult,
  FailReason,
  Funds,
  Hex,
  IndexerCheck,
  LockedFee,
  OpOrigin,
  OpRecord,
  OutPoint,
  Path,
  Producer,
  TxIn,
  TxOut,
  Utxo,
  VmEvent,
  VmOp,
} from '../types';

/** regtest: address prefix bcrt */
export const BTC_NETWORK = 'regtest' as const;

/** KSA decimals: the node genesis has `ksa_decimals: 8` (see the note in D-092). Amounts are always stored as bigints in base units and formatted by the decimals for display */
export const KSA_DECIMALS = 8;

/** Number of base units in 1 KSA */
export const KSA_UNIT = 10n ** BigInt(KSA_DECIMALS);

const SEC = 1000;
const MIN = 60 * SEC;

/** Probability of a parallel block: another producer finds a block at the same height almost simultaneously */
const PARALLEL_RATE = 0.07;

/** Path B sponsored fees of the background traffic (base units) and the probability of each tier: 0.0001 to 0.0005 KSA */
const TRAFFIC_FEES = [
  [10_000n, 0.45],
  [20_000n, 0.3],
  [30_000n, 0.15],
  [50_000n, 0.1],
] as const;

/** Settlement batching (D-077): once the backlogged bodies or this block's own body exceed one eighth of the payload limit, stop waiting for the in-flight settlement transaction */
const PAYLOAD_BODY_TRIGGER = PARAMS.MAX_BLOCK_DATA_BYTES / 8;

/** In-flight settlement transactions: only those whose anchor is at most this many blocks behind the BTC tip count; ones stuck longer are left to rescue and the backlog limit (D-077) */
const IN_FLIGHT_LAG = 2;

/** Exchange contract: how many BTC blocks after a lock's expiry the seller may release it (D-085) */
const RELEASE_DELAY = 6;

/** Byte size of an entry in the payload: a forced inclusion writes only btc_txid (1 + 32), an unlock writes the acceptance position (1 + 8 + 4) */
const FORCED_BYTES = 33;
const UNLOCK_BYTES = 13;

/** How long a producer must be offline before another producer rebuilds its settlement transaction with its own funding */
const RESCUE_AFTER = 25 * SEC;

/** Minimum amount of a change output (the P2TR dust limit) */
const DUST_SAT = 330;

export interface SimOptions {
  seed?: number;
  /** The simulated "now"; defaults to Date.now() */
  now?: number;
  /** How much history to generate up front */
  historyMs?: number;
  /** Average BTC block interval under regtest */
  btcIntervalMs?: number;
  fastIntervalMs?: number;
  /** Background traffic: average number of operations per second */
  trafficPerSec?: number;
  /** Probability of a parallel block; tests may raise it */
  parallelRate?: number;
}

export type ActorKind = 'user' | 'demo' | 'producer' | 'faucet' | 'operator' | 'seller' | 'share';

export interface Actor {
  /** Account: the Taproot output key (D-092) */
  id: Hex;
  kind: ActorKind;
  label?: string;
  weight: number;
  utxos: Utxo[];
}

export interface OpDraft {
  account: Hex;
  path: Path;
  action: Action;
  maxGas: number;
  /** Path B: sponsored fee (KSA base units) */
  tokenFee?: bigint;
  /** Path C: BTC transaction fee rate */
  nativeFeeRate?: number;
  /** Explicit nonce (for example to resend the same nonce via path C) */
  nonce?: number;
  sigScheme?: 'Bip340' | 'Bip322Simple';
  origin?: OpOrigin;
}

export type SubmitResult = { ok: true; opId: Hex; op: VmOp } | { ok: false; code: string; message: string };

type UnlockEntry = Extract<Entry, { kind: 'Unlock' }>;
type CallAction = Extract<Action, { kind: 'Call' }>;

/** Acceptance position (D-079): the height of the chain block that accepts the block, and the block's index in that block's acceptance order (merged blocks are 0, 1, ... in turn; the chain block itself comes last) */
interface Position {
  height: number;
  index: number;
}

interface Timer {
  at: number;
  fn: () => void;
}

/** Block context: the block information used while executing entries */
interface BlockCtx {
  hash: Hex;
  height: number;
  producer: Hex;
  /** The block's BTC anchor height (btc_anchor_height inside contracts) */
  anchor: number;
}

interface ForcedItem {
  r: OpRecord;
  tx: BtcTx | undefined;
}

/** Production plan of a parallel block: decided from the state and entry pool at the same instant, before the chain block executes its own entries */
interface ParallelPlan {
  producer: Producer;
  forced: ForcedItem[];
  unlock: Position | null;
  picked: OpRecord[];
}

/** Locked record: sponsored fees and block rewards are tracked separately so conservation can be verified (LockedFee.amount is their sum) */
interface LockRow extends LockedFee {
  fees: bigint;
  reward: bigint;
}

/** The other headers and bodies carried by a settlement payload (the producer policy of D-063 and D-077) */
interface Carry {
  headers: Hex[];
  bodies: Hex[];
  /** The settlement of the most recent block in the past that carries a settlement transaction is still in flight */
  inFlight: boolean;
}

interface PairSpec {
  kind: 'settlement' | 'rescue' | 'headers';
  author: Hex;
  forBlock?: Block;
  headers: Hex[];
  bodies: Hex[];
  entryCount: number;
  payloadBytes: number;
}

/** Failure receipt: the description is generated in the current language (lazy records the message key and arguments; the text is generated when message is read) */
function failed(reason: FailReason | undefined, gasUsed: number, text: () => string): ExecResult {
  return withText({ ok: false, gasUsed, ...(reason ? { reason } : {}), events: [] }, 'message', text);
}

function skip(reason: () => string): ExecResult {
  return failed('skipped', 0, () => t().sim.exec.skipped(reason()));
}

const UNACCEPTED: ExecResult = failed('unaccepted', 0, lazy((m) => m.sim.exec.unaccepted));

/** Ordering of acceptance positions */
function after(a: Position, b: Position): boolean {
  return a.height > b.height || (a.height === b.height && a.index > b.index);
}

function samePos(a: Position, b: Position): boolean {
  return a.height === b.height && a.index === b.index;
}

export class Devnet {
  readonly kind = 'sim' as const;
  readonly params = PARAMS;
  /** The simulator has its own indexer; all data is local, there are no on-demand lookups */
  readonly hasIndexer = true;
  readonly ready = true;
  readonly indexerHalted: string | null = null;
  /** The simulator's indexer always answers */
  readonly indexerError: string | null = null;
  readonly btcIntervalMs: number;
  readonly fastIntervalMs: number;
  readonly genesisTime: number;
  readonly startedAt: number;

  private rng: Rng;
  private trafficPerSec: number;
  private parallelRate: number;
  clock: number;

  // —— Fast lane: the main chain (virtual selected chain) and parallel blocks ——
  /** The main chain, index = height */
  blocks: Block[] = [];
  /** Parallel blocks not on the main chain, merged (or waiting to be merged) by chain blocks */
  sideBlocks: Block[] = [];
  private blockByHash = new Map<Hex, Block>();
  private sideByHeight = new Map<number, Block[]>();
  /** Parallel blocks not merged yet (the DAG tips) */
  private unmerged: Block[] = [];
  /** DAA score of each block: cumulative weight (a simplification of D-084) */
  private daaOf = new Map<Hex, number>();
  /** Empty-block streak of each block (D-090): 0 for a non-empty block, the selected parent's streak + 1 for an empty block */
  private streakOf = new Map<Hex, number>();

  // —— Bitcoin (regtest) ——
  btcBlocks: BtcBlock[] = [];
  readonly btcBase: number;
  private btcTxs = new Map<Hex, BtcTx>();
  btcMempool: BtcTx[] = [];
  /** Current minimum fee rate for getting from the BTC mempool into a block; raised in the fee-rate spike scenario */
  btcMinFeeRate = 1;
  /** bitcoind's estimatesmartfee */
  feeRate = 2;
  /** Fee rate of the producers' settlement funding (node option --settlement-feerate, D-037) */
  settlementFeeRate: number = NODE_POLICY.SETTLEMENT_FEERATE;

  // —— Operations ——
  private ops = new Map<Hex, OpRecord>();
  /** In submission order */
  opOrder: Hex[] = [];
  mempool: OpRecord[] = [];
  nativePending: OpRecord[] = [];

  // —— State ——
  accounts = new Map<Hex, AccountState>();
  assets = new Map<Hex, AssetMeta>();
  contracts = new Map<Hex, ContractMeta>();
  /** Locked records: keyed by block hash (the producer's portion) or "block hash:share" (the block-share account's portion) */
  private readonly rows = new Map<Hex, LockRow>();
  lockedFees: Map<Hex, LockedFee> = this.rows;
  /** Unlock cursor (state key 0x09, D-079): the acceptance position unlocked so far; the genesis block is (0, 0) and has nothing to unlock */
  private unlockCursor: Position = { height: 0, index: 0 };

  settledHeight = 0;
  finalHeight = 0;
  indexerHeight = 0;
  indexerChecks: IndexerCheck[] = [];
  indexerTally: IndexerTally = { count: 0, failed: 0, lastFailed: null };
  indexerBtcHeight: number;

  // —— Participants ——
  actors = new Map<Hex, Actor>();
  producers: Producer[] = [];
  labels = new Map<Hex, string>();
  demoId!: Hex;
  faucetId!: Hex;
  operatorId!: Hex;
  /** The KSA seller in the top-up demo */
  sellerId!: Hex;
  /** Block-share account (D-089): 20% of every reward slot goes to it */
  shareAccountId!: Hex;
  tokenAsset!: Hex;
  passAsset!: Hex;
  tokenContract!: Hex;
  ammContract!: Hex;
  triggerContract!: Hex;
  /** Exchange contract (a simplified version of the ksa-exchange example contract, D-078, D-085) */
  exchangeContract!: Hex;

  // —— Exchange contract state ——
  private locks = new Map<string, ExchangeLockView>();
  private nextLockId = 0n;
  /** Sellers' free balances in the contract */
  private exchangeAvailable = new Map<Hex, bigint>();
  /** Payment scripts already used (each lock gets a fresh payment address) */
  private lockScripts = new Set<string>();

  // —— Scenarios ——
  censored = new Set<Hex>();
  feeSpike = false;
  /** Offline producer: it produces no blocks and cannot send the settlement transactions it has already built (another producer rebuilds them) */
  producerOffline: Hex | null = null;

  events: ChainEvent[] = [];
  private eventSeq = 0;

  // —— Scheduling ——
  private nextFastAt: number;
  /** The next block is planned as an empty block (slowed production); switches back to the normal interval when an entry arrives */
  private nextFastEmpty = false;
  private nextBtcAt: number;
  private nextTrafficAt: number;
  private timers: Timer[] = [];
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Block hash → reveal transactions whose payload carries its header */
  private headerCarriers = new Map<Hex, Hex[]>();
  /** Block hash → reveal transactions whose payload carries its body */
  private bodyCarriers = new Map<Hex, Hex[]>();

  version = 0;
  private listeners = new Set<() => void>();

  constructor(opts: SimOptions = {}) {
    const now = opts.now ?? Date.now();
    this.rng = new Rng(opts.seed ?? 20260930);
    this.btcIntervalMs = opts.btcIntervalMs ?? 30 * SEC;
    this.fastIntervalMs = opts.fastIntervalMs ?? PARAMS.TARGET_BLOCK_TIME * SEC;
    this.trafficPerSec = opts.trafficPerSec ?? 1.1;
    this.parallelRate = opts.parallelRate ?? PARALLEL_RATE;
    const history = opts.historyMs ?? 40 * MIN;
    this.genesisTime = now - history;
    this.startedAt = now;
    this.clock = this.genesisTime;
    this.btcBase = 3200;
    this.indexerBtcHeight = this.btcBase;

    this.setupActors();
    this.genesis();

    this.nextFastAt = this.genesisTime + this.fastGap();
    this.nextBtcAt = this.genesisTime + this.btcGap();
    this.nextTrafficAt = this.genesisTime + 20 * SEC;

    this.bootstrapOps();
    this.scriptDemoHistory(now);
    this.advanceTo(now);
    this.events = this.events.slice(-60);
  }

  // =====================================================================
  // Participants and genesis
  // =====================================================================

  /** Generate a real key: the account is its Taproot output key (D-092) */
  private newKey(): Hex {
    for (;;) {
      const secret = fromHex(this.rng.hex(32));
      if (!isValidSecretKey(secret)) continue;
      return toHex(accountOf(secret));
    }
  }

  private addActor(kind: ActorKind, weight: number, label?: string | (() => string), utxoCount = 6, utxoRange: [number, number] = [2, 60]): Actor {
    const actor: Actor = { id: this.newKey(), kind, weight, utxos: [] };
    if (label) {
      this.setLabel(actor.id, typeof label === 'string' ? () => label : label);
      withText(actor, 'label', () => this.labels.get(actor.id) ?? '');
    }
    // All UTXOs sit at the account's own Taproot address (the account is the address, D-092)
    for (let i = 0; i < utxoCount; i++) {
      actor.utxos.push({
        outpoint: { txid: this.rng.hex(32), vout: this.rng.int(0, 3) },
        valueSat: this.rng.int(utxoRange[0], utxoRange[1]) * 500_000,
        scriptType: 'p2tr',
        confirmedHeight: this.btcBase - this.rng.int(6, 400),
      });
    }
    this.actors.set(actor.id, actor);
    return actor;
  }

  private setupActors() {
    const names = ['devnet-1', 'devnet-2', 'devnet-3'];
    const weights = [0.45, 0.33, 0.22];
    // --min-token-fee (base units): the third producer only accepts sponsored ops paying 0.0002 KSA or more
    const mins = [1n, 1n, 20_000n];
    names.forEach((name, i) => {
      // The producer's funding UTXO pool: each settlement spends one confirmed UTXO, and the change returns to the pool once confirmed
      const a = this.addActor('producer', 0, name, 24, [1, 10]);
      this.producers.push({ id: a.id, name, weight: weights[i] ?? 0.2, minTokenFee: mins[i] ?? NODE_POLICY.MIN_TOKEN_FEE });
    });
    this.faucetId = this.addActor('faucet', 0, lazy((m) => m.sim.label.faucet), 40, [40, 120]).id;
    this.operatorId = this.addActor('operator', 0, lazy((m) => m.sim.label.operator), 10).id;
    this.shareAccountId = this.addActor('share', 0, lazy((m) => m.sim.label.share), 0).id;
    this.sellerId = this.addActor('seller', 0, lazy((m) => m.sim.label.seller), 12, [4, 40]).id;
    const demo = this.addActor('demo', 1.2, lazy((m) => m.sim.label.demo), 0);
    demo.utxos = [25_000_000, 12_000_000, 6_500_000, 4_000_000, 2_000_000, 1_200_000].map((v, i) => ({
      outpoint: { txid: this.rng.hex(32), vout: i % 2 },
      valueSat: v,
      scriptType: 'p2tr',
      confirmedHeight: this.btcBase - 20 - i * 7,
    }));
    this.demoId = demo.id;
    for (let i = 0; i < 18; i++) this.addActor('user', 0.4 + this.rng.next() * 1.6, undefined, 8);
  }

  private genesis() {
    const ksa: AssetMeta = {
      id: KSA_ASSET_ID,
      symbol: 'KSA',
      name: 'Ksana',
      decimals: KSA_DECIMALS,
      totalSupply: 0n,
      issuer: null,
    };
    this.assets.set(ksa.id, ksa);
    // Genesis-config preallocation (devnet's init.sh preallocates KSA to alice; here every simulated participant gets some), in decimals 8
    const prealloc = (id: Hex, whole: bigint) => {
      const units = whole * KSA_UNIT;
      const acc = this.account(id);
      acc.balances.set(KSA_ASSET_ID, units);
      ksa.totalSupply = (ksa.totalSupply ?? 0n) + units;
    };
    for (const a of this.actors.values()) {
      if (a.kind === 'user') prealloc(a.id, BigInt(this.rng.int(60, 900) * 1000));
      if (a.kind === 'demo') prealloc(a.id, 250_000n);
      if (a.kind === 'faucet') prealloc(a.id, 50_000_000n);
      if (a.kind === 'operator') prealloc(a.id, 20_000_000n);
      if (a.kind === 'seller') prealloc(a.id, 2_000_000n);
      if (a.kind === 'producer') prealloc(a.id, 20_000n);
    }

    const btcGenesis: BtcBlock = { height: this.btcBase, hash: this.btcHash(), time: this.genesisTime - 12 * SEC, txids: [] };
    this.btcBlocks.push(btcGenesis);

    const header = {
      version: 2,
      height: 0,
      parents: [],
      btcAnchor: { height: btcGenesis.height, hash: btcGenesis.hash },
      entriesRoot: '0'.repeat(64),
      stateRoot: phash('genesis-state'),
      producer: '0'.repeat(64),
      timestamp: Math.floor(this.genesisTime / 1000),
      bits: 0x207fffff,
      nonce: '0',
    };
    const block: Block = {
      hash: this.fastHash(),
      header,
      entries: [],
      time: this.genesisTime,
      dataBytes: headerBytes(0),
      gasUsed: 0,
      maxGasSum: 0,
      needsSettlement: false,
      weight: 1,
      settlements: [],
      headerOnBtc: { txid: '0'.repeat(64), btcHeight: btcGenesis.height },
      closureBtc: 0,
      merged: [],
      acceptedHeight: 0,
    };
    block.acceptedBy = block.hash;
    this.blocks.push(block);
    this.blockByHash.set(block.hash, block);
    // By definition the genesis block has weight 1, DAA score 0 and streak 0 (D-084, D-090)
    this.daaOf.set(block.hash, 0);
    this.streakOf.set(block.hash, 0);
  }

  /** Contract deployments, liquidity and test-token distribution: all real operations, which appear in the first few blocks */
  private bootstrapOps() {
    const op = this.operatorId;
    const t0 = this.genesisTime + 1500;
    // Built-in contract names are shown in the current language (demo data of the simulated chain); code hashes are computed from fixed keys, independent of the language
    const deploy = (key: string, name: () => string, codeSize: number, methods: string[], readMethods: string[]) => {
      const nonce = this.nextNonce(op);
      const codeHash = phash('code', key);
      const id = phash('contract', op, nonce, codeHash);
      const res = this.submitAt(t0, {
        account: op,
        path: 'B',
        tokenFee: 20_000n,
        maxGas: 5_000_000,
        action: withText({ kind: 'Deploy', codeHash, codeSize, initArgsSize: 64 } as Omit<Extract<Action, { kind: 'Deploy' }>, 'name'>, 'name', name),
        origin: 'system',
      });
      if (res.ok) {
        this.contractNames.set(id, name);
        this.pendingContracts.set(id, { name: name(), codeHash, codeSize, methods, readMethods, deployOp: res.opId });
      }
      return id;
    };
    this.tokenContract = deploy('tkn', lazy((m) => m.sim.name.tknContract), 18_432, ['transfer', 'approve', 'mint'], ['balance_of', 'total_supply', 'metadata']);
    this.ammContract = deploy('amm', lazy((m) => m.sim.name.ammContract), 26_880, ['swap', 'add_liquidity', 'remove_liquidity'], ['get_reserves', 'quote']);
    this.triggerContract = deploy('trigger', lazy((m) => m.sim.name.triggerContract), 21_504, ['claim'], ['claimed', 'asset_id']);
    this.exchangeContract = deploy(
      'ksa-exchange',
      lazy((m) => m.sim.name.exchangeContract),
      24_064,
      ['deposit', 'withdraw', 'lock', 'release', 'claim'],
      ['get_lock', 'lock_of_script', 'balance', 'lock_count', 'locks_of'],
    );
    this.tokenAsset = phash('asset', this.tokenContract, 'TKN');
    this.passAsset = phash('asset', this.triggerContract, 'PASS');
    this.setLabel(this.tokenContract, () => t().sim.label.contract(t().sim.label.tknContract));
    this.setLabel(this.ammContract, () => t().sim.label.contract(t().sim.label.ammContract));
    this.setLabel(this.triggerContract, () => t().sim.label.contract(t().sim.label.triggerContract));
    this.setLabel(this.exchangeContract, () => t().sim.label.contract(t().sim.label.exchangeContract));

    this.submitAt(t0, {
      account: op,
      path: 'B',
      tokenFee: 10_000n,
      maxGas: 400_000,
      action: { kind: 'Call', contract: this.ammContract, method: 'add_liquidity', args: { ksa: 5_000_000n * KSA_UNIT, tkn: 200_000_000n } },
      origin: 'system',
    });
    for (const a of this.actors.values()) {
      if (a.kind !== 'user' && a.kind !== 'demo') continue;
      this.submitAt(t0, {
        account: op,
        path: 'B',
        tokenFee: 10_000n,
        maxGas: 60_000,
        action: { kind: 'AssetTransfer', asset: this.tokenAsset, to: a.id, amount: BigInt(this.rng.int(20, 400) * 1000) },
        origin: 'system',
      });
    }
  }

  private pendingContracts = new Map<Hex, Omit<ContractMeta, 'id' | 'deployer' | 'deployedAt'>>();
  /** Names of the built-in contracts (generated in the current language) */
  private readonly contractNames = new Map<Hex, () => string>();

  // —— Address book: names of built-in accounts and contracts are generated in the current language and regenerated on a locale change ——
  private readonly labelText = new Map<Hex, () => string>();
  private readonly unsubscribeLocale = onLocaleChange(() => this.relabel());

  private setLabel(id: Hex, text: () => string) {
    this.labelText.set(id, text);
    this.labels.set(id, text());
  }

  private relabel() {
    for (const [id, text] of this.labelText) this.labels.set(id, text());
  }

  /** A bit of history for the demo account so the wallet has real records to show when opened: transfers, swaps, one completed top-up and a few locks waiting for payment */
  private scriptDemoHistory(now: number) {
    const d = this.demoId;
    const at = (msBeforeNow: number, fn: () => void) => {
      const when = now - msBeforeNow;
      if (when > this.genesisTime) this.timers.push({ at: when, fn });
    };
    const someone = () => this.randomUser(d).id;
    at(38 * MIN, () => this.trafficTransfer(this.faucetId, d, 30_000n * KSA_UNIT, 'B'));
    // Top-up demo: the seller first locks 1,000 KSA for the demo account; two minutes later the demo account pays and claims
    at(36 * MIN, () => this.sellerLock(d, 1_000n * KSA_UNIT, 200_000n, 40));
    at(34 * MIN, () => this.topUpFirstOpen(d));
    at(33 * MIN, () => this.walletLike(d, 'B', { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: someone(), amount: 12_000n * KSA_UNIT }));
    at(26 * MIN, () =>
      this.walletLike(d, 'B', { kind: 'Call', contract: this.ammContract, method: 'swap', args: { asset_in: 'KSA', amount_in: 4_000n * KSA_UNIT, min_out: 1n } }),
    );
    at(19 * MIN, () => this.walletLike(d, 'C', { kind: 'AssetTransfer', asset: this.tokenAsset, to: someone(), amount: 50_000n }));
    at(13 * MIN, () => this.trafficTransfer(someone(), d, 7_500n * KSA_UNIT, 'B'));
    at(9 * MIN, () =>
      this.walletLike(d, 'B', { kind: 'Call', contract: this.ammContract, method: 'swap', args: { asset_in: 'TKN', amount_in: 90_000n, min_out: 1_000n } }),
    );
    at(4 * MIN, () => this.walletLike(d, 'B', { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: someone(), amount: 1_850n * KSA_UNIT }));
    // Locks waiting for payment: different prices and amounts, expiring a few dozen blocks after the current BTC height
    at(3 * MIN, () => {
      this.sellerLock(d, 2_000n * KSA_UNIT, 250_000n, 40);
      this.sellerLock(d, 5_000n * KSA_UNIT, 200_000n, 60);
      this.sellerLock(d, 250n * KSA_UNIT, 160_000n, 80);
    });
    at(16 * SEC, () => this.walletLike(d, 'B', { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: someone(), amount: 4_200n * KSA_UNIT }));
  }

  private walletLike(account: Hex, path: Path, action: Action) {
    const maxGas = action.kind === 'Call' ? 250_000 : 50_000;
    const draft: OpDraft = { account, path, action, maxGas, origin: 'wallet' };
    this.fillFees(draft);
    this.submitAt(this.clock, draft);
  }

  /**
   * The seller locks KSA for a beneficiary account (the exchange contract's lock, path B, with the locked KSA attached, D-085).
   * The payment address is a fresh Taproot address of the seller: one per lock, so any payment can match at most one lock.
   */
  private sellerLock(beneficiary: Hex, ksa: bigint, price: bigint, expiryAfter: number) {
    const key = this.newKey();
    const script = `5120${key}`;
    const draft: OpDraft = {
      account: this.sellerId,
      path: 'B',
      maxGas: 300_000,
      tokenFee: this.estimateFee().pathB.amount,
      action: {
        kind: 'Call',
        contract: this.exchangeContract,
        method: 'lock',
        args: { ksa, price, script, beneficiary, expiry: this.btcTip.height + expiryAfter },
        funds: [{ asset: KSA_ASSET_ID, amount: ksa }],
      },
      origin: 'system',
    };
    this.submitAt(this.clock, draft);
  }

  /** Demo script: the beneficiary account pays its first Open lock and buys all of the locked KSA */
  private topUpFirstOpen(beneficiary: Hex) {
    const lock = this.locksFor(beneficiary)[0];
    if (!lock) return;
    this.topUpAt(this.clock, lock, satsForAll(lock));
  }

  // =====================================================================
  // Subscriptions and live operation
  // =====================================================================

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private bump() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  start() {
    if (this.liveTimer) return;
    const loop = () => {
      this.advanceTo(Date.now());
      const next = Math.min(this.nextFastAt, this.nextBtcAt, this.nextTrafficAt, ...this.timers.map((x) => x.at));
      const delay = Math.max(16, Math.min(next - Date.now(), 1000));
      this.liveTimer = setTimeout(loop, delay);
    };
    loop();
  }

  stop() {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = null;
    this.unsubscribeLocale();
  }

  /** While running live, catch the simulated clock up to now before a user action */
  private syncLive() {
    if (this.liveTimer) this.advanceTo(Date.now());
  }

  /** Advance to time t, processing every due event in time order */
  advanceTo(t: number): boolean {
    let changed = false;
    for (let guard = 0; guard < 200_000; guard++) {
      let timerAt = Infinity;
      for (const x of this.timers) timerAt = Math.min(timerAt, x.at);
      const next = Math.min(this.nextFastAt, this.nextBtcAt, this.nextTrafficAt, timerAt);
      if (next > t) break;
      this.clock = next;
      if (next === timerAt) {
        const due = this.timers.filter((x) => x.at <= next);
        this.timers = this.timers.filter((x) => x.at > next);
        for (const x of due) x.fn();
      } else if (next === this.nextTrafficAt) {
        this.traffic();
        this.nextTrafficAt = next + this.trafficGap();
      } else if (next === this.nextBtcAt) {
        this.mineBtcBlock();
        this.nextBtcAt = next + this.btcGap();
      } else {
        this.mineFastBlock();
        this.scheduleNextFast();
      }
      changed = true;
    }
    this.clock = Math.max(this.clock, t);
    if (changed) this.bump();
    return changed;
  }

  private fastGap(): number {
    // PoW block intervals are roughly exponentially distributed; ASERT keeps the mean near the target
    return Math.min(Math.max(this.rng.exp(this.fastIntervalMs), 900), 14 * SEC);
  }

  /** Block interval of an empty block: the difficulty is weight times that of a non-empty block (D-084, D-090), so it takes about weight block intervals */
  private emptyGap(weight: number): number {
    return weight * this.fastIntervalMs * (0.75 + 0.5 * this.rng.next());
  }

  private btcGap(): number {
    return Math.min(Math.max(this.rng.exp(this.btcIntervalMs), 10 * SEC), 4 * this.btcIntervalMs);
  }

  private trafficGap(): number {
    // Busy and quiet periods: an 8-minute cycle; empty blocks appear in the troughs
    const phase = ((this.clock - this.genesisTime) / (8 * MIN)) * Math.PI * 2;
    const rate = this.trafficPerSec * Math.max(0.025, 1 + 0.95 * Math.sin(phase));
    return Math.max(80, this.rng.exp(SEC / rate));
  }

  /**
   * The producer's plan (D-084 item 7): with entries to include (forced inclusions, an unlock or candidates in the entry pool),
   * produce a non-empty block at the normal interval; otherwise produce an empty block, whose difficulty grows with the streak and
   * whose interval lengthens accordingly.
   */
  private scheduleNextFast() {
    if (this.hasWork()) {
      this.nextFastAt = this.clock + this.fastGap();
      this.nextFastEmpty = false;
    } else {
      this.nextFastAt = this.clock + this.emptyGap(emptyBlockWeight(this.streakOf.get(this.tip.hash) ?? 0));
      this.nextFastEmpty = true;
    }
  }

  /** A new operation entered the entry pool, a native transaction confirmed or a block became unlockable: the empty-block template is discarded and a block is produced at the normal interval right away */
  private wakeProducer() {
    if (!this.nextFastEmpty || !this.hasWork()) return;
    this.nextFastAt = this.clock + this.fastGap();
    this.nextFastEmpty = false;
  }

  /** Whether the next block will have entries */
  private hasWork(): boolean {
    const anchor = this.btcTip.height;
    if (this.forcedFor([this.tip, ...this.unmerged], anchor).length) return true;
    const backlog = this.backlogStatus(anchor).triggered;
    if (backlog) return false;
    if (this.unlockSegment(anchor).length) return true;
    return this.mempool.some((r) => !this.censored.has(r.op.account) && r.op.nonce === this.account(r.op.account).nonce);
  }

  private emit(kind: ChainEvent['kind'], text: () => string, ref?: string) {
    const ev = withText({ id: ++this.eventSeq, at: this.clock, kind } as Omit<ChainEvent, 'text'>, 'text', text) as ChainEvent;
    if (ref) ev.ref = ref;
    this.events.push(ev);
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
  }

  // =====================================================================
  // Queries
  // =====================================================================

  /** On-demand lookup with the same name as in the node data source: the simulator's data is all local */
  lookup(_kind: 'block' | 'op' | 'account' | 'asset', _id: string): undefined {
    return undefined;
  }

  request(_kind: 'block' | 'op' | 'account' | 'asset', _id: string) {}

  retry(_kind: 'block' | 'op' | 'account' | 'asset', _id: string) {}

  get tip(): Block {
    return this.blocks[this.blocks.length - 1] as Block;
  }

  get btcTip(): BtcBlock {
    return this.btcBlocks[this.btcBlocks.length - 1] as BtcBlock;
  }

  /** A height means a chain block; a hash may be any block in the DAG (same as ksana_getBlock) */
  getBlock(id: string | number): Block | undefined {
    if (typeof id === 'number') return this.blocks[id];
    if (/^\d+$/.test(id)) return this.blocks[Number(id)];
    return this.blockByHash.get(id.toLowerCase());
  }

  /** Parallel blocks at the same height */
  sideAt(height: number): Block[] {
    return this.sideByHeight.get(height) ?? [];
  }

  /** Parallel blocks merged by a chain block */
  mergedOf(b: Block): Block[] {
    return b.merged.map((id) => this.blockByHash.get(id)).filter((x): x is Block => !!x);
  }

  getOp(id: Hex): OpRecord | undefined {
    return this.ops.get(id.toLowerCase());
  }

  getBtcTx(id: Hex): BtcTx | undefined {
    return this.btcTxs.get(id.toLowerCase());
  }

  getBtcBlock(height: number): BtcBlock | undefined {
    return this.btcBlocks[height - this.btcBase];
  }

  btcConfs(height: number | undefined): number {
    if (height === undefined) return 0;
    return Math.max(0, this.btcTip.height - height + 1);
  }

  /** Current BTC tip height (same name as in the node data source) */
  currentBtcHeight(): number {
    return this.btcTip.height;
  }

  getUtxos(id: Hex): Utxo[] {
    return this.actors.get(id)?.utxos ?? [];
  }

  private addrCache = new Map<Hex, string>();

  /** Whether the account is a contract (deployed, or about to be by the demo's first blocks) */
  isContract(id: Hex): boolean {
    return this.contracts.has(id) || this.contractNames.has(id);
  }

  /** The account's Taproot address: the account is the 32-byte output key inside the address (D-092). Contract IDs and values off the curve have no address; returns the empty string */
  addressOf(id: Hex): string {
    if (this.isContract(id)) return '';
    let a = this.addrCache.get(id);
    if (a === undefined) {
      try {
        a = accountToAddress(fromHex(id, 32), BTC_NETWORK);
      } catch {
        a = '';
      }
      this.addrCache.set(id, a);
    }
    return a;
  }

  /** Taproot address → account (D-092): every valid regtest P2TR address corresponds to an account; other addresses have none */
  accountOfAddress(address: string): Hex | undefined {
    try {
      return toHex(accountFromAddress(address.trim(), BTC_NETWORK));
    } catch {
      return undefined;
    }
  }

  account(id: Hex): AccountState {
    let acc = this.accounts.get(id);
    if (!acc) {
      acc = { id, nonce: 0, balances: new Map(), opIds: [] };
      this.accounts.set(id, acc);
    }
    return acc;
  }

  peekAccount(id: Hex): AccountState | undefined {
    return this.accounts.get(id);
  }

  balance(id: Hex, asset: Hex): bigint {
    return this.accounts.get(id)?.balances.get(asset) ?? 0n;
  }

  /** The nonce for a new submission: after the state nonce, following the operations already in the entry pool */
  nextNonce(id: Hex): number {
    let n = this.accounts.get(id)?.nonce ?? 0;
    for (const r of this.mempool) if (r.op.account === id && r.op.nonce >= n) n = r.op.nonce + 1;
    for (const r of this.nativePending) if (r.op.account === id && r.op.nonce >= n) n = r.op.nonce + 1;
    return n;
  }

  pendingOf(id: Hex): OpRecord[] {
    return [...this.mempool, ...this.nativePending].filter((r) => r.op.account === id);
  }

  allOps(): IterableIterator<OpRecord> {
    return this.ops.values();
  }

  /** Locked balances not yet unlocked: sponsored fees and block rewards separately (rewards only enter the KSA total supply when unlocked, D-079) */
  lockedSupply(): { fees: bigint; rewards: bigint } {
    let fees = 0n;
    let rewards = 0n;
    for (const row of this.rows.values()) {
      if (row.unlocked) continue;
      fees += row.fees;
      rewards += row.reward;
    }
    return { fees, rewards };
  }

  /** One lock of the exchange contract (corresponds to the SDK's getLock, D-085) */
  getLock(exchange: Hex, lockId: bigint): ExchangeLockView | undefined {
    if (exchange.toLowerCase() !== this.exchangeContract) return undefined;
    return this.locks.get(lockId.toString());
  }

  /** What the exchange contract's read-only calls answer from: its locks in lock order, and a seller's free balance in it (D-085) */
  exchangeState(): { locks: ExchangeLockView[]; available: (seller: Hex) => bigint } {
    return { locks: [...this.locks.values()], available: (seller) => this.exchangeAvailable.get(seller) ?? 0n };
  }

  /** Locks whose beneficiary is this account and that are still Open (the buyer can pay them) */
  locksFor(beneficiary: Hex): ExchangeLockView[] {
    const out: ExchangeLockView[] = [];
    for (const l of this.locks.values()) if (l.beneficiary === beneficiary && l.state === 'Open') out.push(l);
    return out;
  }

  /**
   * Settlement backlog limit (D-046, D-077): when any block in the past whose body must land on BTC has not landed as of the current
   * anchor, and its anchor is SETTLEMENT_TIMEOUT or more BTC blocks behind, a new block may only be empty or contain only forced
   * inclusions (it may still carry a settlement transaction with the backlogged bodies).
   */
  backlogStatus(anchorHeight = this.btcTip.height): BacklogStatus {
    const limit = PARAMS.SETTLEMENT_TIMEOUT;
    let oldest: Block | undefined;
    for (let h = this.settledHeight + 1; h < this.blocks.length; h++) {
      const c = this.blocks[h] as Block;
      for (const b of [c, ...this.mergedOf(c)]) {
        if (!b.needsSettlement || b.settlementOnBtc) continue;
        if (!oldest || b.header.btcAnchor.height < oldest.header.btcAnchor.height) oldest = b;
      }
    }
    if (!oldest) return { waited: 0, limit, triggered: false };
    const waited = anchorHeight - oldest.header.btcAnchor.height;
    return { oldest, waited, limit, triggered: waited >= limit };
  }

  private feeCache: { key: string; value: FeeEstimate } | null = null;

  /** ksana_estimateFee (D-054, D-078) + the BTC market fee rate */
  estimateFee(): FeeEstimate {
    const key = `${this.blocks.length}:${this.feeRate}:${this.btcMinFeeRate}:${this.settlementFeeRate}`;
    if (this.feeCache?.key === key) return this.feeCache.value;
    const value = this.computeFeeEstimate();
    this.feeCache = { key, value };
    return value;
  }

  private computeFeeEstimate(): FeeEstimate {
    const feerate = Math.max(PARAMS.MIN_SETTLEMENT_FEERATE, this.settlementFeeRate);
    // Path B: the median of the path B entry amounts in the last 20 chain blocks (the upper middle value for an even count), not below this node's min_token_fee
    const recent: bigint[] = [];
    for (let h = this.blocks.length - 1; h >= Math.max(1, this.blocks.length - 20); h--) {
      for (const e of (this.blocks[h] as Block).entries) {
        if (e.entry.kind !== 'Sponsored') continue;
        const r = this.ops.get(e.entry.opId);
        if (r && r.op.fee.kind === 'Token') recent.push(r.op.fee.amount);
      }
    }
    recent.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const nodeMin = this.producers[0]?.minTokenFee ?? NODE_POLICY.MIN_TOKEN_FEE;
    const median = recent.length ? (recent[Math.floor(recent.length / 2)] as bigint) : nodeMin;
    const amount = median > nodeMin ? median : nodeMin;
    const marketRate = this.feeRate;
    return {
      feerateSatVb: feerate,
      pathB: {
        amount,
        nodeMin,
        producerMins: this.producers.map((p) => ({ name: p.name, min: p.minTokenFee })),
        // The simulator's producers ask a minimum amount, whatever an op's size
        forOp: () => amount,
        basis: 'median',
      },
      market: { feeRate: marketRate, minFeeRate: this.btcMinFeeRate },
      pathC: (opBytes, rate = marketRate) => pathCFee(opBytes, rate),
    };
  }

  // =====================================================================
  // Submission
  // =====================================================================

  /** Estimated Borsh-encoded length of a VmOp (version 2, D-073) (the op_bytes of D-054) */
  opSize(path: Path, action: Action, scheme: 'Bip340' | 'Bip322Simple' = 'Bip340'): number {
    const fee = path === 'B' ? 1 + 16 : 1;
    let act = 1;
    if (action.kind === 'AssetTransfer') act += 32 + 32 + 16;
    if (action.kind === 'Call') act += 32 + 4 + action.method.length + 4 + 8 + Object.keys(action.args).length * 24 + 4 + (action.funds?.length ?? 0) * 48;
    if (action.kind === 'Deploy') act += 4 + action.codeSize + 4 + action.initArgsSize + 4 + (action.funds?.length ?? 0) * 48;
    // BIP322 simple: the consensus encoding of the P2TR witness stack is 1 + 1 + 65 bytes (D-052, D-092)
    const sig = scheme === 'Bip340' ? 1 + 64 : 1 + 4 + 67;
    return 1 + 4 + 32 + 8 + fee + 8 + act + sig;
  }

  /** KSA the operation moves out of the signing account: the transfer amount plus the attached KSA (D-073) */
  private ksaOut(action: Action): bigint {
    if (action.kind === 'AssetTransfer') return action.asset === KSA_ASSET_ID ? action.amount : 0n;
    let out = 0n;
    for (const f of action.funds ?? []) if (f.asset === KSA_ASSET_ID) out += f.amount;
    return out;
  }

  /** The node's admission checks (SPEC §5, §8.4, ksana_submitOp in core/docs/RPC.md). Returns null when the op passes */
  validate(draft: OpDraft): { code: string; message: string } | null {
    const acc = this.accounts.get(draft.account);
    const size = this.opSize(draft.path, draft.action, draft.sigScheme);
    const rj = t().sim.reject;
    if (size > PARAMS.MAX_OP_BYTES) return { code: 'too_large', message: rj.tooLarge(size) };
    if (draft.nonce !== undefined && acc && draft.nonce < acc.nonce) {
      return { code: 'nonce_used', message: t().sim.reject.nonceUsed(String(draft.nonce)) };
    }
    if (draft.path === 'C' && draft.maxGas > PARAMS.NATIVE_MAX_GAS) {
      return { code: 'native_gas', message: rj.nativeGas(PARAMS.NATIVE_MAX_GAS.toLocaleString('en-US')) };
    }
    if (draft.path === 'B') {
      const fee = draft.tokenFee ?? 0n;
      if (fee < NODE_POLICY.MIN_TOKEN_FEE) return { code: 'fee_low', message: rj.feeLow(fmtAmount(NODE_POLICY.MIN_TOKEN_FEE, KSA_DECIMALS)) };
      if (this.balance(draft.account, KSA_ASSET_ID) < fee + this.ksaOut(draft.action)) return { code: 'ksa', message: rj.ksa };
    }
    if (draft.path === 'C') {
      const fee = pathCFee(size, draft.nativeFeeRate ?? this.feeRate);
      if (!this.freeUtxos(draft.account).some((u) => u.valueSat > fee + DUST_SAT)) return { code: 'no_utxo', message: rj.noUtxo };
    }
    return null;
  }

  submit(draft: OpDraft): SubmitResult {
    this.syncLive();
    const res = this.submitAt(this.clock, { ...draft, origin: draft.origin ?? 'wallet' });
    if (res.ok) this.bump();
    return res;
  }

  private findUtxo(owner: Hex, outpoint: OutPoint): Utxo | undefined {
    return this.actors.get(owner)?.utxos.find((u) => u.outpoint.txid === outpoint.txid && u.outpoint.vout === outpoint.vout);
  }

  /** Build the VmOp (not yet signed) for the signing confirmation page to display */
  buildOp(draft: OpDraft): VmOp {
    const nonce = draft.nonce ?? this.nextNonce(draft.account);
    const fee: VmOp['fee'] = draft.path === 'B' ? { kind: 'Token', amount: draft.tokenFee ?? 0n } : { kind: 'BtcNative' };
    return {
      version: 2,
      chainId: PARAMS.CHAIN_ID,
      account: draft.account,
      nonce,
      fee,
      maxGas: draft.maxGas,
      action: draft.action,
      sig: { kind: draft.sigScheme ?? 'Bip340', sig: '' },
    };
  }

  /** Illustrative signature hash: the tagged hash "Ksana/VmOp/v1" over the encoding without sig (the real algorithm is vmopSighash in @ksana/sdk) */
  sigHash(op: VmOp): Hex {
    return phash('Ksana/VmOp/v1', op.chainId, op.account, op.nonce, JSON.stringify(op.fee, bigintJson), op.maxGas, JSON.stringify(op.action, bigintJson));
  }

  private submitAt(at: number, draft: OpDraft): SubmitResult {
    const invalid = this.validate(draft);
    if (invalid) return { ok: false, ...invalid };
    const op = this.buildOp(draft);
    const sigLen = op.sig.kind === 'Bip340' ? 64 : 67;
    op.sig = { kind: op.sig.kind, sig: this.rng.hex(sigLen) };
    const size = this.opSize(draft.path, draft.action, op.sig.kind);
    // Path C: first build the native transaction funded by the user's UTXOs; without funding the op is not accepted
    let native: BtcTx | null = null;
    if (draft.path === 'C') {
      native = this.buildUserTx(op.account, 'native', [], draft.nativeFeeRate ?? this.feeRate, size + 5);
      if (!native) return { ok: false, code: 'no_utxo', message: t().sim.reject.noUtxo };
    }
    const id = phash('op', op.account, op.nonce, draft.path, at, this.rng.next());
    const record: OpRecord = {
      id,
      op,
      path: draft.path,
      size,
      submittedAt: at,
      origin: draft.origin ?? 'traffic',
    };
    this.ops.set(id, record);
    this.opOrder.push(id);
    this.account(op.account).opIds.push(id);
    if (draft.action.kind === 'AssetTransfer' && draft.action.to !== op.account) this.account(draft.action.to).opIds.push(id);

    if (native) {
      native.opId = id;
      native.author = op.account;
      record.nativeTxid = native.txid;
      this.nativePending.push(record);
    } else {
      this.mempool.push(record);
      this.wakeProducer();
    }
    return { ok: true, opId: id, op };
  }

  /** Confirmed, unspent UTXOs that satisfy the anchor depth, largest amount first */
  private freeUtxos(id: Hex): Utxo[] {
    const a = this.actors.get(id);
    if (!a) return [];
    const tipH = this.btcTip.height;
    return a.utxos.filter((u) => u.confirmedHeight !== null && u.confirmedHeight <= tipH - PARAMS.ANCHOR_DEPTH && !u.spentBy).sort((x, y) => y.valueSat - x.valueSat);
  }

  /**
   * A BTC transaction funded by the user (a path C native transaction or a faucet transfer): UTXOs are selected in turn until they
   * cover the payments, the fee and a non-dust change output. Output 0 of a native transaction is the KSN1 data output, followed by
   * the payments (for a top-up, paid to the lock's payment address) and finally the change (buildNativeTx in core/sdk/ts).
   * The selected UTXOs are marked spent immediately (the transaction is already in the mempool).
   */
  private buildUserTx(owner: Hex, kind: 'native' | 'faucet', payments: TxOut[], feeRate: number, payloadBytes = 0): BtcTx | null {
    const free = this.freeUtxos(owner);
    const outFixed = payments.reduce((s, o) => s + o.valueSat, 0);
    const outVb = (payments.length + 1) * VB.out.p2tr + (kind === 'native' ? opReturnVbytes(payloadBytes) : 0);
    const picked: Utxo[] = [];
    let inSum = 0;
    for (const u of free) {
      picked.push(u);
      inSum += u.valueSat;
      const vsize = Math.ceil(VB.base + picked.length * VB.in.p2tr + outVb);
      const fee = Math.ceil(vsize * feeRate);
      if (inSum < outFixed + fee + DUST_SAT) {
        if (picked.length >= 4) return null;
        continue;
      }
      const txid = this.rng.hex(32);
      const outputs: TxOut[] = [];
      if (kind === 'native') {
        outputs.push({ valueSat: 0, role: 'op_return', owner: null, scriptType: 'op_return', chunks: chunkCount(payloadBytes), payloadBytes });
      }
      outputs.push(...payments);
      outputs.push({ valueSat: inSum - outFixed - fee, role: 'change', owner, address: this.addressOf(owner), scriptType: 'p2tr' });
      const inputs: TxIn[] = picked.map((u) => ({ prevout: u.outpoint, valueSat: u.valueSat, owner, role: 'payer', scriptType: 'p2tr', sighash: 'ALL' }));
      for (const u of picked) u.spentBy = txid;
      const tx: BtcTx = {
        txid,
        kind,
        status: 'broadcast',
        headers: [],
        bodies: [],
        entryCount: kind === 'native' ? 1 : 0,
        inputs,
        outputs,
        vsize,
        feeSat: fee,
        feeRate,
        payloadBytes,
        createdAt: this.clock,
        broadcastAt: this.clock,
        author: owner,
      };
      this.btcTxs.set(txid, tx);
      this.btcMempool.push(tx);
      return tx;
    }
    return null;
  }

  /**
   * Top-up (D-078, D-085): the buyer (the lock's beneficiary account) sends one BTC transaction from its own UTXOs; output 0 carries
   * the claim operation and output 1 pays the lock's payment address. The claim operation is signed by a one-time key with nonce 0;
   * once confirmed it is force-included and the contract credits KSA to the beneficiary account at the lock's price.
   */
  topUp(lockId: bigint, sats: number, buyer?: Hex): SubmitResult {
    this.syncLive();
    const rj = t().sim.reject;
    const lock = this.locks.get(lockId.toString());
    if (!lock) return { ok: false, code: 'lock_missing', message: rj.lockMissing };
    if (lock.state !== 'Open') return { ok: false, code: 'lock_not_open', message: rj.lockNotOpen };
    if (buyer !== undefined && buyer.toLowerCase() !== lock.beneficiary) return { ok: false, code: 'not_beneficiary', message: rj.notBeneficiary };
    if (!(sats > 0)) return { ok: false, code: 'sats', message: rj.sats };
    const res = this.topUpAt(this.clock, lock, Math.floor(sats));
    if (res.ok) this.bump();
    return res;
  }

  private topUpAt(at: number, lock: ExchangeLockView, sats: number): SubmitResult {
    const buyer = lock.beneficiary;
    const oneTime = this.newKey();
    const action: Action = { kind: 'Call', contract: this.exchangeContract, method: 'claim', args: { lock: lock.id } };
    const op: VmOp = {
      version: 2,
      chainId: PARAMS.CHAIN_ID,
      account: oneTime,
      nonce: 0,
      fee: { kind: 'BtcNative' },
      maxGas: 200_000,
      action,
      sig: { kind: 'Bip340', sig: this.rng.hex(64) },
    };
    const size = this.opSize('C', action);
    const payment: TxOut = { valueSat: sats, role: 'payment', owner: lock.seller, scriptType: 'p2tr', ...(lock.address ? { address: lock.address } : {}) };
    const tx = this.buildUserTx(buyer, 'native', [payment], this.feeRate, size + 5);
    if (!tx) return { ok: false, code: 'no_utxo', message: t().sim.reject.noUtxo };
    const id = phash('op', oneTime, 0, 'C', at, this.rng.next());
    const record: OpRecord = { id, op, path: 'C', size, submittedAt: at, origin: 'wallet', nativeTxid: tx.txid };
    tx.opId = id;
    tx.author = buyer;
    this.ops.set(id, record);
    this.opOrder.push(id);
    this.account(oneTime).opIds.push(id);
    // The top-up is listed in the beneficiary account's records too
    this.account(buyer).opIds.push(id);
    this.nativePending.push(record);
    return { ok: true, opId: id, op };
  }

  // =====================================================================
  // Background traffic
  // =====================================================================

  private userList: Actor[] | null = null;

  /** Pick a random ordinary user (excluding the demo account) */
  private randomUser(except?: Hex): Actor {
    const users = this.userList ?? (this.userList = [...this.actors.values()].filter((a) => a.kind === 'user'));
    for (;;) {
      const u = this.rng.pick(users);
      if (u.id !== except) return u;
    }
  }

  /** Fill in the draft's fees from the node's suggestion */
  fillFees(draft: OpDraft) {
    const est = this.estimateFee();
    if (draft.path === 'B') {
      // Most background traffic bids near the minimum; always raising to the suggested value (the median of the last 20 blocks) would form a feedback loop that keeps pushing fees up
      draft.tokenFee = draft.origin === 'traffic' ? this.rng.weighted(TRAFFIC_FEES) : est.pathB.amount;
    } else {
      draft.nativeFeeRate = this.feeRate;
    }
  }

  private trafficTransfer(from: Hex, to: Hex, amount: bigint, path: Path) {
    const draft: OpDraft = {
      account: from,
      path,
      maxGas: 50_000,
      action: { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to, amount },
      origin: from === this.faucetId ? 'faucet' : 'traffic',
    };
    this.fillFees(draft);
    this.submitAt(this.clock, draft);
  }

  private traffic() {
    if (this.contracts.size < 4) return;
    // The demo account only acts in the script; the background traffic occasionally transfers to it
    const pool = this.trafficPool ?? (this.trafficPool = [...this.actors.values()].filter((a) => a.kind === 'user').map((a) => [a, a.weight] as const));
    const actor = this.rng.weighted(pool);
    if (this.pendingOf(actor.id).length >= 3) return;
    // Amounts are a small fraction of the balance, so balances stay healthy over time and the failure rate resembles a real network
    const portion = (asset: Hex, maxWhole: number, unit: bigint) => {
      const cap = this.balance(actor.id, asset) / 14n;
      const want = BigInt(Math.max(1, Math.round((this.rng.int(1, 1000) * maxWhole) / 1000))) * unit;
      return want < cap ? want : cap;
    };

    const r = this.rng.next();
    let action: Action;
    let maxGas = 50_000;
    const ksaAmt = portion(KSA_ASSET_ID, 24_000, KSA_UNIT);
    const tknAmt = portion(this.tokenAsset, 50_000, 1n);
    if (r < 0.46 && ksaAmt > 0n) {
      const to = this.rng.chance(0.012) ? this.demoId : this.randomUser(actor.id).id;
      action = { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to, amount: ksaAmt };
    } else if (r < 0.62 && tknAmt > 0n) {
      action = { kind: 'AssetTransfer', asset: this.tokenAsset, to: this.randomUser(actor.id).id, amount: tknAmt };
      maxGas = 60_000;
    } else if (r < 0.86 && (ksaAmt > 0n || tknAmt > 0n)) {
      const inKsa = tknAmt === 0n || (ksaAmt > 0n && this.rng.chance(0.5));
      const amountIn = inKsa ? ksaAmt : tknAmt;
      const tight = this.rng.chance(0.03);
      action = {
        kind: 'Call',
        contract: this.ammContract,
        method: 'swap',
        args: { asset_in: inKsa ? 'KSA' : 'TKN', amount_in: amountIn, min_out: tight ? amountIn * 1_000n : 1n },
      };
      maxGas = 250_000;
    } else if (r < 0.94) {
      action = { kind: 'Call', contract: this.tokenContract, method: 'approve', args: { spender: this.ammContract, amount: BigInt(this.rng.int(100, 9000)) * 100n } };
      maxGas = 80_000;
    } else if (r < 0.993) {
      const depth = this.rng.int(1, 45);
      action = { kind: 'Call', contract: this.triggerContract, method: 'claim', args: { btc_height: this.btcTip.height - depth + 1, proof_len: 352 } };
      maxGas = 150_000;
    } else {
      // Names of user-deployed contracts are on-chain data and do not follow the UI language: use the English identifiers developers typically use
      const names = ['counter', 'multisig-vault', 'voting', 'escrow', 'auction', 'name-service'];
      const name = this.rng.pick(names);
      action = { kind: 'Deploy', codeHash: phash('code', name, this.clock), codeSize: this.rng.int(6_000, 30_000), initArgsSize: 32, name };
      maxGas = 5_000_000;
    }

    // About 90% path B, 10% path C; a native transaction needs the user's own confirmed UTXOs for funding and no queued operations (the nonce must follow on exactly)
    let path: Path = this.rng.weighted([
      ['B', 0.9],
      ['C', 0.1],
    ] as const);
    if (path === 'C' && (this.pendingOf(actor.id).length > 0 || maxGas > PARAMS.NATIVE_MAX_GAS || !this.freeUtxos(actor.id).length)) path = 'B';
    const draft: OpDraft = { account: actor.id, path, action, maxGas, origin: 'traffic' };
    this.fillFees(draft);
    this.submitAt(this.clock, draft);
  }

  private trafficPool: (readonly [Actor, number])[] | null = null;

  // =====================================================================
  // Fast-lane block production (GHOSTDAG, D-063; two-speed difficulty, D-084, D-090)
  // =====================================================================

  private fastHash(): Hex {
    return '000000' + this.rng.hex(29).slice(0, 58);
  }

  /** A block hash below limit: with equal chain work the block with the larger hash becomes the selected parent (D-100), so a parallel block needs the smaller hash */
  private fastHashBelow(limit: Hex): Hex {
    for (;;) {
      const h = this.fastHash();
      if (h < limit) return h;
    }
  }

  private btcHash(): Hex {
    // regtest difficulty is minimal: the hash only has to be below 2^255, so the first digit is 0-7
    return this.rng.int(0, 7).toString(16) + this.rng.hex(32).slice(1);
  }

  private pickProducer(): Producer {
    const online = this.producers.filter((p) => p.id !== this.producerOffline);
    return this.rng.weighted((online.length ? online : this.producers).map((p) => [p, p.weight] as const));
  }

  private producerOf(id: Hex): Producer | undefined {
    return this.producers.find((p) => p.id === id);
  }

  /** Forced inclusion (§7.4, D-063): native transactions confirmed at BTC heights within (max(h(parents)), h(this block)], ordered by height and index within the block */
  private forcedFor(parents: Block[], anchorHeight: number): ForcedItem[] {
    const hParent = Math.max(...parents.map((p) => p.header.btcAnchor.height)) - PARAMS.NATIVE_CONFIRMATIONS + 1;
    const hThis = anchorHeight - PARAMS.NATIVE_CONFIRMATIONS + 1;
    return this.nativePending
      .map((r) => ({ r, tx: r.nativeTxid ? this.btcTxs.get(r.nativeTxid) : undefined }))
      .filter((x) => x.tx?.confirmedHeight !== undefined && (x.tx.confirmedHeight as number) > hParent && (x.tx.confirmedHeight as number) <= hThis)
      .sort((a, b) => {
        const ha = a.tx?.confirmedHeight ?? 0;
        const hb = b.tx?.confirmedHeight ?? 0;
        if (ha !== hb) return ha - hb;
        const blk = this.getBtcBlock(ha);
        return (blk?.txids.indexOf(a.tx?.txid ?? '') ?? 0) - (blk?.txids.indexOf(b.tx?.txid ?? '') ?? 0);
      });
  }

  /** The block's acceptance position (D-079); a parallel block not yet accepted by the main chain has none */
  private positionOf(b: Block): Position | undefined {
    if (b.acceptedHeight === undefined) return undefined;
    const chain = this.blocks[b.acceptedHeight];
    if (!chain) return undefined;
    return { height: b.acceptedHeight, index: b.side ? chain.merged.indexOf(b.hash) : chain.merged.length };
  }

  /** The highest chain height inside the settled closure as of the anchor height (the settled prefix is monotonic in height) */
  private settledAt(anchorHeight: number): number {
    let h = this.settledHeight;
    while (h > 0 && ((this.blocks[h] as Block).closureBtc ?? Infinity) > anchorHeight) h--;
    return h;
  }

  /**
   * Unlockable segment (D-079): the blocks after the cursor in acceptance order whose acceptance height does not exceed the settled
   * height at the anchor (merged blocks first, then the chain block itself), at most MAX_UNLOCK_BATCH of them.
   */
  private unlockSegment(anchorHeight: number): Block[] {
    const settled = this.settledAt(anchorHeight);
    const out: Block[] = [];
    const cur = this.unlockCursor;
    for (let h = cur.height; h <= settled && h < this.blocks.length; h++) {
      const c = this.blocks[h] as Block;
      const order = [...this.mergedOf(c), c];
      for (let index = 0; index < order.length; index++) {
        if (h === cur.height && index <= cur.index) continue;
        out.push(order[index] as Block);
        if (out.length >= PARAMS.MAX_UNLOCK_BATCH) return out;
      }
    }
    return out;
  }

  /** The producer's unlock target: the last position in the segment (the node's unlock_target) */
  private unlockTarget(anchorHeight: number): Position | null {
    const seg = this.unlockSegment(anchorHeight);
    const last = seg[seg.length - 1];
    return last ? (this.positionOf(last) ?? null) : null;
  }

  private mineFastBlock() {
    const sp = this.tip;
    const height = sp.header.height + 1;
    const btcTip = this.btcTip;
    const anchorBlock = this.getBtcBlock(Math.max(sp.header.btcAnchor.height, btcTip.height - PARAMS.ANCHOR_DEPTH)) ?? btcTip;
    const anchor = { height: anchorBlock.height, hash: anchorBlock.hash };
    const producer = this.pickProducer();
    const hash = this.fastHash();
    const ctx: BlockCtx = { hash, height, producer: producer.id, anchor: anchor.height };
    const toMerge = this.unmerged;
    this.unmerged = [];
    const parents = [sp, ...toMerge];

    // 0. Merge set: first execute the entries of the merged parallel blocks in lenient mode (D-063); their unlock entries are skipped (D-100)
    for (const side of toMerge) this.acceptSide(side, ctx);

    // Shared between this block and a possible parallel block: the forced-inclusion window and the unlock target.
    // While the backlog limit is triggered a block may only be empty or contain only forced inclusions (D-046, D-077); the unlock entry waits too
    const forced = this.forcedFor(parents, anchor.height);
    const backlog = this.backlogStatus(anchor.height);
    const unlock = backlog.triggered ? null : this.unlockTarget(anchor.height);

    // Parallel block: another producer finds a block at the same height almost simultaneously. Its entries are decided from the state and entry pool at this instant
    let plan: ParallelPlan | null = null;
    if (height > 3 && this.rng.chance(this.parallelRate)) {
      const rivals = this.producers.filter((p) => p.id !== producer.id && p.id !== this.producerOffline);
      if (rivals.length) {
        const rival = this.rng.pick(rivals);
        const picked = backlog.triggered ? [] : this.selectFastPath(rival, PARAMS.MAX_BLOCK_DATA_BYTES - headerBytes(1) * 4 - 1024, PARAMS.BLOCK_GAS_LIMIT);
        plan = { producer: rival, forced, unlock, picked };
      }
    }

    const entries: EntryRecord[] = [];
    let gasUsed = 0;
    let maxGasSum = 0;
    let dataBytes = 0;

    // 1. Forced inclusions
    for (const { r, tx } of forced) {
      const result = this.executeOp(r, ctx, 'strict');
      this.placeOp(r, hash, height, entries.length, result);
      entries.push({ entry: { kind: 'Forced', btcTxid: tx?.txid ?? '', opId: r.id }, result, dataBytes: FORCED_BYTES });
      gasUsed += result.gasUsed;
      maxGasSum += Math.min(r.op.maxGas, PARAMS.NATIVE_MAX_GAS);
      dataBytes += FORCED_BYTES;
    }
    this.nativePending = this.nativePending.filter((r) => !forced.some((f) => f.r === r));

    // 2. Unlock (at most one per block, D-074)
    if (unlock) {
      const done = this.tryUnlock(unlock, height, anchor.height);
      if (done.ok) {
        entries.push(done.rec);
        dataBytes += UNLOCK_BYTES;
        const amount = done.entry.amount ?? 0n;
        this.emit('fast_block', () => t().sim.event.unlock(fmtInt(unlock.height), fmtAmount(amount, KSA_DECIMALS)), hash);
      }
    }

    // 3. Fast-path entries: must not be included while the settlement backlog limit is triggered (§6.4, D-046)
    if (backlog.triggered) {
      if (!this.backlogAlerted && this.mempool.length) {
        const oldest = backlog.oldest;
        const waited = backlog.waited;
        this.emit('alert', () => t().sim.event.backlogOn(this.blockLabel(oldest), waited));
        this.backlogAlerted = true;
      }
    } else {
      if (this.backlogAlerted) this.emit('alert', lazy((m) => m.sim.event.backlogOff));
      this.backlogAlerted = false;
      const budget = PARAMS.MAX_BLOCK_DATA_BYTES - dataBytes - headerBytes(1) * 4 - 512;
      const picked = this.selectFastPath(producer, budget, PARAMS.BLOCK_GAS_LIMIT - maxGasSum);
      for (const r of picked) {
        const result = this.executeOp(r, ctx, 'strict');
        this.placeOp(r, hash, height, entries.length, result);
        entries.push({ entry: { kind: 'Sponsored', opId: r.id }, result, dataBytes: 1 + r.size });
        gasUsed += result.gasUsed;
        maxGasSum += r.op.maxGas;
        dataBytes += 1 + r.size;
      }
      this.mempool = this.mempool.filter((r) => !picked.includes(r));
    }

    // The body must land on BTC when the block contains non-forced entries (D-077). Weight: 1 with entries, otherwise by the empty-block streak on the selected chain (D-084, D-090)
    const needsSettlement = entries.some((e) => e.entry.kind !== 'Forced');
    const spStreak = this.streakOf.get(sp.hash) ?? 0;
    const weight = entries.length ? 1 : emptyBlockWeight(spStreak);
    const streak = entries.length ? 0 : spStreak + 1;
    const daa = (this.daaOf.get(sp.hash) ?? 0) + toMerge.reduce((s, b) => s + (b.weight ?? 1), 0) + weight;
    // Empty blocks write no state (D-079): when neither this block nor the blocks it merges executed any entry, the state root equals the selected parent's
    const changed = entries.length > 0 || toMerge.some((b) => b.entries.some((e) => executed(e)));
    const header = {
      version: 2,
      height,
      parents: [sp.hash, ...toMerge.map((b) => b.hash).sort()],
      btcAnchor: anchor,
      entriesRoot: entries.length ? phash('entries', hash) : '0'.repeat(64),
      stateRoot: changed ? phash('state', sp.header.stateRoot, hash) : sp.header.stateRoot,
      producer: producer.id,
      timestamp: Math.floor(this.clock / 1000),
      bits: 0x207fffff - this.rng.int(0, 0x4000),
      nonce: BigInt.asUintN(64, BigInt('0x' + this.rng.hex(8))).toString(),
    };
    const block: Block = {
      hash,
      header,
      entries,
      time: this.clock,
      dataBytes: dataBytes + headerBytes(header.parents.length),
      gasUsed,
      maxGasSum,
      needsSettlement,
      weight,
      settlements: [],
      merged: toMerge.map((b) => b.hash),
      acceptedBy: hash,
      acceptedHeight: height,
    };
    this.blocks.push(block);
    this.blockByHash.set(hash, block);
    this.daaOf.set(hash, daa);
    this.streakOf.set(hash, streak);
    // Block rewards are locked first (D-079, D-084, D-089): this block and the blocks it merges each take reward slots by their own weight
    for (const side of toMerge) this.lockReward(side);
    this.lockReward(block);
    if (toMerge.length) {
      const skipped = toMerge.reduce((s, b) => s + b.entries.filter((e) => e.result.reason === 'skipped').length, 0);
      const n = toMerge.length;
      this.emit('fast_block', () => t().sim.event.merged(fmtInt(height), n) + (skipped ? t().sim.event.mergedSkipped(skipped) : ''), hash);
    }
    if (weight > 1) this.emit('fast_block', lazy((m) => m.sim.event.emptyWeight, weight), hash);

    // Settlement transaction (the producer policy of D-077): carry a commit / reveal pair when a body must land on BTC (this block's or a backlogged one) and no settlement transaction is in flight
    this.settleIfDue(block, producer.id);

    if (plan) this.makeParallel(plan, block, sp, toMerge, anchor);

    // A fast-path operation whose nonce has been used up can never be included (for example a path C op with the same nonce got in first); the node drops it from the entry pool
    this.mempool = this.mempool.filter((r) => {
      if (r.op.nonce >= this.account(r.op.account).nonce) return true;
      r.dropped = withText({ at: this.clock }, 'reason', lazy((m) => m.sim.dropped.nonceUsed, String(r.op.nonce)));
      delete r.requeued;
      return false;
    });

    this.broadcastDueSettlements();
    this.maybeBackfillHeaders();
  }

  private backlogAlerted = false;

  private blockLabel(b: Block | undefined): string {
    if (!b) return '?';
    return b.side ? t().sim.event.sideBlock(b.hash.slice(6, 12), fmtInt(b.header.height)) : `#${fmtInt(b.header.height)}`;
  }

  /** The operation's position: the block that executed it and the height of the chain block that accepted that block */
  private placeOp(r: OpRecord, blockHash: Hex, acceptedHeight: number, index: number, result: ExecResult) {
    r.blockHash = blockHash;
    r.height = acceptedHeight;
    r.entryIndex = index;
    r.result = result;
  }

  // —— Locking and unlocking (D-074, D-079, D-084, D-089) ——

  /** The block's locked record (the producer's portion or the block-share account's portion), created if missing */
  private lockRow(b: Block, share: boolean): LockRow {
    const key = share ? `${b.hash}:share` : b.hash;
    let row = this.rows.get(key);
    if (!row) {
      row = { blockHash: b.hash, height: b.acceptedHeight ?? b.header.height, producer: share ? this.shareAccountId : b.header.producer, amount: 0n, unlocked: false, fees: 0n, reward: 0n };
      this.rows.set(key, row);
    }
    return row;
  }

  /** A single reward slot (D-074, D-089, D-105): halves by DAA score; the first REWARD_INTERVAL_DOUBLINGS halving periods double in length */
  private slotReward(daa: number): bigint {
    let rest = daa;
    let len: number = PARAMS.REWARD_HALVING_INTERVAL;
    let halvings = 0;
    for (; halvings < PARAMS.REWARD_INTERVAL_DOUBLINGS && rest >= len; halvings++) {
      rest -= len;
      len *= 2;
    }
    halvings += Math.floor(rest / len);
    return halvings >= 128 ? 0n : BigInt(PARAMS.BLOCK_REWARD) >> BigInt(halvings);
  }

  /**
   * A block's reward: weight slots (D-084), each halved by that slot's DAA score; slots with a DAA score below BLOCK_SHARE_END give 20%
   * to the block-share account (D-089). Rewards are paid out and enter the KSA total supply when unlocked (D-079); here they are only
   * recorded as locked.
   */
  private lockReward(b: Block) {
    const daa = this.daaOf.get(b.hash) ?? 0;
    let producer = 0n;
    let share = 0n;
    for (let i = 0; i < (b.weight ?? 1); i++) {
      const d = daa - i;
      if (d < 0) break;
      const r = this.slotReward(d);
      const s = d < PARAMS.BLOCK_SHARE_END ? (r * BigInt(PARAMS.BLOCK_SHARE_BPS)) / 10_000n : 0n;
      share += s;
      producer += r - s;
    }
    if (producer > 0n) {
      const row = this.lockRow(b, false);
      row.reward += producer;
      row.amount += producer;
    }
    if (share > 0n) {
      const row = this.lockRow(b, true);
      row.reward += share;
      row.amount += share;
    }
  }

  /**
   * Unlock entry (D-079): for every block after the cursor up to the target position, pay out the block reward (capped at
   * KSA_MAX_SUPPLY, the share portion first) and release the sponsored fees, all into available balances; the cursor is set to the target.
   * The target must be after the cursor and within the unlockable segment at the anchor; otherwise the failure reason is returned
   * (a chain block never writes such an entry; in a merged block the entry is skipped).
   */
  private tryUnlock(target: Position, execHeight: number, anchorHeight: number): { ok: true; rec: EntryRecord; entry: UnlockEntry } | { ok: false; reason: () => string } {
    if (!after(target, this.unlockCursor)) return { ok: false, reason: () => t().sim.exec.alreadyUnlocked };
    const seg = this.unlockSegment(anchorHeight);
    const end = seg.findIndex((b) => {
      const p = this.positionOf(b);
      return !!p && samePos(p, target);
    });
    if (end < 0) return { ok: false, reason: () => t().sim.exec.unlockNotSettled };
    const ksa = this.assets.get(KSA_ASSET_ID);
    const blocks: Hex[] = [];
    let amount = 0n;
    let unlockedBlocks = 0;
    for (const b of seg.slice(0, end + 1)) {
      blocks.push(b.hash);
      for (const share of [true, false]) {
        const row = this.rows.get(share ? `${b.hash}:share` : b.hash);
        if (!row || row.unlocked) continue;
        // Reward cap: the two portions together may not exceed the headroom under the max supply; when a block can only pay out part, the share portion comes first (D-089)
        const supply = ksa?.totalSupply ?? 0n;
        const room = BigInt(PARAMS.KSA_MAX_SUPPLY) - supply;
        const reward = row.reward < room ? row.reward : room < 0n ? 0n : room;
        const credit = row.fees + reward;
        row.unlocked = true;
        row.unlockHeight = execHeight;
        row.amount = credit;
        row.reward = reward;
        const acc = this.account(row.producer);
        acc.balances.set(KSA_ASSET_ID, (acc.balances.get(KSA_ASSET_ID) ?? 0n) + credit);
        if (ksa) ksa.totalSupply = supply + reward;
        amount += credit;
        unlockedBlocks++;
      }
    }
    this.unlockCursor = target;
    const entry: UnlockEntry = { kind: 'Unlock', height: target.height, index: target.index, blocks, amount };
    return {
      ok: true,
      entry,
      rec: {
        entry,
        result: { ok: true, gasUsed: 0, events: [{ name: 'Unlocked', fields: { blocks: String(blocks.length), records: String(unlockedBlocks), amount: amount.toString() } }] },
        dataBytes: UNLOCK_BYTES,
      },
    };
  }

  /**
   * Parallel block: same height and same selected parent as the chain block, including entries from the entry pool and state at the
   * moment of production (mostly duplicates of the chain block). The next chain block merges it; only then are its entries executed
   * in lenient mode.
   */
  private makeParallel(plan: ParallelPlan, chain: Block, sp: Block, toMerge: Block[], anchor: { height: number; hash: Hex }) {
    const hash = this.fastHashBelow(chain.hash);
    const entries: EntryRecord[] = [];
    let dataBytes = 0;
    let maxGasSum = 0;
    for (const { r, tx } of plan.forced) {
      entries.push({ entry: { kind: 'Forced', btcTxid: tx?.txid ?? '', opId: r.id }, result: UNACCEPTED, dataBytes: FORCED_BYTES });
      dataBytes += FORCED_BYTES;
      maxGasSum += Math.min(r.op.maxGas, PARAMS.NATIVE_MAX_GAS);
    }
    if (plan.unlock) {
      entries.push({ entry: { kind: 'Unlock', height: plan.unlock.height, index: plan.unlock.index }, result: UNACCEPTED, dataBytes: UNLOCK_BYTES });
      dataBytes += UNLOCK_BYTES;
    }
    for (const r of plan.picked) {
      entries.push({ entry: { kind: 'Sponsored', opId: r.id }, result: UNACCEPTED, dataBytes: 1 + r.size });
      dataBytes += 1 + r.size;
      maxGasSum += r.op.maxGas;
    }
    // The parallel block is found at about the same time as the chain block, and not before the submission time of the operations it includes
    let latest = 0;
    for (const r of plan.picked) latest = Math.max(latest, r.submittedAt);
    for (const { r } of plan.forced) latest = Math.max(latest, r.submittedAt);
    const lo = Math.max(sp.time + 300, chain.time - 1500, latest + 50);
    const time = lo >= chain.time ? chain.time : lo + this.rng.int(0, chain.time - lo);
    const parents = [sp.hash, ...toMerge.map((b) => b.hash).sort()];
    const spStreak = this.streakOf.get(sp.hash) ?? 0;
    // Parallel empty blocks each take their weight from their own streak (D-090)
    const weight = entries.length ? 1 : emptyBlockWeight(spStreak);
    const nonce = BigInt.asUintN(64, BigInt('0x' + this.rng.hex(8))).toString();
    // The fork choice counts a block's own work (D-100): an empty parallel block next to a non-empty chain block would outweigh it and become the selected parent
    // instead, so the simulation leaves it out (the rival would have needed that many times the work); the nonce is drawn first so the random sequence stays the same
    if (weight > (chain.weight ?? 1)) return;
    const block: Block = {
      hash,
      header: {
        version: 2,
        height: chain.header.height,
        parents,
        btcAnchor: anchor,
        entriesRoot: entries.length ? phash('entries', hash) : '0'.repeat(64),
        stateRoot: entries.length ? phash('state', sp.header.stateRoot, hash) : sp.header.stateRoot,
        producer: plan.producer.id,
        timestamp: Math.floor(time / 1000),
        bits: chain.header.bits,
        nonce,
      },
      entries,
      time,
      dataBytes: dataBytes + headerBytes(parents.length),
      gasUsed: 0,
      maxGasSum,
      needsSettlement: entries.some((e) => e.entry.kind !== 'Forced'),
      weight,
      settlements: [],
      merged: toMerge.map((b) => b.hash),
      side: true,
    };
    this.sideBlocks.push(block);
    this.blockByHash.set(hash, block);
    this.daaOf.set(hash, (this.daaOf.get(sp.hash) ?? 0) + toMerge.reduce((s, b) => s + (b.weight ?? 1), 0) + weight);
    this.streakOf.set(hash, entries.length ? 0 : spStreak + 1);
    const level = this.sideByHeight.get(block.header.height) ?? [];
    level.push(block);
    this.sideByHeight.set(block.header.height, level);
    this.unmerged.push(block);
    this.settleIfDue(block, plan.producer.id);
  }

  /** A chain block merges a parallel block: its entries are executed in lenient mode, skipping those whose state conditions do not hold (D-063) */
  private acceptSide(side: Block, ctx: BlockCtx) {
    side.acceptedBy = ctx.hash;
    side.acceptedHeight = ctx.height;
    // Path B sponsored fees of a merged block are recorded at its own acceptance position and go to its producer (D-079)
    const sideCtx: BlockCtx = { hash: side.hash, height: ctx.height, producer: side.header.producer, anchor: ctx.anchor };
    side.entries.forEach((e, i) => {
      e.result = this.looseEntry(e, side, i, sideCtx);
      if (e.result.ok || e.result.reason !== 'skipped') side.gasUsed += e.result.gasUsed;
    });
  }

  private looseEntry(e: EntryRecord, side: Block, index: number, ctx: BlockCtx): ExecResult {
    const entry = e.entry;
    // An unlock entry of a merged block is always skipped: only a chain block's own unlock entry moves the cursor (D-100)
    if (entry.kind === 'Unlock') return skip(lazy((m) => m.sim.exec.mergedUnlock));
    const r = this.ops.get(entry.opId);
    if (!r) return skip(lazy((m) => m.sim.exec.unknownOp));
    const markSkipped = (reason: () => string) => {
      if (!r.blockHash) {
        r.skippedIn ??= [];
        r.skippedIn.push(withText({ block: side.hash, index, at: this.clock }, 'reason', reason));
        // Still in the entry pool, to be included again until its nonce is used
        r.requeued = true;
      }
      return skip(reason);
    };
    if (r.blockHash) {
      const where = r.blockHash === ctx.hash ? null : this.blockByHash.get(r.blockHash);
      return markSkipped(() => t().sim.exec.duplicate(where === null ? t().sim.exec.thisBlock : this.blockLabel(where)));
    }
    const acc = this.account(r.op.account);
    if (r.op.nonce !== acc.nonce) return markSkipped(lazy((m) => m.sim.exec.nonceConflict, String(acc.nonce), String(r.op.nonce)));
    if (r.op.fee.kind === 'Token') {
      if (this.balance(r.op.account, KSA_ASSET_ID) < r.op.fee.amount + this.ksaOut(r.op.action)) return markSkipped(lazy((m) => m.sim.exec.ksaShort));
    }
    const result = this.executeOp(r, ctx, 'loose');
    this.placeOp(r, side.hash, ctx.height, index, result);
    this.mempool = this.mempool.filter((x) => x !== r);
    this.nativePending = this.nativePending.filter((x) => x !== r);
    return result;
  }

  /** The producer picks entries from the highest revenue down, keeping each account's nonces consecutive (SPEC §4.3, §8.2) */
  private selectFastPath(producer: Producer, byteBudget: number, gasBudget: number): OpRecord[] {
    const byAccount = new Map<Hex, OpRecord[]>();
    for (const r of this.mempool) {
      const list = byAccount.get(r.op.account) ?? [];
      list.push(r);
      byAccount.set(r.op.account, list);
    }
    // Sponsored fee per byte: used only for local ordering; the protocol sets no exchange rate between KSA and sats (SPEC §8.2)
    const score = (r: OpRecord): number => (r.op.fee.kind === 'Token' ? Number(r.op.fee.amount) / r.size : 0);
    const picked: OpRecord[] = [];
    const spentKsa = new Map<Hex, bigint>();
    const nextNonce = new Map<Hex, number>();
    let bytes = 0;
    let gas = 0;
    for (;;) {
      let best: OpRecord | undefined;
      for (const [acct, list] of byAccount) {
        if (this.censored.has(acct)) continue;
        const want = nextNonce.get(acct) ?? this.account(acct).nonce;
        const cand = list.find((r) => r.op.nonce === want && !picked.includes(r));
        if (!cand) continue;
        if (cand.op.fee.kind === 'Token') {
          if (cand.op.fee.amount < producer.minTokenFee) continue;
          const already = spentKsa.get(acct) ?? 0n;
          if (this.balance(acct, KSA_ASSET_ID) - already < cand.op.fee.amount + this.ksaOut(cand.op.action)) continue;
        }
        const extra = 1 + cand.size;
        if (bytes + extra > byteBudget || gas + cand.op.maxGas > gasBudget) continue;
        if (!best || score(cand) > score(best)) best = cand;
      }
      if (!best) break;
      picked.push(best);
      bytes += 1 + best.size;
      gas += best.op.maxGas;
      nextNonce.set(best.op.account, best.op.nonce + 1);
      if (best.op.fee.kind === 'Token') {
        spentKsa.set(best.op.account, (spentKsa.get(best.op.account) ?? 0n) + best.op.fee.amount + this.ksaOut(best.op.action));
      }
      if (picked.length >= 60) break;
    }
    return picked;
  }

  // =====================================================================
  // Execution (an illustrative stand-in for the VM)
  // =====================================================================

  /**
   * Execute one operation. strict: a chain block's own entries; loose (lenient mode): entries of a merged block (the caller has
   * already done the state-only checks). In strict mode a path C op with a mismatched nonce is recorded as failed (a forced-inclusion
   * entry must appear in the block, D-018).
   */
  private executeOp(r: OpRecord, ctx: BlockCtx, mode: 'strict' | 'loose'): ExecResult {
    const op = r.op;
    const acc = this.account(op.account);

    if (r.path === 'C' && mode === 'strict' && op.nonce !== acc.nonce) {
      return failed('nonce_mismatch', 0, lazy((m) => m.sim.exec.nonceMismatch, String(acc.nonce), String(op.nonce)));
    }

    // Fee: path B deducts the sponsored fee into the producer's locked balance at this block's acceptance position (SPEC §8.1, §8.5, D-079)
    if (op.fee.kind === 'Token') {
      acc.balances.set(KSA_ASSET_ID, (acc.balances.get(KSA_ASSET_ID) ?? 0n) - op.fee.amount);
      const b = this.blockByHash.get(ctx.hash);
      const row = b ? this.lockRow(b, false) : this.pendingRow(ctx);
      row.fees += op.fee.amount;
      row.amount += op.fee.amount;
    }
    acc.nonce = op.nonce + 1;

    // Occasional failures: exceeding max_gas, contract traps (except the operator's bootstrap operations and the exchange contract demo).
    // A transfer uses ASSET_TRANSFER_GAS whatever it moves, so it runs out of gas only below that. The chance is drawn for it all the same,
    // and a transfer that succeeds takes the draw its gas used to take: a seeded chain stays as it was up to the first transfer this chance
    // used to fail, which now succeeds and draws once more
    const flaky = r.origin !== 'system' && !(op.action.kind === 'Call' && op.action.contract === this.exchangeContract);
    if (flaky && this.rng.chance(op.action.kind === 'Call' ? 0.015 : 0.004) && op.action.kind !== 'AssetTransfer') {
      return failed('out_of_gas', op.maxGas, lazy((m) => m.sim.exec.outOfGas, op.maxGas.toLocaleString('en-US')));
    }
    if (flaky && op.action.kind === 'Call' && this.rng.chance(0.006)) {
      return failed('trap', op.maxGas, lazy((m) => m.sim.exec.trap));
    }
    return this.applyAction(r, ctx);
  }

  /** A chain block's own entries execute before the block object exists: the locked record is created from the context first, and lockRow keeps using the same record once the block exists */
  private pendingRow(ctx: BlockCtx): LockRow {
    let row = this.rows.get(ctx.hash);
    if (!row) {
      row = { blockHash: ctx.hash, height: ctx.height, producer: ctx.producer, amount: 0n, unlocked: false, fees: 0n, reward: 0n };
      this.rows.set(ctx.hash, row);
    }
    return row;
  }

  private move(from: Hex, to: Hex, asset: Hex, amount: bigint): boolean {
    const a = this.account(from);
    const have = a.balances.get(asset) ?? 0n;
    if (have < amount) return false;
    a.balances.set(asset, have - amount);
    const b = this.account(to);
    b.balances.set(asset, (b.balances.get(asset) ?? 0n) + amount);
    return true;
  }

  private symbol(asset: Hex): string {
    return this.assets.get(asset)?.symbol ?? 'asset';
  }

  private applyAction(r: OpRecord, ctx: BlockCtx): ExecResult {
    const op = r.op;
    const act = op.action;
    const gasOf = (lo: number, hi: number) => Math.min(op.maxGas, Math.floor(op.maxGas * (lo + this.rng.next() * (hi - lo))));
    // A failed operation's gas_used is recorded as max_gas (the receipt in core/docs/RPC.md)
    const fail = (reason: ExecResult['reason'], text: () => string): ExecResult => failed(reason, op.maxGas, text);

    if (act.kind === 'AssetTransfer') {
      if (op.maxGas < PARAMS.ASSET_TRANSFER_GAS) return fail('out_of_gas', lazy((m) => m.sim.exec.outOfGas, op.maxGas.toLocaleString('en-US')));
      if (!this.assets.has(act.asset)) return fail('unknown_asset', lazy((m) => m.sim.exec.noAsset));
      if (!this.move(op.account, act.to, act.asset, act.amount)) return fail('insufficient_balance', lazy((m) => m.sim.exec.balanceShort, this.symbol(act.asset)));
      // The draw its gas used to take (see the chance of failure above)
      gasOf(0, 0);
      return {
        ok: true,
        gasUsed: PARAMS.ASSET_TRANSFER_GAS,
        events: [{ name: 'Transfer', fields: { asset: this.symbol(act.asset), from: op.account, to: act.to, amount: act.amount.toString() } }],
      };
    }

    if (act.kind === 'Deploy') {
      const id = phash('contract', op.account, op.nonce, act.codeHash);
      const pending = this.pendingContracts.get(id);
      const named = this.contractNames.get(id);
      const meta: ContractMeta = pending
        ? named
          ? withText({ id, deployer: op.account, deployedAt: ctx.height, ...pending }, 'name', named)
          : { id, deployer: op.account, deployedAt: ctx.height, ...pending }
        : {
            id,
            name: act.name,
            codeHash: act.codeHash,
            codeSize: act.codeSize,
            deployer: op.account,
            deployedAt: ctx.height,
            deployOp: r.id,
            methods: ['execute'],
            readMethods: ['state'],
          };
      this.contracts.set(id, meta);
      this.pendingContracts.delete(id);
      if (!this.labels.has(id)) {
        const name = act.name;
        this.setLabel(id, () => t().sim.label.contract(name));
      }
      const events: VmEvent[] = [{ name: 'Deployed', fields: { contract: id, code_hash: act.codeHash } }];
      if (id === this.tokenContract) {
        const supply = 10_000_000_000n;
        this.assets.set(this.tokenAsset, withText({ id: this.tokenAsset, symbol: 'TKN', decimals: 0, totalSupply: supply, issuer: id } as Omit<AssetMeta, 'name'>, 'name', lazy((m) => m.sim.name.tknAsset)));
        const deployer = this.account(op.account);
        deployer.balances.set(this.tokenAsset, supply);
        events.push({ name: 'AssetIssued', fields: { asset: 'TKN', amount: supply.toString() } });
      }
      if (id === this.triggerContract) {
        this.assets.set(this.passAsset, withText({ id: this.passAsset, symbol: 'PASS', decimals: 0, totalSupply: 0n, issuer: id } as Omit<AssetMeta, 'name'>, 'name', lazy((m) => m.sim.name.passAsset)));
      }
      return { ok: true, gasUsed: gasOf(0.4, 0.7), events };
    }

    // Call
    const c = this.contracts.get(act.contract);
    if (!c) return fail('no_contract', lazy((m) => m.sim.exec.noContract));

    // Attached funds (D-073): first moved item by item from the signing account to the contract; when the call fails the transfers are rolled back with it
    const moved: Funds[] = [];
    const rollback = () => {
      for (const f of moved) this.move(act.contract, op.account, f.asset, f.amount);
    };
    for (const f of act.funds ?? []) {
      if (!this.move(op.account, act.contract, f.asset, f.amount)) {
        rollback();
        return fail('insufficient_balance', () => t().sim.exec.fundsShort(this.symbol(f.asset)));
      }
      moved.push(f);
    }
    const result = this.callContract(r, ctx, act, fail, gasOf);
    if (!result.ok) rollback();
    return result;
  }

  private callContract(r: OpRecord, ctx: BlockCtx, act: CallAction, fail: (reason: ExecResult['reason'], text: () => string) => ExecResult, gasOf: (lo: number, hi: number) => number): ExecResult {
    const op = r.op;
    if (act.contract === this.ammContract) {
      const pool = act.contract;
      if (act.method === 'add_liquidity') {
        const ksa = BigInt(act.args.ksa ?? 0);
        const tkn = BigInt(act.args.tkn ?? 0);
        if (!this.move(op.account, pool, KSA_ASSET_ID, ksa) || !this.move(op.account, pool, this.tokenAsset, tkn)) {
          return fail('insufficient_balance', lazy((m) => m.sim.exec.liquidityShort));
        }
        return { ok: true, gasUsed: gasOf(0.5, 0.7), events: [{ name: 'LiquidityAdded', fields: { ksa: ksa.toString(), tkn: tkn.toString() } }] };
      }
      if (act.method === 'swap') {
        const inKsa = act.args.asset_in === 'KSA';
        const assetIn = inKsa ? KSA_ASSET_ID : this.tokenAsset;
        const assetOut = inKsa ? this.tokenAsset : KSA_ASSET_ID;
        const amountIn = BigInt(act.args.amount_in ?? 0);
        const minOut = BigInt(act.args.min_out ?? 0);
        const rIn = this.balance(pool, assetIn);
        const rOut = this.balance(pool, assetOut);
        const out = (rOut * amountIn * 997n) / (rIn * 1000n + amountIn * 997n);
        if (out < minOut) return fail('revert', lazy((m) => m.sim.exec.slippage, out.toString(), minOut.toString()));
        if (!this.move(op.account, pool, assetIn, amountIn)) return fail('insufficient_balance', lazy((m) => m.sim.exec.balanceShort, inKsa ? 'KSA' : 'TKN'));
        this.move(pool, op.account, assetOut, out);
        return {
          ok: true,
          gasUsed: gasOf(0.55, 0.78),
          events: [
            {
              name: 'Swap',
              fields: { trader: op.account, asset_in: inKsa ? 'KSA' : 'TKN', amount_in: amountIn.toString(), asset_out: inKsa ? 'TKN' : 'KSA', amount_out: out.toString() },
            },
          ],
        };
      }
    }

    if (act.contract === this.triggerContract && act.method === 'claim') {
      const h = Number(act.args.btc_height ?? 0);
      const depth = this.btcTip.height - h + 1;
      if (depth < PARAMS.BTC_QUERY_DEPTH) {
        return fail('btc_header_too_shallow', lazy((m) => m.sim.exec.headerShallow, PARAMS.BTC_QUERY_DEPTH, fmtInt(h), depth));
      }
      const pass = this.assets.get(this.passAsset);
      if (pass) pass.totalSupply = (pass.totalSupply ?? 0n) + 1n;
      const acc = this.account(op.account);
      acc.balances.set(this.passAsset, (acc.balances.get(this.passAsset) ?? 0n) + 1n);
      return {
        ok: true,
        gasUsed: gasOf(0.5, 0.7),
        events: [{ name: 'Claimed', fields: { payer: op.account, btc_height: String(h), issued: '1 PASS' } }],
      };
    }

    if (act.contract === this.tokenContract && act.method === 'approve') {
      return { ok: true, gasUsed: gasOf(0.4, 0.6), events: [{ name: 'Approval', fields: { owner: op.account, spender: String(act.args.spender ?? ''), amount: String(act.args.amount ?? '') } }] };
    }

    if (act.contract === this.exchangeContract) return this.exchangeCall(r, ctx, act, fail, gasOf);

    return { ok: true, gasUsed: gasOf(0.3, 0.6), events: [{ name: 'Called', fields: { method: act.method } }] };
  }

  /**
   * Exchange contract (a simplified version of the ksa-exchange example contract, D-085): deposit / withdraw manage the seller's
   * free balance in the contract; lock locks KSA for a beneficiary account and fixes the price, payment script and expiry height;
   * claim accepts only path C and credits KSA to the beneficiary account by the amount paid to the payment script and the price;
   * release returns the unsold KSA to the seller's free balance RELEASE_DELAY BTC blocks after expiry.
   */
  private exchangeCall(r: OpRecord, ctx: BlockCtx, act: CallAction, fail: (reason: ExecResult['reason'], text: () => string) => ExecResult, gasOf: (lo: number, hi: number) => number): ExecResult {
    const op = r.op;
    const args = act.args;
    const contract = act.contract;
    const avail = (who: Hex) => this.exchangeAvailable.get(who) ?? 0n;
    // The attached KSA has already been moved into the contract by the caller; credit it to the seller's free balance first (D-085). When the call fails the caller rolls it back together with the attached funds
    let fundsKsa = 0n;
    for (const f of act.funds ?? []) if (f.asset === KSA_ASSET_ID) fundsKsa += f.amount;
    this.exchangeAvailable.set(op.account, avail(op.account) + fundsKsa);
    const revert = (text: () => string): ExecResult => {
      this.exchangeAvailable.set(op.account, avail(op.account) - fundsKsa);
      return fail('revert', text);
    };

    if (act.method === 'deposit') {
      return { ok: true, gasUsed: gasOf(0.3, 0.5), events: [{ name: 'deposit', fields: { seller: op.account, amount: fundsKsa.toString() } }] };
    }
    if (act.method === 'withdraw') {
      const amount = BigInt(args.amount ?? 0);
      if (amount <= 0n || amount > avail(op.account)) return revert(() => t().sim.exec.exchangeShort);
      this.exchangeAvailable.set(op.account, avail(op.account) - amount);
      this.move(contract, op.account, KSA_ASSET_ID, amount);
      return { ok: true, gasUsed: gasOf(0.3, 0.5), events: [{ name: 'withdraw', fields: { seller: op.account, amount: amount.toString() } }] };
    }
    if (act.method === 'lock') {
      const ksa = BigInt(args.ksa ?? 0);
      const price = BigInt(args.price ?? 0);
      const script = String(args.script ?? '').toLowerCase();
      const beneficiary = String(args.beneficiary ?? '').toLowerCase();
      const expiry = Number(args.expiry ?? 0);
      const scriptOk = /^[0-9a-f]+$/.test(script) && script.length % 2 === 0 && script.length >= 2 && script.length <= 128 && !script.startsWith('6a');
      if (ksa <= 0n || price <= 0n || expiry <= ctx.anchor || !scriptOk || beneficiary.length !== 64) return revert(() => t().sim.exec.lockInvalid);
      if (this.lockScripts.has(script)) return revert(() => t().sim.exec.scriptUsed);
      if (avail(op.account) < ksa) return revert(() => t().sim.exec.exchangeShort);
      this.exchangeAvailable.set(op.account, avail(op.account) - ksa);
      this.lockScripts.add(script);
      const id = this.nextLockId++;
      const address = script.startsWith('5120') && script.length === 68 ? this.addressOf(script.slice(4)) : '';
      const lock: ExchangeLockView = { id, exchange: contract, seller: op.account, beneficiary, script, price, ksa, expiry, state: 'Open', ...(address ? { address } : {}) };
      this.locks.set(id.toString(), lock);
      return {
        ok: true,
        gasUsed: gasOf(0.5, 0.7),
        events: [{ name: 'lock', fields: { lock: id.toString(), seller: op.account, beneficiary, ksa: ksa.toString(), price: price.toString(), expiry: String(expiry) } }],
      };
    }
    if (act.method === 'claim') {
      const lock = this.locks.get(BigInt(args.lock ?? 0).toString());
      if (!lock) return revert(lazy((m) => m.sim.reject.lockMissing));
      const tx = r.path === 'C' && r.nativeTxid ? this.btcTxs.get(r.nativeTxid) : undefined;
      if (!tx) return revert(() => t().sim.exec.notNative);
      if (lock.state !== 'Open') return revert(lazy((m) => m.sim.exec.lockNotOpen));
      // Sum the outputs paid to the lock's payment script
      let paid = 0;
      for (const o of tx.outputs) if (o.role === 'payment' && o.address !== undefined && o.address === lock.address) paid += o.valueSat;
      if (paid <= 0) return revert(() => t().sim.exec.noPayment);
      const product = BigInt(paid) * lock.price;
      const ksaPaid = product < lock.ksa ? product : lock.ksa;
      this.move(contract, lock.beneficiary, KSA_ASSET_ID, ksaPaid);
      // The rest stays locked for the beneficiary; the lock closes once all of it has been bought (D-098)
      lock.ksa -= ksaPaid;
      lock.paidSats = (lock.paidSats ?? 0) + paid;
      lock.ksaPaid = (lock.ksaPaid ?? 0n) + ksaPaid;
      if (lock.ksa === 0n) lock.state = 'Claimed';
      this.emit('op', lazy((m) => m.sim.event.topUp, fmtInt(paid), fmtAmount(ksaPaid, KSA_DECIMALS)), r.id);
      return {
        ok: true,
        gasUsed: gasOf(0.5, 0.7),
        events: [{ name: 'claim', fields: { lock: lock.id.toString(), beneficiary: lock.beneficiary, paid_sats: String(paid), ksa_paid: ksaPaid.toString() } }],
      };
    }
    if (act.method === 'release') {
      const lock = this.locks.get(BigInt(args.lock ?? 0).toString());
      if (!lock) return revert(lazy((m) => m.sim.reject.lockMissing));
      if (lock.seller !== op.account) return revert(() => t().sim.exec.notSeller);
      if (lock.state !== 'Open') return revert(lazy((m) => m.sim.exec.lockNotOpen));
      if (ctx.anchor < lock.expiry + RELEASE_DELAY) return revert(() => t().sim.exec.notExpired(fmtInt(lock.expiry + RELEASE_DELAY)));
      this.exchangeAvailable.set(lock.seller, avail(lock.seller) + lock.ksa);
      lock.state = 'Released';
      return { ok: true, gasUsed: gasOf(0.3, 0.5), events: [{ name: 'release', fields: { lock: lock.id.toString(), ksa: lock.ksa.toString() } }] };
    }
    return revert(() => t().sim.exec.noMethod(act.method));
  }

  // =====================================================================
  // Settlement transactions (SPEC §7.2, §7.3, D-063, D-077, D-081)
  // =====================================================================

  /** Estimated size of a compact header (D-075, D-079): from 14 bytes for an empty block, plus 32 when the state root changes, plus 2 per extra parent */
  private compactHeaderBytes(b: Block): number {
    const sp = b.header.parents[0] ? this.blockByHash.get(b.header.parents[0]) : undefined;
    const sameRoot = !!sp && sp.header.stateRoot === b.header.stateRoot;
    return 14 + (sameRoot ? 0 : 32) + Math.max(0, b.header.parents.length - 1) * 2;
  }

  /** Size of the body (all entries in payload form) in bytes */
  private entryBytes(b: Block): number {
    return b.entries.reduce((s, e) => s + e.dataBytes, 0);
  }

  /** Whether a live (built or broadcast) reveal transaction carries this header in its payload */
  private headerInFlight(id: Hex): boolean {
    return (this.headerCarriers.get(id) ?? []).some((txid) => {
      const s = this.btcTxs.get(txid)?.status;
      return s === 'built' || s === 'broadcast';
    });
  }

  private bodyInFlight(id: Hex): boolean {
    return (this.bodyCarriers.get(id) ?? []).some((txid) => {
      const s = this.btcTxs.get(txid)?.status;
      return s === 'built' || s === 'broadcast';
    });
  }

  /**
   * The other headers and bodies the payload carries (the producer policy of D-063 and D-077): walk the blocks in the past starting
   * from the parents; a block that carries a settlement transaction is skipped and its past is not searched further (nor is the past
   * of blocks inside the settled closure: all data there has landed); collect the headers of blocks whose header has neither landed
   * nor is in another payload, and the headers and bodies of blocks whose body must land but has neither landed nor is in another
   * payload, ordered by height from low to high, at most MAX_SETTLEMENT_HEADERS − 1 headers (beyond that the earliest are dropped
   * and left to republishing). Along the way, determine whether the settlement of the most recent block in the past that carries a
   * settlement transaction is still in flight.
   */
  private collectCarry(of: Block): Carry {
    const picked: Block[] = [];
    let inFlight = false;
    const btcTipH = this.btcTip.height;
    const seen = new Set<Hex>();
    const queue: Hex[] = [...of.header.parents];
    while (queue.length) {
      const id = queue.shift() as Hex;
      if (seen.has(id)) continue;
      seen.add(id);
      const b = this.blockByHash.get(id);
      if (!b || b.header.height === 0) continue;
      if (b.settlementTxid) {
        // In flight: its settlement transaction is unconfirmed and its anchor is at most IN_FLIGHT_LAG blocks behind the BTC tip (D-077)
        const live = b.settlements.some((txid) => {
          const st = this.btcTxs.get(txid)?.status;
          return st === 'built' || st === 'broadcast';
        });
        if (live && !b.settlementOnBtc && btcTipH - b.header.btcAnchor.height <= IN_FLIGHT_LAG) inFlight = true;
        continue;
      }
      if (b.closureBtc !== undefined) continue;
      const bodyNeeded = b.needsSettlement && !b.settlementOnBtc && !this.bodyInFlight(b.hash);
      const headerNeeded = !b.headerOnBtc && !this.headerInFlight(b.hash);
      if (bodyNeeded || headerNeeded) picked.push(b);
      queue.push(...b.header.parents);
    }
    picked.sort((x, y) => x.header.height - y.header.height || (x.hash < y.hash ? -1 : 1));
    const kept = picked.slice(Math.max(0, picked.length - (PARAMS.MAX_SETTLEMENT_HEADERS - 1)));
    return {
      headers: kept.map((b) => b.hash),
      bodies: kept.filter((b) => b.needsSettlement && !b.settlementOnBtc && !this.bodyInFlight(b.hash)).map((b) => b.hash),
      inFlight,
    };
  }

  /**
   * Whether this block carries a settlement transaction (D-077 item 6): a body must land on BTC (this block's or a backlogged one) and
   * no settlement transaction is in flight; or the backlogged bodies or this block's own body exceed one eighth of the payload limit,
   * so it stops waiting. With insufficient funding it carries none (the body is carried by a later settlement).
   */
  private settleIfDue(block: Block, producer: Hex) {
    const carry = this.collectCarry(block);
    const own = block.needsSettlement ? this.entryBytes(block) : 0;
    const backlogBytes = carry.bodies.reduce((s, id) => s + this.entryBytes(this.blockByHash.get(id) as Block), 0);
    if (!block.needsSettlement && !carry.bodies.length) return;
    if (carry.inFlight && backlogBytes <= PAYLOAD_BODY_TRIGGER && own <= PAYLOAD_BODY_TRIGGER) return;
    // Payload budget: headers take at most half, bodies and this block's entries share the rest; when it does not fit, drop the earliest bodies (republishing picks them up later)
    const headersBytes = carry.headers.reduce((s, id) => s + this.compactHeaderBytes(this.blockByHash.get(id) as Block), 0) + this.compactHeaderBytes(block);
    const room = PARAMS.MAX_BLOCK_DATA_BYTES - Math.min(headersBytes, PARAMS.MAX_BLOCK_DATA_BYTES / 2) - own - 64;
    const bodies = [...carry.bodies];
    let bodyBytes = backlogBytes;
    while (bodies.length && bodyBytes > room) {
      const dropped = bodies.shift() as Hex;
      bodyBytes -= this.entryBytes(this.blockByHash.get(dropped) as Block);
    }
    const payloadBytes = 1 + headersBytes + own + 4 + bodies.length * 4 + bodyBytes;
    const pair = this.buildPair({
      kind: 'settlement',
      author: producer,
      forBlock: block,
      headers: [...carry.headers, block.hash],
      bodies: block.needsSettlement ? [...bodies, block.hash] : bodies,
      entryCount: block.entries.length + bodies.reduce((n, id) => n + (this.blockByHash.get(id) as Block).entries.length, 0),
      payloadBytes,
    });
    if (!pair) return;
    block.settlementTxid = pair.reveal.txid;
    const carried = bodies.length;
    if (carried) withText(pair.reveal, 'note', lazy((m) => m.sim.note.carriedBodies, carried));
  }

  /** A UTXO the producer can use for funding: confirmed, unspent and large enough to pay both transactions and leave non-dust change */
  private fundingUtxo(owner: Hex, need: number): Utxo | undefined {
    const free = this.freeUtxos(owner).filter((u) => u.valueSat >= need + DUST_SAT);
    // Use the smallest one that suffices, keeping the large ones
    return free[free.length - 1];
  }

  /**
   * The commit + reveal pair of a settlement / rescue / republish (D-081). Commit transaction: one P2TR funding input of the producer →
   * change + commitment output (amount = the reveal transaction's fee + 240 sats); reveal transaction: spends the commitment output
   * (script path, the witness holds the envelope with the payload) → P2A anchor (240 sats, anyone can CPFP) + an empty OP_RETURN.
   * Returns null when funding is insufficient.
   */
  private buildPair(spec: PairSpec): { commit: BtcTx; reveal: BtcTx } | null {
    const { commit: commitVb, reveal: revealVb } = envelopeVbytes(spec.payloadBytes);
    const feeRate = Math.max(PARAMS.MIN_SETTLEMENT_FEERATE, this.settlementFeeRate);
    const commitFee = Math.ceil(commitVb * feeRate);
    const revealFee = Math.ceil(revealVb * feeRate);
    const commitment = revealFee + P2A_VALUE_SAT;
    const utxo = this.fundingUtxo(spec.author, commitFee + commitment);
    if (!utxo) return null;
    const commitTxid = this.rng.hex(32);
    const revealTxid = this.rng.hex(32);
    utxo.spentBy = commitTxid;
    const forBlock = spec.forBlock ? { forBlock: spec.forBlock.hash, forHeight: spec.forBlock.header.height } : {};
    const commit: BtcTx = {
      txid: commitTxid,
      kind: 'commit',
      status: 'built',
      ...forBlock,
      headers: [],
      bodies: [],
      entryCount: 0,
      inputs: [{ prevout: utxo.outpoint, valueSat: utxo.valueSat, owner: spec.author, role: 'producer', scriptType: 'p2tr', sighash: 'DEFAULT' }],
      outputs: [
        { valueSat: utxo.valueSat - commitFee - commitment, role: 'change', owner: spec.author, address: this.addressOf(spec.author), scriptType: 'p2tr' },
        { valueSat: commitment, role: 'commitment', owner: spec.author, scriptType: 'p2tr' },
      ],
      vsize: commitVb,
      feeSat: commitFee,
      feeRate,
      payloadBytes: 0,
      revealTxid,
      createdAt: this.clock,
      author: spec.author,
    };
    const reveal: BtcTx = {
      txid: revealTxid,
      kind: spec.kind,
      status: 'built',
      ...forBlock,
      headers: spec.headers,
      bodies: spec.bodies,
      entryCount: spec.entryCount,
      inputs: [{ prevout: { txid: commitTxid, vout: 1 }, valueSat: commitment, owner: spec.author, role: 'commit', scriptType: 'envelope', sighash: 'DEFAULT' }],
      outputs: [
        { valueSat: P2A_VALUE_SAT, role: 'anchor', owner: null, scriptType: 'p2a' },
        { valueSat: 0, role: 'op_return', owner: null, scriptType: 'op_return' },
      ],
      vsize: revealVb,
      feeSat: revealFee,
      feeRate,
      payloadBytes: spec.payloadBytes,
      chunks: chunkCount(spec.payloadBytes),
      commitTxid,
      createdAt: this.clock,
      author: spec.author,
    };
    this.btcTxs.set(commitTxid, commit);
    this.btcTxs.set(revealTxid, reveal);
    if (spec.forBlock && spec.kind !== 'headers') spec.forBlock.settlements.push(revealTxid);
    this.noteCarried(reveal);
    return { commit, reveal };
  }

  /** Record the headers and bodies a payload carries; the first time a settlement payload carries the body of a block without its own settlement transaction, that block becomes its carrier (D-077) */
  private noteCarried(tx: BtcTx) {
    for (const id of tx.headers) {
      const list = this.headerCarriers.get(id) ?? [];
      list.push(tx.txid);
      this.headerCarriers.set(id, list);
    }
    for (const id of tx.bodies) {
      const list = this.bodyCarriers.get(id) ?? [];
      list.push(tx.txid);
      this.bodyCarriers.set(id, list);
      if (tx.kind === 'settlement' && tx.forBlock && id !== tx.forBlock) {
        const b = this.blockByHash.get(id);
        if (b && !b.carrier) {
          b.carrier = tx.forBlock;
          if (tx.forHeight !== undefined) b.carrierHeight = tx.forHeight;
        }
      }
    }
  }

  /** Reveal transactions (settlement, rescue, republish) whose payload carries this header, in build order */
  carriersOf(blockHash: Hex): BtcTx[] {
    return (this.headerCarriers.get(blockHash) ?? []).map((id) => this.btcTxs.get(id)).filter((t): t is BtcTx => !!t);
  }

  /** Broadcast once the chain block that merges (or is) the block has SETTLEMENT_DEPTH blocks after it (D-037, D-063): commit and reveal together */
  private broadcastDueSettlements() {
    const tipH = this.tip.header.height;
    for (let h = Math.max(1, this.settledHeight + 1); h <= tipH - PARAMS.SETTLEMENT_DEPTH; h++) {
      const c = this.blocks[h] as Block;
      for (const b of [c, ...this.mergedOf(c)]) this.broadcastFor(b);
    }
  }

  private broadcastFor(b: Block) {
    if (!b.settlementTxid) return;
    const pending = b.settlements.map((id) => this.btcTxs.get(id)).filter((t): t is BtcTx => !!t);
    if (pending.some((t) => t.status === 'broadcast' || t.status === 'confirmed')) return;
    const built = pending.find((t) => t.status === 'built');
    if (!built) return;
    // All data the payload carries has landed via other transactions: the settlement record closes and is no longer broadcast (D-077)
    if (this.carriedOnChain(built)) {
      this.replacePair(built, undefined, () => t().sim.note.carriedElsewhere);
      return;
    }
    // Offline producer: it cannot send its settlement transaction; after a while another producer rebuilds it with its own funding (same payload)
    if (this.producerOffline === built.author) {
      if (this.clock - b.time >= RESCUE_AFTER) this.rescue(b, built);
      return;
    }
    this.broadcastPair(built);
  }

  /** Whether all headers and bodies the reveal transaction carries have landed on BTC */
  private carriedOnChain(reveal: BtcTx): boolean {
    for (const id of reveal.bodies) if (!this.blockByHash.get(id)?.settlementOnBtc) return false;
    for (const id of reveal.headers) if (!this.blockByHash.get(id)?.headerOnBtc) return false;
    return true;
  }

  private broadcastPair(reveal: BtcTx) {
    const commit = reveal.commitTxid ? this.btcTxs.get(reveal.commitTxid) : undefined;
    for (const tx of [commit, reveal]) {
      if (!tx || tx.status !== 'built') continue;
      tx.status = 'broadcast';
      tx.broadcastAt = this.clock;
      this.btcMempool.push(tx);
    }
  }

  /** A settlement pair becomes void (rebuilt or no longer needed): mark it, drop it from the mempool and release its unconfirmed funding inputs */
  private replacePair(reveal: BtcTx, by: Hex | undefined, note: () => string) {
    const commit = reveal.commitTxid ? this.btcTxs.get(reveal.commitTxid) : undefined;
    for (const tx of [commit, reveal]) {
      if (!tx || tx.status === 'confirmed') continue;
      tx.status = 'replaced';
      if (by) tx.replacedBy = by;
      withText(tx, 'note', note);
      this.btcMempool = this.btcMempool.filter((m) => m !== tx);
      this.freeInputs(tx);
    }
  }

  /** After an unconfirmed transaction is voided, the UTXOs it spent become available again */
  private freeInputs(tx: BtcTx) {
    for (const i of tx.inputs) {
      const u = i.owner ? this.findUtxo(i.owner, i.prevout) : undefined;
      if (u && u.spentBy === tx.txid) delete u.spentBy;
    }
  }

  /** Rebuild: another producer builds a commit / reveal pair with the same payload from its own funding (kind rescue) and broadcasts it immediately (D-045, D-077, D-081) */
  private rescue(block: Block, broken: BtcTx) {
    const rescuer = this.pickOnlineProducer(block.header.producer);
    if (!rescuer) return;
    const pair = this.buildPair({
      kind: 'rescue',
      author: rescuer.id,
      forBlock: block,
      headers: broken.headers,
      bodies: broken.bodies,
      entryCount: broken.entryCount,
      payloadBytes: broken.payloadBytes,
    });
    if (!pair) return;
    this.replacePair(broken, pair.reveal.txid, lazy((m) => m.sim.note.rebuiltOffline));
    this.broadcastPair(pair.reveal);
    this.emit('alert', () => t().sim.event.rescue(this.blockLabel(block)), pair.reveal.txid);
  }

  /** An online producer that still has funding (excluding except) */
  private pickOnlineProducer(except?: Hex): Producer | undefined {
    const online = this.producers.filter((p) => p.id !== this.producerOffline && p.id !== except && this.freeUtxos(p.id).length > 0);
    return online.length ? this.rng.pick(online) : undefined;
  }

  /**
   * Header republishing (D-047, D-077): take f, the first block in main-chain order whose data has not landed and that carries no
   * settlement transaction; when no settlement payload can ever carry it any more (MAX_SETTLEMENT_HEADERS − 1 blocks already follow
   * it), or its anchor is more than 4 × SETTLEMENT_TIMEOUT blocks behind the BTC tip, republish the headers from f on that have
   * reached depth SETTLEMENT_DEPTH, together with the bodies of the blocks that need one.
   */
  private maybeBackfillHeaders() {
    const upto = this.tip.header.height - PARAMS.SETTLEMENT_DEPTH;
    let first: Block | undefined;
    const missing: Block[] = [];
    let carrierAfter = false;
    for (let h = this.settledHeight + 1; h <= upto; h++) {
      const c = this.blocks[h] as Block;
      for (const b of [c, ...this.mergedOf(c)]) {
        if (b.settlementTxid) {
          if (first) carrierAfter = true;
          continue;
        }
        if (this.dataBtc(b) !== undefined || this.headerInFlight(b.hash)) continue;
        first ??= b;
        if (missing.length < PARAMS.MAX_SETTLEMENT_HEADERS) missing.push(b);
      }
    }
    if (!first) return;
    const after = this.tip.header.height - first.header.height;
    const lagging = this.btcTip.height - first.header.btcAnchor.height > 4 * PARAMS.SETTLEMENT_TIMEOUT;
    if (carrierAfter && after < PARAMS.MAX_SETTLEMENT_HEADERS - 1) return;
    if (!carrierAfter && after < PARAMS.MAX_SETTLEMENT_HEADERS - 1 && !lagging) return;
    const author = this.pickOnlineProducer();
    if (!author) return;
    const headers = missing.map((b) => b.hash);
    const bodies = missing.filter((b) => b.needsSettlement && !b.settlementOnBtc && !this.bodyInFlight(b.hash));
    const payloadBytes = 1 + missing.reduce((s, b) => s + this.compactHeaderBytes(b), 0) + 4 + bodies.reduce((s, b) => s + 4 + this.entryBytes(b), 0);
    const pair = this.buildPair({ kind: 'headers', author: author.id, headers, bodies: bodies.map((b) => b.hash), entryCount: 0, payloadBytes });
    if (!pair) return;
    if (bodies.length) withText(pair.reveal, 'note', lazy((m) => m.sim.note.carriedBodies, bodies.length));
    this.broadcastPair(pair.reveal);
    this.emit('alert', lazy((m) => m.sim.event.headers, headers.length), pair.reveal.txid);
  }

  // =====================================================================
  // BTC block production (regtest)
  // =====================================================================

  /** A reveal transaction's package: the unconfirmed commit transaction, the reveal transaction itself and the CPFP child hanging off the P2A anchor */
  private packageOf(reveal: BtcTx): BtcTx[] {
    const out: BtcTx[] = [];
    const commit = reveal.commitTxid ? this.btcTxs.get(reveal.commitTxid) : undefined;
    if (commit && commit.status !== 'confirmed') out.push(commit);
    out.push(reveal);
    const child = this.btcMempool.find((c) => c.kind === 'cpfp' && c.parent === reveal.txid);
    if (child) out.push(child);
    return out;
  }

  private isReveal(tx: BtcTx): boolean {
    return tx.kind === 'settlement' || tx.kind === 'rescue' || tx.kind === 'headers';
  }

  /** Fee rate computed per package: the commit / reveal pair enters a block together (D-081), and a CPFP child speeds up both */
  private effectiveFeeRate(tx: BtcTx): number {
    let pkg: BtcTx[];
    if (this.isReveal(tx)) pkg = this.packageOf(tx);
    else if (tx.kind === 'commit') {
      const reveal = tx.revealTxid ? this.btcTxs.get(tx.revealTxid) : undefined;
      pkg = reveal && reveal.status === 'broadcast' ? this.packageOf(reveal) : [tx];
    } else {
      const child = this.btcMempool.find((c) => c.kind === 'cpfp' && c.parent === tx.txid);
      pkg = child ? [tx, child] : [tx];
    }
    // Every transaction the simulator builds knows its input amounts and fee
    const fee = pkg.reduce((s, x) => s + (x.feeSat ?? 0), 0);
    const vsize = pkg.reduce((s, x) => s + x.vsize, 0);
    return vsize ? fee / vsize : 0;
  }

  /** Whether the transaction can enter the next BTC block (below the inclusion floor it stays stuck in the mempool) */
  canConfirm(tx: BtcTx): boolean {
    if (tx.kind === 'cpfp') {
      const parent = tx.parent ? this.btcTxs.get(tx.parent) : undefined;
      return !!parent && (parent.status === 'confirmed' || this.effectiveFeeRate(parent) >= this.btcMinFeeRate);
    }
    return this.effectiveFeeRate(tx) >= this.btcMinFeeRate;
  }

  private mineBtcBlock() {
    const height = this.btcTip.height + 1;
    const included = this.btcMempool.filter((tx) => this.canConfirm(tx));
    // Order within the block: a commit transaction before its reveal, a CPFP child after its parent, the rest slightly randomized
    const rank = (tx: BtcTx) => (tx.kind === 'commit' ? 0 : tx.kind === 'cpfp' ? 2 : 1);
    const jitter = new Map(included.map((tx) => [tx.txid, this.rng.next()] as const));
    included.sort((a, b) => rank(a) - rank(b) || (jitter.get(a.txid) ?? 0) - (jitter.get(b.txid) ?? 0));
    const block: BtcBlock = { height, hash: this.btcHash(), time: this.clock, txids: included.map((t) => t.txid) };
    this.btcBlocks.push(block);
    this.btcMempool = this.btcMempool.filter((t) => !included.includes(t));

    for (const tx of included) {
      tx.status = 'confirmed';
      tx.confirmedHeight = height;
      tx.confirmedAt = this.clock;
      this.onConfirmed(tx, height);
    }

    const prevSettled = this.settledHeight;
    const prevFinal = this.finalHeight;
    this.advanceSettled();
    this.advanceFinal();
    if (this.settledHeight > prevSettled) this.emit('settled', lazy((m) => m.sim.event.settledTo, fmtInt(this.settledHeight)), String(this.settledHeight));
    if (this.finalHeight > prevFinal) this.emit('final', lazy((m) => m.sim.event.finalTo, fmtInt(this.finalHeight)), String(this.finalHeight));
    this.emit('btc_block', lazy((m) => m.sim.event.btcBlock, fmtInt(height), included.length), String(height));

    // The indexer only reads BTC and catches up a little later
    this.timers.push({ at: this.clock + 1500, fn: () => this.runIndexer(height) });

    // The market fee rate takes a random walk (held high during a fee-rate spike)
    if (!this.feeSpike) {
      const drift = this.rng.next();
      if (drift < 0.2) this.feeRate = Math.max(1, this.feeRate - 1);
      else if (drift > 0.8) this.feeRate = Math.min(6, this.feeRate + 1);
    }

    this.broadcastDueSettlements();
    // Native transactions confirmed or blocks became unlockable: the empty-block template is discarded and a block is produced at the normal interval
    this.wakeProducer();
  }

  private onConfirmed(tx: BtcTx, height: number) {
    const addUtxo = (owner: Hex | null, txid: Hex, vout: number, valueSat: number) => {
      const a = owner ? this.actors.get(owner) : undefined;
      if (!a || valueSat <= 0) return;
      a.utxos.push({ outpoint: { txid, vout }, valueSat, scriptType: 'p2tr', confirmedHeight: height });
      // When the list grows too long, drop the UTXOs spent by confirmed transactions (the inputs of unconfirmed ones must still be recoverable if those are voided)
      if (a.utxos.length > 80) a.utxos = a.utxos.filter((u) => !u.spentBy || this.btcTxs.get(u.spentBy)?.status !== 'confirmed');
    };

    for (const i of tx.inputs) {
      const u = i.owner ? this.findUtxo(i.owner, i.prevout) : undefined;
      if (u) u.spentBy = tx.txid;
    }
    tx.outputs.forEach((o, idx) => {
      if ((o.role === 'change' || o.role === 'payment') && o.scriptType === 'p2tr') addUtxo(o.owner, tx.txid, idx, o.valueSat);
    });

    if (this.isReveal(tx)) {
      // Bodies carried by the payload land on BTC (D-077): the first confirmation wins, and the other versions of the same block's own settlement become void (§7.3)
      for (const id of tx.bodies) {
        const b = this.blockByHash.get(id);
        if (!b || b.settlementOnBtc) continue;
        b.settlementOnBtc = { txid: tx.txid, btcHeight: height };
        for (const other of b.settlements) {
          const o = this.btcTxs.get(other);
          if (o && o !== tx && (o.status === 'broadcast' || o.status === 'built')) this.replacePair(o, tx.txid, () => t().sim.note.carriedElsewhere);
        }
      }
      for (const id of tx.headers) {
        const b = this.blockByHash.get(id);
        if (b && !b.headerOnBtc) b.headerOnBtc = { txid: tx.txid, btcHeight: height };
      }
    }
  }

  /** Data landing height data(b) (D-038, D-077): the body for blocks whose body must land, the header for the rest */
  private dataBtc(b: Block): number | undefined {
    return b.needsSettlement ? b.settlementOnBtc?.btcHeight : b.headerOnBtc?.btcHeight;
  }

  /** Settled closure (D-063): closure(b) = max(data(b), closure(parents)) */
  closureOf(b: Block): number | undefined {
    if (b.closureBtc !== undefined) return b.closureBtc;
    const data = this.dataBtc(b);
    if (data === undefined) return undefined;
    let out = data;
    for (const id of b.header.parents) {
      const p = this.blockByHash.get(id);
      const c = p ? this.closureOf(p) : undefined;
      if (c === undefined) return undefined;
      out = Math.max(out, c);
    }
    b.closureBtc = out;
    return out;
  }

  private advanceSettled() {
    let h = this.settledHeight;
    while (h + 1 < this.blocks.length) {
      const c = this.blocks[h + 1] as Block;
      if (this.closureOf(c) === undefined) break;
      h++;
    }
    this.settledHeight = h;
  }

  /**
   * The chain block's settled closure has BTC_FINAL_DATA_CONFS confirmations: determined final at its BTC_FINALITY_CONFS-th, reported once
   * the BTC block of that determination has BTC_FINALITY_CONFS confirmations too (D-038, D-082, D-114: prefix(b) + 2 × CONFS − 2 ≤ BTC tip)
   */
  private advanceFinal() {
    const limit = this.btcTip.height - BTC_FINAL_DATA_CONFS + 1;
    let h = this.finalHeight;
    while (h + 1 <= this.settledHeight) {
      const c = this.blocks[h + 1] as Block;
      if ((c.closureBtc ?? Infinity) > limit) break;
      h++;
    }
    this.finalHeight = h;
  }

  /** Indexer: only chain blocks inside the settled closure with SETTLEMENT_DEPTH confirmations on its main chain are executed and verified (D-063, D-082) */
  private runIndexer(btcHeight: number) {
    let headerTip = this.indexerHeight;
    for (let h = this.blocks.length - 1; h > headerTip; h--) {
      if ((this.blocks[h] as Block).headerOnBtc) {
        headerTip = h;
        break;
      }
    }
    const upto = Math.min(this.settledHeight, headerTip - PARAMS.SETTLEMENT_DEPTH);
    for (let h = this.indexerHeight + 1; h <= upto; h++) {
      const b = this.blocks[h] as Block;
      const check = { height: h, hash: b.hash, nodeRoot: b.header.stateRoot, indexerRoot: b.header.stateRoot, at: this.clock };
      this.indexerChecks.push(check);
      tallyCheck(this.indexerTally, check);
    }
    if (this.indexerChecks.length > 400) this.indexerChecks.splice(0, this.indexerChecks.length - 400);
    this.indexerHeight = Math.max(this.indexerHeight, upto);
    this.indexerBtcHeight = btcHeight;
  }

  // =====================================================================
  // Scenarios and regtest controls
  // =====================================================================

  /** regtest: mine n BTC blocks immediately */
  mineBtc(n: number) {
    this.syncLive();
    for (let i = 0; i < n; i++) {
      this.clock += 10;
      this.mineBtcBlock();
    }
    this.nextBtcAt = this.clock + this.btcGap();
    this.emit('scenario', lazy((m) => m.sim.event.mined, n));
    this.bump();
  }

  /** Faucet: sends 5,000 KSA on the fast lane (path B, about 5 seconds) and a 0.1 BTC UTXO on BTC (waits for the next BTC block) */
  faucet(to: Hex): { opId?: Hex; txid: Hex } {
    this.syncLive();
    const draft: OpDraft = {
      account: this.faucetId,
      path: 'B',
      maxGas: 50_000,
      tokenFee: this.estimateFee().pathB.amount,
      action: { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to, amount: 5_000n * KSA_UNIT },
      origin: 'faucet',
    };
    const res = this.submitAt(this.clock, draft);
    // During a fee-rate spike the faucet pays the market fee rate so the demo does not get stuck
    const rate = this.feeSpike ? this.feeRate : 1.3;
    const payment: TxOut = { valueSat: 10_000_000, role: 'payment', owner: to, address: this.addressOf(to), scriptType: 'p2tr' };
    const tx = this.buildUserTx(this.faucetId, 'faucet', [payment], rate);
    this.emit('scenario', lazy((m) => m.sim.event.faucet));
    this.bump();
    const txid = tx?.txid ?? '';
    return res.ok ? { opId: res.opId, txid } : { txid };
  }

  setCensored(account: Hex, on: boolean) {
    this.syncLive();
    if (on) this.censored.add(account);
    else this.censored.delete(account);
    this.emit('scenario', on ? lazy((m) => m.sim.event.censorOn) : lazy((m) => m.sim.event.censorOff));
    if (!on) this.wakeProducer();
    this.bump();
  }

  /** BTC fee-rate spike: the market fee rate and the inclusion floor both rise above 40; settlements funded at the node's configured fee rate (2 sat/vB) get stuck in the mempool */
  setFeeSpike(on: boolean) {
    this.syncLive();
    this.feeSpike = on;
    this.btcMinFeeRate = on ? 40 : 1;
    this.feeRate = on ? 45 : 3;
    this.emit('scenario', on ? lazy((m) => m.sim.event.feeSpikeOn) : lazy((m) => m.sim.event.feeSpikeOff));
    this.bump();
  }

  /** Anyone can CPFP via the reveal transaction's P2A anchor (SPEC §7.2, D-081). Attaches a child transaction to every stuck settlement in the mempool */
  cpfpStuck(payer: Hex): number {
    this.syncLive();
    let count = 0;
    for (const tx of [...this.btcMempool]) {
      if (!this.isReveal(tx) || tx.status !== 'broadcast') continue;
      if (this.effectiveFeeRate(tx) >= this.btcMinFeeRate) continue;
      if (this.cpfp(tx, payer)) count++;
    }
    if (count) this.emit('scenario', lazy((m) => m.sim.event.cpfpMany, count));
    this.bump();
    return count;
  }

  /** Attach a child transaction to one stuck transaction: for a reveal transaction it spends the P2A anchor (speeding up the commit transaction as well), for other transactions (such as a path C native transaction) it spends the change */
  cpfpTx(txid: Hex, payer: Hex): boolean {
    this.syncLive();
    const tx = this.btcTxs.get(txid);
    if (!tx || tx.status !== 'broadcast' || this.effectiveFeeRate(tx) >= this.btcMinFeeRate) return false;
    const ok = this.cpfp(tx, payer);
    if (ok) {
      this.emit('scenario', lazy((m) => m.sim.event.cpfpOne), tx.txid);
      this.bump();
    }
    return ok;
  }

  private cpfp(tx: BtcTx, payer: Hex): boolean {
    const anchorIdx = tx.outputs.findIndex((o) => o.role === 'anchor');
    const changeIdx = tx.outputs.findIndex((o) => o.role === 'change' && o.owner === payer);
    const spendIdx = anchorIdx >= 0 ? anchorIdx : changeIdx;
    if (spendIdx < 0) return false;
    const spent = tx.outputs[spendIdx] as TxOut;
    const childVsize = 120;
    const target = this.btcMinFeeRate + 2;
    // The child must lift the fee rate of the whole package (unconfirmed commit + reveal + child) above the floor
    const pkg = this.isReveal(tx) ? this.packageOf(tx).filter((x) => x.kind !== 'cpfp') : [tx];
    const pkgFee = pkg.reduce((s, x) => s + (x.feeSat ?? 0), 0);
    const pkgVsize = pkg.reduce((s, x) => s + x.vsize, 0);
    const fee = Math.ceil(target * (pkgVsize + childVsize) - pkgFee);
    const funding = this.fundingUtxo(payer, fee);
    const value = funding?.valueSat ?? fee + 20_000;
    const prevout = funding?.outpoint ?? { txid: this.rng.hex(32), vout: 0 };
    const child: BtcTx = {
      txid: this.rng.hex(32),
      kind: 'cpfp',
      status: 'broadcast',
      parent: tx.txid,
      headers: [],
      bodies: [],
      entryCount: 0,
      inputs: [
        {
          prevout: { txid: tx.txid, vout: spendIdx },
          valueSat: spent.valueSat,
          owner: spent.owner,
          role: anchorIdx >= 0 ? 'anchor' : 'payer',
          scriptType: anchorIdx >= 0 ? 'p2a' : 'p2tr',
          sighash: 'DEFAULT',
        },
        { prevout, valueSat: value, owner: payer, role: 'payer', scriptType: 'p2tr', sighash: 'DEFAULT' },
      ],
      outputs: [{ valueSat: value + spent.valueSat - fee, role: 'change', owner: payer, address: this.addressOf(payer), scriptType: 'p2tr' }],
      vsize: childVsize,
      feeSat: fee,
      feeRate: fee / childVsize,
      payloadBytes: 0,
      createdAt: this.clock,
      broadcastAt: this.clock,
      author: payer,
    };
    if (funding) funding.spentBy = child.txid;
    this.btcTxs.set(child.txid, child);
    this.btcMempool.push(child);
    return true;
  }

  setProducerOffline(id: Hex | null) {
    this.syncLive();
    this.producerOffline = id;
    this.emit('scenario', id ? () => t().sim.event.offline(this.labels.get(id) ?? t().status.producer) : lazy((m) => m.sim.event.online));
    this.bump();
  }

  /** Broadcast settlement and republish transactions awaiting BTC confirmation (reveal transactions; the commit sits in the mempool with it) */
  get pendingSettlements(): BtcTx[] {
    return this.btcMempool.filter((t) => this.isReveal(t));
  }

  allBtcTxs(): IterableIterator<BtcTx> {
    return this.btcTxs.values();
  }

  /** Producer info (name, minimum sponsored fee) */
  producerInfo(id: Hex): Producer | undefined {
    return this.producerOf(id);
  }
}

/** Whether the entry was executed (skipped and not-yet-accepted entries change no state) */
function executed(e: EntryRecord): boolean {
  return e.result.reason !== 'skipped' && e.result.reason !== 'unaccepted';
}

/** Minimum sats needed to buy all of a lock's KSA: ⌈ksa / price⌉ (same as the SDK's quoteTopUp) */
export function satsForAll(lock: ExchangeLockView): number {
  return Number((lock.ksa + lock.price - 1n) / lock.price);
}

export function outKey(o: OutPoint): string {
  return `${o.txid}:${o.vout}`;
}

export function bigintJson(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
