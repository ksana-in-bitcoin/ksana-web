import type { Messages } from '..';

/** Traditional Chinese (Taiwan): settlement list page and the status mark for BTC transactions */
const settlements: Messages['settlements'] = {
  eyebrow: '比特幣上的 Ksana',
  title: '結算',
  inMempool: 'BTC 記憶池',

  tabsLabel: '交易類型',
  tab: {
    settlement: '結算交易',
    native: '原生交易 · 路徑 C',
    other: '補發與加速',
  },

  col: {
    block: '快軌區塊',
    bodies: '區塊體',
    headers: '區塊頭',
    data: '資料量',
    user: '使用者',
    forced: '強制收錄',
    btcBlock: 'BTC 區塊',
  },
  waitingConf: '等待確認',
  headersContent: (span: string, n: number) => `${span} 共 ${n} 個區塊頭`,
  cpfpContent: 'CPFP 加速',
  commit: '提交交易',
  /** Before the fee rate of a settlement whose commit transaction's fee the page does not know: the fee shown is the reveal transaction's (D-081) */
  revealOnly: '僅揭示交易',
  empty: '還沒有這類交易',
  /** Node data source: header item, the number of blocks loaded whose BTC transactions the list holds */
  ofLoaded: (n: number) => `來自已載入的 ${n.toLocaleString('en-US')} 個區塊`,
  /** Node data source: none of this type in the blocks loaded (the chain may hold older ones) */
  emptyLoaded: '已載入的區塊裡沒有這類交易',

  status: {
    confs: (n: number) => `${n.toLocaleString('en-US')} 個確認`,
    stuck: '卡在 BTC 記憶池',
    feeBelow: (rate: string, min: string) => `費率 ${rate}\u00a0sat/vB 低於入塊門檻 ${min}\u00a0sat/vB`,
  },
};

export default settlements;
