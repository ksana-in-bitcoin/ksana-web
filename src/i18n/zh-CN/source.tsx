/** Data source settings (app/SourcePanel.tsx) and the messages shown when connecting to a node fails */
import type { ReactNode } from 'react';
import { latinGap } from '../spacing';

export default {
  title: '数据源',
  state: { live: '已连接', connecting: '连接中…', error: '连接中断' },
  tip: (height: string) => `链顶 #${height}`,
  push: { ws: 'WebSocket 推送', poll: '每 2.5 秒轮询' },
  lastSync: (ago: string) => `上次同步 ${ago}`,
  indexer: (url: ReactNode) => <>索引器 {url}</>,
  indexerHalted: (reason: string) => `已停止：${reason}`,
  btc: (url: ReactNode) => <>比特币 RPC {url}</>,
  noBtc: '未填比特币 RPC：路径 C 与充值改用钱包的接口或手填 UTXO',
  noIndexer: '未连接索引器，验证页无法比对状态根',
  fromLink: '来自本页链接：只在当前标签页使用，不会保存。在这里改连别的节点才会保存。',

  kind: { sim: '浏览器内模拟器', rpc: '节点 RPC' },
  simHint: '无需任何服务，刷新页面会重新生成链',
  nodeUrl: '节点 JSON-RPC',
  nodeUrlHint: '节点要以 --rpc-cors 允许本页面，或填同源代理路径（如\u00a0/rpc）',
  indexerUrl: '索引器 JSON-RPC（可选）',
  indexerUrlHint: '索引器没有跨源设置，只能填同源代理路径',
  btcUrl: '比特币 RPC（可选）',
  btcUrlHint: 'bitcoind 的 JSON-RPC 同源代理路径，凭据留在代理一侧；钱包的路径 C 与充值用它列 UTXO、广播',
  network: '网络',
  devnet: 'devnet（regtest）',

  action: {
    connect: '连接节点',
    reconnect: '重新连接',
    toSim: '切换到模拟器',
    regenerate: '重新生成模拟链',
  },

  /** Connection errors: one sentence for the result, then what to do; error messages returned by the node are shown as-is */
  error: {
    noUrl: '填写节点的 JSON-RPC 地址',
    otherNetwork: (node: string, chainId: string, chosen: string) =>
      `节点在 ${node}（chain_id ${chainId}）上，不是 ${chosen}。把网络改选为 ${node}，或连接 ${chosen} 的节点。`,
    mainnet: (chainId: string) => `节点在 mainnet（chain_id ${chainId}）上。本页面暂不支持 mainnet，请连接 devnet 或 signet 的节点。`,
    unknownChain: (chainId: string) => `节点的 chain_id 为 ${chainId}，不属于任何 Ksana 网络，请检查地址。`,
    rpc: (code: string, message: string) => `节点返回错误 ${code}：${message}`,
    timeout: (url: string) => `连接 ${url} 超时，确认节点在运行后重试`,
    unreachable: (url: string, origin: string) => `连不上 ${url}。确认节点在运行，并以 --rpc-cors 允许${latinGap(origin)}。`.replace(/ 。$/, '。'),
    offline: (url: string) => `连不上 ${url}：检查网络连接。`,
    unavailable: (url: string, status: string) => `节点暂时没有应答（${url} 返回 HTTP ${status}）。`,
    /** Stands in for the page origin when it can't be read (outside a browser) */
    thisPage: '本页面的来源',
  },
};
