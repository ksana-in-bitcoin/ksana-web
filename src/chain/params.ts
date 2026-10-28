import type { Messages } from '../i18n';

/**
 * devnet protocol parameters, matching `DEVNET` in core/crates/ksana-primitives/src/params.rs (SPEC v2 §13, D-056, D-062, D-063,
 * D-074 to D-076, D-083, D-084, D-089, D-090, D-094, D-095, D-100, D-105). The UI's thresholds and progress ticks all read from here; no separate magic numbers.
 * The upgrade schedule (UPGRADES, D-076) is empty on every network, so the rules that vary with the protocol version are the base values here.
 */
export const PARAMS = {
  CHAIN_ID: 1001,
  MAGIC: 'KSN1',
  TARGET_BLOCK_TIME: 5,
  ASERT_HALF_LIFE: 7200,
  SETTLEMENT_DEPTH: 2,
  SETTLEMENT_TIMEOUT: 6,
  NATIVE_CONFIRMATIONS: 1,
  MAX_ANCHOR_LAG: 1,
  ANCHOR_DEPTH: 0,
  BTC_QUERY_DEPTH: 6,
  BTC_FINALITY_CONFS: 6,
  MIN_SETTLEMENT_FEERATE: 1,
  BLOCK_GAS_LIMIT: 100_000_000,
  NATIVE_MAX_GAS: 1_000_000,
  /** The gas a built-in asset transfer uses, whatever it moves: the gas table's `AssetTransfer` (core/docs/ABI.md, `ASSET_TRANSFER_ACTION` in core/crates/ksana-vm/src/gas.rs) */
  ASSET_TRANSFER_GAS: 10_000,
  MAX_OP_BYTES: 64 * 1024,
  MAX_BLOCK_DATA_BYTES: 80 * 1024,
  MAX_SETTLEMENT_HEADERS: 500,
  MAX_WASM_MEMORY: 16 * 1024 * 1024,
  MAX_CALL_DEPTH: 8,
  REORG_WINDOW: 1000,
  MEDIAN_TIME_SPAN: 11,
  MAX_FUTURE_BLOCK_TIME: 15,
  MAX_TIMESTAMP_AHEAD_OF_ANCHOR: 4 * 3600,
  POW_LIMIT_BITS: 0x207fffff,
  POW_ALGORITHM: 'Argon2id',
  /** In bytes: Argon2Params::memory_kib 2 048 */
  POW_ARGON2_MEMORY: 2 * 1024 * 1024,
  POW_ARGON2_ITERATIONS: 1,
  POW_ARGON2_LANES: 1,
  GHOSTDAG_K: 16,
  MAX_BLOCK_PARENTS: 10,
  MAX_MERGESET_SIZE: 128,
  MERGE_DEPTH: 720,
  EMPTY_BLOCK_DIFFICULTY: 12,
  MAX_EMPTY_BLOCK_WEIGHT: 120,
  BLOCK_REWARD: 990_000_000,
  REWARD_HALVING_INTERVAL: 25_228_800,
  REWARD_INTERVAL_DOUBLINGS: 0,
  KSA_MAX_SUPPLY: 100_000_000_000_000_000,
  BLOCK_SHARE_BPS: 2000,
  BLOCK_SHARE_END: 50_457_600,
  CARRIER_BPS: 500,
  CARRIER_FEE_BPS: 5000,
  CARRIER_REPOST_DELAY: 2,
  MAX_UNLOCK_BATCH: 1024,
} as const;

/**
 * The BTC confirmations a block's data has when the block is reported BTC-final at the earliest (D-114): the finality determination decides
 * it at the data's BTC_FINALITY_CONFS-th confirmation, and node and indexer report it once the BTC block of that determination has
 * BTC_FINALITY_CONFS confirmations too. The BTC-final steps, their estimates and the simulator count to this; on a node the stage itself
 * is what the node reports.
 */
export const BTC_FINAL_DATA_CONFS = 2 * PARAMS.BTC_FINALITY_CONFS - 1;

export type ParamName = keyof typeof PARAMS;

/** What the table shows per network: signet differs from devnet only in the chain ID and ANCHOR_DEPTH (D-055, D-056) */
const NETWORK_PARAMS: Record<'devnet' | 'signet', { CHAIN_ID: number; ANCHOR_DEPTH: number }> = {
  devnet: { CHAIN_ID: PARAMS.CHAIN_ID, ANCHOR_DEPTH: PARAMS.ANCHOR_DEPTH },
  signet: { CHAIN_ID: 1002, ANCHOR_DEPTH: 1 },
};

