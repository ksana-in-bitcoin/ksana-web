import type { Messages } from '..';

/** Settlement list (pages/Settlements.tsx) and the TxStatus mark for BTC transactions */
const settlements: Messages['settlements'] = {
  eyebrow: 'Ksana on Bitcoin',
  title: 'Settlements',
  /** Header label, followed by a transaction count */
  inMempool: 'BTC mempool',

  tabsLabel: 'Transaction type',
  tab: {
    settlement: 'Settlements',
    native: 'Native · Path C',
    other: 'Republish and CPFP',
  },

  col: {
    block: 'Ksana block',
    bodies: 'Bodies',
    headers: 'Headers',
    data: 'Data size',
    user: 'User',
    forced: 'Forced inclusion',
    btcBlock: 'BTC block',
  },
  waitingConf: 'Awaiting confirmation',
  /** Header republish: height range and header count */
  headersContent: (span: string, n: number) => `${span} · ${n} ${n === 1 ? 'header' : 'headers'}`,
  /** Label, followed by a link to the parent transaction being bumped */
  cpfpContent: 'CPFP bump for',
  /** Second line of a settlement row: the commit transaction's txid */
  commit: 'Commit transaction',
  /** Before the fee rate of a settlement whose commit transaction's fee the page does not know: the fee shown is the reveal transaction's (D-081) */
  revealOnly: 'Reveal only',
  empty: 'No transactions of this type yet',
  /** Node data source: header item, the number of blocks loaded whose BTC transactions the list holds */
  ofLoaded: (n: number) => `From the ${n.toLocaleString('en-US')} ${n === 1 ? 'block' : 'blocks'} loaded`,
  /** Node data source: none of this type in the blocks loaded (the chain may hold older ones) */
  emptyLoaded: 'None in the blocks loaded',

  /** Transaction status mark */
  status: {
    confs: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'confirmation' : 'confirmations'}`,
    stuck: 'Stuck in BTC mempool',
    feeBelow: (rate: string, min: string) => `Fee rate ${rate}\u00a0sat/vB is below the ${min}\u00a0sat/vB fee floor`,
  },
};

export default settlements;
