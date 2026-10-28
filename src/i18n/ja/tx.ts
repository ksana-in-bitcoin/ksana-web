import type { Messages } from '..';

/** Japanese: BTC transaction detail page */
const tx: Messages['tx'] = {
  notFoundRpc: 'ノードは txid でトランザクションを照会できないため、ブロックのページから開くか、ビットコインのエクスプローラーで確認してください。',
  /** Its title: the transaction may well exist */
  notFoundRpcTitle: 'ここではこの BTC トランザクションを照会できません',
  /** A link to a public Bitcoin explorer's page for the transaction; site is its name */
  viewOn: (site: string) => `${site} で見る`,

  eyebrow: (kind: string) => `BTC トランザクション · ${kind}`,
  forBlock: 'Ksana ブロック',

  pair: {
    commit: '決済 · コミットトランザクション',
    reveal: '決済 · リビールトランザクション',
    commitTx: 'コミットトランザクション',
    revealTx: 'リビールトランザクション',
    hint: 'コミットでコミットメントを固定し、リビールのウィットネスでペイロードを示します。',
  },

  stuck: {
    title: 'BTC メンプールで停滞',
    bumpAnchor: 'P2A アンカーで加速',
    bumpChange: 'お釣りで CPFP',
    bumpedAnchor: (n: number) => `CPFP の子トランザクションを ${n} 件追加したので、次の BTC ブロックでまとめて承認されます`,
    bumpedChange: 'お釣りで CPFP の子トランザクションを追加したので、次の BTC ブロックでまとめて承認されます',
    bumpFailed: '使える出力がないため、CPFP できません',
  },

  partial: {
    title: 'ノードはこのトランザクションの一部しか提供していません',
    more: '全体はビットコインのエクスプローラーで確認してください。',
  },

  replacedBy: '置き換え先',
  invalidRebuilt: '決済は再構築済みで、誰も署名し直す必要はありません。',
  rescueBanner: {
    rebuilt: 'ブロック生成者が再構築した決済',
    rescue: '救済決済',
  },

  structure: 'トランザクションの構造',

  payload: {
    title: 'ペイロード',
    type: 'ペイロードの種類',
    headers: 'ブロックヘッダー',
    bodies: 'ブロック本体',
    dataSize: 'データ量',
    chunks: 'データチャンク',
    none: 'Ksana のデータは含みません',
  },

  details: {
    title: 'トランザクション',
    vsize: '仮想サイズ',
    broadcastAt: (time: string) => `${time} にブロードキャスト`,
    otherVersions: '同じブロックの他のバージョン',
    author: {
      rebuilder: '再構築者',
      rescuer: '救済者',
      user: 'ユーザー',
      funder: '資金提供者',
    },
  },

  diagram: {
    inputs: '入力',
    outputs: '出力',
    inRole: {
      producer: 'ブロック生成者の資金',
      commit: 'コミットトランザクションから',
      payer: '支払い元の入力',
      anchor: 'P2A アンカー（親トランザクション）',
    },
    outRole: {
      change: 'お釣り',
      commitment: 'コミットメント出力',
      anchor: 'P2A アンカー',
      payment: '支払い',
    },
    producerChange: 'ブロック生成者のお釣り',
    anyone: '誰でも使用可',
    commitmentHint: 'リビールトランザクションが使用',
    opReturn: {
      native: 'NativeOp：VmOp 1 件',
      headers: (n: number) => `Headers：ブロックヘッダー ${n} 個`,
      settlement: (headers: number, entries: number) => `ブロックヘッダー ${headers} 個 + エントリ ${entries} 件`,
      empty: '空の OP_RETURN',
    },
    chunks: (n: number) => `${n} チャンク`,
    envelope: {
      title: 'ウィットネスのエンベロープ',
      headers: (n: number) => `ブロックヘッダー ${n} 個`,
      bodies: (n: number) => `ブロック本体 ${n} 個`,
    },
  },
};

export default tx;
