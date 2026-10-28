import type { Messages } from '..';

/** Block detail (pages/BlockDetail.tsx) */
const block: Messages['block'] = {
  head: {
    eyebrow: 'Ksana block',
    eyebrowSide: 'Ksana block · Parallel',
    /** Followed by a BTC block ref */
    anchor: 'Anchor',
    prev: 'Previous',
    next: 'Next',
  },

  /** Banner at the top of a parallel block */
  side: {
    /** h is a formatted height */
    mergedBy: (h: string) => `Parallel block, merged by #${h}`,
    waiting: 'Parallel block, awaiting merge',
    /** Followed by the chain block at the same height */
    sibling: 'Chain block at the same height',
  },

  header: {
    title: 'Block header',
    hash: 'Block hash',
    genesis: 'Genesis block',
    indexerMatch: 'Matches indexer',
    /** Empty-block weight (×12, ×24 …): doubles over consecutive empty blocks, raising difficulty and reward slots */
    weight: 'Empty-block weight',
    weightHint: 'Doubles over consecutive empty blocks, raising difficulty and reward',
  },

  /** DAG facts and parent tags */
  dag: {
    selectedParent: 'Selected parent',
    mergedParent: 'Merged',
    acceptedBy: 'Chain block that merged it',
    mergedStats: (entries: number, skipped: number) => `${entries} ${entries === 1 ? 'entry' : 'entries'} · ${skipped} skipped`,
    closure: 'Settled closure',
  },

  settle: {
    title: 'Settlement',
    own: 'Has its own settlement transaction',
    /** Follows own: a settlement is a commit and a reveal transaction */
    ownPair: 'Commit and reveal transactions',
    none: 'No separate settlement',
    genesis: 'The genesis block needs no settlement.',
    /** The body goes to Bitcoin with a later block's settlement */
    bodyCarried: 'The block body goes to Bitcoin with a later settlement.',
    /** Once it is there */
    bodyCarriedLanded: 'The block body went to Bitcoin with a later settlement.',
    bodyCarrier: 'Settlement carrying the body',
    /** A body that must go to Bitcoin, with no settlement of its own and none carrying it yet (D-077) */
    waiting: 'Waiting for a later settlement',
    /** A body that went to Bitcoin with a transaction other than a later block's settlement: a republish or a rescue (D-045, D-047) */
    otherCarrier: 'Body carried by another transaction',
    bodyOther: 'The block body went to Bitcoin with another transaction.',
    /** The block whose settlement carries this block's body */
    bodyCarrierBlock: 'Settlement of',
    carried: 'For empty or forced-inclusion-only blocks, another transaction carries the header to Bitcoin.',
    /** An empty block that sent a settlement itself, carrying bodies from the backlog (D-077) */
    carriedOwn: 'An empty or forced-inclusion-only block needs no settlement of its own; this one sends one for the bodies of earlier blocks, and its header goes with them.',
    carrier: 'Carrier transaction',
    /** A block's settlement: block is a block title (#1,024), kind a transaction type */
    carrierOf: (block: string, kind: string) => `${kind} for ${block}`,
    otherBlock: 'another block',
    noCarrier: 'No transaction carries this header yet.',
    /** A header on Bitcoin, as the block's life says, that no main-chain settlement the page read carried: a republish or a parallel block's landed it (D-047) */
    carrierUnloaded: 'This block’s header went to Bitcoin with a transaction this page has not found.',
    notBuilt: 'Settlement transaction not built yet.',
    rescue: 'Rescue / rebuilt',
    confs: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'confirmation' : 'confirmations'}`,
    commit: 'Commit transaction',
    reveal: 'Reveal transaction',
    /** The fee of a settlement's reveal transaction alone, where the page does not know its commit transaction's (D-081) */
    revealFee: 'Reveal fee',
    revealFeeHint: 'The commit transaction pays a fee as well, which this page cannot add: it does not know the amount of the input that funds it',
    /** A settlement's fee by transaction, the amounts already formatted */
    feeParts: (commit: string, reveal: string) => `Commit ${commit}\u00a0sats + reveal ${reveal}\u00a0sats`,
    content: 'Transaction details',
    /** Hover text for "—" when the node doesn't provide the transaction */
    contentHint: 'See a Bitcoin explorer for the full transaction',
    headers: 'Headers carried',
    headerCount: (n: number) => `${n}`,
    bodies: 'Bodies carried',
    bodyCount: (n: number) => `${n}`,
    dataSize: 'Data size',
    dataMeter: 'Settlement data size',
    /** Followed by the list of versions */
    versions: (n: number) => `${n} settlement ${n === 1 ? 'transaction' : 'transactions'} built for this block: `,
  },

  entries: {
    title: (n: number) => `Entries (${n})`,
    forced: 'Forced inclusion · from BTC',
    /** The group of the unlock entry (at most one a block): what it does */
    system: 'Unlock · fees and block rewards of settled blocks paid out',
    fast: 'Fast paths',
    /** The unlock entry's row, after its tag: Up to #1,024 · index 3 · 12 blocks · total 36 KSA */
    unlockTo: (h: string, i: number) => `Up to #${h} · index ${i}`,
    unlockBlocks: (n: number) => `${n} ${n === 1 ? 'block' : 'blocks'}`,
    unlockTotal: 'total',
    /** Stats line: 3 skipped · gas … · data … */
    skipped: (n: number) => `${n} skipped`,
    gas: (used: string, sum: string) => `gas ${used} / declared limits ${sum}`,
    data: (size: string) => `data ${size}`,
  },

  type: 'Type',
  raw: 'Raw data (JSON)',
};

export default block;
