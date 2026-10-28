import type { Messages } from '..';

/** BTC block page (pages/BtcBlock.tsx) */
const btc: Messages['btc'] = {
  /** Noun used on the "not found" page */
  what: 'BTC block',
  notFoundRpc: 'This height comes before the BTC block Ksana’s genesis block anchors to, so nothing of Ksana is in it: see it on a Bitcoin explorer.',
  notFoundAhead: 'This height is above the BTC tip the page knows: the block is not mined yet, or the page has not caught up with it.',
  notFoundRpcTitle: 'Can’t look up this BTC block here',
  viewOn: (site: string) => `View it on ${site}`,

  eyebrow: (network: string) => `BTC block · ${network}`,
  confs: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'confirmation' : 'confirmations'}`,
  prev: 'Previous',
  next: 'Next',

  txsTitle: (n: number) => `Ksana transactions (${n})`,
  txsHeading: 'Ksana transactions',
  reading: 'Reading the Ksana blocks around it from the node…',
  readFailed: 'Couldn’t read the Ksana blocks around it from the node',
  noKnownTxs: 'No known Ksana transactions',
  noTxs: 'No Ksana transactions',
  col: {
    kind: 'Type',
    for: 'For',
  },

  hash: 'Block hash',
  timeApprox: 'Time (approx.)',
  explorer: 'External explorer',
  confirmations: 'Confirmations',
  /** What the settlements and republishes in it carry (D-077) */
  headers: 'Ksana block headers',
  bodies: 'Ksana block bodies',
  anchored: 'Anchored here',
  anchoredCount: (n: number) => `${n} Ksana ${n === 1 ? 'block' : 'blocks'}`,
};

export default btc;
