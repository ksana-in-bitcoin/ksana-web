import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Overview: tagline, network stats and the two-lane rail chart (components/RailView.tsx) */
const overview: Messages['overview'] = {
  eyebrow: 'Two lanes · Ksana and Bitcoin',
  title: 'Confirmed in an instant. Final on Bitcoin.',
  latestBlocks: 'Latest blocks',
  allBlocks: 'All blocks',
  latestOps: 'Latest operations',
  allOps: 'All operations',
  /** The latest ops column when the recent blocks hold none */
  noRecentOps: 'No operations in the recent blocks',

  /** Network stats */
  vitals: 'Network stats',
  /** The block time's label over its window of n gaps; with none to give, the label alone */
  blockGap: (n: number) => (n ? `Block time · last ${n} ${n === 1 ? 'block' : 'blocks'}` : 'Block time'),
  /** s is a formatted duration */
  target: (s: string) => `Target ${s}`,
  /** In place of the target when most recent blocks are empty: s is the target time, formatted */
  idleTarget: (s: string) => `Idle; ~${s} once there are operations`,
  mempool: 'Mempool',
  /** Node data source: only operations submitted from this page that aren't included yet */
  pendingLocal: 'Pending · this page',
  pendingLocalHint: 'Only operations submitted from this page and not yet included',
  /** Unit after the mempool count */
  opsUnit: (n: number) => (n === 1 ? 'op' : 'ops'),
  fee: 'Suggested fee',
  /** The two parts of the suggested fee: Path B sponsor fee and Path C miner fee (hover text) */
  feePathB: 'Path B suggested sponsor fee',
  feePathC: 'Path C miner fee',
  /** gas and rate are formatted */
  feeBasis: (gas: string, rate: string) => `Per transfer: max_gas\u00a0${gas} · BTC fee rate ${rate}\u00a0sat/vB`,
  backlog: 'Settlement backlog',
  /** Unit after the backlog count */
  backlogOf: (limit: number) => `/ ${limit} BTC ${limit === 1 ? 'block' : 'blocks'}`,
  backlogTicks: (n: number, limit: number) => `Backlog ${n} / ${limit}`,
  backlogFull: 'At limit: fast paths paused',
  /**
   * block is "#height" or "Parallel block #height": the oldest block whose data (its body, D-077) the backlog counts. Its data, not
   * the block: the empty blocks before it have no body to count, and may not be on Bitcoin yet either
   */
  backlogOldest: (block: string) => `Oldest data not on Bitcoin: ${block}`,
  /** block as in backlogOldest; confs: the confirmations at which its data, on Bitcoin above the anchor, leaves the backlog */
  backlogLanded: (block: string, confs: number) => `Oldest data: ${block} · on Bitcoin; leaves the backlog at ${confs} ${confs === 1 ? 'confirmation' : 'confirmations'}`,
  backlogNone: 'No backlog',
  settleRate: 'Settlement fee rate',
  settleRateMeter: (rate: string) => `Settlement fee rate ${rate}\u00a0sat/vB`,
  consensusMin: (rate: string) => `Consensus minimum ${rate}\u00a0sat/vB`,
  btcRate: 'BTC fee rate',
  btcRateMeter: (rate: string) => `Fee rate ${rate}\u00a0sat/vB`,
  /** Fee spike: floor is the fee floor, rate is what settlements are funded at */
  feeSpike: (floor: string, rate: string) => `Fee floor ${floor}\u00a0sat/vB; settlements funded at ${rate}\u00a0sat/vB will get stuck`,
  feeFloor: (floor: string, min: string) => `Fee floor ${floor}\u00a0sat/vB · settlement minimum ${min}\u00a0sat/vB`,

  /** Two-lane rail chart */
  rail: {
    range: 'Time range',
    fast: 'Ksana',
    btc: 'Bitcoin',
    /** Narrow screens move the lane names above the chart: fast and btc are bold lane names, each kept on one line with its label */
    lanes: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">Top: {fast}</span>, a block every ~{secs} s; <span className="nobr">bottom: {btc}</span>
      </>
    ),
    /** The same while the fast lane is idle (most recent blocks empty) */
    lanesIdle: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">Top: {fast}</span>, a block every ~{secs} s when there are operations, slower when idle; <span className="nobr">bottom: {btc}</span>
      </>
    ),
    /** Below the chart while the fast lane is idle: secs is the target time, mins the slowest empty block's expected time */
    idle: (secs: number, mins: number) =>
      `Idle: with no operations, Ksana makes mostly empty blocks, each slower than the last, up to about one every ${mins}\u00a0min. Each time a settlement lands on Bitcoin, a block then pays out the rewards of the blocks it settled, and the slowing starts over; an operation gets a block in about\u00a0${secs}\u00a0s.`,
    /** Screen-reader description; heights are formatted */
    aria: (fast: string, settled: string, final: string, btc: string) => `Two-lane chart: Ksana #${fast}, settled #${settled}, BTC final #${final}, BTC #${btc}`,
    /** Right end of the x-axis */
    now: 'now',
    /** Hover text */
    entries: (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`,
    entriesForced: (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}, incl. forced inclusion`,
    skipped: (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'} skipped`,
    ksanaTxs: (n: number) => `${n} Ksana ${n === 1 ? 'transaction' : 'transactions'}`,
    noKsanaTxs: 'No Ksana transactions',
    confs: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'confirmation' : 'confirmations'}`,
    /** Settled closure and BTC final boundaries */
    settled: (h: string) => `Settled #${h}`,
    final: (h: string) => `Final #${h}`,
    settledFinal: (h: string) => `Settled · final #${h}`,
    legend: 'Legend',
    barHeight: 'Bar height = entries',
  },
};

export default overview;
