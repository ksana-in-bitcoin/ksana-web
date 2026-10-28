import type { ReactNode } from 'react';
import type { Messages } from '..';

const overview: Messages['overview'] = {
  eyebrow: '이중 레인 · 고속 레인과 비트코인',
  title: '순식간에 확인, 비트코인에서 최종 확정',
  latestBlocks: '최신 블록',
  allBlocks: '전체 블록',
  latestOps: '최신 작업',
  allOps: '전체 작업',
  /** The latest ops column when the recent blocks hold none */
  noRecentOps: '최근 블록에 작업이 없습니다',

  vitals: '네트워크 지표',
  blockGap: (n: number) => (n ? `블록 간격 · 최근 ${n}개 블록` : '블록 간격'),
  target: (s: string) => `목표 ${s}`,
  /** In place of the target when most recent blocks are empty: s is the target time, formatted */
  idleTarget: (s: string) => `한가함, 작업이 있으면 약 ${s}`,
  mempool: '멤풀',
  pendingLocal: '포함 대기 · 이 페이지에서 제출',
  pendingLocalHint: '이 페이지에서 제출해 아직 포함되지 않은 작업만 표시',
  opsUnit: (_n: number) => '건',
  fee: '권장 수수료',
  feePathB: '경로 B 권장 대납 수수료',
  feePathC: '경로 C 채굴 수수료',
  feeBasis: (gas: string, rate: string) => `전송 1건 기준, max_gas\u00a0${gas} · BTC 수수료율 ${rate}\u00a0sat/vB`,
  backlog: '정산 적체',
  backlogOf: (limit: number) => `/ ${limit} BTC 블록`,
  backlogTicks: (n: number, limit: number) => `적체 ${n} / ${limit}`,
  backlogFull: '상한 도달: 빠른 경로 일시 중지',
  backlogOldest: (block: string) => `가장 오래된 미기록 데이터: ${block}`,
  backlogLanded: (block: string, confs: number) => `가장 오래된 데이터: ${block} · 비트코인에 기록됨 · ${confs}회 확인 후 적체에서 빠짐`,
  backlogNone: '적체 없음',
  settleRate: '정산 수수료율',
  settleRateMeter: (rate: string) => `정산 수수료율 ${rate}\u00a0sat/vB`,
  consensusMin: (rate: string) => `합의 최저 ${rate}\u00a0sat/vB`,
  btcRate: 'BTC 수수료율',
  btcRateMeter: (rate: string) => `수수료율 ${rate}\u00a0sat/vB`,
  feeSpike: (floor: string, rate: string) => `블록 포함 하한 ${floor}\u00a0sat/vB, ${rate}\u00a0sat/vB로 낸 정산은 정체됩니다`,
  feeFloor: (floor: string, min: string) => `블록 포함 하한 ${floor}\u00a0sat/vB · 정산 최저 ${min}\u00a0sat/vB`,

  rail: {
    range: '시간 범위',
    fast: '고속 레인',
    btc: '비트코인',
    lanes: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">위: {fast}</span>(약 {secs}초에 한 블록) · <span className="nobr">아래: {btc}</span>
      </>
    ),
    /** The same while the fast lane is idle (most recent blocks empty) */
    lanesIdle: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">위: {fast}</span>(작업이 있으면 약 {secs}초에 한 블록, 없으면 점점 느려짐) · <span className="nobr">아래: {btc}</span>
      </>
    ),
    /** Below the chart while the fast lane is idle: secs is the target time, mins the slowest empty block's expected time */
    idle: (secs: number, mins: number) =>
      `고속 레인이 한가합니다. 작업이 없으면 대부분 빈 블록이 만들어지고, 하나씩 느려져 최대 약 ${mins}분에 하나가 됩니다. 정산이 Bitcoin에 기록될 때마다 그 뒤의 블록이 정산된 블록의 보상을 지급하고, 빈 블록은 다시 빠른 간격부터 느려집니다. 작업이 들어오면 약 ${secs}초 안에 블록이 나옵니다.`,
    aria: (fast: string, settled: string, final: string, btc: string) =>
      `이중 레인 차트: 고속 레인 #${fast}, 정산됨 #${settled}, BTC 최종 확정 #${final}, BTC #${btc}`,
    now: '지금',
    entries: (n: number) => `항목 ${n}개`,
    entriesForced: (n: number) => `항목 ${n}개, 강제 포함 있음`,
    skipped: (n: number) => `항목 ${n}개 건너뜀`,
    ksanaTxs: (n: number) => `Ksana 트랜잭션 ${n}건 포함`,
    noKsanaTxs: 'Ksana 트랜잭션 없음',
    confs: (n: number) => `${n.toLocaleString('en-US')}회 확인`,
    settled: (h: string) => `정산됨 #${h}`,
    final: (h: string) => `최종 확정 #${h}`,
    settledFinal: (h: string) => `정산됨 · 최종 확정 #${h}`,
    legend: '범례',
    barHeight: '막대 높이 = 항목 수',
  },
};

export default overview;
