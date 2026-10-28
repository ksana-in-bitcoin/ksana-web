import type { Messages } from '..';

/** Traditional Chinese (Taiwan): BTC block page */
const btc: Messages['btc'] = {
  what: 'BTC 區塊',
  notFoundRpc: '這個高度早於 Ksana 創世區塊所錨定的 BTC 區塊，其中沒有 Ksana 的內容：請用比特幣區塊瀏覽器查看。',
  notFoundAhead: '這個高度高於本頁所知的 BTC 鏈頂：這個區塊還沒挖出，或本頁還沒同步到它。',
  notFoundRpcTitle: '這裡查不到這個 BTC 區塊',
  viewOn: (site: string) => `在 ${site} 查看`,

  eyebrow: (network: string) => `BTC 區塊 · ${network}`,
  confs: (n: number) => `${n.toLocaleString('en-US')} 個確認`,
  prev: '上一區塊',
  next: '下一區塊',

  txsTitle: (n: number) => `Ksana 相關交易（${n}）`,
  txsHeading: 'Ksana 相關交易',
  reading: '正在從節點讀取它前後的快軌區塊…',
  readFailed: '無法從節點讀取它前後的快軌區塊',
  noKnownTxs: '沒有已知的 Ksana 交易',
  noTxs: '沒有 Ksana 交易',
  col: {
    kind: '類型',
    for: '對應',
  },

  hash: '區塊雜湊',
  timeApprox: '時間（約）',
  explorer: '外部區塊瀏覽器',
  confirmations: '確認數',
  headers: '快軌區塊頭',
  bodies: '快軌區塊體',
  anchored: '錨定到此區塊',
  anchoredCount: (n: number) => `${n} 個快軌區塊`,
};

export default btc;
