import type { Messages } from '..';

const ui: Messages['ui'] = {
  copyWhat: (label: string, text: string) => `${label}: ${text}`,
  accountTitle: (address: string) => `계정 ${address}`,
  accountHex: (id: string) => `16진수 ${id}`,
  contractTitle: (id: string) => `컨트랙트 ${id}`,
  sideBlockSr: '(병렬 블록)',
  goneSr: '(이 목록에서 빠짐)',
  issuedBy: '발행처',
  lookalike: (coin: string) => `${coin}가 아닙니다: 이름이 ${coin}와 비슷한 컨트랙트 자산입니다`,

  emptyBlock: '빈 블록',
  entryCounts: (b: number, c: number) => `대납 ${b} · 강제 포함 ${c}`,
  entryCountsOther: (n: number) => ` · 잠금 해제 ${n}`,
  entryUnlock: '잠금 해제',
  mergedCount: (n: number) => `병렬 블록 ${n}개 병합`,
  btcAnchor: 'BTC 앵커',
  blockList: '블록 목록',
  opList: '작업 목록',
  received: '받음',
  arrowTo: '받는 계정',
  arrowFrom: '보낸 계정',
  sender: '발신 계정',

  minerFee: '채굴 수수료',
  minerFeeHint: 'BTC 채굴자에게 지급',
  feeRateCapped: (rate: string, cap: string) => `노드 제안은 ${rate}\u00a0sat/vB이지만, 이 페이지는 최대 ${cap}\u00a0sat/vB를 씁니다`,
  skipped: '건너뜀',
  awaitingMerge: '병합 대기',
  awaitingMergeHint: '병합 후 실행',
  ok: '성공',

  satsUnknown: '노드가 이 금액을 제공하지 않음',
  entryKind: {
    Forced: '강제 포함',
    Sponsored: '대납',
    Unlock: '잠금 해제',
  },

  progress: '작업 진행 상황',
  stuck: '정체',

  search: '검색',
  searchPlaceholder: '높이, 해시, op_id 또는 주소',
  searchResults: '검색 결과',
  searchNone: '일치하는 결과 없음',

  lookupWhat: { block: '블록', op: '작업', account: '계정', asset: '자산', contract: '컨트랙트', btcTx: 'BTC 트랜잭션' },
  lookupErrorEyebrow: '조회 오류',
  lookupError: (what: string) => `${what} 정보를 가져오지 못했습니다`,
  lookupLoadingEyebrow: '조회 중',
  lookupLoading: (what: string) => `${what} 불러오는 중…`,
  /** Under a lookup that failed while the page says the node is disconnected: it is read again once the node answers */
  lookupAgain: '노드가 응답하면 이 페이지가 다시 조회합니다.',
  doc: {
    block: (height: string) => `블록 #${height}`,
    btcBlock: (height: string) => `BTC 블록 #${height}`,
    btcTx: (txid: string) => `BTC 트랜잭션 ${txid}`,
    op: (id: string) => `작업 ${id}`,
    account: (address: string) => `계정 ${address}`,
    contract: (name: string) => `컨트랙트 ${name}`,
    asset: (symbol: string) => `자산 ${symbol}`,
  },
  history: {
    reading: (h: string) => `이전 블록을 가져오는 중(#${h}까지 완료)…`,
    from: (h: string) => `#${h}부터의 블록에 있는 작업만 표시합니다.`,
    earlier: '이전 블록 더 가져오기',
    listing: '노드에서 작업을 가져오는 중…',
    listed: (n: string) => `최근 ${n}개의 작업까지 확인했습니다.`,
    older: '이전 작업 더 확인하기',
    showOlder: '이전 작업 더 보기',
    failed: (message: string) => `노드에서 작업을 가져오지 못했습니다: ${message}`,
    retry: '다시 시도',
  },
};

export default ui;
