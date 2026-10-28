import type { Messages } from '..';

/** Traditional Chinese (Taiwan): node data source lookup results, the indexer and unknown asset names */
const rpc: Messages['rpc'] = {
  pending: '這筆操作還在節點的條目池裡，收錄後會自動顯示詳情。',
  missing: {
    block: '節點上沒有這個區塊',
    op: (confs: number) =>
      `節點不認得這筆操作。路徑 C 的操作要等它的 BTC 交易有 ${confs} 個確認、並被一個區塊收錄後，節點才會認得；其他操作可能從未收到，也可能已被移出條目池。本頁會自動再查。`,
    account: '查不到這個帳戶',
    asset: '節點上沒有這個資產：它不是內建資產，節點的索引也不認識這個 ID 的代幣或合集',
  },
  badBlockId: '格式不對：區塊要用十進位高度或 64 碼十六進位雜湊',
  dropped: '節點已不認得這筆操作，可能已被移出條目池',
  notRequeued: '節點的條目池已不再保留它',
  indexerDown: (message: string) => `索引器無法使用：${message}`,
  btcRpcDown: (message: string) => `比特幣 RPC 無法使用：${message}`,
  btcRpcNotJson: (method: string, status: number) => `比特幣 RPC ${method} 回傳了非 JSON 的回應（HTTP ${status}）`,
  btcRpcFailed: (method: string, code: number, message: string) => `比特幣 RPC ${method} 失敗（${code}）：${message}`,
  btcRpcHttp: (method: string, status: number) => `比特幣 RPC ${method} 失敗：HTTP ${status}`,
  btcRpcWrongChain: (url: string, chain: string, expected: string) =>
    `比特幣 RPC（${url}）在 BTC ${chain} 上，而本頁的網路跑在 BTC ${expected} 上，所以不用它列 UTXO 或廣播。請在資料來源設定中把比特幣 RPC 指向 BTC ${expected} 的 bitcoind，或者清空它，改為手動填寫 UTXO 並自行廣播。`,
  skipped: '跳過',
  unaccepted: '尚未被主鏈合併',
  producer: (n: number) => `出塊者 ${n}`,
  assetSymbol: (id: string) => `資產 ${id}`,
  assetName: (head: string, tail: string) => `資產 ${head}…${tail}`,
};

export default rpc;
