import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Japanese: block detail */
const block: Messages['block'] = {
  head: {
    eyebrow: 'Ksana ブロック',
    eyebrowSide: 'Ksana ブロック · 並行ブロック',
    anchor: 'アンカー',
    prev: '前のブロック',
    next: '次のブロック',
  },

  side: {
    mergedBy: (h: string) => `並行ブロック、#${h} によりマージ済み`,
    waiting: '並行ブロック、マージ待ち',
    sibling: '同じ高さのチェーンブロック',
  },

  header: {
    title: 'ブロックヘッダー',
    hash: 'ブロックハッシュ',
    genesis: 'ジェネシスブロック',
    indexerMatch: 'インデクサーと一致',
    weight: '空ブロックの重み',
    weightHint: '空ブロックが続くと重みが倍増し、難易度と報酬も上がります',
  },

  dag: {
    selectedParent: '選択された親',
    mergedParent: 'マージ対象',
    acceptedBy: 'マージしたチェーンブロック',
    mergedStats: (entries: number, skipped: number) => `エントリ ${entries} 件 · スキップ ${skipped} 件`,
    closure: '決済済み閉包',
  },

  settle: {
    title: '決済',
    own: '独自の決済トランザクションあり',
    ownPair: 'コミットとリビールの 2 件',
    none: '単独では決済されない',
    genesis: 'ジェネシスブロックは決済不要です。',
    bodyCarried: 'ブロック本体は後のブロックの決済に同梱されて記録されます。',
    bodyCarriedLanded: 'ブロック本体は後のブロックの決済に同梱されて記録されました。',
    bodyCarrier: '本体を同梱した決済',
    waiting: '後の決済を待機中',
    otherCarrier: '本体は別のトランザクションに同梱',
    bodyOther: 'ブロック本体は別のトランザクションに同梱されて記録されました。',
    bodyCarrierBlock: '決済したブロック',
    carried: '空ブロックまたは強制取り込みのみのブロックのため、ヘッダーは別のトランザクションに同梱されて記録されます。',
    carriedOwn: '空ブロックまたは強制取り込みのみのブロックは本来決済不要ですが、このブロックは以前のブロックの本体のために決済を送り、ヘッダーもそれに同梱されて記録されます。',
    carrier: '同梱先のトランザクション',
    /** The settlement transaction of #1,024, or another block's settlement transaction */
    carrierOf: (block: string, kind: string) => `${latinGap(block).trimStart()}の${kind}`,
    otherBlock: '別のブロック',
    noCarrier: 'このヘッダーを同梱したトランザクションはまだありません。',
    carrierUnloaded: 'このブロックのヘッダーは別のトランザクションで Bitcoin に記録済みです。そのトランザクションはこのページでは見つかっていません。',
    notBuilt: '決済トランザクションはまだ構築されていません。',
    rescue: '救済 / 再構築',
    confs: (n: number) => `${n.toLocaleString('en-US')} 承認`,
    commit: 'コミットトランザクション',
    reveal: 'リビールトランザクション',
    /** The fee of a settlement's reveal transaction alone, where the page does not know its commit transaction's (D-081) */
    revealFee: 'リビールの手数料',
    revealFeeHint: 'コミットトランザクションの手数料も別にかかりますが、それを賄う入力の金額がわからないため、このページでは加算できません',
    /** A settlement's fee by transaction, the amounts already formatted */
    feeParts: (commit: string, reveal: string) => `コミット ${commit}\u00a0sats + リビール ${reveal}\u00a0sats`,
    content: 'トランザクションの内容',
    contentHint: '全体はビットコインのエクスプローラーで確認してください',
    headers: '同梱したヘッダー',
    headerCount: (n: number) => `${n} 個`,
    bodies: '同梱したブロック本体',
    bodyCount: (n: number) => `${n} 個`,
    dataSize: 'データ量',
    dataMeter: '決済のデータ量',
    versions: (n: number) => `このブロックで構築された決済トランザクション（${n} 件）：`,
  },

  entries: {
    title: (n: number) => `エントリ（${n}）`,
    forced: '強制取り込み · BTC から',
    system: 'ロック解除 · 決済済みブロックの手数料とブロック報酬を支払う',
    fast: '高速パス',
    unlockTo: (h: string, i: number) => `#${h} まで · 番号 ${i}`,
    unlockBlocks: (n: number) => `${n} ブロック`,
    unlockTotal: '合計',
    skipped: (n: number) => `スキップ ${n} 件`,
    gas: (used: string, sum: string) => `gas ${used} / 宣言上限の合計 ${sum}`,
    data: (size: string) => `データ ${size}`,
  },

  type: '種類',
  raw: '生データ（JSON）',
};

export default block;
