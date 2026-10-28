import type { Messages } from '..';

/** App shell (app/Shell.tsx, app/App.tsx): top bar, nav, status strip, toasts, console, footer and the connecting page */
const shell: Messages['shell'] = {
  skipToMain: 'Skip to main content',

  /** Top bar and mobile bottom bar */
  mainNav: 'Main navigation',
  nav: {
    overview: 'Overview',
    blocks: 'Blocks',
    ops: 'Operations',
    settlements: 'Settlements',
    verify: 'Verify',
    wallet: 'Wallet',
    explorer: 'Explorer',
    /** The contract playground (core/playground/, D-119): a page of its own, opened in a new tab from the top bar and the footer */
    playground: 'Playground',
  },
  /** Title of the playground's links in the top bar and the footer */
  playground: 'Contract playground: edit, compile and deploy contracts in your browser; opens in a new tab',

  /** Theme: top-bar button and footer */
  theme: 'Theme',
  themes: { system: 'System', light: 'Light', dark: 'Dark' },
  themeNow: (current: string) => `Theme: ${current}`,
  themeSwitch: (current: string, next: string) => `Theme: ${current}; click to switch to ${next}`,

  top: {
    connectWallet: 'Connect wallet',
    myWallet: 'My wallet',
    walletTitle: (account: string) => `My wallet · Account ${account}`,
    pending: (n: number) => `${n} ${n === 1 ? 'operation' : 'operations'} awaiting inclusion`,
    closeSearch: 'Close search',
    /** Network chip: simulator */
    simTitle: 'Open the regtest console and data source settings',
    simLabel: (chainId: string) => `Network devnet, chain_id ${chainId}, in-browser simulator; open the regtest console`,
    /** Beside the network from 1100 px, where the status strip leaves the data source to the chip */
    sim: 'simulator',
    /** Network chip: node (state is the connection state) */
    node: 'node',
    nodeTitle: (url: string, state: string) => `Node ${url}: ${state}`,
    nodeLabel: (chain: string, state: string) => `Network ${chain}, node data source, ${state}; open data source settings`,
  },

  /** Two-lane status strip under the top bar */
  strip: {
    label: 'Chain status',
    disconnected: 'Node disconnected',
    disconnectedSince: (ago: string) => `Node disconnected · last update ${ago}`,
    backlogFull: 'Settlement backlog at limit; fast paths paused',
    fast: 'Ksana',
    settled: 'Settled',
    btcTipHint: 'The node doesn’t report the BTC tip; estimated from known data',
    /** Once the Bitcoin RPC has given the tip (`BtcTipReader`, TIP_EVERY_MS); until then, and without one, btcTipHint */
    btcTipRead: 'Read from the Bitcoin RPC every 30 seconds; in between, it follows the node’s new blocks',
    backlog: (waited: number, limit: number) => `Settlement backlog ${waited}/${limit}`,
    backlogHint: 'BTC blocks the oldest block’s data has waited to count as on Bitcoin, which it does once the next block’s anchor reaches the BTC block it is in',
    settleFee: 'Settlement fee rate',
    settleFeeHint: 'The fee rate the node funds settlements at, not the BTC market rate',
    fee: 'Fee rate',
    feeHint: 'Estimated BTC fee rate',
    minFee: (rate: string) => `fee floor ${rate}`,
    noIndexer: 'No indexer',
    indexer: { ok: 'Indexer matches', mismatch: 'Indexer mismatch', halted: 'Indexer halted', none: 'No indexer check yet', unreachable: 'Indexer unreachable', stalled: 'Indexer stalled at' },
    mempool: 'Mempool',
    pendingHint: 'Only operations submitted from this page and not yet included',
    sourceNode: (host: string) => `Source: node ${host}`,
    sourceSim: 'Source: in-browser simulator',
  },

  /** Toasts: wallet stage changes and incoming transfers */
  toast: {
    close: 'Dismiss',
    /** One-line summary of an operation: Transfer 5 KSA */
    what: (verb: string, amount: string, symbol: string) => `${verb} ${amount}\u00a0${symbol}`,
    failed: 'Operation failed',
    dropped: 'Operation dropped from the mempool',
    skipped: 'Operation skipped in a parallel block',
    received: (amount: string, symbol: string) => `Received ${amount}\u00a0${symbol}`,
    large: 'At or above your large-amount threshold; wait for BTC final before counting it as received',
    deepNext: 'Next: BTC final',
    finalTakenBack: 'BTC final withdrawn',
    finalTakenBackBody: 'The node no longer reports it as BTC final; wait for BTC final again',
    from: (name: string) => `From ${name}`,
  },

  /** A newer version of the page (app/update.ts) */
  update: {
    title: 'A newer version of this page is available',
    body: 'Reload the page to use it',
    language: (name: string) => `Reload the page to use it and switch to ${name}`,
    reload: 'Reload',
    missed: (name: string) => `Could not load ${name}`,
    missedBody: 'The server did not answer; check the connection and try again',
  },

  /** The node's network started over from another genesis block while the page was open (app/store.ts, `readAnew`) */
  startedOver: {
    title: 'The network started over from a new genesis block',
    body: "The page read the node's chain anew: blocks, operations and balances from before are not on it",
  },

  /** Console drawer */
  console: {
    sim: 'regtest console',
    rpc: 'Data source and node',
    loaded: (n: number) => `Loaded the latest ${n} chain ${n === 1 ? 'block' : 'blocks'}; older ones are fetched when opened`,
    disconnect: 'Disconnect wallet',
    disconnectDemo: 'Disconnect demo wallet',
    events: 'Recent events',
    needWallet: 'Connect a wallet to use the censorship scenario',
  },

  /** Simulator regtest scenarios: one line each */
  scenario: {
    mine: {
      title: (seconds: number) => `Bitcoin blocks · every ~${seconds} s`,
      hint: 'Mining several blocks in a row can briefly hit the backlog limit',
      button: (n: number) => `Mine ${n} ${n === 1 ? 'block' : 'blocks'}`,
    },
    fee: {
      title: 'BTC fee spike',
      hint: 'Settlements get stuck in the BTC mempool; once the backlog is full, fast paths pause',
      toggle: 'Fee spike',
      cpfp: 'CPFP via P2A anchor',
      cpfpCount: (n: number) => `CPFP via P2A anchor (${n})`,
      cpfpDone: (n: number) => `Bumped ${n} ${n === 1 ? 'transaction' : 'transactions'} to confirm in the next BTC block`,
      backlog: (waited: number, limit: number) => `Backlog ${waited} / ${limit} BTC ${limit === 1 ? 'block' : 'blocks'}`,
      paused: 'Fast paths paused',
    },
    censor: {
      title: 'Producers censor my account',
      hint: 'Producers stop including your fast-path operations',
      toggle: 'Censor my account',
    },
    offline: {
      title: 'Producer goes offline',
      hint: (name: string) => `${name} stops producing; other nodes broadcast its settlements`,
      toggle: (name: string) => `${name} offline`,
    },
  },

  footer: {
    /** Brand tagline */
    tagline: 'Confirmed in an instant on Ksana, written into Bitcoin for good.',
    fromSim: 'Data from the in-browser simulator; reloading the page regenerates the chain',
    fromNode: (url: string) => `Data from node ${url}`,
    build: 'Build',
    buildHint: 'Git commit this page was built from; see README.md, “verify this page”',
  },

  /** Full page shown until the node data source finishes its first sync (App.tsx) */
  connecting: {
    eyebrow: 'Connecting',
    title: 'Connecting to node…',
    failedEyebrow: 'Connection failed',
    failedTitle: 'Can’t reach the node',
    wrongNetworkTitle: 'The node is on another network',
    detail: (message: string) => `Error details: ${message}`,
    /** The node data source keeps syncing every 2.5 s (POLL_MS) while it cannot connect, and opens the page once it does */
    retrying: 'The page tries again every 2.5 seconds and opens as soon as the node answers.',
    settings: 'Data source settings',
    useSim: 'Use the in-browser simulator instead',
    switchTo: (chain: string) => `Switch to ${chain}`,
  },
  linkSource: {
    eyebrow: 'Data source',
    title: 'Read from the node this link names?',
    body: 'This link asks the page to read from the addresses below rather than from the node it usually reads from. Everything the page then shows (balances, operations, how far they are confirmed) would come from them, and what your wallet signs would be sent to them. Do so only if you run them or trust whoever does.',
    node: 'Node',
    indexer: 'Indexer',
    btc: 'Bitcoin RPC',
    network: 'Network',
    note: 'Nothing is saved either way: the answer holds for this tab.',
    keep: 'Keep the usual node',
    follow: 'Read from this node',
  },
  /** A node an earlier version of the page saved, perhaps from a link (store.ts, `savedSource`): asked about once */
  savedSource: {
    eyebrow: 'Data source',
    title: 'Keep reading from the node saved earlier?',
    body: 'An earlier version of this page saved the addresses below as where it reads from. Earlier versions saved a node a link named just as they saved a choice made in the data source panel, so these may come from a link you opened. Everything the page shows (balances, operations, how far they are confirmed) would come from them, and what your wallet signs would be sent to them. Keep them only if you chose them yourself.',
    node: 'Node',
    indexer: 'Indexer',
    btc: 'Bitcoin RPC',
    network: 'Network',
    note: 'You are asked this once; the data source panel can change it at any time.',
    keep: 'Use this page’s node',
    follow: 'Keep reading from it',
  },
};

export default shell;
