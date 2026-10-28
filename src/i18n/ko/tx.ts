import type { Messages } from '..';

const tx: Messages['tx'] = {
  notFoundRpc: '노드는 txid로 트랜잭션을 조회할 수 없으니 블록 페이지에서 열거나 비트코인 탐색기를 이용하세요.',
  /** Its title: the transaction may well exist */
  notFoundRpcTitle: '여기서는 이 BTC 트랜잭션을 조회할 수 없습니다',
  /** A link to a public Bitcoin explorer's page for the transaction; site is its name */
  viewOn: (site: string) => `${site}에서 보기`,

  eyebrow: (kind: string) => `BTC 트랜잭션 · ${kind}`,
  forBlock: 'Ksana 블록',

  pair: {
    commit: '정산 · 커밋 트랜잭션',
    reveal: '정산 · 공개 트랜잭션',
    commitTx: '커밋 트랜잭션',
    revealTx: '공개 트랜잭션',
    hint: '커밋 트랜잭션이 약정을 먼저 잠그고, 공개 트랜잭션이 증인에 페이로드를 담습니다.',
  },

  stuck: {
    title: 'BTC 멤풀에서 정체',
    bumpAnchor: 'P2A 앵커로 가속',
    bumpChange: '잔돈으로 CPFP',
    bumpedAnchor: (n: number) => `CPFP 자식 트랜잭션 ${n}건을 붙여, 다음 BTC 블록에서 함께 확인됩니다`,
    bumpedChange: '잔돈으로 CPFP 자식 트랜잭션을 붙여, 다음 BTC 블록에서 함께 확인됩니다',
    bumpFailed: '사용할 수 있는 출력이 없어 CPFP를 할 수 없습니다',
  },

  partial: {
    title: '노드가 이 트랜잭션의 일부만 제공합니다',
    more: '전체 내용은 비트코인 탐색기에서 확인하세요.',
  },

  replacedBy: '대체한 트랜잭션',
  invalidRebuilt: '정산이 재구성되었으며, 누구도 다시 서명할 필요가 없습니다.',
  rescueBanner: {
    rebuilt: '블록 생성자가 재구성한 정산',
    rescue: '구조 정산',
  },

  structure: '트랜잭션 구조',

  payload: {
    title: '페이로드',
    type: '페이로드 유형',
    headers: '블록 헤더',
    bodies: '블록 본문',
    dataSize: '데이터 크기',
    chunks: '데이터 청크',
    none: 'Ksana 데이터 없음',
  },

  details: {
    title: '트랜잭션',
    vsize: '가상 크기',
    broadcastAt: (time: string) => `${time}에 브로드캐스트`,
    otherVersions: '같은 블록의 다른 버전',
    author: {
      rebuilder: '재구성자',
      rescuer: '구조자',
      user: '사용자',
      funder: '자금 제공자',
    },
  },

  diagram: {
    inputs: '입력',
    outputs: '출력',
    inRole: {
      producer: '블록 생성자 자금',
      commit: '커밋 트랜잭션에서',
      payer: '결제 입력',
      anchor: 'P2A 앵커(부모 트랜잭션)',
    },
    outRole: {
      change: '잔돈',
      commitment: '약정 출력',
      anchor: 'P2A 앵커',
      payment: '결제',
    },
    producerChange: '블록 생성자 잔돈',
    anyone: '누구나 사용 가능',
    commitmentHint: '공개 트랜잭션이 사용',
    opReturn: {
      native: 'NativeOp: VmOp 1개',
      headers: (n: number) => `Headers: 블록 헤더 ${n}개`,
      settlement: (headers: number, entries: number) => `블록 헤더 ${headers}개 + 항목 ${entries}개`,
      empty: '빈 OP_RETURN',
    },
    chunks: (n: number) => `데이터 청크 ${n}개`,
    envelope: {
      title: '증인 봉투',
      headers: (n: number) => `블록 헤더 ${n}개`,
      bodies: (n: number) => `블록 본문 ${n}개`,
    },
  },
};

export default tx;
