import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Japanese: overview page and the two-lane rail chart */
const overview: Messages['overview'] = {
  eyebrow: '2 レーン · 高速レーンとビットコイン',
  title: '瞬時に確認、ビットコインで確定',
  latestBlocks: '最新のブロック',
  allBlocks: 'すべてのブロック',
  latestOps: '最新のオペレーション',
  allOps: 'すべてのオペレーション',
  /** The latest ops column when the recent blocks hold none */
  noRecentOps: '最近のブロックにオペレーションはありません',

  vitals: 'ネットワークの状況',
  blockGap: (n: number) => (n ? `ブロック間隔 · 直近 ${n} ブロック` : 'ブロック間隔'),
  target: (s: string) => `目標 ${s}`,
  /** In place of the target when most recent blocks are empty: s is the target time, formatted */
  idleTarget: (s: string) => `待機中 · オペレーションがあれば約 ${s}`,
  mempool: 'メンプール',
  pendingLocal: '取り込み待ち · このページから送信',
  pendingLocalHint: 'このページから送信し、まだ取り込まれていないオペレーションのみ表示',
  /** Japanese doesn't distinguish singular and plural */
  opsUnit: (_n: number) => '件',
  fee: '推奨手数料',
  feePathB: 'パス B の推奨代払い手数料',
  feePathC: 'パス C のマイナー手数料',
  feeBasis: (gas: string, rate: string) => `送金 1 件、max_gas\u00a0${gas} · BTC 手数料率 ${rate}\u00a0sat/vB`,
  backlog: '決済の滞留',
  backlogOf: (limit: number) => `/ ${limit} BTC ブロック`,
  backlogTicks: (n: number, limit: number) => `滞留 ${n} / ${limit}`,
  backlogFull: '上限に到達：高速パスは停止中',
  /** The backlog's notes break only at their spaces and zero-width spaces (`.vital-note`): after a particle, not inside a word */
  backlogOldest: (block: string) => `最古の\u200b未記録データ：${block}`,
  backlogLanded: (block: string, confs: number) => `最古のデータ：${block} · ビットコインに\u200b記録済み · ${confs} 承認で\u200b滞留から外れる`,
  backlogNone: '滞留なし',
  settleRate: '決済の手数料率',
  settleRateMeter: (rate: string) => `決済の手数料率 ${rate}\u00a0sat/vB`,
  consensusMin: (rate: string) => `コンセンサスの下限 ${rate}\u00a0sat/vB`,
  btcRate: 'BTC 手数料率',
  btcRateMeter: (rate: string) => `手数料率 ${rate}\u00a0sat/vB`,
  feeSpike: (floor: string, rate: string) => `ブロック入りの下限が ${floor}\u00a0sat/vB のため、${rate}\u00a0sat/vB の決済は停滞します`,
  feeFloor: (floor: string, min: string) => `ブロック入りの下限 ${floor}\u00a0sat/vB · 決済の下限 ${min}\u00a0sat/vB`,

  rail: {
    range: '時間範囲',
    fast: '高速レーン',
    btc: 'ビットコイン',
    lanes: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">上段は{fast}</span>（約 {secs} 秒に 1 ブロック）、<span className="nobr">下段は{btc}</span>
      </>
    ),
    /** The same while the fast lane is idle (most recent blocks empty) */
    lanesIdle: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">上段は{fast}</span>（オペレーションがあれば約 {secs} 秒に 1 ブロック、なければ次第に遅く）、<span className="nobr">下段は{btc}</span>
      </>
    ),
    /** Below the chart while the fast lane is idle: secs is the target time, mins the slowest empty block's expected time */
    idle: (secs: number, mins: number) =>
      `高速レーンは待機中です。オペレーションがないあいだはほとんどが空ブロックで、1 つごとに遅くなりながら最長で約 ${mins} 分に 1 つ作られます。決済が Bitcoin に載るたびに、そのあとのブロックが決済済みブロックの報酬を支払い、空ブロックはまた速いところから遅くなっていきます。オペレーションが届けば約 ${secs} 秒でブロックになります。`,
    aria: (fast: string, settled: string, final: string, btc: string) => `2 レーン図：高速レーン #${fast}、決済済み #${settled}、BTC 確定 #${final}、BTC #${btc}`,
    now: '現在',
    entries: (n: number) => `エントリ ${n} 件`,
    entriesForced: (n: number) => `エントリ ${n} 件（強制取り込みを含む）`,
    skipped: (n: number) => `エントリ ${n} 件をスキップ`,
    ksanaTxs: (n: number) => `Ksana トランザクション ${n} 件を含む`,
    noKsanaTxs: 'Ksana トランザクションなし',
    confs: (n: number) => `${n.toLocaleString('en-US')} 承認`,
    settled: (h: string) => `決済済み #${h}`,
    final: (h: string) => `確定 #${h}`,
    settledFinal: (h: string) => `決済済み · 確定 #${h}`,
    legend: '凡例',
    barHeight: 'バーの高さ = エントリ数',
  },
};

export default overview;
