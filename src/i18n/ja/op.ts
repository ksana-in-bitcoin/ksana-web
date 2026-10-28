import type { Messages } from '..';

/** Japanese: operation detail */
const op: Messages['op'] = {
  head: {
    mine: 'あなたのオペレーション',
    toMe: 'あなた宛て',
    execFailed: '実行失敗',
    liveStatus: (status: string) => `現在の状態：${status}`,
  },

  banner: {
    failed: (reason: string) => `実行失敗：${reason}`,
    failedCharged: '手数料は差し引かれ nonce も使われましたが、その他の変更は巻き戻されました。',
    failedNative: '状態は変わりませんが、BTC マイナーに支払った手数料は戻りません。',
    failedNativeUsed: 'nonce は使われ BTC マイナーに支払った手数料も戻りませんが、その他の変更は巻き戻されました。',
    skipped: 'スキップ：実行されず、手数料もかかりません',
    dropped: 'メンプールから除外：チェーンに載らず、手数料もかかりません',
    waitedBody: 'ブロック生成者は取り込まないこともできますが、パス C ならブロック生成者は不要です。',
    resendNative: 'パス C で再送信',
    large: '高額の着金：BTC 確定まで待つことをおすすめします',
    largeBody: '金額が、設定した高額のしきい値以上です。',
  },

  journey: {
    title: '高速確認から BTC 確定へ',
    /** Followed by the duration */
    fastLatency: '送信から高速確認まで',
  },

  vmop: {
    sigHash: '署名ハッシュ',
    size: 'エンコード長',
    bytes: (n: string) => `${n} バイト`,
    cap: (n: string) => `上限 ${n}`,
    /** Before the gas an executed op used, under its max_gas */
    gasUsed: '使用量',
    minerFee: (sats: string, rate: string) => `${sats}\u00a0sats（${rate}\u00a0sat/vB）`,
    name: '名前',
    code: 'コード',
    wasm: (n: string) => `${n} バイトの WASM`,
  },

  exec: {
    title: '実行',
    block: '所属ブロック',
    entry: (index: number) => `エントリ #${index}`,
    accepted: '受理したブロック',
    fastDepth: '高速レーンでの深さ',
    confs: (n: number) => `${n.toLocaleString('en-US')} 承認`,
    events: 'イベント',
    nativeTx: 'ネイティブトランザクション',
    closure: '決済済み閉包',
  },

  raw: '生データ（JSON）',
};

export default op;
