import type { Messages } from '..';
import { latinGap } from '../spacing';

/** A sentence-initial parameter is followed directly by kana: a space is kept only after a Latin-script ending ("Unisat で署名", "テスト用秘密鍵ウォレットで署名") */
const head = (s: string) => latinGap(s).trimStart();

/** Japanese: send page */
const send: Messages['send'] = {
  eyebrow: 'ウォレット',
  title: '送金',
  step: (n: number, total: number) => `ステップ ${n}（全 ${total} ステップ）`,

  to: {
    section: '送金先と金額',
    label: '送金先\u200bアカウント',
    placeholder: 'Taproot アドレスか 16 進数',
    hint: '貼り付けたら、先頭と末尾の 8 桁とアカウント印を確認してください',
    headTail: '先頭・末尾',
    asAddress: '対応するアドレス',
    notTaproot: 'Taproot アドレス（bc1p / tb1p / bcrt1p）のみ使えます',
    wrongNetwork: (net: string) => `このアドレスは現在のネットワーク（${net}）のものではありません`,
    badAddress: 'アドレスが無効で、どこかの文字が間違っている可能性があります',
    badChars: '0–9 と a–f のみ使えます',
    badLength: (n: number) => `64 桁必要です（現在 ${n} 桁）`,
    notOnCurve: '有効なアカウントではなく、どこかの桁が間違っている可能性があります',
    self: '送金先はあなた自身のアカウントです',
    noRecord: 'このアカウントはチェーン上に記録がないため、先頭と末尾を再確認してください',
  },

  recent: {
    title: '最近の送金先',
    sentBefore: (n: number, ago: string) => `過去に ${n} 回送金（最終 ${ago}）`,
  },

  amount: {
    max: '全額',
    available: '利用可能',
    integer: (symbol: string) => `${symbol} は整数のみ入力できます`,
    decimals: (symbol: string, n: number) => `${symbol} の小数は ${n} 桁までです`,
    notNumber: '金額は 12.5 のように数字で入力してください',
    positive: '金額は 0 より大きくしてください',
    overBalance: (amount: string, symbol: string) => `利用可能残高 ${amount}\u00a0${symbol} を超えています`,
    withFee: '残高が金額と代払い手数料の合計に足りません',
  },

  path: {
    section: '送信方法',
    more: 'その他の送信方法',
    tagDefault: 'デフォルト',
    tagRecommended: '推奨',
    tagCensorship: '検閲耐性',
    speedFast: (s: number) => `約 ${s} 秒で反映`,
    speedNative: (n: number) => `BTC で ${n} 承認後に強制取り込み`,
    paused: '停止中',
    mayNotInclude: '取り込まれない可能性あり',
    backlog: '決済が滞留中のため、解消されるまで取り込まれません',
    censored: 'ブロック生成者が最近あなたのオペレーションを取り込んでいません',
    sameNonce: '同じ nonce での再送はパス C のみ',
    ksaShort: '代払い手数料を払う KSA が足りません',
    noOutputC: 'マイナー手数料を払える BTC 出力がありません',
    nativeGas: (max: string) => `パス C の max_gas は ${max} 以下にしてください`,
    nativeWaiting: (nonce: string) => `パス C のオペレーション（nonce ${nonce}）がまだ BTC 承認を待っています。取り込まれるとパス C を再び使えます`,
    feeSpike: 'BTC 手数料率が高め',
  },


  sponsor: {
    label: '代払い手数料',
    suggestedTag: '推奨値（詳細オプションで変更可）',
    customTag: '任意の金額',
    custom: '代払い手数料',
    hint: (amount: string) => `空欄なら推奨値 ${amount}\u00a0KSA（直近 20 ブロックのパス B 手数料の中央値）`,
    hintRate: (amount: string) => `空欄なら推奨値 ${amount}\u00a0KSA（ノードが直近 20 ブロックから求めた手数料率をこの送金に当てはめた額）`,
    hintMin: (amount: string) => `空欄なら推奨値 ${amount}\u00a0KSA（ノードの最低手数料）`,
    invalid: '手数料は 0 より大きい KSA の金額で指定してください',
    belowMin: 'あるブロック生成者の最低額を下回ると、他のブロック生成者による取り込みを待つことになります',
  },

  native: {
    feeRate: '手数料率',
    feeRateHint: (rate: string) => `既定はノードの決済手数料率 ${rate}\u00a0sat/vB`,
    feeRateRange: (cap: string) => `手数料率は 1〜${cap}\u00a0sat/vB で入力してください`,
    utxos: 'BTC 出力',
    loading: 'ウォレットアドレスの出力を読み込み中…',
    source: { btc_rpc: 'Bitcoin RPC から', unisat: 'ウォレットから', manual: '手入力' },
    available: (sats: string, n: number) => `利用可能 ${sats}\u00a0sat（${n} 出力）`,
    unconfirmed: (sats: string, n: number) => `未承認：${sats}\u00a0sat（${n} 出力）、BTC ブロックに入ると使えます`,
    need: (sats: string) => `最低 ${sats}\u00a0sat 必要`,
    short: (sats: string) => `BTC 出力が不足：最低 ${sats}\u00a0sat 必要`,
    manualNeeded: 'BTC 出力を手入力してください',
    loadFailed: (detail: string) => `BTC 出力を読み込めません：${detail}`,
    manualLabel: '出力を手入力',
    manualPlaceholder: 'txid:vout:sat（1 行に 1 つ）',
    manualHint: 'Bitcoin RPC もウォレットの UTXO API も使えないときに入力',
  },

  nativeRates: (rate: string, min: string) => `BTC 手数料率 ${rate}\u00a0sat/vB · ブロック入りの下限 ${min}\u00a0sat/vB`,

  advanced: {
    title: '詳細設定',
    gasHint: (n: string) => `超過すると実行は失敗し、手数料は差し引かれます（送金 1 件で ${n} を使用）`,
    gasRange: (min: string, max: string) => `max_gas は ${min}〜${max} の範囲にしてください`,
  },

  nonce: {
    title: (nonce: string) => `同じ nonce（${nonce}）でパス C に切り替え`,
    race: '先に取り込まれた方だけが有効で、元のオペレーションが先に取り込まれると、こちらのマイナー手数料は戻りません',
    fixed: (nonce: string) => `${nonce}（指定）`,
  },

  summary: {
    title: 'サマリー',
    needTo: 'まず送金先アカウントを入力してください',
    needAmount: '次に金額を入力してください',
    readingBalance: '残高を読み込み中…',
    badFee: '手数料が不正です',
    badGas: 'max_gas が範囲外です',
    badRate: '手数料率が範囲外です',
    unavailable: (path: string, reason: string) => `パス ${path} は利用不可：${reason}`,
    needUtxo: 'まずマイナー手数料を払える BTC 出力を用意してください',
    waitUtxo: 'BTC 出力が BTC ブロックで承認されるまでお待ちください',
  },

  review: {
    title: '確認して署名',
    edit: '戻って修正',
    signing: '署名中…',
    submit: '署名して送信',
    /** Transfer <amount> to <recipient> */
    to: '宛先',
    signedBy: (wallet: string) => `${head(wallet)}で署名`,
    signedLocal: 'ローカル開発鍵で署名',
    lockB: '実行前に KSA 残高から差し引き',
    lockC: 'BTC トランザクションをブロードキャストし、お釣りはあなたのアドレスに戻ります',
    warnings: '注意事項',
    large: (threshold: string, eta: string) => `高額のしきい値（${threshold}\u00a0KSA）に達しており、BTC 確定まで${eta}かかります`,
    afterNative: (nonce: string) => `まだ BTC 承認を待っているパス C のオペレーション（nonce ${nonce}）の次の nonce を使います。そのすぐ後に取り込まれます`,
    network: (name: string, id: string) => `ネットワーク ${name}（chain_id ${id}）`,
    raw: 'あなたが署名する VmOp',
    minUnit: '最小単位',
    sigHash: '署名ハッシュ',
    /** Path C: on the review page there is no carrying transaction yet, so the sighash can't be given in advance */
    sigHashNative: '署名時に搬送トランザクションの最初の入力から計算されます（D-086）。この時点ではまだありません',
  },

  error: {
    transferOnly: '送金のみ対応しています',
    disconnected: 'ウォレットの接続が切れたため、再接続してください',
    walletDeclined: (detail: string) => `ウォレットが署名しませんでした：${detail}`,
    rpc: {
      invalid: 'ノードが拒否：無効なオペレーション',
      policy: 'ノードが拒否：このノードのポリシーに不適合',
      params: 'ノードが拒否：形式エラー',
      internal: 'ノードの内部エラー',
    },
    rpcCode: (code: string) => `ノードがエラー ${code} を返しました`,
    retrySuggested: '推奨値で再試行',
    node: (what: string, detail: string) => `${what}（${detail}）`,
  },

  toast: {
    submitted: '署名して送信しました',
    broadcast: '署名して BTC にブロードキャストしました',
  },

  sent: {
    broadcastNative: 'BTC にブロードキャスト済み',
    failedFoot: '手数料は差し引かれ、送金は反映されていません',
    droppedFoot: 'チェーンに載らず、手数料もかかっていません',
    failedFootB: (fee: string, amount: string) => `手数料 ${fee} は差し引かれました。${amount} の送金は反映されず、その金額は残高に残っています`,
    failedFootC: (amount: string) => `マイナー手数料は BTC マイナーに支払われ、返金されません。${amount} の送金は反映されず、その金額は残高に残っています`,
    againWait: 'この送金が確認されるまで、次の送金はお待ちください',
    latency: (d: string) => `高速確認まで ${d}`,
    waited: 'ブロック生成者は取り込まないこともできますが、パス C ならブロック生成者は不要です',
    resendC: 'パス C で再送信',
    next: '次の操作',
    again: 'もう 1 件送金',
    backToWallet: 'ウォレットに戻る',
    tx: 'BTC トランザクション',
    manualBroadcast: 'ブロードキャスト手段がありません。このトランザクションをご自身で送信してください：',
    copyRaw: '生トランザクションをコピー',
  },
};

export default send;
