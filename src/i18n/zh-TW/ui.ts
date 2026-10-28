import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Traditional Chinese (Taiwan): shared components */
const ui: Messages['ui'] = {
  copyWhat: (label: string, text: string) => `${label}：${text}`,
  accountTitle: (address: string) => `帳戶 ${address}`,
  accountHex: (id: string) => `十六進位 ${id}`,
  contractTitle: (id: string) => `合約 ${id}`,
  sideBlockSr: '（平行塊）',
  goneSr: '（已不在此列表中）',
  issuedBy: '發行方',
  lookalike: (coin: string) => `不是 ${coin}：這是合約發行、名字與 ${coin} 相近的資產`,

  emptyBlock: '空區塊',
  entryCounts: (b: number, c: number) => `代付 ${b} · 強制收錄 ${c}`,
  entryCountsOther: (n: number) => ` · 解鎖 ${n}`,
  entryUnlock: '解鎖',
  mergedCount: (n: number) => `合併了 ${n} 個平行塊`,
  btcAnchor: 'BTC 錨定',
  blockList: '區塊列表',
  opList: '操作列表',
  received: '收到',
  arrowTo: '到',
  arrowFrom: '來自',
  sender: '發起帳戶',

  minerFee: '礦工費',
  minerFeeHint: '付給 BTC 礦工',
  feeRateCapped: (rate: string, cap: string) => `節點建議 ${rate}\u00a0sat/vB，本頁最多用 ${cap}\u00a0sat/vB`,
  skipped: '跳過',
  awaitingMerge: '待合併',
  awaitingMergeHint: '合併後執行',
  ok: '成功',

  satsUnknown: '節點不提供這個金額',
  entryKind: {
    Forced: '強制收錄',
    Sponsored: '代付',
    Unlock: '解鎖',
  },

  progress: '操作進度',
  stuck: '卡住',

  search: '搜尋',
  searchPlaceholder: '高度、雜湊、op_id 或地址',
  searchResults: '搜尋結果',
  searchNone: '沒有符合的結果',

  lookupWhat: { block: '區塊', op: '操作', account: '帳戶', asset: '資產', contract: '合約', btcTx: 'BTC 交易' },
  lookupErrorEyebrow: '查詢出錯',
  lookupError: (what: string) => `無法取得這個${latinGap(what, 'before')}`,
  lookupLoadingEyebrow: '查詢中',
  lookupLoading: (what: string) => `正在查詢${latinGap(what, 'before')}…`,
  /** Under a lookup that failed while the page says the node is disconnected: it is read again once the node answers */
  lookupAgain: '節點一回應，本頁就重新查詢。',
  doc: {
    block: (height: string) => `區塊 #${height}`,
    btcBlock: (height: string) => `BTC 區塊 #${height}`,
    btcTx: (txid: string) => `BTC 交易 ${txid}`,
    op: (id: string) => `操作 ${id}`,
    account: (address: string) => `帳戶 ${address}`,
    contract: (name: string) => `合約 ${name}`,
    asset: (symbol: string) => `資產 ${symbol}`,
  },
  history: {
    reading: (h: string) => `正在載入更早的區塊（已到 #${h}）…`,
    from: (h: string) => `只列出 #${h} 及之後區塊裡的操作。`,
    earlier: '載入更早的區塊',
    listing: '正在從節點取得操作…',
    listed: (n: string) => `已查看最近 ${n} 筆操作。`,
    older: '查看更早的操作',
    showOlder: '顯示更早的操作',
    failed: (message: string) => `無法從節點取得操作：${message}`,
    retry: '重試',
  },
};

export default ui;
