import type { Messages } from '..';
import { latinGap } from '../spacing';

/** A sentence-initial parameter is followed directly by kana: a space is kept only after a Latin-script ending ("#1,024 の", "並行ブロック …（#1,024）の") */
const head = (s: string) => latinGap(s).trimStart();

/** Japanese: text produced by the in-browser simulator */
const sim: Messages['sim'] = {
  label: {
    faucet: 'devnet フォーセット',
    operator: 'devnet 運営',
    demo: 'デモアカウント',
    share: 'ブロック配分アカウント',
    seller: 'KSA の売り手',
    contract: (name: string) => `コントラクト · ${name}`,
    tknContract: 'TKN トークン',
    ammContract: 'AMM',
    triggerContract: 'BTC 支払いトリガー',
    exchangeContract: 'KSA 交換',
  },
  name: {
    tknContract: 'サンプルトークン TKN',
    ammContract: '定数積 AMM（KSA/TKN）',
    triggerContract: 'BTC 支払いトリガーで発行',
    exchangeContract: 'KSA 交換（BTC で KSA を購入）',
    tknAsset: 'サンプルトークン',
    passAsset: 'BTC 支払い証明',
  },

  /** Rejected by this node on submit (shown on the Send page) */
  reject: {
    tooLarge: (size: number) => `オペレーションが大きすぎます：${size} バイト（上限 64 KiB）`,
    nativeGas: (max: string) => `パス C の max_gas は ${max} 以下にしてください`,
    feeLow: (min: string) => `代払い手数料は ${min}\u00a0KSA 以上にしてください`,
    ksa: 'KSA 残高が代払い手数料に足りません',
    noUtxo: 'マイナー手数料を払える BTC UTXO がありません',
    lockNotOpen: 'ロックが Open ではありません',
    lockMissing: 'このロックが見つかりません',
    sats: '支払い金額は 0 より大きくしてください',
    notBeneficiary: 'チャージできるのはロックの受益アカウントだけです',
    nonceUsed: (nonce: string) => `nonce ${nonce} はすでに使われています`,
  },

  /** Failure and skip reasons in receipts */
  exec: {
    skipped: (reason: string) => `スキップ：${reason}`,
    unaccepted: 'メインチェーンに未マージ',
    thisBlock: 'このブロック',
    duplicate: (where: string) => `重複して取り込まれ、すでに${latinGap(where)}で実行済み`,
    nonceConflict: (cur: string, op: string) => `nonce の競合：アカウントは現在 ${cur}、オペレーションは ${op}`,
    ksaShort: 'KSA 残高が代払い手数料に不足',
    unknownOp: '不明なオペレーション',
    nonceMismatch: (cur: string, op: string) => `nonce の不一致：アカウントは現在 ${cur}、オペレーションは ${op}`,
    outOfGas: (max: string) => `実行が max_gas（${max}）を超過`,
    trap: 'コントラクトの trap：unreachable',
    noAsset: '資産が存在しません',
    balanceShort: (symbol: string) => `${symbol} の残高不足`,
    noContract: 'コントラクトが存在しません',
    liquidityShort: '残高不足のため流動性を追加できません',
    slippage: (out: string, min: string) => `スリッページ超過：受取額 ${out} が min_out ${min} を下回っています`,
    headerShallow: (min: number, h: string, depth: number) => `btc_header で読めるのは深さ ${min} 以上のブロックのみ（BTC #${h} の深さは ${depth}）`,
    lockNotOpen: 'ロックが Open ではありません',
    alreadyUnlocked: 'ロック解除カーソルはすでにこの位置を過ぎています',
    unlockNotSettled: '対象ブロックはまだ決済済みクロージャに入っていません',
    mergedUnlock: '並行ブロックのロック解除エントリは実行されません。カーソルを進めるのはチェーンブロック自身のロック解除エントリだけです',
    fundsShort: (symbol: string) => `添付する ${symbol} の残高が不足しています`,
    noMethod: (method: string) => `コントラクトに ${method} メソッドがありません`,
    lockInvalid: 'ロックのパラメータが無効：数量と価格は 0 より大きく、期限はアンカー高さより後にしてください',
    scriptUsed: 'この受取スクリプトは別のロックで使われています',
    exchangeShort: '交換コントラクトの利用可能残高が不足しています',
    notNative: '受け取れるのはパス C の操作だけです',
    noPayment: 'トランザクションにロックの受取アドレスへの出力がありません',
    notSeller: 'ロックを解放できるのは売り手だけです',
    notExpired: (h: string) => `ロックは BTC #${h} より後にしか解放できません`,
  },

  /** Why an operation was dropped from the mempool */
  dropped: {
    nonceUsed: (nonce: string) => `nonce ${nonce} は同じアカウントの別のオペレーションで使用済み`,
  },

  /** Notes on BTC transactions */
  note: {
    commit: 'コミットトランザクション',
    reveal: 'リビールトランザクション',
    carriedBodies: (n: number) => `ブロック本体 ${n} 個を同梱`,
    rebuiltOffline: 'ブロック生成者がオフラインのため、他のノードが再構築',
    carriedElsewhere: 'ペイロードのデータは別のトランザクションでチェーンに載ったため、ブロードキャストしません',
  },

  /** Event log (regtest console and toasts) */
  event: {
    sideBlock: (hash: string, h: string) => `並行ブロック ${hash}（#${h}）`,
    backlogOn: (block: string, n: number) => `決済の滞留：${head(block)}が ${n} BTC ブロック待機し、高速パスは停止`,
    backlogOff: '決済の滞留が解消し、高速パスが再開',
    merged: (h: string, n: number) => `#${h} が並行ブロック ${n} 個をマージ`,
    mergedSkipped: (n: number) => `、重複または競合するエントリ ${n} 件をスキップ`,
    rescue: (block: string) => `${head(block)}の決済トランザクションが無効になり、救済決済を開始`,
    headers: (n: number) => `ヘッダー ${n} 個を再送`,
    settledTo: (h: string) => `決済済みが #${h} まで進行`,
    finalTo: (h: string) => `BTC 確定が #${h} まで進行`,
    btcBlock: (h: string, n: number) => `BTC #${h} を生成、Ksana トランザクション ${n} 件を含む`,
    mined: (n: number) => `regtest：BTC ブロックを ${n} 個手動で採掘`,
    faucet: 'フォーセット：5,000\u00a0KSA と 0.1\u00a0BTC を送金',
    unlock: (h: string, amount: string) => `#${h} までロック解除、合計 ${amount}\u00a0KSA`,
    emptyWeight: (w: number) => `空ブロックの重み ×${w}`,
    topUp: (sats: string, ksa: string) => `チャージ：${sats}\u00a0sats を支払い、${ksa}\u00a0KSA を受け取り`,
    censorOn: 'シナリオ：ブロック生成者がこのアカウントの取り込みを停止',
    censorOff: 'シナリオ：ブロック生成者がこのアカウントの取り込みを再開',
    feeSpikeOn: 'シナリオ：BTC 手数料率が 40\u00a0sat/vB に上昇し、決済トランザクションが停滞',
    feeSpikeOff: 'シナリオ：BTC 手数料率が元に戻る',
    cpfpMany: (n: number) => `停滞中のトランザクション ${n} 件に P2A アンカーで CPFP`,
    cpfpOne: '停滞中のトランザクションに CPFP',
    offline: (name: string) => `シナリオ：${head(name)}がオフライン`,
    online: 'シナリオ：ブロック生成者がオンラインに復帰',
  },
};

export default sim;
