import type { Messages } from '..';

/** Shared components: refs, lists, amounts, entry results, progress, search box, on-demand lookups */
const ui: Messages['ui'] = {
  /** Screen-reader label of a copy button: Copy: <text> */
  copyWhat: (label: string, text: string) => `${label}: ${text}`,
  /** Hover text of an account ref: the address, then the same account in hex */
  accountTitle: (address: string) => `Account ${address}`,
  accountHex: (id: string) => `Hex ${id}`,
  contractTitle: (id: string) => `Contract ${id}`,
  sideBlockSr: ' (parallel block)',
  /** Screen-reader note on a row a list held while the keyboard is in it keeps, though the list no longer has it (drawn grey) */
  goneSr: ' (no longer in this list)',
  /** A contract's asset: the contract that issued it, before its ref; the warning beside one named like a native coin */
  issuedBy: 'Issued by',
  lookalike: (coin: string) => `Not ${coin}: a contract’s asset with a name like it`,

  emptyBlock: 'Empty block',
  entryCounts: (b: number, c: number) => `Sponsored ${b} · Forced ${c}`,
  entryCountsOther: (n: number) => ` · Unlock ${n}`,
  entryUnlock: 'unlock',
  mergedCount: (n: number) => `Merged ${n} parallel ${n === 1 ? 'block' : 'blocks'}`,
  btcAnchor: 'BTC anchor',
  blockList: 'Block list',
  opList: 'Operation list',
  received: 'Received',
  arrowTo: 'to',
  arrowFrom: 'from',
  sender: 'Sender',

  minerFee: 'Miner fee',
  minerFeeHint: 'Paid to BTC miners',
  feeRateCapped: (rate: string, cap: string) => `The node suggests ${rate}\u00a0sat/vB; this page uses at most ${cap}\u00a0sat/vB`,
  skipped: 'Skipped',
  awaitingMerge: 'Awaiting merge',
  awaitingMergeHint: 'Runs once merged',
  ok: 'Success',

  satsUnknown: 'The node doesn’t provide this amount',
  entryKind: {
    Forced: 'Forced inclusion',
    Sponsored: 'Sponsored',
    Unlock: 'Unlock',
  },

  progress: 'Operation progress',
  stuck: 'Stuck',

  search: 'Search',
  searchPlaceholder: 'Height, hash, op_id, or address',
  searchResults: 'Search results',
  searchNone: 'No matches',

  /** Lowercase: inserted into the sentences below and into search.notFound.title */
  lookupWhat: { block: 'block', op: 'operation', account: 'account', asset: 'asset', contract: 'contract', btcTx: 'BTC transaction' },
  lookupErrorEyebrow: 'Lookup failed',
  lookupError: (what: string) => `Couldn’t load this ${what}`,
  lookupLoadingEyebrow: 'Looking up',
  lookupLoading: (what: string) => `Loading ${what}…`,
  /** Under a lookup that failed while the page says the node is disconnected: it is read again once the node answers */
  lookupAgain: 'The page looks it up again as soon as the node answers.',
  doc: {
    block: (height: string) => `Block #${height}`,
    btcBlock: (height: string) => `BTC block #${height}`,
    btcTx: (txid: string) => `BTC transaction ${txid}`,
    op: (id: string) => `Operation ${id}`,
    account: (address: string) => `Account ${address}`,
    contract: (name: string) => `Contract ${name}`,
    asset: (symbol: string) => `Asset ${symbol}`,
  },
  /**
   * Above a list of operations on the node data source: how far the node's listing reaches (D-111; n is a formatted count of
   * operations), or from a node without it how far down the chain has been read (D-110; h is a formatted height)
   */
  history: {
    reading: (h: string) => `Fetching older blocks (at #${h})…`,
    from: (h: string) => `Only operations in blocks from #${h} onward are listed.`,
    earlier: 'Fetch older blocks',
    listing: 'Fetching the operations from the node…',
    listed: (n: string) => (Number(n) === 1 ? 'Looked through the latest operation.' : `Looked through the latest ${n} operations.`),
    older: 'Look through older operations',
    /** Below a full list: shows older rows, as many again as it showed at first */
    showOlder: 'Show older operations',
    failed: (message: string) => `Could not fetch the operations from the node: ${message}`,
    retry: 'Try again',
  },
};

export default ui;
