import type { Messages } from '..';

/** Japanese: settlement list page and the status mark for BTC transactions */
const settlements: Messages['settlements'] = {
  eyebrow: 'ビットコイン上の Ksana',
  title: '決済',
  inMempool: 'BTC メンプール',

  tabsLabel: 'トランザクションの種類',
  tab: {
    settlement: '決済トランザクション',
    native: 'パス C・ネイティブ',
    other: '再送・加速',
  },

  col: {
    block: 'Ksana ブロック',
    bodies: 'ブロック本体',
    headers: 'ヘッダー',
    data: 'データ量',
    user: 'ユーザー',
    forced: '強制取り込み',
    btcBlock: 'BTC ブロック',
  },
  waitingConf: '承認待ち',
  headersContent: (span: string, n: number) => `${span}（ヘッダー計 ${n} 個）`,
  cpfpContent: 'CPFP で加速',
  commit: 'コミットトランザクション',
  /** Before the fee rate of a settlement whose commit transaction's fee the page does not know: the fee shown is the reveal transaction's (D-081) */
  revealOnly: 'リビールのみ',
  empty: 'この種類のトランザクションはまだありません',
  /** Node data source: header item, the number of blocks loaded whose BTC transactions the list holds */
  ofLoaded: (n: number) => `読み込み済み ${n.toLocaleString('en-US')} ブロックから`,
  /** Node data source: none of this type in the blocks loaded (the chain may hold older ones) */
  emptyLoaded: '読み込み済みのブロックには、この種類のトランザクションはありません',

  status: {
    confs: (n: number) => `${n.toLocaleString('en-US')} 承認`,
    stuck: 'BTC メンプールで停滞',
    feeBelow: (rate: string, min: string) => `手数料率 ${rate}\u00a0sat/vB がブロック入りの下限 ${min}\u00a0sat/vB を下回っています`,
  },
};

export default settlements;
