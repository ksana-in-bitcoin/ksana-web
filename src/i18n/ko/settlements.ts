import type { Messages } from '..';

const settlements: Messages['settlements'] = {
  eyebrow: '비트코인 위의 Ksana',
  title: '정산',
  inMempool: 'BTC 멤풀',

  tabsLabel: '트랜잭션 유형',
  tab: {
    settlement: '정산 트랜잭션',
    native: '네이티브 · 경로 C',
    other: '재전송·가속',
  },

  col: {
    block: 'Ksana 블록',
    bodies: '블록 본문',
    headers: '블록 헤더',
    data: '데이터 크기',
    user: '사용자',
    forced: '강제 포함',
    btcBlock: 'BTC 블록',
  },
  waitingConf: '확인 대기',
  headersContent: (span: string, n: number) => `${span}, 블록 헤더 총 ${n}개`,
  cpfpContent: 'CPFP 가속',
  commit: '커밋 트랜잭션',
  /** Before the fee rate of a settlement whose commit transaction's fee the page does not know: the fee shown is the reveal transaction's (D-081) */
  revealOnly: '공개 트랜잭션만',
  empty: '아직 이 유형의 트랜잭션 없음',
  /** Node data source: header item, the number of blocks loaded whose BTC transactions the list holds */
  ofLoaded: (n: number) => `불러온 블록 ${n.toLocaleString('en-US')}개에서`,
  /** Node data source: none of this type in the blocks loaded (the chain may hold older ones) */
  emptyLoaded: '불러온 블록에는 이 유형의 트랜잭션 없음',

  status: {
    confs: (n: number) => `${n.toLocaleString('en-US')}회 확인`,
    stuck: 'BTC 멤풀에서 정체',
    feeBelow: (rate: string, min: string) => `수수료율 ${rate}\u00a0sat/vB가 블록 포함 하한 ${min}\u00a0sat/vB보다 낮음`,
  },
};

export default settlements;
