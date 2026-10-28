import type { Messages } from '..';

const btc: Messages['btc'] = {
  what: 'BTC 블록',
  notFoundRpc: '이 높이는 Ksana 제네시스 블록이 앵커하는 BTC 블록보다 앞이라 Ksana의 내용이 없습니다. 비트코인 탐색기에서 확인하세요.',
  notFoundAhead: '이 높이는 이 페이지가 아는 BTC 최신 블록보다 위입니다. 아직 채굴되지 않았거나 페이지가 아직 따라잡지 못했습니다.',
  notFoundRpcTitle: '여기서는 이 BTC 블록을 조회할 수 없습니다',
  viewOn: (site: string) => `${site}에서 보기`,

  eyebrow: (network: string) => `BTC 블록 · ${network}`,
  confs: (n: number) => `${n.toLocaleString('en-US')}회 확인`,
  prev: '이전 블록',
  next: '다음 블록',

  txsTitle: (n: number) => `Ksana 관련 트랜잭션(${n})`,
  txsHeading: 'Ksana 관련 트랜잭션',
  reading: '노드에서 앞뒤의 Ksana 블록을 읽는 중…',
  readFailed: '노드에서 앞뒤의 Ksana 블록을 읽지 못했습니다',
  noKnownTxs: '알려진 Ksana 트랜잭션 없음',
  noTxs: 'Ksana 트랜잭션 없음',
  col: {
    kind: '유형',
    for: '대상',
  },

  hash: '블록 해시',
  timeApprox: '시간(추정)',
  explorer: '외부 탐색기',
  confirmations: '확인 수',
  headers: 'Ksana 블록 헤더',
  bodies: 'Ksana 블록 본문',
  anchored: '이 블록에 앵커한 블록',
  anchoredCount: (n: number) => `Ksana 블록 ${n}개`,
};

export default btc;
