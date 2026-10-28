import type { Messages } from '..';

/** Japanese: node data source on-demand lookup results, operations dropped from the mempool, the indexer and unknown asset names */
const rpc: Messages['rpc'] = {
  pending: 'このオペレーションはまだノードのメンプールにあり、取り込まれると詳細が自動で表示されます。',
  missing: {
    block: 'ノードにこのブロックはありません',
    op: (confs: number) =>
      `ノードはこのオペレーションを把握していません。パス C のオペレーションは、BTC トランザクションが ${confs} 承認に達してブロックに取り込まれてから把握されます。それ以外は受信していないか、メンプールから除外された可能性があります。このページは自動で再確認します。`,
    account: 'このアカウントは見つかりません',
    asset: 'ノードにこの資産はありません。組み込み資産ではなく、ノードのインデックスもこの ID のトークンやコレクションを把握していません',
  },
  badBlockId: '形式が正しくありません：ブロックは 10 進数の高さか 64 桁の 16 進数ハッシュで指定してください',
  dropped: 'ノードはこのオペレーションをもう把握しておらず、メンプールから除外された可能性があります',
  notRequeued: 'ノードのメンプールにもう残っていません',
  indexerDown: (message: string) => `インデクサーを利用できません：${message}`,
  btcRpcDown: (message: string) => `Bitcoin RPC を利用できません：${message}`,
  btcRpcNotJson: (method: string, status: number) => `ビットコイン RPC ${method} が JSON 以外の応答を返しました（HTTP ${status}）`,
  btcRpcFailed: (method: string, code: number, message: string) => `ビットコイン RPC ${method} が失敗しました（${code}）：${message}`,
  btcRpcHttp: (method: string, status: number) => `ビットコイン RPC ${method} が失敗しました：HTTP ${status}`,
  btcRpcWrongChain: (url: string, chain: string, expected: string) =>
    `ビットコイン RPC（${url}）は BTC ${chain} 上にありますが、このページのネットワークは BTC ${expected} 上で動いているため、UTXO の一覧とブロードキャストには使いません。データソース設定のビットコイン RPC を BTC ${expected} の bitcoind に向けるか、空にして UTXO を手入力し、自分でブロードキャストしてください。`,
  skipped: 'スキップ',
  unaccepted: 'メインチェーンに未マージ',
  producer: (n: number) => `ブロック生成者 ${n}`,
  assetSymbol: (id: string) => `資産 ${id}`,
  assetName: (head: string, tail: string) => `資産 ${head}…${tail}`,
};

export default rpc;
