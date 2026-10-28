import type { Messages } from '..';

/** Japanese: search results and "not found" pages */
const search: Messages['search'] = {
  results: (q: string) => `「${q}」の検索結果`,
  none: (q: string) => `「${q}」は見つかりません`,
  count: (n: number) => `${n} 件`,
  howTo: '次のように検索できます：',

  tipSep: '：',
  tips: {
    height: { label: 'Ksana ブロック', text: '128 や #128 などの高さで、同じ高さの並行ブロックもまとめて表示' },
    hash: { label: 'ブロックハッシュ、op_id、BTC txid', text: '64 桁の 16 進数で、先頭 4 桁から候補を表示' },
    /** prefix is the network's Taproot address prefix, such as tb1p */
    account: { label: 'アカウント', text: (prefix: string) => `Taproot アドレス（${prefix}…）または 64 桁の 16 進数` },
    name: { label: '名前', text: 'ブロック生成者（devnet-1）、コントラクト（AMM）、フォーセット' },
  },

  miss: {
    aboveTip: (tip: string) => `このページが把握している限り、この高さの Ksana ブロックはまだありません。チェーンの最新は #${tip} です。`,
    aboveTips: (tip: string, btcTip: string) => `このページが把握している限り、この高さのブロックはどちらのチェーンにもまだありません。Ksana の最新は #${tip}、ビットコインの最新は #${btcTip} です。`,
    notTaproot: (prefix: string) =>
      `これはビットコインのアドレスですが、Taproot アドレスではないため Ksana のアカウントではありません。アカウントは ${prefix} で始まる Taproot アドレスです。ここでウォレットを使うには、ウォレットで Taproot アカウントに切り替えてください。`,
    noKey: 'この Taproot アドレスは Ksana のアカウントにはなり得ません。対応する鍵がないため、誰も署名できません。',
    otherNetwork: (nets: string, net: string, prefix: string) =>
      `これはビットコイン ${nets} のアドレスですが、このページのネットワークは BTC ${net} 上で動いています。このネットワークのアカウントは ${prefix} で始まる Taproot アドレスです。`,
    viewAddress: (site: string) => `このアドレスを ${site} で見る`,
    or: (a: string, b: string) => `${a} または ${b}`,
    comma: '、',
  },

  notFound: {
    eyebrow: '該当なし',
    /** what is the thing looked for (block, account…); it goes at the start of the sentence so that any noun can follow */
    title: (what: string) => `${what}が見つかりません`,
    page: 'ページ',
    badPath: 'URL の入力ミスか、ページが移動した可能性があります。',
    badOpId: 'オペレーション ID（op_id）は 16 進数 64 桁です。これは違います。',
    badAccount: (prefix: string) => `アカウントは ${prefix} で始まる Taproot アドレスか、16 進数 64 桁です。これはどちらでもありません。`,
    ahead: (tip: string) => `この高さはチェーンの最新 #${tip} より上です。ブロックはまだ生成されていません。`,
    sim: 'ページを再読み込みすると模擬チェーンが再生成され、古いリンクのハッシュは無効になります。',
    home: '概要に戻る',
  },
};

export default search;
