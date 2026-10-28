import type { Messages } from '..';

/** Japanese: shared components */
const ui: Messages['ui'] = {
  copyWhat: (label: string, text: string) => `${label}：${text}`,
  accountTitle: (address: string) => `アカウント ${address}`,
  accountHex: (id: string) => `16 進数 ${id}`,
  contractTitle: (id: string) => `コントラクト ${id}`,
  sideBlockSr: '（並行ブロック）',
  goneSr: '（この一覧から外れました）',
  issuedBy: '発行元',
  lookalike: (coin: string) => `${coin} ではありません：名前が ${coin} に似たコントラクトの資産です`,

  emptyBlock: '空ブロック',
  entryCounts: (b: number, c: number) => `代払い ${b} · 強制取り込み ${c}`,
  entryCountsOther: (n: number) => ` · ロック解除 ${n}`,
  entryUnlock: 'ロック解除',
  mergedCount: (n: number) => `並行ブロック ${n} 個をマージ`,
  btcAnchor: 'BTC アンカー',
  blockList: 'ブロック一覧',
  opList: 'オペレーション一覧',
  received: '受け取り',
  arrowTo: '宛先',
  arrowFrom: '送金元',
  sender: '送信元',

  minerFee: 'マイナー手数料',
  minerFeeHint: 'BTC マイナーへの支払い',
  feeRateCapped: (rate: string, cap: string) => `ノードの提案は ${rate}\u00a0sat/vB ですが、このページでは最大 ${cap}\u00a0sat/vB です`,
  skipped: 'スキップ',
  awaitingMerge: 'マージ待ち',
  awaitingMergeHint: 'マージ後に実行',
  ok: '成功',

  satsUnknown: 'ノードはこの金額を提供していません',
  entryKind: {
    Forced: '強制取り込み',
    Sponsored: '代払い',
    Unlock: 'ロック解除',
  },

  progress: 'オペレーションの進捗',
  stuck: '停滞',

  search: '検索',
  searchPlaceholder: '高さ、ハッシュ、op_id、アドレス',
  searchResults: '検索結果',
  searchNone: '一致する結果はありません',

  lookupWhat: { block: 'ブロック', op: 'オペレーション', account: 'アカウント', asset: '資産', contract: 'コントラクト', btcTx: 'BTC トランザクション' },
  lookupErrorEyebrow: '照会エラー',
  /** A Japanese title breaks only at its spaces and zero-width spaces (`.page-title`): after the particle, not inside the verb as on a phone */
  lookupError: (what: string) => `${what}を\u200b取得できません`,
  lookupLoadingEyebrow: '照会中',
  lookupLoading: (what: string) => `${what}を\u200b照会中…`,
  /** Under a lookup that failed while the page says the node is disconnected: it is read again once the node answers */
  lookupAgain: 'ノードが応答すると、このページは改めて照会します。',
  doc: {
    block: (height: string) => `ブロック #${height}`,
    btcBlock: (height: string) => `BTC ブロック #${height}`,
    btcTx: (txid: string) => `BTC トランザクション ${txid}`,
    op: (id: string) => `オペレーション ${id}`,
    account: (address: string) => `アカウント ${address}`,
    contract: (name: string) => `コントラクト ${name}`,
    asset: (symbol: string) => `資産 ${symbol}`,
  },
  history: {
    reading: (h: string) => `ブロックを遡って取得中（#${h} まで）…`,
    from: (h: string) => `#${h} 以降のブロックにあるオペレーションのみ表示しています。`,
    earlier: 'さらに前のブロックを取得',
    listing: 'ノードからオペレーションを取得中…',
    listed: (n: string) => `最新 ${n} 件のオペレーションまで確認しました。`,
    older: 'さらに前のオペレーションを確認',
    showOlder: 'さらに前のオペレーションを表示',
    failed: (message: string) => `ノードからオペレーションを取得できませんでした：${message}`,
    retry: '再試行',
  },
};

export default ui;
