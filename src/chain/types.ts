/**
 * The on-chain data model as seen by the explorer and the wallet.
 * The structure follows SPEC v2 §4.1, §6.1, §7.1 and the implementation on main (block header v2 and the block DAG: D-063;
 * settlement batching and block bodies: D-077; path A deleted: D-078; settlement as commit / reveal transactions with the payload
 * in the reveal transaction's witness envelope: D-081; account = Taproot address: D-092; RPC: core/docs/RPC.md).
 * Amounts (u128) use bigint; heights, gas and sats use number.
 */

import type { Native } from './assetNames';

export type Hex = string;

/** Submission path: B sponsored (pays in KSA, via the node RPC), C native transaction (pays in BTC, forced inclusion). Path A is deleted (D-078) */
export type Path = 'B' | 'C';

export interface OutPoint {
  txid: Hex;
  vout: number;
}

export interface BtcAnchor {
  height: number;
  hash: Hex;
}

export type FeeMode = { kind: 'Token'; amount: bigint } | { kind: 'BtcNative' };

export type CallArgs = Record<string, string | number | bigint>;

/** Funds attached to a call or deployment (D-073) */
export interface Funds {
  asset: Hex;
  amount: bigint;
}

export type Action =
  /** `contract`: the contract it creates, sha256(deployer ‖ nonce (u64 little-endian) ‖ code_hash) (SPEC §9.2, D-015); the node data source works it out */
  | { kind: 'Deploy'; codeHash: Hex; codeSize: number; initArgsSize: number; name: string; contract?: Hex; funds?: Funds[] }
  | { kind: 'Call'; contract: Hex; method: string; args: CallArgs; funds?: Funds[] }
  | { kind: 'AssetTransfer'; asset: Hex; to: Hex; amount: bigint };

export type SigScheme = { kind: 'Bip340'; sig: Hex } | { kind: 'Bip322Simple'; sig: Hex };

export interface VmOp {
  version: number;
  chainId: number;
  /** Account: the 32 bytes of the Taproot output key (D-092), lower-case hex; the address form is given by addressOf */
  account: Hex;
  nonce: number;
  fee: FeeMode;
  maxGas: number;
  action: Action;
  sig: SigScheme;
}

export type FailReason =
  | 'out_of_gas'
  | 'trap'
  | 'revert'
  /** A transfer short of balance: the op's own, its attached funds or one a contract made (the node's `insufficient balance`) */
  | 'insufficient_balance'
  /** The asset a transfer names does not exist */
  | 'unknown_asset'
  /** The contract called does not exist */
  | 'no_contract'
  /** The code deployed failed the static checks at deployment */
  | 'deploy_rejected'
  /** Path C: max_gas above NATIVE_MAX_GAS; only the nonce is used (§7.4) */
  | 'native_gas'
  /** Path C: version, chain ID, encoded size, fee mode or signature wrong; nothing changes, the nonce included (§7.4, D-086) */
  | 'not_authenticated'
  | 'nonce_mismatch'
  | 'btc_header_too_shallow'
  /** Entries of a merged parallel block execute in lenient mode and are skipped when the state does not allow them: not executed, no fee charged (D-063) */
  | 'skipped'
  /** The parallel block has not been accepted by the main chain yet; the entry has not executed */
  | 'unaccepted';

export interface VmEvent {
  name: string;
  fields: Record<string, string>;
  /** On a node, the bytes the contract emitted, in hex: a standard's event is read from them (D-123) */
  raw?: Hex;
}

export interface ExecResult {
  ok: boolean;
  gasUsed: number;
  reason?: FailReason;
  message?: string;
  events: VmEvent[];
  /**
   * The changes the op made to built-in assets, in the order it made them, from a node's receipt (D-122; empty on failure); null when
   * the node did not record them (a node before them, or a receipt it stored before), undefined in the simulator
   */
  changes?: AssetChange[] | null;
}

/** A change an op made to a built-in asset (D-122), as the SDK reads it with its IDs in hex; `events`: how many of the op's events came before it */
export type AssetChange =
  | { kind: 'transfer' | 'funds' | 'payout'; asset: Hex; from: Hex; to: Hex; amount: bigint; events: number }
  | { kind: 'issue'; asset: Hex; to: Hex; amount: bigint; events: number }
  | { kind: 'burn'; asset: Hex; from: Hex; amount: bigint; events: number }
  | { kind: 'create' | 'renounce'; asset: Hex; capabilities: string[]; events: number }
  | { kind: 'freeze'; asset: Hex; account: Hex; frozen: boolean; events: number }
  | { kind: 'allow'; asset: Hex; account: Hex; allowed: boolean; events: number }
  | { kind: 'pause'; asset: Hex; paused: boolean; events: number };

