import type { Messages } from '..';

/** Traditional Chinese (Taiwan): block list page */
const blocks: Messages['blocks'] = {
  eyebrow: '快軌',
  title: '區塊',

  tip: (h: string) => `鏈頂 #${h}`,
  avgInterval: (d: string, n: number) => `平均出塊 ${d}（近 ${n} 個區塊）`,
  empty: (n: number) => `空區塊 ${n.toLocaleString('en-US')}`,
  emptyOfLoaded: (n: number, loaded: number) => `空區塊 ${n.toLocaleString('en-US')}（已載入的 ${loaded.toLocaleString('en-US')} 個區塊中）`,
  side: (n: number, pct: string) => `平行塊 ${n.toLocaleString('en-US')}（${pct}%）`,
  sideOfLoaded: (n: number, loaded: number) => `平行塊 ${n.toLocaleString('en-US')}（由已載入的 ${loaded.toLocaleString('en-US')} 個區塊合併）`,
  sideHint: '同一高度的平行塊會被下一個主鏈塊合併，不會作廢。',

  jump: '跳到高度',
  view: '區塊檢視',
  main: '主鏈',
  sideTab: '平行塊',
  hideEmpty: '隱藏空區塊',
  fetching: (n: number) => `正在向節點取得 ${n.toLocaleString('en-US')} 個更早的區塊…`,
  noSide: '還沒有平行塊',
  noBlocks: '沒有區塊',

  pagination: '分頁',
  newer: '較新',
  older: '較舊',
  page: (p: number, total: number) => `第 ${p} / ${total} 頁`,
};

export default blocks;
