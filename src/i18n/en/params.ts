import type { Messages } from '..';

/** Protocol parameter table (paramDocs in chain/params.ts, shown on the Verify page): value units and a short phrase per parameter */
const params: Messages['params'] = {
  /** Value units */
  blocks: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'block' : 'blocks'}`,
  btcBlocks: (n: number) => `${n.toLocaleString('en-US')} BTC ${n === 1 ? 'block' : 'blocks'}`,
  /** The value of a list with nothing in it (UPGRADES) */
  none: 'None',

  /** Keys are parameter names: those of SPEC §13 the table shows */
  note: {
    CHAIN_ID: 'Chain ID; prevents cross-network replay',
    MAGIC: 'Data marker of OP_RETURN outputs and witness envelopes',
    TARGET_BLOCK_TIME: 'Target time per block, with an empty block counting as 12\u00a0to\u00a0120 (its weight)',
    ASERT_HALF_LIFE: 'Difficulty adjustment half-life',
    SETTLEMENT_DEPTH: 'Blocks to wait before broadcasting a settlement',
    SETTLEMENT_TIMEOUT: 'Settlement backlog limit',
    NATIVE_CONFIRMATIONS: 'BTC confirmations needed before forced inclusion, plus\u00a0ANCHOR_DEPTH',
    MAX_ANCHOR_LAG: 'Blocks the anchor may lag behind the BTC tip, beyond\u00a0ANCHOR_DEPTH',
    ANCHOR_DEPTH: 'Blocks below the BTC tip to anchor at',
    BTC_QUERY_DEPTH: 'Minimum depth of BTC headers contracts can read',
    BTC_FINALITY_CONFS: 'Confirmations to decide BTC finality, then as many again to report it',
    MIN_SETTLEMENT_FEERATE: 'Minimum fee rate for settlement transactions',
    BLOCK_GAS_LIMIT: 'Per-block gas limit',
    NATIVE_MAX_GAS: 'Per-operation gas limit on Path C',
    MAX_OP_BYTES: 'Max size of one VmOp, including contract code',
    MAX_BLOCK_DATA_BYTES: 'Max data in one settlement or republish payload, all its headers and bodies',
    MAX_SETTLEMENT_HEADERS: 'Max block headers in one payload',
    MAX_WASM_MEMORY: 'Contract linear memory limit',
    MAX_CALL_DEPTH: 'Max depth of contract-to-contract calls',
    REORG_WINDOW: 'Ksana blocks that can be rolled back',
    MEDIAN_TIME_SPAN: 'Timestamp must exceed the median time of this many recent blocks',
    MAX_FUTURE_BLOCK_TIME: 'How far ahead of local time a timestamp may be',
    MAX_TIMESTAMP_AHEAD_OF_ANCHOR: 'How far ahead of the anchored BTC block’s time a timestamp may be',
    POW_LIMIT_BITS: 'Lowest difficulty; the genesis block’s bits unless its config sets them',
    POW_ALGORITHM: 'Mining algorithm, salted with the chain ID',
    POW_ARGON2_MEMORY: 'Argon2id memory per block header; one check takes about 1 ms on a CPU',
    POW_ARGON2_ITERATIONS: 'Argon2id passes',
    POW_ARGON2_LANES: 'Argon2id lanes (parallelism)',
    GHOSTDAG_K: 'Merge set holds at most k\u00a0+\u00a01 blue blocks',
    MAX_BLOCK_PARENTS: 'Max parents a block can reference',
    MAX_MERGESET_SIZE: 'Max merge set size',
    MERGE_DEPTH: 'Max blue score gap allowed when merging',
    EMPTY_BLOCK_DIFFICULTY: 'Weight of an empty block after one with entries: difficulty multiplier and reward slots',
    MAX_EMPTY_BLOCK_WEIGHT: 'Empty-block weight stops doubling here',
    BLOCK_REWARD: 'Initial block reward per reward slot',
    REWARD_HALVING_INTERVAL: 'DAA score between reward halvings',
    REWARD_INTERVAL_DOUBLINGS: 'Times the halving period doubles in length (0: all periods equal)',
    KSA_MAX_SUPPLY: 'Maximum KSA supply',
    CARRIER_BPS: 'Part of each reward slot for the block’s carrier (first to land its data), out of the producer’s',
    CARRIER_FEE_BPS: 'Carrier’s part of the block’s Path B sponsor fees',
    CARRIER_REPOST_DELAY: 'Blocks after the anchor, beyond ANCHOR_DEPTH, before a republish earns the carrier reward',
    MAX_UNLOCK_BATCH: 'Max blocks one unlock entry can unlock',
    UPGRADES: 'Scheduled protocol upgrades',
  },
};

export default params;
