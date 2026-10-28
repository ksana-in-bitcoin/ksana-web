import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Traditional Chinese (Taiwan): overview page and the two-lane rail chart */
const overview: Messages['overview'] = {
  eyebrow: '雙軌 · 快軌與比特幣',
  title: '瞬間確認，最終在比特幣上落定',
  latestBlocks: '最新區塊',
  allBlocks: '全部區塊',
  latestOps: '最新操作',
  allOps: '全部操作',
  /** The latest ops column when the recent blocks hold none */
  noRecentOps: '最近的區塊裡沒有操作',

  vitals: '網路讀數',
  blockGap: (n: number) => (n ? `出塊間隔 · 近 ${n} 個區塊` : '出塊間隔'),
  target: (s: string) => `目標 ${s}`,
  /** In place of the target when most recent blocks are empty: s is the target time, formatted */
  idleTarget: (s: string) => `閒置，有操作時約 ${s}`,
  mempool: '條目池',
  pendingLocal: '待收錄 · 本頁提交',
  pendingLocalHint: '只顯示本頁提交、尚未收錄的操作',
  opsUnit: (_n: number) => '筆',
  fee: '建議費用',
  feePathB: '路徑 B 建議代付費',
  feePathC: '路徑 C 礦工費',
  feeBasis: (gas: string, rate: string) => `一筆轉帳，max_gas\u00a0${gas} · BTC 費率 ${rate}\u00a0sat/vB`,
  backlog: '結算積壓',
  backlogOf: (limit: number) => `/ ${limit} 個 BTC 區塊`,
  backlogTicks: (n: number, limit: number) => `積壓 ${n} / ${limit}`,
  backlogFull: '已達上限：快速路徑暫停',
  backlogOldest: (block: string) => `最早未上鏈的\u200b資料：${block}`,
  backlogLanded: (block: string, confs: number) => `最早的資料：${block} · 已寫入比特幣 · ${confs} 個確認後移出積壓`,
  backlogNone: '沒有積壓',
  settleRate: '結算費率',
  settleRateMeter: (rate: string) => `結算費率 ${rate}\u00a0sat/vB`,
  consensusMin: (rate: string) => `共識最低 ${rate}\u00a0sat/vB`,
  btcRate: 'BTC 費率',
  btcRateMeter: (rate: string) => `費率 ${rate}\u00a0sat/vB`,
  feeSpike: (floor: string, rate: string) => `入塊門檻 ${floor}\u00a0sat/vB，以 ${rate}\u00a0sat/vB 出資的結算會卡住`,
  feeFloor: (floor: string, min: string) => `入塊門檻 ${floor}\u00a0sat/vB · 結算最低 ${min}\u00a0sat/vB`,

  rail: {
    range: '時間範圍',
    fast: '快軌',
    btc: '比特幣',
    lanes: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">上軌 {fast}</span>，約 {secs} 秒一個區塊；<span className="nobr">下軌 {btc}</span>
      </>
    ),
    /** The same while the fast lane is idle (most recent blocks empty) */
    lanesIdle: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">上軌 {fast}</span>，有操作時約 {secs} 秒一個區塊，<span className="nobr">閒置時漸慢</span>；<span className="nobr">下軌 {btc}</span>
      </>
    ),
    /** Below the chart while the fast lane is idle: secs is the target time, mins the slowest empty block's expected time */
    idle: (secs: number, mins: number) =>
      `快軌閒置：沒有操作時大多是空區塊，一個比一個慢，最慢約 ${mins} 分鐘一個；每當一筆結算上了 Bitcoin，隨後的一個區塊就發放已結算區塊的獎勵，空區塊重新由快到慢。一有操作，約 ${secs} 秒出塊。`,
    aria: (fast: string, settled: string, final: string, btc: string) => `雙軌圖：快軌 #${fast}，已結算 #${settled}，BTC 最終 #${final}，BTC #${btc}`,
    now: '現在',
    entries: (n: number) => `${n} 個條目`,
    entriesForced: (n: number) => `${n} 個條目，含強制收錄`,
    skipped: (n: number) => `${n} 個條目被跳過`,
    ksanaTxs: (n: number) => `含 ${n} 筆 Ksana 交易`,
    noKsanaTxs: '不含 Ksana 交易',
    confs: (n: number) => `${n.toLocaleString('en-US')} 個確認`,
    settled: (h: string) => `已結算 #${h}`,
    final: (h: string) => `最終 #${h}`,
    settledFinal: (h: string) => `已結算 · 最終 #${h}`,
    legend: '圖例',
    barHeight: '直條高度 = 條目數',
  },
};

export default overview;
