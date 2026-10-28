import type { ReactNode } from 'react';

/** Overview page: tagline, network stats, and the two-lane rail chart (rail, components/RailView.tsx) */
export default {
  eyebrow: '双轨 · 快轨与比特币',
  title: '瞬间确认，最终在比特币上落定',
  latestBlocks: '最新区块',
  allBlocks: '全部区块',
  latestOps: '最新操作',
  allOps: '全部操作',
  /** The latest ops column when the recent blocks hold none */
  noRecentOps: '最近的区块里没有操作',

  /** Network stats */
  vitals: '网络读数',
  /** The block time's label over its window of n gaps; with none to give, the label alone */
  blockGap: (n: number) => (n ? `出块间隔 · 近 ${n} 块` : '出块间隔'),
  /** s is a formatted duration */
  target: (s: string) => `目标 ${s}`,
  /** In place of the target when most recent blocks are empty: s is the target time, formatted */
  idleTarget: (s: string) => `空闲，有操作时约 ${s}`,
  mempool: '条目池',
  /** Node data source: only operations submitted from this page and not yet included */
  pendingLocal: '待收录 · 本页提交',
  pendingLocalHint: '只显示本页提交、尚未收录的操作',
  /** Unit of the mempool stat, written after the number; n is the count (languages with plural forms pick the word by it) */
  opsUnit: (_n: number) => '笔',
  fee: '建议费用',
  /** The two parts of the suggested fee: the path B sponsor fee and the path C miner fee (hover text) */
  feePathB: '路径 B 建议代付费',
  feePathC: '路径 C 矿工费',
  /** Assumptions behind the suggested fee: gas and rate are formatted */
  feeBasis: (gas: string, rate: string) => `一笔转账，max_gas\u00a0${gas} · BTC 费率 ${rate}\u00a0sat/vB`,
  backlog: '结算积压',
  /** Unit of the backlog stat, written after the number */
  backlogOf: (limit: number) => `/ ${limit} BTC 块`,
  backlogTicks: (n: number, limit: number) => `积压 ${n} / ${limit}`,
  backlogFull: '已达上限：快速路径暂停',
  /** block is "#height" or "Parallel block #height" */
  backlogOldest: (block: string) => `最早未上链的\u200b数据：${block}`,
  /** block as in backlogOldest; confs: the confirmations at which its data, on Bitcoin above the anchor, leaves the backlog */
  backlogLanded: (block: string, confs: number) => `最早的数据：${block} · 已写入比特币 · ${confs} 个确认后移出积压`,
  backlogNone: '没有积压',
  settleRate: '结算费率',
  settleRateMeter: (rate: string) => `结算费率 ${rate}\u00a0sat/vB`,
  consensusMin: (rate: string) => `共识最低 ${rate}\u00a0sat/vB`,
  btcRate: 'BTC 费率',
  btcRateMeter: (rate: string) => `费率 ${rate}\u00a0sat/vB`,
  /** Fee spike: floor is the fee floor for getting into a block, rate is the fee rate settlements are funded at */
  feeSpike: (floor: string, rate: string) => `入块门槛 ${floor}\u00a0sat/vB，按 ${rate}\u00a0sat/vB 出资的结算会卡住`,
  feeFloor: (floor: string, min: string) => `入块门槛 ${floor}\u00a0sat/vB · 结算最低 ${min}\u00a0sat/vB`,

  /** Two-lane rail chart */
  rail: {
    range: '时间范围',
    fast: '快轨',
    btc: '比特币',
    /** On narrow screens the lane names move above the chart: fast and btc are the bold lane names */
    lanes: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">上轨 {fast}</span>，约 {secs} 秒一块；<span className="nobr">下轨 {btc}</span>
      </>
    ),
    /** The same while the fast lane is idle (most recent blocks empty) */
    lanesIdle: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">上轨 {fast}</span>，有操作时约 {secs} 秒一块，<span className="nobr">空闲时渐慢</span>；<span className="nobr">下轨 {btc}</span>
      </>
    ),
    /** Below the chart while the fast lane is idle: secs is the target time, mins the slowest empty block's expected time */
    idle: (secs: number, mins: number) =>
      `快轨空闲：没有操作时大多是空块，一块比一块慢，最慢约 ${mins} 分钟一块；每当一笔结算上了 Bitcoin，随后的一块就发放已结算块的奖励，空块重新由快到慢。一有操作，约 ${secs} 秒出块。`,
    /** Screen-reader description; heights are formatted */
    aria: (fast: string, settled: string, final: string, btc: string) => `双轨图：快轨 #${fast}，已结算 #${settled}，BTC 最终 #${final}，BTC #${btc}`,
    /** Right end of the x-axis */
    now: '现在',
    /** Hover text */
    entries: (n: number) => `${n} 个条目`,
    entriesForced: (n: number) => `${n} 个条目，含强制收录`,
    skipped: (n: number) => `${n} 个条目被跳过`,
    ksanaTxs: (n: number) => `含 ${n} 笔 Ksana 交易`,
    noKsanaTxs: '不含 Ksana 交易',
    confs: (n: number) => `${n.toLocaleString('en-US')} 个确认`,
    /** Boundaries of the settled closure and BTC finality */
    settled: (h: string) => `已结算 #${h}`,
    final: (h: string) => `最终 #${h}`,
    settledFinal: (h: string) => `已结算 · 最终 #${h}`,
    legend: '图例',
    barHeight: '竖条高度 = 条目数',
  },
};
