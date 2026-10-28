import type { Messages } from '..';

/** Send page (pages/wallet/Send.tsx): recipient and amount, how to submit, review and sign, progress after submitting */
const send: Messages['send'] = {
  eyebrow: 'Wallet',
  title: 'Send',
  /** Screen-reader label of the step number */
  step: (n: number, total: number) => `Step ${n}\u00a0of\u00a0${total}`,

  /** Step 1: recipient (a Taproot address, or the same account as 64 hex characters) */
  to: {
    section: 'Recipient and amount',
    label: 'Recipient',
    /** Short enough to show whole in the field on a phone; the errors give the hex form's length */
    placeholder: 'Taproot address or hex account',
    hint: 'After pasting, check the first and last 8 characters and the account seal',
    /** Followed by the first and last 8 characters of the address */
    headTail: 'First and last 8:',
    /** When hex was entered, the matching address */
    asAddress: 'Address',
    notTaproot: 'Only Taproot addresses (bc1p / tb1p / bcrt1p) are accepted',
    /** net is the current Bitcoin network */
    wrongNetwork: (net: string) => `This address isn’t on the current network (${net})`,
    badAddress: 'Invalid address; a character may be wrong',
    badChars: 'Only 0–9 and a–f are allowed',
    badLength: (n: number) => `Needs 64 characters; this has ${n}`,
    notOnCurve: 'Not a valid account; a character may be wrong',
    self: 'The recipient is your own account',
    noRecord: 'This account has no on-chain record; double-check the first and last characters',
  },

  recent: {
    title: 'Recently sent to',
    sentBefore: (n: number, ago: string) => (n === 1 ? `Sent here once before, ${ago}` : `Sent here ${n} times before, most recently ${ago}`),
  },

  /** Step 1: amount */
  amount: {
    max: 'Max',
    available: 'Available',
    integer: (symbol: string) => `${symbol} must be a whole number`,
    decimals: (symbol: string, n: number) => `${symbol} allows at most ${n} decimal ${n === 1 ? 'place' : 'places'}`,
    notNumber: 'Amount must be written in digits, such as 12.5',
    positive: 'Amount must be greater than 0',
    /** amount is formatted */
    overBalance: (amount: string, symbol: string) => `Exceeds your available balance of ${amount}\u00a0${symbol}`,
    withFee: 'Balance can’t cover both the amount and the sponsor fee',
  },

  /** Step 2: how to submit. Path B by default; Path C sits under "More ways to submit" (each card's line comes from status.pathDesc) */
  path: {
    section: 'How to submit',
    more: 'More ways to submit',
    tagDefault: 'Default',
    tagRecommended: 'Recommended',
    tagCensorship: 'Censorship-resistant',
    speedFast: (s: number) => `Takes effect in ~${s} s`,
    speedNative: (n: number) => `Forced inclusion after ${n} BTC ${n === 1 ? 'confirmation' : 'confirmations'}`,
    paused: 'Paused',
    mayNotInclude: 'May not be included',
    // Why a path is unavailable, and warnings
    backlog: 'Settlement backlog; nothing is included until it clears',
    censored: 'Producers haven’t included your operations lately',
    sameNonce: 'Resending with the same nonce requires Path C',
    ksaShort: 'Not enough KSA for the sponsor fee',
    noOutputC: 'No usable BTC output for the miner fee',
    nativeGas: (max: string) => `Path C max_gas can’t exceed ${max}`,
    /** An earlier path C op of the account still waits for its BTC confirmations: a second one could be confirmed first and fail */
    nativeWaiting: (nonce: string) => `Your Path C operation (nonce ${nonce}) is still waiting for its BTC confirmations; Path C opens again once it is included`,
    feeSpike: 'BTC fee rates are high',
  },


  /** Path B: three sponsor fee levels */
  sponsor: {
    label: 'Sponsor fee',
    suggestedTag: 'Suggested value; change it under Advanced',
    customTag: 'Custom amount',
    custom: 'Sponsor fee',
    // The suggestion's basis: the simulator's median, a node's fee rate applied to this op's cost, or a node's minimum (its rate is 0)
    hint: (amount: string) => `Leave empty for the suggested ${amount}\u00a0KSA: the median path-B fee over the last 20 blocks`,
    hintRate: (amount: string) => `Leave empty for the suggested ${amount}\u00a0KSA: the node’s fee rate from the last 20 blocks, applied to this transfer`,
    hintMin: (amount: string) => `Leave empty for the suggested ${amount}\u00a0KSA, the node’s minimum fee`,
    invalid: 'The sponsor fee must be a KSA amount greater than 0',
    belowMin: 'Below a producer’s minimum, you have to wait for another producer to include it',
  },

  /** Path C: BTC market fee rate */
  native: {
    feeRate: 'Fee rate',
    feeRateHint: (rate: string) => `Defaults to the node’s settlement fee rate, ${rate}\u00a0sat/vB`,
    feeRateRange: (cap: string) => `Enter a fee rate from 1\u00a0to\u00a0${cap}\u00a0sat/vB`,
    utxos: 'BTC outputs',
    loading: 'Reading the outputs at your wallet address…',
    source: { btc_rpc: 'from Bitcoin RPC', unisat: 'from the wallet', manual: 'entered by hand' },
    available: (sats: string, n: number) => `${sats}\u00a0sats available (${n} ${n === 1 ? 'output' : 'outputs'})`,
    unconfirmed: (sats: string, n: number) => `Not confirmed yet: ${sats}\u00a0sats (${n} ${n === 1 ? 'output' : 'outputs'}), usable once a BTC block includes ${n === 1 ? 'it' : 'them'}`,
    need: (sats: string) => `At least ${sats}\u00a0sats needed`,
    short: (sats: string) => `Not enough BTC outputs; at least ${sats}\u00a0sats needed`,
    manualNeeded: 'BTC outputs must be entered by hand',
    loadFailed: (detail: string) => `Couldn’t read BTC outputs: ${detail}`,
    manualLabel: 'Enter outputs by hand',
    manualPlaceholder: 'txid:vout:sats, one per line',
    manualHint: 'For when neither Bitcoin RPC nor the wallet’s UTXO API is available',
  },

  nativeRates: (rate: string, min: string) => `BTC fee rate ${rate}\u00a0sat/vB · fee floor ${min}\u00a0sat/vB`,

  advanced: {
    title: 'Advanced',
    /** n: the gas a transfer uses, formatted */
    gasHint: (n: string) => `If exceeded, execution fails and the fee is still charged; a transfer uses ${n}`,
    gasRange: (min: string, max: string) => `max_gas must be between ${min}\u00a0and\u00a0${max}`,
  },

  /** Resending via Path C with the same nonce */
  nonce: {
    title: (nonce: string) => `Resending via Path C with the same nonce (${nonce})`,
    race: 'Only the one included first takes effect; if the original wins, this one’s miner fee isn’t refunded',
    fixed: (nonce: string) => `${nonce} (fixed)`,
  },

  /** Summary panel and why the button is disabled */
  summary: {
    title: 'Summary',
    needTo: 'Enter a recipient first',
    needAmount: 'Then enter an amount',
    readingBalance: 'Reading your balance…',
    badFee: 'Invalid sponsor fee',
    badGas: 'max_gas out of range',
    badRate: 'Fee rate out of range',
    unavailable: (path: string, reason: string) => `Path ${path} unavailable: ${reason}`,
    needUtxo: 'Provide BTC outputs that cover the miner fee first',
    waitUtxo: 'Wait for a BTC block to confirm your outputs',
  },

  /** Review and sign */
  review: {
    title: 'Review and sign',
    edit: 'Back to edit',
    signing: 'Signing…',
    submit: 'Sign and submit',
    /** Transfer <amount> to <recipient> */
    to: 'to',
    signedBy: (wallet: string) => `Signed with ${wallet}`,
    signedLocal: 'Signed with local dev key',
    /** Follows the sponsor fee amount */
    lockB: 'Deducted from your KSA balance before execution',
    /** Followed by the miner fee and fee rate */
    lockC: 'Broadcasts a BTC transaction; change returns to your address',
    warnings: 'Warnings',
    large: (threshold: string, eta: string) => `Reaches the large-amount threshold (${threshold}\u00a0KSA); BTC final takes ${eta}`,
    /** A path B op signed while the account's path C op waits for BTC takes the nonce after it */
    afterNative: (nonce: string) => `Takes the nonce after your Path C operation (nonce ${nonce}), which is still waiting for its BTC confirmations; this one is included right after it`,
    network: (name: string, id: string) => `Network ${name} (chain_id ${id})`,
    raw: 'The VmOp you’re signing',
    minUnit: 'base units',
    sigHash: 'Signature hash',
    /** Path C: on the review page there is no carrying transaction yet, so the sighash can't be given in advance */
    sigHashNative: 'Computed when signing, from the first input of the carrying transaction (D-086); not known yet',
  },

  /** Submit errors: the result first; wallet and node messages are appended as-is (not translated) */
  error: {
    transferOnly: 'Only transfers are supported',
    disconnected: 'Wallet disconnected; please reconnect',
    walletDeclined: (detail: string) => `Wallet didn’t sign: ${detail}`,
    /** By node error code (core/docs/RPC.md) */
    rpc: {
      invalid: 'Rejected by node: invalid operation',
      policy: 'Rejected by node: doesn’t meet this node’s policy',
      params: 'Rejected by node: malformed request',
      internal: 'Node internal error',
    },
    rpcCode: (code: string) => `Node returned error ${code}`,
    retrySuggested: 'Retry with the suggested fee',
    /** Explanation + the node's own message */
    node: (what: string, detail: string) => `${what} (${detail})`,
  },

  toast: {
    submitted: 'Signed and submitted',
    broadcast: 'Signed and broadcast to BTC',
  },

  /** After submitting: titles mostly reuse status.stage; a line only when something went wrong */
  sent: {
    broadcastNative: 'Broadcast to BTC',
    failedFoot: 'The fee was still charged; the transfer didn’t go through',
    droppedFoot: 'Not included, and no fee was charged',
    failedFootB: (fee: string, amount: string) => `The sponsor fee of ${fee} was charged; the transfer of ${amount} didn’t go through, so that amount is still in your balance`,
    failedFootC: (amount: string) => `The miner fee went to BTC miners and isn’t refunded; the transfer of ${amount} didn’t go through, so that amount is still in your balance`,
    againWait: 'Wait for this one’s fast confirmation before sending another',
    latency: (d: string) => `Fast-confirmed in ${d}`,
    waited: 'Producers can decline to include it; Path C doesn’t need a producer',
    resendC: 'Resubmit via Path C',
    next: 'What’s next',
    again: 'Send another',
    backToWallet: 'Back to wallet',
    tx: 'BTC transaction',
    manualBroadcast: 'No way to broadcast from here; broadcast this transaction yourself:',
    copyRaw: 'Copy raw transaction',
  },
};

export default send;
