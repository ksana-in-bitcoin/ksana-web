/** BTC block page (pages/BtcBlock.tsx) */
export default {
  /** Noun used on the "not found" page */
  what: 'BTC 区块',
  /** A BTC height before the one the genesis block anchors to, where nothing of Ksana can be */
  notFoundRpc: '这个高度早于 Ksana 创世块所锚定的 BTC 块，其中没有 Ksana 的内容：请用比特币浏览器查看。',
  /** A BTC height above the BTC tip the page knows */
  notFoundAhead: '这个高度高于本页所知的 BTC 链顶：这个块还没挖出，或本页还没同步到它。',
  /** Title when the node data source does not know the block: it may well exist on BTC */
  notFoundRpcTitle: '这里查不到这个 BTC 区块',
  viewOn: (site: string) => `在 ${site} 查看`,

  eyebrow: (network: string) => `BTC 区块 · ${network}`,
  confs: (n: number) => `${n.toLocaleString('en-US')} 个确认`,
  prev: '上一块',
  next: '下一块',

  txsTitle: (n: number) => `Ksana 相关交易（${n}）`,
  /** The section's title while the blocks around it are read from the node */
  txsHeading: 'Ksana 相关交易',
  reading: '正在从节点读取它前后的快轨区块…',
  /** The node's message follows, with a Retry button */
  readFailed: '没能从节点读取它前后的快轨区块',
  noKnownTxs: '没有已知的 Ksana 交易',
  noTxs: '没有 Ksana 交易',
  col: {
    kind: '类型',
    for: '对应',
  },

  hash: '区块哈希',
  timeApprox: '时间（约）',
  explorer: '外部浏览器',
  confirmations: '确认',
  /** What the settlements and republishes in it carry (D-077) */
  headers: '快轨区块头',
  bodies: '快轨区块体',
  anchored: '锚定到此块',
  anchoredCount: (n: number) => `${n} 个快轨块`,
};