export type EntryKind = 'Forced' | 'Sponsored' | 'Unlock';

export type Entry =
  | { kind: 'Forced'; btcTxid: Hex; opId: Hex }
  | { kind: 'Sponsored'; opId: Hex }
  /**
   * Unlock (D-074, D-079): turns the sponsored fees and block rewards accumulated up to the acceptance position (height, index) into
   * available balance. The unlocked blocks and amount are derived from local data and are empty when the node RPC data source has
   * not fetched those blocks
   */
  | { kind: 'Unlock'; height: number; index: number; blocks?: Hex[]; amount?: bigint };

export interface EntryRecord {
  entry: Entry;
  /** Receipt. Unlock also has an execution result but consumes no gas; for skipped and not-yet-accepted entries see FailReason */
  result: ExecResult;
  /** Amount of data written into the settlement payload (Forced writes only btc_txid) */
  dataBytes: number;
}

/** Block header v2 (D-063): `parent` becomes `parents`, `height` is the selected-chain depth */
export interface BlockHeader {
  version: number;
  height: number;
  /** The first is the selected parent, the rest in ascending byte order; empty for the genesis block */
  parents: Hex[];
  btcAnchor: BtcAnchor;
  entriesRoot: Hex;
  stateRoot: Hex;
  producer: Hex;
  /** Seconds */
  timestamp: number;
  bits: number;
  nonce: string;
}

/** Record of the data landing on BTC: which transaction, and at which BTC height it confirmed */
export interface OnBtc {
  txid: Hex;
  btcHeight: number;
}

export interface Block {
  hash: Hex;
  header: BlockHeader;
  entries: EntryRecord[];
  /** Local time of receipt (block production), in milliseconds */
  time: number;
  /** Bytes of block data written into the settlement payload (header + entries) */
  dataBytes: number;
  gasUsed: number;
  maxGasSum: number;
  /**
   * The body must go on-chain (D-077): a block with entries other than forced inclusions. Its entries are carried on-chain by the
   * block's own settlement transaction, or by the settlement / republish payload of a later block; for empty blocks and blocks
   * with only forced-inclusion entries only the header must go on-chain
   */
  needsSettlement: boolean;
  /** Weight of an empty block (D-084, D-090): 12 → 24 → ... → 120 by the empty-block streak on the selected chain; 1 for a block with entries */
  weight?: number;
  /** The block's own settlement transaction (the reveal transaction's ID; the first one built. D-077: while a settlement is in flight the body is backlogged first and this block carries none) */
  settlementTxid?: Hex;
  /** All of the block's settlement transactions (reveal transaction IDs), including replaced, invalid and rescue ones */
  settlements: Hex[];
  /** When this block carries no settlement transaction: the block whose settlement payload carried this block's body (the carrier of D-077) */
  carrier?: Hex;
  /** That block's height, which the node gives with its hash: the page names the carrier by it also where it has not loaded that block */
  carrierHeight?: number;
  /** The transaction and BTC height at which the header first landed on-chain */
  headerOnBtc?: OnBtc;
  /** The transaction and BTC height at which the body landed on-chain (the block's own settlement, or the carrier's settlement / republish transaction) */
  settlementOnBtc?: OnBtc;
  /**
   * Settled closure (D-063): the BTC height at which the data of this block and of its whole past is on BTC,
   * i.e. max(data(b), the closure heights of the parents). Empty when undefined.
   */
  closureBtc?: number;
  /** The parallel blocks it merges (the merge set without the selected parent, in consensus order) */
  merged: Hex[];
  /** Parallel block: not on the main chain, merged by a later chain block */
  side?: boolean;
  /** The chain block that accepts it (a chain block is its own; empty for a parallel block not yet accepted) */
  acceptedBy?: Hex;
  acceptedHeight?: number;
}

/**
 * BTC transaction kinds: settlement is the settlement's reveal transaction (payload in the witness, D-081), commit is the commit
 * transaction it spends; rescue is a rescue / rebuilt reveal transaction; headers is a header and body republish (also a reveal
 * transaction); native is a path C native transaction; faucet and cpfp are the simulator's test transactions
 */
export type BtcTxKind = 'settlement' | 'commit' | 'rescue' | 'headers' | 'native' | 'faucet' | 'cpfp';

export type BtcTxStatus = 'built' | 'broadcast' | 'confirmed' | 'replaced' | 'invalid';