/** ANCHOR_DEPTH of a network: a block anchors this many BTC blocks below the BTC tip its producer saw (D-056) */
export function anchorDepthOf(chain: 'devnet' | 'signet'): number {
  return NETWORK_PARAMS[chain].ANCHOR_DEPTH;
}

/** The parameters the table shows: those of SPEC §13 but the block share's (see paramDocs) */
type ShownParam = keyof Messages['params']['note'];

export interface ParamDoc {
  name: ShownParam;
  value: string;
  note: string;
}

/**
 * The protocol parameter table of the Verify page for `chain`, the network the page shows. The units and notes of the values come
 * from the messages passed in (the result of useT() in the component) and follow a language switch.
 * Only the type of the messages is imported here: this file has no runtime dependency on i18n, so a message file referencing
 * PARAMS forms no cycle. The block share's ratio and end (BLOCK_SHARE_BPS, BLOCK_SHARE_END) are left out: the explorer and the
 * wallet do not show the token's allocation for now, as the project owner asked on 2026-10-15
 */
export function paramDocs(m: Messages, chain: 'devnet' | 'signet'): ParamDoc[] {
  const net = NETWORK_PARAMS[chain];
  const { blocks, btcBlocks, none, note } = m.params;
  // Numbers are written the same in every language (comma thousands separators, consistent with fmtInt in lib/format)
  const int = (n: number) => n.toLocaleString('en-US');
  const sec = (n: number) => m.format.seconds(int(n));
  // KSA amounts are kept in base units, 10^8 to the KSA (KSA_DECIMALS)
  const ksa = (base: number) => {
    const units = BigInt(base);
    const frac = (units % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
    return `${(units / 100_000_000n).toLocaleString('en-US')}${frac ? `.${frac}` : ''}\u00a0KSA`;
  };
  const kib = (n: number) => `${n / 1024}\u00a0KiB`;
  const mib = (n: number) => `${n / 1024 / 1024}\u00a0MiB`;
  // Basis points as a percentage
  const bps = (n: number) => `${n / 100}%`;
  const rows: [ShownParam, string][] = [
    ['CHAIN_ID', String(net.CHAIN_ID)],
    ['MAGIC', PARAMS.MAGIC],
    ['TARGET_BLOCK_TIME', sec(PARAMS.TARGET_BLOCK_TIME)],
    ['ASERT_HALF_LIFE', sec(PARAMS.ASERT_HALF_LIFE)],
    ['EMPTY_BLOCK_DIFFICULTY', `×${PARAMS.EMPTY_BLOCK_DIFFICULTY}`],
    ['MAX_EMPTY_BLOCK_WEIGHT', `×${PARAMS.MAX_EMPTY_BLOCK_WEIGHT}`],
    ['SETTLEMENT_DEPTH', blocks(PARAMS.SETTLEMENT_DEPTH)],
    ['SETTLEMENT_TIMEOUT', btcBlocks(PARAMS.SETTLEMENT_TIMEOUT)],
    ['NATIVE_CONFIRMATIONS', String(PARAMS.NATIVE_CONFIRMATIONS)],
    ['MAX_ANCHOR_LAG', btcBlocks(PARAMS.MAX_ANCHOR_LAG)],
    ['ANCHOR_DEPTH', String(net.ANCHOR_DEPTH)],
    ['BTC_QUERY_DEPTH', String(PARAMS.BTC_QUERY_DEPTH)],
    ['BTC_FINALITY_CONFS', String(PARAMS.BTC_FINALITY_CONFS)],
    ['MIN_SETTLEMENT_FEERATE', `${PARAMS.MIN_SETTLEMENT_FEERATE}\u00a0sat/vB`],
    ['BLOCK_GAS_LIMIT', int(PARAMS.BLOCK_GAS_LIMIT)],
    ['NATIVE_MAX_GAS', int(PARAMS.NATIVE_MAX_GAS)],
    ['MAX_OP_BYTES', kib(PARAMS.MAX_OP_BYTES)],
    ['MAX_BLOCK_DATA_BYTES', kib(PARAMS.MAX_BLOCK_DATA_BYTES)],
    ['MAX_SETTLEMENT_HEADERS', String(PARAMS.MAX_SETTLEMENT_HEADERS)],
    ['MAX_WASM_MEMORY', mib(PARAMS.MAX_WASM_MEMORY)],
    ['MAX_CALL_DEPTH', String(PARAMS.MAX_CALL_DEPTH)],
    ['REORG_WINDOW', blocks(PARAMS.REORG_WINDOW)],
    ['MEDIAN_TIME_SPAN', blocks(PARAMS.MEDIAN_TIME_SPAN)],
    ['MAX_FUTURE_BLOCK_TIME', sec(PARAMS.MAX_FUTURE_BLOCK_TIME)],
    ['MAX_TIMESTAMP_AHEAD_OF_ANCHOR', sec(PARAMS.MAX_TIMESTAMP_AHEAD_OF_ANCHOR)],
    ['POW_LIMIT_BITS', `0x${PARAMS.POW_LIMIT_BITS.toString(16).padStart(8, '0')}`],
    ['POW_ALGORITHM', PARAMS.POW_ALGORITHM],
    ['POW_ARGON2_MEMORY', mib(PARAMS.POW_ARGON2_MEMORY)],
    ['POW_ARGON2_ITERATIONS', String(PARAMS.POW_ARGON2_ITERATIONS)],
    ['POW_ARGON2_LANES', String(PARAMS.POW_ARGON2_LANES)],
    ['GHOSTDAG_K', String(PARAMS.GHOSTDAG_K)],
    ['MAX_BLOCK_PARENTS', String(PARAMS.MAX_BLOCK_PARENTS)],
    ['MAX_MERGESET_SIZE', String(PARAMS.MAX_MERGESET_SIZE)],
    ['MERGE_DEPTH', String(PARAMS.MERGE_DEPTH)],
    ['BLOCK_REWARD', ksa(PARAMS.BLOCK_REWARD)],
    ['REWARD_HALVING_INTERVAL', int(PARAMS.REWARD_HALVING_INTERVAL)],
    ['REWARD_INTERVAL_DOUBLINGS', String(PARAMS.REWARD_INTERVAL_DOUBLINGS)],
    ['KSA_MAX_SUPPLY', ksa(PARAMS.KSA_MAX_SUPPLY)],
    ['CARRIER_BPS', bps(PARAMS.CARRIER_BPS)],
    ['CARRIER_FEE_BPS', bps(PARAMS.CARRIER_FEE_BPS)],
    ['CARRIER_REPOST_DELAY', btcBlocks(PARAMS.CARRIER_REPOST_DELAY)],
    ['MAX_UNLOCK_BATCH', int(PARAMS.MAX_UNLOCK_BATCH)],
    ['UPGRADES', none],
  ];
  return rows.map(([name, value]) => ({ name, value, note: note[name] }));
}

/** Default values of the node's local policy (ksana-node command-line flags, not consensus rules) */
export const NODE_POLICY = {
  /** --min-token-fee: the minimum token amount for accepting a path B op */
  MIN_TOKEN_FEE: 1n,
  /** --settlement-feerate: the fee rate of settlement transactions (sat/vB) */
  SETTLEMENT_FEERATE: 2,
  /** --max-settlement-feerate: the highest fee rate of the node's BTC transactions (sat/vB, D-102) */
  MAX_SETTLEMENT_FEERATE: 100,
} as const;

/** Asset ID of the project token KSA: 32 zero bytes (SPEC §4.4) */
export const KSA_ASSET_ID = '0'.repeat(64);
/** Display precision of KSA (SPEC §8.6, D-066): the built-in asset's metadata has 8 decimals, which ksana_getAsset also returns */
export const KSA_DECIMALS = 8;

/** Borsh-encoded length of a block header v2: 168 + 32 × number of parents (D-063). Payloads use the compact encoding (D-075); this is the length in the RPC and in storage */
export function headerBytes(parents: number): number {
  return 168 + 32 * parents;
}

/** This block's weight as an empty block at empty-block streak `streak` (how many consecutive empty blocks the selected chain already has) (D-084, D-090): 12, 24, 48, 96, 120 */
export function emptyBlockWeight(streak: number): number {
  const w = PARAMS.EMPTY_BLOCK_DIFFICULTY * 2 ** Math.max(0, Math.min(streak, 10));
  return Math.min(w, PARAMS.MAX_EMPTY_BLOCK_WEIGHT);
}

/** Value of the P2A anchor output, taken as the dust limit of Bitcoin Core 28 */
export const P2A_VALUE_SAT = 240;
