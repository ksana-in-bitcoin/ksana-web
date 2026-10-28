import type { Messages } from '..';
import coins from './coins';

/** Wallet home and connect page (pages/wallet/Wallet.tsx), plus wallet/connect.ts */
const wallet: Messages['wallet'] = {
  title: 'Wallet',
  /** Two spellings of one account: the address is primary, hex is for contract arguments */
  address: 'Address',
  copyAddress: 'Copy address',
  accountHex: 'Account (hex)',
  copyAccountHex: 'Copy hex account',

  /** Connect page and wallet/connect.ts */
  connect: {
    title: 'Connect wallet',
    noCustody: 'Ksana only asks for signatures; it never holds your assets.',
    /** The three points at the bottom of the connect page */
    points: {
      key: 'Your account is your Taproot address',
      topup: 'No KSA yet? Top up with BTC',
      pathC: 'Path C still works if every producer refuses',
    },
    /** The line under each point; n is the BTC confirmations after which Ksana blocks must include a Path C operation */
    pointNotes: {
      key: 'Your Bitcoin wallet signs for it: no new key or seed phrase, and one address receives both KSA and BTC.',
      topup: 'A seller locks KSA for you, and the Bitcoin transaction that pays the seller also claims it.',
      pathC: (n: number) => `A Path C operation travels in a Bitcoin transaction you send yourself: after ${n}\u00a0BTC ${n === 1 ? 'confirmation' : 'confirmations'}, Ksana blocks must include it.`,
    },
    go: 'Connect',
    waiting: 'Waiting for wallet…',
    demoName: 'Local dev key',
    demoNote: 'Test account allocated at genesis',
    demoConnected: 'Demo account connected',
    needsNode: 'Needs a node',
    switchSource: 'Switch data source',
    lastUsed: 'Last used',
    localOnly: 'Local regtest only',
    /** The tag of a wallet the page did not find: a computer's names the extension, a touch screen's (which has no extensions) does not */
    notDetected: 'Extension not found',
    notDetectedTouch: 'Not detected',
    install: 'Install the extension, then reload this page.',
    /** What a touch screen (a phone, a tablet without a trackpad), which has no extensions, is told instead of install */
    openInApp: {
      unisat: 'Open this page in the browser inside the Unisat or OneKey app.',
      xverse: 'Open this page in the browser inside the Xverse app.',
    },
    failed: (name: string) => `Couldn’t connect to ${name}`,
    /** net is the Bitcoin network (regtest, signet), prefix how an account's Taproot address starts there (bcrt1p, tb1p) */
    network: (net: string, prefix: string) => `Your wallet must be on ${net}: addresses start with ${prefix}.`,
    mockHint: 'On local regtest you can use the test-key wallet:',
    mockParam: '?wallet=mock&key=<private-key>',
    /** The character in the test-key wallet icon */
    mockIcon: 'T',
    mockName: 'Test-key wallet',
    unisatNote: 'Taproot (P2TR) account',
    xverseNote: 'Uses the Ordinals address (P2TR)',
    mockNote: 'The private key comes from the URL and stays only in this page’s memory.',
    /** Shown in the Xverse connect popup */
    xverseMessage: 'Connect to Ksana wallet',
    noMockKey: 'No test private key in the URL',
    /** The address bar carried a test private key on a page that is not on local regtest */
    keyRefusedTitle: 'The key in the link was not used',
    keyRefused:
      'The test-key wallet is for local regtest only. The page removed the key from the address bar, but a key in a link also reaches the server that serves the page: don’t use it for an account that holds anything.',
    /** addr is the first 8 characters of the wallet address, net the node's Bitcoin network */
    wrongNetwork: (addr: string, net: string) => `Wallet address ${addr}… isn’t a ${net} address; switch the Bitcoin network in your wallet.`,
    /** wallet is the wallet's name, chain its own name of the BTC network it is set to (Bitcoin Testnet4), net the page's Bitcoin network */
    wrongChain: (wallet: string, chain: string, net: string) =>
      `${wallet} is set to ${chain}, but this page’s network runs on BTC ${net}; switch the Bitcoin network in your wallet to ${net}.`,
    /** The wallet is on an account that is not a Taproot address, which an account is (D-092) */
    notTaproot: 'Your wallet’s account isn’t a Taproot address; switch to a Taproot account in your wallet.',
    /** The wallet's Taproot address is not the standard one of its key (BIP86, no script tree), which an account is (D-092) */
    notBip86: 'Your wallet’s Taproot address isn’t the standard one for its key (BIP86); choose another Taproot account in your wallet.',
    /** A toast: the wallet switched to another account while the page was open, and the page with it; addr is that account's address, shortened */
    switched: (wallet: string) => `${wallet} switched accounts`,
    switchedTo: (addr: string) => `This page now shows ${addr}.`,
    /** The page disconnected from a wallet that switched to an account or a network it cannot use; why follows */
    left: (wallet: string) => `Disconnected from ${wallet}`,
    /** A signature asked of a wallet that had switched to another account than the one the page showed */
    signSwitched: (wallet: string) => `Nothing was signed: ${wallet} is on another account than the one this page showed. Check the details, then sign again.`,
    signSwitchedLeft: (wallet: string) => `Nothing was signed: ${wallet} is on another account than the one this page showed. Connect it again to use that account.`,
  },

  home: {
    eyebrowDemo: 'Wallet · Demo account',
    eyebrow: (name: string) => `Wallet · ${name}`,
    title: 'My wallet',
    viewInExplorer: 'View in explorer',
    send: 'Send',
    showBalances: 'Show balances',
    hideBalances: 'Hide balances',
  },

  /** Banners at the top of the wallet home */
  alert: {
    backlogTitle: 'Settlement backlog at limit; fast paths paused',
    /** rate is the current BTC fee rate */
    backlog: (rate: string) => `Balances already in effect don’t change; if it’s urgent, switch to Path C at the current ${rate}\u00a0sat/vB.`,
    censoredTitle: 'Producers aren’t including your fast-path operations (demo scenario)',
    censored: 'Producers can decline to include them; Path C doesn’t need a producer.',
  },

  balances: {
    ksa: 'Ksana · KSA',
    btc: (net: string) => `${coins.bitcoin} · ${net}`,
    /** at and final are formatted heights */
    loading: (at: string, final: string) => `Fetching older blocks (at #${at}, final boundary #${final}); the BTC-final balance is incomplete for now.`,
    /** "Final 1,234" in the other-assets rows */
    finalShort: 'Final',
    utxoCount: (n: number) => `${n} ${n === 1 ? 'UTXO' : 'UTXOs'}`,
    btcInWallet: (name: string) => `Check your BTC balance in ${name}.`,
    empty: 'No KSA yet: top up with BTC, or have someone send to your address.',
    noIndexerNote: '“BTC final” is then only the node’s word',
    tokens: 'Tokens',
    btcUnconfirmed: (amount: string) => `${amount}\u00a0sats of it unconfirmed`,
    btcReading: 'Reading the BTC balance…',
    ksaReading: 'Reading the KSA balance…',
    btcFailed: 'Could not read the BTC balance just now',
    btcStale: 'Could not read the latest BTC balance just now',
    btcRefresh: 'Refresh the BTC balance',
    emptyFaucet: 'No KSA yet: claim some test KSA, or top up with BTC.',
  },

  /** Balance under both confirmations: BTC-final balance ± changes not yet final = current balance */
  split: {
    allFinal: 'Entire balance is BTC final',
    finalBalance: 'BTC-final balance',
    inflow: 'Incoming, not final yet',
    outflow: 'Outgoing and fees, not final yet',
    total: 'Current balance (available now)',
    unreadAll: 'Not all of it may be BTC final: a contract call that isn’t final yet may have paid into it, by an amount the page can’t read.',
    unreadMore: 'A contract call that isn’t final yet may also have paid into it, by an amount the page can’t read; the BTC-final balance is then lower.',
  },

  inflight: {
    title: 'In progress',
    eyebrow: (n: number) => `Not BTC final yet · ${n}`,
    failed: 'Execution failed',
    resend: 'Switch to Path C',
    skipped: 'Skipped, awaiting re-inclusion',
    stuck: 'Stuck, see details',
    /** eta is a formatted estimate (~3 min); under 1.5 s the page shows format.soon instead */
    eta: (eta: string) => `Final in ${eta}`,
    waitInclusion: 'Waiting for inclusion',
    waitSettlement: 'Waiting for settlement',
  },

  activity: {
    title: 'Activity',
    filter: 'Filter',
    out: 'Sent',
    in: 'Received',
    empty: 'No records',
  },

  utxos: {
    title: 'BTC outputs',
    output: 'Output',
    change: 'Settlement change',
    showSpent: 'Show spent',
    empty: 'No BTC outputs',
    /** section is the title of the "Test funds" section */
    emptyHint: (section: string) => `Get some regtest BTC from “${section}”.`,
    state: {
      available: 'Available',
      unconfirmed: 'Unconfirmed',
      spent: 'Spent',
    },
  },

  /** Node data source: the connected browser wallet */
  info: {
    address: 'Address',
    signing: 'Signing method',
    signingValue: 'BIP322 simple',
    disconnect: 'Disconnect wallet',
  },

  settings: {
    title: 'Incoming confirmation',
    threshold: 'Large-amount threshold',
    save: 'Save',
    saved: 'Saved',
    hint: 'Below the threshold, fast confirmation is enough; at or above it, you’re reminded to wait for BTC final.',
  },

  /** Node source: the BTC side of path C and top-ups (wallet/native.ts) */
  native: {
    noUtxo: 'No usable BTC output',
    unconfirmed: 'Your BTC outputs aren’t confirmed yet: wait for a BTC block to include them, then try again',
    feeRateTooHigh: (rate: string, cap: string) => `A fee rate of ${rate}\u00a0sat/vB is above this page’s limit of ${cap}\u00a0sat/vB: nothing was signed. Use a lower fee rate`,
  },

  faucet: {
    title: 'Test funds',
    /** s is the Ksana block interval in seconds */
    hint: (s: number) => `KSA arrives in ~${s} s; BTC waits for the next BTC block.`,
    claim: 'Claim 5,000\u00a0KSA and 0.1\u00a0BTC',
    requested: 'Requested from the faucet',
    claimHosted: 'Claim test KSA',
    claimed: 'Requested, on its way',
    console: 'regtest console',
  },

  /** The contract playground's card on the wallet home (D-119); it opens in a new tab */
  playground: {
    title: 'Contract playground',
    body: 'Edit, compile and deploy smart contracts in your browser. A token, an NFT collection, an AMM, lending, a multisig and vesting, each with a page of its own, on the public signet.',
    open: 'Open the playground',
  },
};

export default wallet;
