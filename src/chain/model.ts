/** Derived types shared by the two data sources (simulator and node RPC); the on-chain data model is in types.ts */
import type { Block, IndexerCheck } from './types';

/** Corresponds to ksana_estimateFee (D-054, D-078), plus the BTC market fee rates (bitcoind's estimatesmartfee and the mempool floor) */
export interface FeeEstimate {
  /** The fee rate this node funds settlements at (--settlement-feerate) */
  feerateSatVb: number;
  /**
   * Path B. `amount`: the suggested sponsored fee of a plain KSA transfer, not below this node's minimum sponsored fee: in the simulator
   * the median path B amount over the last 20 chain blocks; on a node its `path_b.amount`, the fee rate `path_b.per_kib` (the median of
   * the lowest path B fee rate of each of the last 20 main-chain blocks, not below its minimum rate) applied to the node's reference
   * transfer (D-054, D-095). `forOp`: the suggestion for an op of that encoded size and `max_gas`, on a node the op's own cost at that
   * rate (RPC.md: other ops scale by their own cost), not below `amount`. `basis`: what the suggestion rests on, the simulator's median,
   * a node's fee rate, or a node's minimum sponsored fee (its rate is 0, so `amount` is that minimum)
   */
  pathB: {
    amount: bigint;
    nodeMin: bigint;
    producerMins: { name: string; min: bigint }[];
    forOp: (opBytes: number, maxGas: number) => bigint;
    basis: 'median' | 'rate' | 'minimum';
  };
  /** BTC market: the estimated fee rate and the current fee floor (the floor rises during a fee-rate spike) */
  market: { feeRate: number; minFeeRate: number };
  /** Path C: the fee the user pays the BTC miners themselves (sats) */
  pathC: (opBytes: number, feeRate?: number) => number;
}

/** Settlement backlog (D-046, D-077): how many BTC blocks the earliest-anchored block whose body still has to go on-chain has been waiting */
export interface BacklogStatus {
  /** The earliest-anchored block whose body must go on-chain and has not yet */
  oldest?: Block;
  /**
   * Where the oldest block's data is on Bitcoin already, in a BTC block above the anchor the count takes (on signet, the newest): that
   * block, and the confirmations at which the next block's anchor reaches it and the data leaves the backlog, ANCHOR_DEPTH + 1 (D-056)
   */
  landed?: { btcHeight: number; confs: number };
  /** BTC blocks elapsed (counted from the current tip's anchor) */
  waited: number;
  limit: number;
  triggered: boolean;
}

/** Node and indexer have the same block at this height, with the same state_root */
export const checkOk = (c: IndexerCheck) => !c.nodeHash && c.nodeRoot === c.indexerRoot;

/**
 * Every state_root check this page made, beyond the recent ones a data source keeps (`indexerChecks`, a window): how many, how many did
 * not match, and the latest of those, so that a mismatch the window has let go of is still told
 */
export interface IndexerTally {
  count: number;
  failed: number;
  lastFailed: IndexerCheck | null;
}

export function tallyCheck(tally: IndexerTally, c: IndexerCheck) {
  tally.count++;
  if (checkOk(c)) return;
  tally.failed++;
  tally.lastFailed = c;
}

/**
 * One lock of the exchange contract (the example contract core/contracts/examples/ksa-exchange, D-078, D-085) in the form the UI uses: the
 * seller locks KSA for a beneficiary account, the buyer pays BTC to the payment address and claims in the same transaction (top-up).
 * Both data sources provide this form: the simulator has a built-in exchange contract; the node data source reads it through the
 * SDK's getLock.
 */
export interface ExchangeLockView {
  /** Lock id */
  id: bigint;
  /** Exchange contract ID (64 hex digits) */
  exchange: string;
  seller: string;
  /** Beneficiary account: the buyer account that receives the KSA on claim */
  beneficiary: string;
  /** The BTC payment script (hex) and its address (empty when no address can be derived from it) */
  script: string;
  address?: string;
  /** Price: how many KSA base units per sat */
  price: bigint;
  /** Locked KSA (base units) */
  ksa: bigint;
  /** Expiry BTC height; RELEASE_DELAY (6) blocks later the seller can release */
  expiry: number;
  state: 'Open' | 'Claimed' | 'Released';
  paidSats?: number;
  ksaPaid?: bigint;
}
