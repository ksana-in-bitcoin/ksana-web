import type { ReactNode } from 'react';
import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Japanese: data source settings and node connection error messages */
const source: Messages['source'] = {
  title: 'データソース',
  state: { live: '接続済み', connecting: '接続中…', error: '切断' },
  tip: (height: string) => `最新 #${height}`,
  push: { ws: 'WebSocket プッシュ', poll: '2.5 秒ごとにポーリング' },
  lastSync: (ago: string) => `最終同期 ${ago}`,
  indexer: (url: ReactNode) => <>インデクサー {url}</>,
  indexerHalted: (reason: string) => `停止：${reason}`,
  btc: (url: ReactNode) => <>ビットコイン RPC {url}</>,
  noBtc: 'ビットコイン RPC 未設定：パス C とチャージはウォレットのインターフェースか手入力の UTXO を使います',
  noIndexer: 'インデクサーが未接続のため、検証ページで状態ルートを照合できません',
  fromLink: 'ページのリンクで指定されたもの：このタブの中だけで使い、保存はしません。ここで別のノードに接続すると、それが保存されます。',

  kind: { sim: 'ブラウザ内シミュレーター', rpc: 'ノード RPC' },
  simHint: 'サービスは不要で、ページを再読み込みするとチェーンが再生成されます',
  nodeUrl: 'ノードの JSON-RPC',
  nodeUrlHint: 'ノード側で --rpc-cors によりこのページを許可するか、同一オリジンのプロキシパス（/rpc など）を入力してください',
  indexerUrl: 'インデクサーの JSON-RPC（任意）',
  indexerUrlHint: 'インデクサーにはクロスオリジン設定がないため、同一オリジンのプロキシパスのみ指定できます',
  btcUrl: 'ビットコイン RPC（任意）',
  btcUrlHint: 'bitcoind の JSON-RPC への同一オリジンのプロキシパス。認証情報はプロキシ側に残り、パス C とチャージが UTXO の一覧とブロードキャストに使います',
  network: 'ネットワーク',
  devnet: 'devnet（regtest）',

  action: {
    connect: 'ノードに接続',
    reconnect: '再接続',
    toSim: 'シミュレーターに切り替え',
    regenerate: '模擬チェーンを再生成',
  },

  error: {
    noUrl: 'ノードの JSON-RPC の URL を入力してください',
    otherNetwork: (node: string, chainId: string, chosen: string) =>
      `ノードは ${node}（chain_id ${chainId}）で、${chosen} ではありません。ネットワークに ${node} を選ぶか、${chosen} のノードに接続してください。`,
    mainnet: (chainId: string) => `ノードは mainnet（chain_id ${chainId}）です。このページはまだ mainnet に対応していません。devnet か signet のノードに接続してください。`,
    unknownChain: (chainId: string) => `ノードの chain_id ${chainId} はどの Ksana ネットワークにも属しません。アドレスを確認してください。`,
    rpc: (code: string, message: string) => `ノードがエラー ${code} を返しました：${message}`,
    timeout: (url: string) => `${url} への接続がタイムアウトしたため、ノードの起動を確認して再試行してください`,
    unreachable: (url: string, origin: string) => `${url} に接続できません。ノードが起動しているか確認し、--rpc-cors で${latinGap(origin)}を許可してください。`,
    offline: (url: string) => `${url} に接続できません。ネットワーク接続を確認してください。`,
    unavailable: (url: string, status: string) => `ノードが一時的に応答していません（${url} が HTTP ${status} を返しました）。`,
    thisPage: 'このページのオリジン',
  },
};

export default source;
