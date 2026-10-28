import type { Messages } from '..';
import { latinGap } from '../spacing';
import coins from './coins';

/** A sentence-initial parameter is followed directly by kana: a space is kept only after a Latin-script ending ("Unisat に", "テスト用秘密鍵ウォレットに") */
const head = (s: string) => latinGap(s).trimStart();

/** Japanese: wallet home and connect page */
const wallet: Messages['wallet'] = {
  title: 'ウォレット',
  address: 'アドレス',
  copyAddress: 'アドレスをコピー',
  accountHex: 'アカウント（16 進数）',
  copyAccountHex: '16 進数のアカウントをコピー',

  connect: {
    title: 'ウォレットを接続',
    noCustody: 'Ksana は署名を求めるだけで、資産を預かりません。',
    points: {
      key: 'アカウントはあなたの Taproot アドレスそのもの',
      topup: 'KSA がなくても BTC でチャージできる',
      pathC: 'ブロック生成者が全員拒否しても、パス C は有効',
    },
    /** The line under each point; n is the BTC confirmations after which Ksana blocks must include a Path C operation */
    pointNotes: {
      key: 'いま使っているビットコインウォレットがそのまま署名します。新しい秘密鍵もシードフレーズも要らず、ひとつのアドレスで KSA も BTC も受け取れます。',
      topup: '売り手があなた宛てに KSA をロックします。売り手に BTC を支払うトランザクションで、そのまま KSA も受け取れます。',
      pathC: (n: number) => `パス C のオペレーションは、あなた自身が送るビットコインのトランザクションに載ります。BTC 承認が ${n}\u00a0回つくと、Ksana のブロックに必ず取り込まれます。`,
    },
    go: '接続',
    waiting: 'ウォレットを待機中…',
    demoName: 'ローカル開発鍵',
    demoNote: 'ジェネシスブロックで割り当て済みのテストアカウント',
    demoConnected: 'デモアカウントに接続しました',
    needsNode: 'ノード接続後に利用可能',
    switchSource: 'データソースを切り替え',
    lastUsed: '前回使用',
    localOnly: 'ローカル regtest 専用',
    notDetected: '拡張機能が未検出',
    notDetectedTouch: '未検出',
    install: '拡張機能をインストールしてから、このページを再読み込みしてください。',
    openInApp: {
      unisat: 'Unisat または OneKey アプリ内のブラウザでこのページを開いてください。',
      xverse: 'Xverse アプリ内のブラウザでこのページを開いてください。',
    },
    failed: (name: string) => `${head(name)}に接続できませんでした`,
    network: (net: string, prefix: string) => `ウォレットを ${net} に切り替えてください：アドレスは ${prefix} で始まります。`,
    mockHint: 'ローカル regtest ではテスト用秘密鍵ウォレットを使えます：',
    mockParam: '?wallet=mock&key=<秘密鍵>',
    mockIcon: '試',
    mockName: 'テスト用秘密鍵ウォレット',
    unisatNote: 'Taproot（P2TR）のアカウント',
    xverseNote: 'Ordinals アドレス（P2TR）を使用',
    mockNote: '秘密鍵はアドレスバーから読み取り、このページのメモリにのみ保持します。',
    xverseMessage: 'Ksana ウォレットを接続',
    noMockKey: 'アドレスバーにテスト用秘密鍵がありません',
    keyRefusedTitle: 'リンクの秘密鍵は使っていません',
    keyRefused:
      'テスト用秘密鍵ウォレットはローカル regtest 専用です。秘密鍵はアドレスバーから消しましたが、リンクに含まれる秘密鍵はこのページを配信するサーバーにも届きます。資産のあるアカウントには使わないでください。',
    wrongNetwork: (addr: string, net: string) => `ウォレットのアドレス ${addr}… は ${net} のアドレスではないため、ウォレットでビットコインのネットワークを切り替えてください。`,
    wrongChain: (wallet: string, chain: string, net: string) =>
      `${head(wallet)}は ${chain} に設定されていますが、このページのネットワークは BTC ${net} 上で動いているため、ウォレットでビットコインのネットワークを ${net} に切り替えてください。`,
    notTaproot: 'ウォレットのアカウントが Taproot アドレスではないため、ウォレットで Taproot アカウントに切り替えてください。',
    notBip86: 'ウォレットの Taproot アドレスが鍵の標準のアドレス（BIP86）ではないため、ウォレットで別の Taproot アカウントを選んでください。',
    switched: (wallet: string) => `${head(wallet)}のアカウントが切り替わりました`,
    switchedTo: (addr: string) => `このページには ${addr} を表示しています。`,
    left: (wallet: string) => `${head(wallet)}との接続を切断しました`,
    signSwitched: (wallet: string) => `署名していません：${head(wallet)}は、このページが表示していたものとは別のアカウントになっています。内容を確認してから、もう一度署名してください。`,
    signSwitchedLeft: (wallet: string) => `署名していません：${head(wallet)}は、このページが表示していたものとは別のアカウントになっています。そのアカウントを使うには、もう一度接続してください。`,
  },

  home: {
    eyebrowDemo: 'ウォレット · デモアカウント',
    eyebrow: (name: string) => `ウォレット · ${name}`,
    title: 'マイウォレット',
    viewInExplorer: 'ブロックエクスプローラーで表示',
    send: '送金',
    showBalances: '残高を表示',
    hideBalances: '残高を隠す',
  },

  alert: {
    backlogTitle: '決済の滞留が上限に達し、高速パスは停止中',
    backlog: (rate: string) => `反映済みの残高は変わらず、急ぐ場合は現在の ${rate}\u00a0sat/vB のマイナー手数料でパス C を使えます。`,
    censoredTitle: 'ブロック生成者があなたの高速パスのオペレーションを取り込んでいません（デモシナリオ）',
    censored: 'ブロック生成者は取り込まないこともできますが、パス C ならブロック生成者は不要です。',
  },

  balances: {
    ksa: '高速レーン · KSA',
    btc: (net: string) => `${coins.bitcoin} · ${net}`,
    loading: (at: string, final: string) => `ブロックを遡って取得中のため（#${at} まで、確定の境界は #${final}）、BTC 確定残高はまだ不完全です。`,
    finalShort: '確定',
    utxoCount: (n: number) => `UTXO ${n} 個`,
    btcInWallet: (name: string) => `BTC 残高は${latinGap(name)}で確認してください。`,
    empty: 'KSA はまだありません。BTC でチャージするか、このアドレスに送ってもらってください。',
    noIndexerNote: 'その間「BTC 最終」はノードの主張にすぎません',
    tokens: 'トークン',
    btcUnconfirmed: (amount: string) => `うち ${amount}\u00a0sats は未承認`,
    btcReading: 'BTC 残高を読み込み中…',
    ksaReading: 'KSA 残高を読み込み中…',
    btcFailed: 'BTC 残高を今は読み込めません',
    btcStale: '最新の BTC 残高を今は読み込めません',
    btcRefresh: 'BTC 残高を更新',
    emptyFaucet: 'KSA はまだありません。テスト用 KSA を受け取るか、BTC でチャージしてください。',
  },

  split: {
    allFinal: '残高はすべて BTC 確定済み',
    finalBalance: 'BTC 確定残高',
    inflow: '受け取り（未確定）',
    outflow: '送金と手数料（未確定）',
    total: '現在の残高（すぐに利用可能）',
    unreadAll: 'すべてが BTC 確定済みとは限りません。未確定のコントラクト呼び出しがここへ支払った可能性があり、その額はページから読み取れません。',
    unreadMore: '未確定のコントラクト呼び出しがここへさらに支払った可能性があり、その額はページから読み取れません。その場合、BTC 確定残高はこれより少なくなります。',
  },

  inflight: {
    title: '進行中',
    eyebrow: (n: number) => `BTC 確定前 · ${n}`,
    failed: '実行失敗',
    resend: 'パス C に切り替え',
    skipped: 'スキップ、再取り込み待ち',
    stuck: '停滞中、詳細を確認',
    /** eta is a formatted estimate (~3 min, soon) */
    eta: (eta: string) => `確定まで${eta}`,
    waitInclusion: '取り込み待ち',
    waitSettlement: '決済待ち',
  },

  activity: {
    title: 'アクティビティ',
    filter: '絞り込み',
    out: '送信',
    in: '受け取り',
    empty: '記録はありません',
  },

  utxos: {
    title: 'BTC 出力',
    output: '出力',
    change: '決済のお釣り',
    showSpent: '使用済みを表示',
    empty: 'BTC 出力はありません',
    emptyHint: (section: string) => `「${section}」から regtest BTC を受け取れます。`,
    state: {
      available: '利用可能',
      unconfirmed: '未承認',
      spent: '使用済み',
    },
  },

  info: {
    address: 'アドレス',
    signing: '署名方式',
    signingValue: 'BIP322 simple',
    disconnect: 'ウォレットを切断',
  },

  settings: {
    title: '着金の確認',
    threshold: '高額のしきい値',
    save: '保存',
    saved: '保存しました',
    hint: 'しきい値未満の着金は高速確認で十分とし、しきい値以上は BTC 確定まで待つよう通知します。',
  },

  native: {
    noUtxo: '利用できる BTC 出力がありません',
    unconfirmed: 'BTC 出力がまだ承認されていません。BTC ブロックに入ってから、もう一度お試しください',
    feeRateTooHigh: (rate: string, cap: string) => `手数料率 ${rate}\u00a0sat/vB はこのページの上限 ${cap}\u00a0sat/vB を超えています。何も署名していません。より低い手数料率にしてください`,
  },

  faucet: {
    title: 'テスト用資産',
    hint: (s: number) => `KSA は約 ${s} 秒で着金し、BTC は次の BTC ブロックを待ちます。`,
    claim: '5,000\u00a0KSA と 0.1\u00a0BTC を受け取る',
    requested: 'フォーセットに申請しました',
    claimHosted: 'テスト用 KSA を受け取る',
    claimed: '申請済み、着金待ち',
    console: 'regtest コンソール',
  },

  playground: {
    title: 'コントラクト Playground',
    body: 'ブラウザでスマートコントラクトを編集・コンパイル・デプロイできます。トークン、NFT、AMM、レンディング、マルチシグ、ベスティングの各サンプルに専用の画面があり、公開 signet で動きます。',
    open: 'Playground を開く',
  },
};

export default wallet;
