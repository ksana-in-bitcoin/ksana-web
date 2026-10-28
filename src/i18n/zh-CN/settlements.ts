/** Settlement list page (pages/Settlements.tsx) and TxStatus, the status mark of BTC transactions */
export default {
  eyebrow: '比特币上的 Ksana',
  title: '结算',
  /** Header label, followed by the transaction count */
  inMempool: 'BTC 内存池',

  tabsLabel: '交易类型',
  tab: {
    settlement: '结算交易',
    native: '原生交易 · 路径 C',
    other: '补发与加速',
  },

  col: {
    block: '快轨块',
    bodies: '区块体',
    headers: '区块头',
    data: '数据量',
    user: '用户',
    forced: '强制收录',
    btcBlock: 'BTC 区块',
  },
  waitingConf: '等待确认',
  /** Header republish transaction: height range and header count */
  headersContent: (span: string, n: number) => `${span} 共 ${n} 个区块头`,
  /** Label, followed by a link to the parent transaction being bumped */
  cpfpContent: 'CPFP 加速',
  /** Second line of a settlement row: the commit transaction's txid */
  commit: '提交交易',
  /** Before the fee rate of a settlement whose commit transaction's fee the page does not know: the fee shown is the reveal transaction's (D-081) */
  revealOnly: '仅揭示交易',
  empty: '还没有这类交易',
  /** Node data source: header item, the number of blocks loaded whose BTC transactions the list holds */
  ofLoaded: (n: number) => `来自已加载的 ${n.toLocaleString('en-US')} 块`,
  /** Node data source: none of this type in the blocks loaded (the chain may hold older ones) */
  emptyLoaded: '已加载的块里没有这类交易',

  /** Transaction status mark */
  status: {
    confs: (n: number) => `${n.toLocaleString('en-US')} 个确认`,
    stuck: '卡在 BTC 内存池',
    feeBelow: (rate: string, min: string) => `费率 ${rate}\u00a0sat/vB 低于入块门槛 ${min}\u00a0sat/vB`,
  },
};
