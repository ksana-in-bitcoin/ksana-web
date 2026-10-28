import type { Messages } from '..';

/**
 * Top-up page (pages/wallet/TopUp.tsx): buy KSA with BTC by paying a seller's lock on the exchange contract; the same transaction
 * claims the locked KSA
 */
const topup: Messages['topup'] = {
  title: 'Top up',
  one: 'Buy KSA with BTC: pay the payout address of a seller’s lock, and the same transaction claims the locked KSA.',
  nav: 'Top up',

  lock: {
    section: 'Lock',
    mine: 'Locks for you',
    none: 'No lock for you yet. A seller must first lock KSA for your account on the exchange contract.',
    exchange: 'Exchange contract',
    exchangePlaceholder: '64-character hex contract ID',
    id: 'Lock number',
    load: 'Load',
    loading: 'Loading…',
    notFound: 'Cannot read this lock: wrong contract ID or number, or the contract is not an exchange',
    /** The node did not answer the read, or answered with an error; `why` is the explained error, which says what to do */
    readFailed: (why: string) => `Couldn’t read the lock. ${why}`,
    badExchange: 'The contract ID must be 64 hex characters',
    badId: 'The number must be a non-negative integer',
    seller: 'Seller',
    beneficiary: 'Beneficiary',
    notYours: 'This lock’s beneficiary is not you: paying would credit someone else',
    price: 'Price',
    perSat: (ksa: string) => `${ksa}\u00a0KSA / sat`,
    ksa: 'Locked KSA',
    payTo: 'Payout address',
    expiry: 'Expiry',
    blocksLeft: (n: number, h: string) => `${n} BTC ${n === 1 ? 'block' : 'blocks'} left (height ${h})`,
    expired: (h: string) => `Expired (height ${h})`,
    state: { Open: 'Open', Claimed: 'Claimed', Released: 'Released' },
    claimed: (paid: string, ksa: string) => `Buyer paid ${paid}\u00a0sats and received ${ksa}\u00a0KSA`,
  },

  pay: {
    section: 'Payment',
    /** The payment column before a lock is loaded */
    needLock: 'Load a lock first',
    needLockHint: 'Once a seller locks KSA for you on an exchange contract, they give you the contract ID and the lock number. Enter and load them, then pay the BTC here.',
    amount: 'Amount to pay',
    all: 'All',
    forAll: (sats: string) => `${sats}\u00a0sats buys all of the locked KSA`,
    get: 'You receive',
    partial: 'Paying less buys only the matching KSA; the rest stays locked for you until it is paid for or the seller releases it after expiry',
    over: (sats: string) => `Anything above ${sats}\u00a0sats buys nothing more`,
    positive: 'The amount must be greater than 0',
    tooLate: 'Too close to expiry: the payment may not be included before the seller can release the lock',
    nearExpiry: (n: number) => `Only ${n} BTC ${n === 1 ? 'block' : 'blocks'} until expiry`,
    minerFee: 'Miner fee',
    rate: (rate: string) => `${rate}\u00a0sat/vB`,
    utxo: {
      label: 'BTC outputs',
      source: { btc_rpc: 'from Bitcoin RPC', unisat: 'from the wallet', manual: 'entered manually' },
      available: (sats: string, n: number) => `${sats}\u00a0sats available (${n} ${n === 1 ? 'output' : 'outputs'})`,
      unconfirmed: (sats: string, n: number) => `Not confirmed yet: ${sats}\u00a0sats (${n} ${n === 1 ? 'output' : 'outputs'}), usable once a BTC block includes ${n === 1 ? 'it' : 'them'}`,
      short: (sats: string) => `Not enough BTC: this payment and its miner fee need at least ${sats}\u00a0sats. Pay less, or add BTC to your address`,
      none: 'No spendable output',
      manualLabel: 'Enter outputs manually',
      manualPlaceholder: 'txid:vout:sats, one per line',
      manualHint: 'Use this when neither a Bitcoin RPC nor the wallet’s UTXO interface is connected',
      loading: 'Loading outputs…',
    },
    submit: 'Sign and broadcast',
    submitSim: 'Pay and claim',
    signing: 'Signing…',
    disconnected: 'Connect a wallet first',
    how: 'The wallet signs only the inputs of the BTC transaction; the claim is signed with a one-time key bound to the first input.',
  },

  sent: {
    title: 'Payment broadcast',
    titleSim: 'Paid',
    then: (n: number) => `Forced inclusion after ${n} BTC ${n === 1 ? 'confirmation' : 'confirmations'}, then the KSA is credited to your account`,
    tx: 'BTC transaction',
    claim: 'Claim operation',
    payBy: (h: string) => `Should confirm before BTC height ${h}`,
    manual: 'No broadcast route available. Broadcast this transaction yourself:',
    copyRaw: 'Copy raw transaction',
    ksa: (ksa: string) => `Buys ${ksa}\u00a0KSA`,
    another: 'Top up again',
    back: 'Back to wallet',
  },

  error: {
    failed: (detail: string) => `Top-up failed: ${detail}`,
    rejected: (detail: string) => `The wallet declined to sign: ${detail}`,
  },
};

export default topup;
