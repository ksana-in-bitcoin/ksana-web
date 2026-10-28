import type { Messages } from '..';

/** Japanese: block list page */
const blocks: Messages['blocks'] = {
  eyebrow: '高速レーン',
  title: 'ブロック',

  tip: (h: string) => `最新 #${h}`,
  avgInterval: (d: string, n: number) => `平均ブロック間隔 ${d}（直近 ${n} ブロック）`,
  empty: (n: number) => `空ブロック ${n.toLocaleString('en-US')}`,
  emptyOfLoaded: (n: number, loaded: number) => `空ブロック ${n.toLocaleString('en-US')}（読み込み済み ${loaded.toLocaleString('en-US')} ブロック中）`,
  side: (n: number, pct: string) => `並行ブロック ${n.toLocaleString('en-US')}（${pct}%）`,
  sideOfLoaded: (n: number, loaded: number) => `並行ブロック ${n.toLocaleString('en-US')}（読み込み済み ${loaded.toLocaleString('en-US')} ブロックにマージ済み）`,
  sideHint: '同じ高さの並行ブロックは次のチェーンブロックにマージされ、破棄されません。',

  jump: '高さへ移動',
  view: 'ブロックの表示',
  main: 'メインチェーン',
  sideTab: '並行ブロック',
  hideEmpty: '空ブロックを隠す',
  fetching: (n: number) => `ノードから過去のブロックを ${n.toLocaleString('en-US')} 個取得中…`,
  noSide: '並行ブロックはまだありません',
  noBlocks: 'ブロックがありません',

  pagination: 'ページ送り',
  newer: '新しい',
  older: '古い',
  page: (p: number, total: number) => `${p} / ${total} ページ`,
};

export default blocks;