export interface TxIn {
  prevout: OutPoint;
  /** Value of the spent output. The transaction itself does not carry this number; empty when the node RPC data source does not know it */
  valueSat?: number;
  owner: Hex | null;
  /** Address of the spent output, where the page has read the transaction it belongs to */
  address?: string;
  /** producer: the producer's funding; commit: the reveal transaction spending the commit transaction's commitment output (script path, the envelope is in the witness); payer: the user's payment; anchor: P2A */
  role: 'producer' | 'commit' | 'payer' | 'anchor';
  scriptType: 'p2tr' | 'p2wpkh' | 'p2a' | 'envelope';
  sighash: 'ALL' | 'DEFAULT';
}

export interface TxOut {
  valueSat: number;
  /** commitment: the commit transaction's commitment output (P2TR, the leaf script is the envelope); op_return: a KSN1 data output (path C) or the reveal transaction's empty OP_RETURN */
  role: 'change' | 'commitment' | 'op_return' | 'anchor' | 'payment';
  owner: Hex | null;
  address?: string;
  scriptType: 'p2tr' | 'p2wpkh' | 'op_return' | 'p2a';
  /** KSN1 data output: number of data chunks and payload bytes */
  chunks?: number;
  payloadBytes?: number;
}

export interface BtcTx {
  txid: Hex;
  kind: BtcTxKind;
  status: BtcTxStatus;
  /** settlement / rescue / commit: the corresponding fast-lane block */
  forBlock?: Hex;
  forHeight?: number;
  /** Headers carried by the payload (block hashes). For a settlement transaction the last one is the block itself (D-063) */
  headers: Hex[];
  /**
   * The heights of `headers`, in the same order, where the payload gave them (node data source: its headers are decoded), so that a
   * payload names a block the page has not loaded by its height too
   */
  headerHeights?: number[];
  /** Blocks whose bodies the payload carries (D-077): for a settlement payload the block itself and the blocks in bodies, for a republish payload its bodies */
  bodies: Hex[];
  /** The entries the payload carries: those of the block itself and of every body it carries (D-077) */
  entryCount: number;
  inputs: TxIn[];
  outputs: TxOut[];
  vsize: number;
  /** The fee needs the input values to compute; empty when the node RPC data source does not know them */
  feeSat?: number;
  feeRate?: number;
  payloadBytes: number;
  /** Reveal transaction: number of data chunks in the witness envelope (at most 520 bytes each) */
  chunks?: number;
  /** The commit transaction a reveal transaction spends; the reveal transaction corresponding to a commit transaction */
  commitTxid?: Hex;
  revealTxid?: Hex;
  createdAt: number;
  broadcastAt?: number;
  confirmedHeight?: number;
  /**
   * A path C transaction known from the block that forced it in, whose window spans more than one BTC height or whose parents are
   * not loaded (D-036): it confirmed at `confirmedHeight` or below, so it has at least the confirmations that height has
   */
  heightAtMost?: boolean;
  confirmedAt?: number;
  /** Replaced by whom / why invalid */
  note?: string;
  replacedBy?: Hex;
  /** A settlement rebuilt by the producer (kind is rescue, but not a rescue initiated by someone else) */
  rebuilt?: boolean;
  /** Initiator (the rescuer of a rescue settlement, the republisher, the user of a native transaction) */
  author?: Hex;
  /** native: the op it carries */
  opId?: Hex;
  /** cpfp: the parent transaction being bumped */
  parent?: Hex;
  /** Only part of the transaction is known (node RPC data source: a rescue settlement has only the transaction ID and confirmation position) */
  partial?: boolean;
}

export interface BtcBlock {
  height: number;
  hash: Hex;
  /**
   * When it was mined. The node data source gives the time its block gives (the header's) where the page read it as the Bitcoin
   * RPC's tip (`timeExact`), otherwise estimates it from the fast-lane blocks around it, and leaves it out when they do not tell
   */
  time?: number;
  /** The time is the block's own (with a node: read as the tip), not an estimate */
  timeExact?: boolean;
  txids: Hex[];
}

