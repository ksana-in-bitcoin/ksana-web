import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Counts with thousands separators (digits are written the same in every language) */
const int = (n: number) => n.toLocaleString('en-US');

/** Japanese: verify page */
const verify: Messages['verify'] = {
  eyebrow: 'どのノードも信頼不要',
  title: '検証',
  lead: 'インデクサーはビットコイン上のデータだけを読み、各ブロックを実行し直して、得られた状態がヘッダーの state_root と同じときだけ受け入れます。このページは、それがノードのブロックを受け入れたかを照合します。',
  bitcoin: 'ビットコイン',

  flow: {
    label: '検証の流れ',
    node: 'Ksana ノード',
    settled: (height: ReactNode) => <>Ksana は {height} まで決済済み</>,
    readOnly: 'BTC のみ読み取り',
    indexer: '独立インデクサー',
    noIndexer: '未接続：データソース設定でインデクサーの URL を入力してください',
    halted: (reason: string) => `インデクサー停止：${reason}`,
    ok: 'すべて一致',
    okCompared: (n: number) => (n === 1 ? 'このページで 1 回照合し、一致' : `このページで ${int(n)} 回照合し、すべて一致`),
    /** No check made yet */
    none: 'まだ照合していません',
    /** The indexer did not answer the last time the page asked */
    unreachable: '応答がありません。応答するまで照合できず、ページは更新のたびに問い合わせ直します',
    /** The recent checks match; an older one did not, as the line under it says */
    okRecent: '最近の照合は一致',
    /** Checks that did not match, older than the recent ones the page keeps: failed of the n checks this page made, the latest at height */
    earlier: (failed: number, n: number, height: ReactNode) =>
      failed === 1 ? (
        <>それ以前、このページでの {int(n)} 回の照合のうち 1 回が不一致（{height}）</>
      ) : (
        <>それ以前、このページでの {int(n)} 回の照合のうち {int(failed)} 回が不一致（最後は {height}）</>
      ),
    forked: 'メインチェーンが異なる：インデクサーはこの高さで別のブロックを受け入れました。ノードのブロックが無効か、未決済の分岐上にある可能性があります',
    stalled: (height: ReactNode) => <>{height} を実行できるのに、まだ実行していません</>,
    mismatch: '不一致を検出：高速レーンに無効なブロックがある可能性があります',
  },
  lag: (n: number, unwritten: number, depth: number) => {
    if (unwritten >= n) return `インデクサーは最新ブロックより ${int(n)} ブロック遅れており、それらはビットコインへの記録待ちです。`;
    if (unwritten === 0) return `インデクサーは最新ブロックより ${int(n)} ブロック遅れています。各ブロックは、その後の ${int(depth)} ブロックもビットコインに記録されてから実行されます。`;
    return `インデクサーは最新ブロックより ${int(n)} ブロック遅れています。最新の ${int(unwritten)} ブロックはまだビットコインへの記録待ちで、各ブロックはその後の ${int(depth)} ブロックも記録されてから実行されます。`;
  },
  stall: (height: ReactNode, btc: ReactNode, depth: number) => (
    <>
      インデクサーは {height} をまだ実行していませんが、このブロックのデータと後続 {int(depth)} ブロックのヘッダーは {btc} からビットコイン上にあります。追いついている途中か、ローカルの障害で止まっているか、このブロックを無効と判定した可能性があります。実行されるまで、このブロック以降を保証しているのはノードだけです。
    </>
  ),

  checks: {
    title: '最近の照合',
    caption: 'state_root の照合',
    noIndexer: 'インデクサーが接続されていません',
    none: '照合の記録はまだありません',
    nodeRoot: 'ノードの state_root',
    /**
     * A zero-width space after the particle: on a phone the label (word-break: keep-all) breaks there too, beside a root of 21 characters that
     * does not break, where kept whole it ran 12 px past a 320 px screen
     */
    indexerRoot: 'インデクサーが\u200b再計算した state_root',
    match: '一致',
    forked: 'メインチェーンが異なる',
    mismatch: '不一致',
    nodeBlock: (hash: string) => `この高さでのノードのチェーンブロック：${hash}`,
    at: '照合時刻',
  },

  confirm: {
    title: '2 種類の確認',
    when: '条件',
    time: '目安の所要時間',
    security: '安全性の根拠',
    fit: '向いている用途',
    fastWhen: 'Ksana ブロックに取り込まれる',
    fastSecurity: '高速レーンの PoW ハッシュレート',
    fastFit: '日常の少額オペレーション',
    finalWhen: (confs: number) => `データがビットコインで ${confs} 承認を得て、判定したビットコインのブロックも ${confs} 承認を得る`,
    finalTime: (mainnet: string, network: string, now?: string) =>
      now === undefined ? (
        `メインネットで${mainnet}`
      ) : (
        <>
          <span className="phrase">メインネットで{mainnet}、</span>
          <span className="phrase">{network} では現在{now}</span>
        </>
      ),
    finalFit: '高額、またはビットコインの保証が必要な結果',
    risk: '高速レーンへの過半数ハッシュレート攻撃で巻き戻せるのは、BTC 確定前のブロックだけです。',
  },

  params: {
    title: 'プロトコルのパラメーター',
    eyebrow: (chain: string) => `${chain} のパラメータ`,
    name: 'パラメーター',
    value: '値',
    note: '説明',
    count: (n: number) => `${n} 件のパラメーター`,
  },

  self: {
    title: '自分で照合',
    how: (indexer: ReactNode, txindex: ReactNode) => (
      <>
        {indexer} を実行し、{txindex} を有効にした bitcoind に接続するだけです。
      </>
    ),
    btcTip: '最新ブロック',
    indexerAt: 'インデクサーの処理済み',
    console: 'regtest コンソールで異常シナリオを試す',
    settings: 'データソースとインデクサーの設定',
  },
};

export default verify;
