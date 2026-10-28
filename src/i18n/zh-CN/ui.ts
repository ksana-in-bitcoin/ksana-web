import { latinGap } from '../spacing';

/** Shared components: refs, lists, amounts, entry results, progress tracker, search box, on-demand lookups */
export default {
  /** Screen-reader label of a copy button: Copy: <text> */
  copyWhat: (label: string, text: string) => `${label}：${text}`,
  /** Hover text of an account ref: the first line is the address, the second the same account in hex */
  accountTitle: (address: string) => `账户 ${address}`,
  accountHex: (id: string) => `十六进制 ${id}`,
  contractTitle: (id: string) => `合约 ${id}`,
  sideBlockSr: '（平行块）',
  /** Screen-reader note on a row a list held while the keyboard is in it keeps, though the list no longer has it (drawn grey) */
  goneSr: '（已不在此列表中）',
  /** A contract's asset: the contract that issued it, before its ref; the warning beside one named like a native coin (the review of M33) */
  issuedBy: '发行方',
  lookalike: (coin: string) => `不是 ${coin}：这是合约发行、名字与 ${coin} 相近的资产`,

  emptyBlock: '空块',
  entryCounts: (b: number, c: number) => `代付 ${b} · 强制收录 ${c}`,
  entryCountsOther: (n: number) => ` · 解锁 ${n}`,
  /** Beside the entry counts of a block holding its unlock entry (at most one a block) */
  entryUnlock: '解锁',
  mergedCount: (n: number) => `合并了 ${n} 个平行块`,
  btcAnchor: 'BTC 锚定',
  blockList: '区块列表',
  opList: '操作列表',
  received: '收到',
  arrowTo: '到',
  arrowFrom: '来自',
  sender: '发起账户',

  minerFee: '矿工费',
  minerFeeHint: '付给 BTC 矿工',
  feeRateCapped: (rate: string, cap: string) => `节点建议 ${rate}\u00a0sat/vB，本页最多用 ${cap}\u00a0sat/vB`,
  skipped: '跳过',
  awaitingMerge: '待合并',
  awaitingMergeHint: '合并后执行',
  ok: '成功',

  satsUnknown: '节点不提供这个金额',
  entryKind: {
    Forced: '强制收录',
    Sponsored: '代付',
    Unlock: '解锁',
  },

  progress: '操作进度',
  stuck: '卡住',

  search: '搜索',
  searchPlaceholder: '高度、哈希、op_id 或地址',
  searchResults: '搜索结果',
  searchNone: '没有匹配的结果',

  lookupWhat: { block: '区块', op: '操作', account: '账户', asset: '资产', contract: '合约', btcTx: 'BTC 交易' },
  lookupErrorEyebrow: '查询出错',
  lookupError: (what: string) => `取不到这个${latinGap(what, 'before')}`,
  lookupLoadingEyebrow: '查询中',
  lookupLoading: (what: string) => `正在查询${latinGap(what, 'before')}…`,
  /** Under a lookup that failed while the page says the node is disconnected: it is read again once the node answers */
  lookupAgain: '节点一应答，本页就重新查询。',
  /** The browser's title of a page whose own title is only a number or a hash, or is not plain text: the kind of page with its name ("Block #5") */
  doc: {
    block: (height: string) => `区块 #${height}`,
    btcBlock: (height: string) => `BTC 区块 #${height}`,
    btcTx: (txid: string) => `BTC 交易 ${txid}`,
    op: (id: string) => `操作 ${id}`,
    account: (address: string) => `账户 ${address}`,
    contract: (name: string) => `合约 ${name}`,
    asset: (symbol: string) => `资产 ${symbol}`,
  },
  /**
   * Above a list of operations on the node data source: how far the node's listing reaches (D-111; n is a formatted count of
   * operations), or from a node without it how far down the chain has been read (D-110; h is a formatted height)
   */
  history: {
    reading: (h: string) => `正在加载更早的区块（已到 #${h}）…`,
    from: (h: string) => `只列出 #${h} 及之后区块里的操作。`,
    earlier: '加载更早的区块',
    listing: '正在从节点获取操作…',
    listed: (n: string) => `已查看最近 ${n} 条操作。`,
    older: '查看更早的操作',
    /** Below a full list: shows older rows, as many again as it showed at first */
    showOlder: '显示更早的操作',
    failed: (message: string) => `无法从节点获取操作：${message}`,
    retry: '重试',
  },
};
