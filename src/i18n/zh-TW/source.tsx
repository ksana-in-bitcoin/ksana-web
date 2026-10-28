import type { ReactNode } from 'react';
import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Traditional Chinese (Taiwan): data source settings and node connection error messages */
const source: Messages['source'] = {
  title: '資料來源',
  state: { live: '已連線', connecting: '連線中…', error: '連線中斷' },
  tip: (height: string) => `鏈頂 #${height}`,
  push: { ws: 'WebSocket 推播', poll: '每 2.5 秒輪詢' },
  lastSync: (ago: string) => `上次同步 ${ago}`,
  indexer: (url: ReactNode) => <>索引器 {url}</>,
  indexerHalted: (reason: string) => `已停止：${reason}`,
  btc: (url: ReactNode) => <>比特幣 RPC {url}</>,
  noBtc: '未填比特幣 RPC：路徑 C 與充值改用錢包的介面或手填 UTXO',
  noIndexer: '未連接索引器，驗證頁無法比對狀態根',
  fromLink: '來自本頁連結：只在目前的分頁使用，不會儲存。在這裡改連別的節點才會儲存。',

  kind: { sim: '瀏覽器內模擬器', rpc: '節點 RPC' },
  simHint: '不需要任何服務，重新整理頁面會產生新的鏈',
  nodeUrl: '節點 JSON-RPC',
  nodeUrlHint: '節點要以 --rpc-cors 允許本頁面，或填同源代理路徑（如\u00a0/rpc）',
  indexerUrl: '索引器 JSON-RPC（選填）',
  indexerUrlHint: '索引器沒有跨來源設定，只能填同源代理路徑',
  btcUrl: '比特幣 RPC（選填）',
  btcUrlHint: 'bitcoind 的 JSON-RPC 同源代理路徑，憑證留在代理一側；錢包的路徑 C 與充值用它列 UTXO、廣播',
  network: '網路',
  devnet: 'devnet（regtest）',

  action: {
    connect: '連接節點',
    reconnect: '重新連線',
    toSim: '切換到模擬器',
    regenerate: '重新產生模擬鏈',
  },

  error: {
    noUrl: '填寫節點的 JSON-RPC 網址',
    otherNetwork: (node: string, chainId: string, chosen: string) =>
      `節點在 ${node}（chain_id ${chainId}）上，不是 ${chosen}。把網路改選為 ${node}，或連接 ${chosen} 的節點。`,
    mainnet: (chainId: string) => `節點在 mainnet（chain_id ${chainId}）上。本頁面暫不支援 mainnet，請連接 devnet 或 signet 的節點。`,
    unknownChain: (chainId: string) => `節點的 chain_id 為 ${chainId}，不屬於任何 Ksana 網路，請檢查網址。`,
    rpc: (code: string, message: string) => `節點回傳錯誤 ${code}：${message}`,
    timeout: (url: string) => `連線 ${url} 逾時，確認節點正在運作後重試`,
    unreachable: (url: string, origin: string) => `連不上 ${url}。確認節點正在運作，並以 --rpc-cors 允許${latinGap(origin)}。`.replace(/ 。$/, '。'),
    offline: (url: string) => `連不上 ${url}：檢查網路連線。`,
    unavailable: (url: string, status: string) => `節點暫時沒有回應（${url} 回傳 HTTP ${status}）。`,
    thisPage: '本頁面的來源',
  },
};

export default source;
