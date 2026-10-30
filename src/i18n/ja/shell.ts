import type { Messages } from '..';
import { latinGap } from '../spacing';

/** A sentence-initial parameter is followed directly by kana: a space is kept only after a Latin-script ending ("devnet-1 から", "デモアカウントから") */
const head = (s: string) => latinGap(s).trimStart();

/** Japanese: app shell (top bar, nav, status strip, toasts, console, footer and the "connecting to node" page) */
const shell: Messages['shell'] = {
  skipToMain: '本文へスキップ',

  mainNav: 'メインナビゲーション',
  nav: {
    overview: '概要',
    blocks: 'ブロック',
    ops: 'オペレーション',
    settlements: '決済',
    verify: '検証',
    wallet: 'ウォレット',
    // The wallet's bottom tab, a fifth of a phone's width: the shorter of the word's two spellings in common use, which needs less
    // shrinking to fit (the longer one stays in sentences and links)
    explorer: 'エクスプローラ',
    playground: 'Playground',
  },
  playground: 'コントラクト Playground：ブラウザでコントラクトを編集・コンパイル・デプロイ（新しいタブで開きます）',

  theme: 'テーマ',
  themes: { system: 'システム', light: 'ライト', dark: 'ダーク' },
  themeNow: (current: string) => `テーマ：${current}`,
  themeSwitch: (current: string, next: string) => `テーマ：${current}、クリックで${next}に切り替え`,

  top: {
    connectWallet: 'ウォレットを接続',
    myWallet: 'マイウォレット',
    walletTitle: (account: string) => `マイウォレット · アカウント ${account}`,
    pending: (n: number) => `${n} 件のオペレーションが取り込み待ち`,
    closeSearch: '検索を閉じる',
    simTitle: 'regtest コンソールとデータソース設定を開く',
    simLabel: (chainId: string) => `ネットワーク devnet、chain_id ${chainId}、ブラウザ内シミュレーター。regtest コンソールを開く`,
    sim: 'シミュレーター',
    node: 'ノード',
    nodeTitle: (url: string, state: string) => `ノード ${url}：${state}`,
    nodeLabel: (chain: string, state: string) => `ネットワーク ${chain}、ノードのデータソース、${state}。データソース設定を開く`,
  },

  strip: {
    label: 'チェーンの状態',
    disconnected: 'ノードとの接続が切断',
    disconnectedSince: (ago: string) => `ノードとの接続が切断 · 最終更新 ${ago}`,
    backlogFull: '決済の滞留が上限に達し、高速パスは停止中',
    fast: '高速レーン',
    settled: '決済済み',
    btcTipHint: 'ノードは BTC の最新ブロックを提供しないため、既知のデータから推定しています',
    btcTipRead: 'ビットコイン RPC から 30 秒ごとに読み取り、その間はノードの新しいブロックに従います',
    backlog: (waited: number, limit: number) => `決済の滞留 ${waited}/${limit}`,
    backlogHint: '最も古いブロックのデータがビットコイン上と数えられるまで待っている BTC ブロック数。次のブロックのアンカーがデータのある BTC ブロックに届くと数えられます',
    settleFee: '決済の手数料率',
    settleFeeHint: 'ノードが決済トランザクションに付ける手数料率で、BTC の市場手数料率ではありません',
    fee: '手数料率',
    feeHint: 'BTC の推定手数料率',
    minFee: (rate: string) => `ブロック入りの下限 ${rate}`,
    noIndexer: 'インデクサー未接続',
    indexer: { ok: 'インデクサーと一致', mismatch: 'インデクサーと不一致', halted: 'インデクサー停止', none: 'インデクサー未照合', unreachable: 'インデクサー応答なし', stalled: 'インデクサー停滞' },
    mempool: 'メンプール',
    pendingHint: 'このページから送信し、まだ取り込まれていないオペレーションのみ表示',
    sourceNode: (host: string) => `データソース：ノード ${host}`,
    sourceSim: 'データソース：ブラウザ内シミュレーター',
  },

  toast: {
    close: '通知を閉じる',
    /** Transfer 5 KSA */
    what: (verb: string, amount: string, symbol: string) => `${verb} ${amount}\u00a0${symbol}`,
    failed: 'オペレーションの実行に失敗しました',
    dropped: 'オペレーションがメンプールから除外されました',
    skipped: 'オペレーションが並行ブロックでスキップされました',
    received: (amount: string, symbol: string) => `${amount}\u00a0${symbol} を受け取りました`,
    large: '高額のしきい値以上のため、BTC 確定まで待ってから着金とみなすことをおすすめします',
    deepNext: '次は BTC 確定',
    finalTakenBack: 'BTC 確定が取り消されました',
    finalTakenBackBody: 'ノードがこれを BTC 確定と報告しなくなりました。BTC 確定をもう一度待ってください',
    from: (name: string) => `${head(name)}から`,
  },

  update: {
    title: 'このページの新しいバージョンがあります',
    body: 'ページを再読み込みすると使えます',
    language: (name: string) => `ページを再読み込みすると使え、${head(name)}に切り替わります`,
    reload: '再読み込み',
    missed: (name: string) => `${head(name)}を読み込めませんでした`,
    missedBody: 'サーバーから応答がありません。接続を確認して、もう一度お試しください',
  },

  /** The node's network started over from another genesis block while the page was open (app/store.ts, `readAnew`) */
  startedOver: {
    title: 'ネットワークが新しいジェネシスブロックからリスタートしました',
    body: 'ページはノードのチェーンを読み直しました。以前のブロック、オペレーション、残高はこのチェーンにありません',
  },

  testnet: 'テストネットワークはいつでも新しいジェネシスブロックからリスタートすることがあり、残高とコントラクトは引き継がれません',

  console: {
    sim: 'regtest コンソール',
    rpc: 'データソースとノード',
    loaded: (n: number) => `直近のチェーンブロック ${n} 個を読み込み済みで、それ以前のブロックは開いたときに照会します`,
    disconnect: 'ウォレットを切断',
    disconnectDemo: 'デモウォレットを切断',
    events: '最近のイベント',
    needWallet: 'ウォレットを接続すると、検閲のシナリオを使えます',
  },

  scenario: {
    mine: {
      title: (seconds: number) => `ビットコインのブロック生成 · 平均 ${seconds} 秒に 1 ブロック`,
      hint: '連続で採掘すると、一時的に滞留の上限に達することがあります',
      button: (n: number) => `${n} ブロック採掘`,
    },
    fee: {
      title: 'BTC 手数料率の急騰',
      hint: '決済トランザクションが BTC メンプールで停滞し、滞留が上限に達すると高速パスが停止します',
      toggle: '手数料率の急騰',
      cpfp: 'P2A アンカーで CPFP',
      cpfpCount: (n: number) => `P2A アンカーで CPFP（${n}）`,
      cpfpDone: (n: number) => `${n} 件のトランザクションを加速し、次の BTC ブロックで承認されます`,
      backlog: (waited: number, limit: number) => `滞留 ${waited} / ${limit} BTC ブロック`,
      paused: '高速パスは停止中',
    },
    censor: {
      title: 'ブロック生成者が自分のアカウントを検閲',
      hint: 'ブロック生成者があなたの高速パスのオペレーションを取り込まなくなります',
      toggle: '自分のアカウントを検閲',
    },
    offline: {
      title: 'ブロック生成者がオフライン',
      hint: (name: string) => `${name} がブロック生成を停止し、その決済は他のノードが代わりにブロードキャストします`,
      toggle: (name: string) => `${name} をオフラインに`,
    },
  },

  footer: {
    /** Brand tagline */
    tagline: '高速レーンで瞬時に確認され、最後はビットコインに永遠に刻まれる。',
    fromSim: 'データはブラウザ内シミュレーターのもので、ページを再読み込みするとチェーンが再生成されます',
    fromNode: (url: string) => `データの取得元：ノード ${url}`,
    build: 'ビルド',
    buildHint: 'このページをビルドした git コミット。検証手順は README.md の「Verify this page」',
  },

  connecting: {
    eyebrow: '接続中',
    title: 'ノードに接続中…',
    failedEyebrow: '接続失敗',
    failedTitle: 'ノードに接続できません',
    wrongNetworkTitle: 'ノードは別のネットワークです',
    detail: (message: string) => `エラーの詳細：${message}`,
    retrying: 'このページは 2.5 秒ごとに再試行し、ノードが応答するとそのまま開きます。',
    settings: 'データソース設定',
    useSim: 'ブラウザ内シミュレーターを使う',
    switchTo: (chain: string) => `${chain} に切り替える`,
  },
  linkSource: {
    eyebrow: 'データソース',
    /** A zero-width space after the particle: a Japanese title breaks only there (word-break: keep-all), not before its question mark */
    title: 'リンクのノードから\u200b読み込みますか？',
    body: 'このリンクは、いつものノードではなく下のアドレスからデータを読み込むようページに求めています。そうすると、ページに表示されるすべて（残高、オペレーション、承認の進み具合）がそこから来ることになり、ウォレットで署名した内容もそこへ送られます。自分で運用しているか、運用者を信頼できる場合だけにしてください。',
    node: 'ノード',
    indexer: 'インデクサー',
    btc: 'ビットコイン RPC',
    network: 'ネットワーク',
    note: 'どちらを選んでも保存はされず、このタブの中だけで有効です。',
    keep: 'いつものノードを使う',
    follow: 'このノードから読み込む',
  },
  /** A node an earlier version of the page saved, perhaps from a link (store.ts, `savedSource`): asked about once */
  savedSource: {
    eyebrow: 'データソース',
    /** A zero-width space after the particle: a Japanese title breaks only there (word-break: keep-all), not before its question mark */
    title: '以前に保存されたノードから\u200b読み込み続けますか？',
    body: 'このページの以前のバージョンが、下のアドレスをデータソースとして保存しました。以前のバージョンは、リンクが指定したノードもデータソースパネルで選んだものと同じように保存していたため、開いたことのあるリンクから来たものかもしれません。ページに表示されるすべて（残高、オペレーション、承認の進み具合）がそこから来ることになり、ウォレットで署名した内容もそこへ送られます。自分で選んだものである場合だけ使い続けてください。',
    node: 'ノード',
    indexer: 'インデクサー',
    btc: 'ビットコイン RPC',
    network: 'ネットワーク',
    note: '確認はこの一度だけです。データソースパネルでいつでも変更できます。',
    keep: 'このページのノードを使う',
    follow: 'このまま読み込む',
  },
};

export default shell;
