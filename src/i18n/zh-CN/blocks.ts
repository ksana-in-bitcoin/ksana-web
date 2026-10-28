/** Block list page (pages/Blocks.tsx) */
export default {
  eyebrow: '快轨',
  title: '区块',

  /** Header stats; h is a formatted height, d a formatted duration */
  tip: (h: string) => `链顶 #${h}`,
  avgInterval: (d: string, n: number) => `平均出块 ${d}（近 ${n} 块）`,
  empty: (n: number) => `空块 ${n.toLocaleString('en-US')}`,
  emptyOfLoaded: (n: number, loaded: number) => `空块 ${n.toLocaleString('en-US')}（已加载的 ${loaded.toLocaleString('en-US')} 块中）`,
  /** pct is a formatted percentage (e.g. "2.1") */
  side: (n: number, pct: string) => `平行块 ${n.toLocaleString('en-US')}（${pct}%）`,
  /** The node data source: the parallel blocks the loaded blocks merged, which is all the page knows of */
  sideOfLoaded: (n: number, loaded: number) => `平行块 ${n.toLocaleString('en-US')}（由已加载的 ${loaded.toLocaleString('en-US')} 块合并）`,
  sideHint: '同一高度的平行块会被下一个主链块合并，不作废。',

  jump: '跳到高度',
  view: '区块视图',
  main: '主链',
  sideTab: '平行块',
  hideEmpty: '隐藏空块',
  fetching: (n: number) => `正在向节点取 ${n.toLocaleString('en-US')} 个更早的区块…`,
  noSide: '还没有平行块',
  noBlocks: '没有区块',

  pagination: '分页',
  newer: '较新',
  older: '较旧',
  page: (p: number, total: number) => `第 ${p} / ${total} 页`,
};
