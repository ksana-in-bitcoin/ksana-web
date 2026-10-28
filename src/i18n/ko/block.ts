import type { Messages } from '..';

const block: Messages['block'] = {
  head: {
    eyebrow: 'Ksana 블록',
    eyebrowSide: 'Ksana 블록 · 병렬 블록',
    anchor: '앵커',
    prev: '이전 블록',
    next: '다음 블록',
  },

  side: {
    mergedBy: (h: string) => `병렬 블록, #${h}에 병합됨`,
    waiting: '병렬 블록, 병합 대기 중',
    sibling: '같은 높이의 체인 블록',
  },

  header: {
    title: '블록 헤더',
    hash: '블록 해시',
    genesis: '제네시스 블록',
    indexerMatch: '인덱서 검증 일치',
    weight: '빈 블록 가중치',
    weightHint: '빈 블록이 이어지면 가중치가 두 배가 되어 난이도와 보상이 함께 오릅니다',
  },

  dag: {
    selectedParent: '선택된 부모',
    mergedParent: '병합됨',
    acceptedBy: '병합한 체인 블록',
    mergedStats: (entries: number, skipped: number) => `항목 ${entries}개 · 건너뜀 ${skipped}개`,
    closure: '정산 클로저',
  },

  settle: {
    title: '정산',
    own: '자체 정산 트랜잭션 있음',
    ownPair: '커밋과 공개 두 건',
    none: '별도 정산 없음',
    genesis: '제네시스 블록은 정산이 필요 없습니다.',
    bodyCarried: '블록 본문은 뒤 블록의 정산에 함께 탑재되어 기록됩니다.',
    bodyCarriedLanded: '블록 본문은 뒤 블록의 정산에 함께 탑재되어 기록되었습니다.',
    bodyCarrier: '본문을 탑재한 정산',
    waiting: '뒤 정산을 기다리는 중',
    otherCarrier: '본문은 다른 트랜잭션에 탑재',
    bodyOther: '블록 본문은 다른 트랜잭션에 탑재되어 기록되었습니다.',
    bodyCarrierBlock: '정산한 블록',
    carried: '빈 블록이나 강제 포함만 있는 블록은 헤더가 다른 트랜잭션에 탑재되어 기록됩니다.',
    carriedOwn: '빈 블록이나 강제 포함만 있는 블록은 원래 정산이 필요 없지만, 이 블록은 앞 블록들의 본문을 위해 정산을 보내고 헤더도 함께 탑재되어 기록됩니다.',
    carrier: '탑재 트랜잭션',
    carrierOf: (block: string, kind: string) => `${block}의 ${kind}`,
    otherBlock: '다른 블록',
    noCarrier: '아직 이 블록 헤더를 탑재한 트랜잭션이 없습니다.',
    carrierUnloaded: '이 블록의 헤더는 다른 트랜잭션으로 이미 비트코인에 기록되었습니다. 그 트랜잭션은 이 페이지에서 찾지 못했습니다.',
    notBuilt: '정산 트랜잭션이 아직 구성되지 않았습니다.',
    rescue: '구조 / 재구성',
    confs: (n: number) => `${n.toLocaleString('en-US')}회 확인`,
    commit: '커밋 트랜잭션',
    reveal: '공개 트랜잭션',
    /** The fee of a settlement's reveal transaction alone, where the page does not know its commit transaction's (D-081) */
    revealFee: '공개 트랜잭션 수수료',
    revealFeeHint: '커밋 트랜잭션도 수수료를 내지만, 이 페이지는 그 자금 입력의 금액을 알지 못해 더할 수 없습니다',
    /** A settlement's fee by transaction, the amounts already formatted */
    feeParts: (commit: string, reveal: string) => `커밋 ${commit}\u00a0sats + 공개 ${reveal}\u00a0sats`,
    content: '트랜잭션 내용',
    contentHint: '전체 내용은 비트코인 탐색기에서 확인하세요',
    headers: '탑재된 블록 헤더',
    headerCount: (n: number) => `${n}개`,
    bodies: '탑재된 블록 본문',
    bodyCount: (n: number) => `${n}개`,
    dataSize: '데이터 크기',
    dataMeter: '정산 데이터 크기',
    versions: (n: number) => `이 블록에서 구성한 정산 트랜잭션 ${n}건:`,
  },

  entries: {
    title: (n: number) => `항목(${n})`,
    forced: '강제 포함 · BTC에서',
    system: '잠금 해제 · 정산된 블록의 수수료와 블록 보상 지급',
    fast: '빠른 경로',
    unlockTo: (h: string, i: number) => `#${h}까지 · 인덱스 ${i}`,
    unlockBlocks: (n: number) => `${n}개 블록`,
    unlockTotal: '합계',
    skipped: (n: number) => `건너뜀 ${n}개`,
    gas: (used: string, sum: string) => `gas ${used} / 선언 한도 합계 ${sum}`,
    data: (size: string) => `데이터 ${size}`,
  },

  type: '유형',
  raw: '원시 데이터(JSON)',
};

export default block;