export interface AssetMeta {
  id: Hex;
  symbol: string;
  name: string;
  /** Display precision: 8 for KSA (SPEC §8.6, D-066), other assets per the decimals of ksana_getAsset; ksana-cli amounts are in base units */
  decimals: number;
  /** How much of it exists, in base units, as the node last answered (`ksana_getAsset`; for KSA its genesis allocations and the block rewards paid out, less what was burned) */
  totalSupply?: bigint;
  issuer: Hex | null;
  /**
   * What the node last answered of the asset's rules (D-121): the capabilities its issuing contract still holds (`mint`, `freeze`,
   * `allowlist`, `pause`; none for a fixed supply whose movements no one can stop) and whether it paused the asset; absent until read
   */
  capabilities?: string[];
  paused?: boolean;
  /** A contract's asset whose name reads as this native coin's (`nativeLookalike`): its symbol is then the one its ID gives */
  lookalike?: Native;
  /**
   * The node data source still awaits the node's answer for the asset (`ksana_getAsset`): its decimals are not known, so its amounts
   * show as being read, never as base units its decimals would then turn into another number
   */
  pending?: boolean;
  /**
   * A KS-20 token shown as an asset (D-120, D-123): `id` is the token contract's ID and `issuer` the contract itself; its name, symbol and
   * decimals come from the node's index of the standards' events (`ksana_getToken`)
   */
  standard?: 'KS-20';
}

/** A KS-721 collection an account holds NFTs of, from the node's index of the standards' events (D-120, D-123) */
export interface CollectionMeta {
  /** The collection contract's ID */
  id: Hex;
  symbol: string;
  name: string;
  lookalike?: Native;
  /** The index has yet to answer for it */
  pending?: boolean;
}

export interface ContractMeta {
  id: Hex;
  name: string;
  codeHash: Hex;
  codeSize: number;
  deployer: Hex;
  deployedAt: number;
  deployOp: Hex;
  methods: string[];
  readMethods: string[];
}

/** The sponsored fees and block reward a producer locked in a block (D-074, D-079), turned into available balance by an unlock entry once that block's data is on-chain */
export interface LockedFee {
  blockHash: Hex;
  /** Height of the chain block that accepts the block */
  height: number;
  producer: Hex;
  amount: bigint;
  unlocked: boolean;
  unlockHeight?: number;
  /** The account takes this portion as the carrier of another producer's block (D-095): the one that landed its data on Bitcoin */
  asCarrier?: boolean;
}

export interface Utxo {
  outpoint: OutPoint;
  valueSat: number;
  scriptType: 'p2tr' | 'p2wpkh';
  /** null means unconfirmed */
  confirmedHeight: number | null;
  spentBy?: Hex;
}

/** chain: an op read from a block, submission time unknown (node RPC data source) */
export type OpOrigin = 'traffic' | 'wallet' | 'faucet' | 'system' | 'chain';

export interface OpRecord {
  id: Hex;
  op: VmOp;
  path: Path;
  /** Encoded size in bytes */
  size: number;
  submittedAt: number;
  origin: OpOrigin;
  /** Path C: the BTC transaction carrying it */
  nativeTxid?: Hex;
  /** The block that executed it (possibly a merged parallel block) */
  blockHash?: Hex;
  /** Height of the chain block accepting that block: the op takes effect at this height (block.height in the RPC) */
  height?: number;
  entryIndex?: number;
  result?: ExecResult;
  /** When it only appears at skipped positions, the RPC status is skipped (D-063) */
  skippedIn?: { block: Hex; index: number; reason: string; at: number }[];
  /** The node dropped it from the entry pool (nonce already used), or did not hold it again after a skip; it will not go on-chain any more */
  dropped?: { reason: string; at: number };
  /**
   * Skipped, it waits in the entry pool to be included again (D-063): in the simulator until its nonce is used; with a node, since the
   * node last answered `pending` for it, which it does while it holds the op again
   */
  requeued?: boolean;
}

export interface AccountState {
  id: Hex;
  nonce: number;
  balances: Map<Hex, bigint>;
  /** Ops related to this account, in time order */
  opIds: Hex[];
  /** KS-20 tokens by contract ID and KS-721 collections by contract ID with how many NFTs, as the node's index adds them up (D-123); absent without the index */
  tokens?: Map<Hex, bigint>;
  collections?: Map<Hex, bigint>;
}

export interface Producer {
  id: Hex;
  name: string;
  weight: number;
  /** Local policy: the minimum token amount for path B (--min-token-fee, default 1) */
  minTokenFee: bigint;
}

export interface IndexerCheck {
  height: number;
  /** The indexer's block at this height */
  hash: Hex;
  /** The node's chain block at this height (when it differs from the indexer's, the two main chains have diverged) */
  nodeHash?: Hex;
  nodeRoot: Hex;
  indexerRoot: Hex;
  at: number;
}

export interface ChainEvent {
  id: number;
  at: number;
  kind: 'fast_block' | 'btc_block' | 'settled' | 'final' | 'op' | 'alert' | 'scenario';
  text: string;
  ref?: string;
}
