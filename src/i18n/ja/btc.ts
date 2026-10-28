import type { Messages } from '..';

/** Japanese: BTC block page */
const btc: Messages['btc'] = {
  what: 'BTC ブロック',
  notFoundRpc: 'この高さは Ksana のジェネシスブロックがアンカーする BTC ブロックより前で、Ksana の内容はありません。ビットコインのエクスプローラーで確認してください。',
  notFoundAhead: 'この高さはこのページが把握している BTC の最新ブロックより上です。まだ採掘されていないか、ページがまだ追いついていません。',
  notFoundRpcTitle: 'ここではこの BTC ブロックを照会できません',
  viewOn: (site: string) => `${site} で見る`,

  eyebrow: (network: string) => `BTC ブロック · ${network}`,
  confs: (n: number) => `${n.toLocaleString('en-US')} 承認`,
  prev: '前のブロック',
  next: '次のブロック',

  txsTitle: (n: number) => `Ksana 関連のトランザクション（${n}）`,
  txsHeading: 'Ksana 関連のトランザクション',
  reading: 'ノードから前後の Ksana ブロックを読み込み中…',
  readFailed: 'ノードから前後の Ksana ブロックを読み込めませんでした',
  noKnownTxs: '既知の Ksana トランザクションはありません',
  noTxs: 'Ksana トランザクションはありません',
  col: {
    kind: '種類',
    for: '対象',
  },

  hash: 'ブロックハッシュ',
  timeApprox: '時刻（概算）',
  explorer: '外部エクスプローラー',
  confirmations: '承認数',
  headers: 'Ksana のブロックヘッダー',
  bodies: 'Ksana のブロック本体',
  anchored: 'このブロックにアンカー',
  anchoredCount: (n: number) => `Ksana ブロック ${n} 個`,
};

export default btc;
