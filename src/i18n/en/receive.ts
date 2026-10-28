import type { Messages } from '..';

/** Receive page (pages/wallet/Receive.tsx) */
const receive: Messages['receive'] = {
  title: 'Receive',
  /** One line in the header: the account is the Taproot address, and one address receives everything */
  one: 'This one address receives KSA, contract assets and BTC.',
  card: 'Receiving details',
  qr: 'Address QR code',
  /** net is the Bitcoin network (regtest, signet) */
  address: (net: string) => `Address · Taproot · ${net}`,
  hex: 'Account (hex) · for contract arguments',
  checkEdges: 'Check the first and last 8: ',
  copyAddress: 'Copy address',
  copyHex: 'Copy hex account',
  btcUse: 'Received BTC can also pay Path C miner fees.',

  rules: {
    title: 'Which confirmation counts',
    /** amount is the formatted threshold */
    below: (amount: string) => `Below ${amount}\u00a0KSA: fast confirmation is enough`,
    above: 'At or above the threshold: wait for BTC final',
    /** net is devnet or signet, eta a formatted estimate (~2 min) */
    aboveEta: (net: string, eta: string) => `${net} ${eta}, mainnet ~110 min`,
    edit: 'Change threshold',
  },
  faucet: 'Claim from the devnet faucet',
  /** net is the network of the hosted page (signet) */
  faucetHosted: (net: string) => `Get test KSA from the ${net} faucet`,
  faucetFailed: 'The faucet did not send KSA',
  /** Why the hosted faucet sent nothing (core/signet/services/faucet.mjs); wait is a duration ("22 h 35 min") */
  faucetWhy: {
    claimed: (wait: string) => `This account already received its test KSA; it can ask again in ${wait}`,
    tooOften: (wait: string) => `Too many requests from this connection; try again in ${wait}`,
    busy: (wait: string) => `The faucet is busy; try again in ${wait}`,
    today: 'This connection has asked for test KSA too often today; try again later',
    empty: 'The faucet has run out of test KSA; try again later',
    down: 'The faucet is not working right now; try again later',
    noAnswer: 'The faucet did not answer; check the connection and try again',
  },
  back: 'Back to wallet',

  recent: {
    title: 'Recently received',
    empty: 'No transfers received yet',
    // Below an empty list: with a faucet (the simulation's, or a hosted signet's) / without one
    emptyFaucet: 'Share your address, or claim from the faucet.',
    emptyShare: 'Share your address with the sender.',
    from: (who: string) => `From ${who}`,
    big: 'Large · awaiting BTC final',
    final: 'Safe to count as received',
    belowThreshold: 'Counts as received under your threshold',
  },
};

export default receive;
