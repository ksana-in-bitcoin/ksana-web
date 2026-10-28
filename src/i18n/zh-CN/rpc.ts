/** Node data source (chain/rpc): on-demand lookup results, dropped from the mempool, the indexer and names for unknown assets */
export default {
  pending: '这笔操作还在节点的条目池里，收录后会自动显示详情。',
  missing: {
    block: '节点上没有这个区块',
    /** confs: the BTC confirmations a path C op's transaction needs before a block forces it in (NATIVE_CONFIRMATIONS + ANCHOR_DEPTH) */
    op: (confs: number) =>
      `节点不认识这笔操作。路径 C 的操作要等它的 BTC 交易有 ${confs} 个确认、并被一个区块收录后，节点才会认识；其他操作可能从未收到，也可能已被移出条目池。本页会自动再查。`,
    account: '查不到这个账户',
    asset: '节点上没有这个资产：它不是内置资产，节点的索引也不认识这个 ID 的代币或合集',
  },
  badBlockId: '格式不对：区块要用十进制高度或 64 位十六进制哈希',
  dropped: '节点已不认识这笔操作，可能已被移出条目池',
  /** Why a skipped operation won't be included again (status.skipFinal), when the node no longer holds it (D-063) */
  notRequeued: '节点的条目池已不再保留它',
  indexerDown: (message: string) => `索引器不可用：${message}`,
  /** The Bitcoin RPC in data source settings (UTXOs and broadcast for path C and top-ups) */
  btcRpcDown: (message: string) => `比特币 RPC 不可用：${message}`,
  /** Errors of the wallet's Bitcoin RPC calls (wallet/btc.ts) */
  btcRpcNotJson: (method: string, status: number) => `比特币 RPC ${method} 返回了非 JSON 的响应（HTTP ${status}）`,
  btcRpcFailed: (method: string, code: number, message: string) => `比特币 RPC ${method} 失败（${code}）：${message}`,
  btcRpcHttp: (method: string, status: number) => `比特币 RPC ${method} 失败：HTTP ${status}`,
  /** The Bitcoin RPC is on another BTC network than the page's (A2-11, D-106); the chains as bitcoind names them (main, signet, regtest) */
  btcRpcWrongChain: (url: string, chain: string, expected: string) =>
    `比特币 RPC（${url}）在 BTC ${chain} 上，而本页的网络跑在 BTC ${expected} 上，所以不用它列 UTXO 或广播。请在数据源设置里把比特币 RPC 指向 BTC ${expected} 的 bitcoind，或者清空它，改为手动填写 UTXO 并自行广播。`,
  skipped: '跳过',
  unaccepted: '尚未被主链合并',
  producer: (n: number) => `出块者 ${n}`,
  assetSymbol: (id: string) => `资产 ${id}`,
  assetName: (head: string, tail: string) => `资产 ${head}…${tail}`,
};
