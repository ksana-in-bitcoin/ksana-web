import type { Messages } from '..';

const account: Messages['account'] = {
  mine: '내 계정',
  producerFee: (fee: string) => `블록 생성자 · 최저 대납 ${fee}\u00a0KSA`,
  censored: '블록 생성자가 빠른 경로 작업을 포함하지 않음(데모 시나리오)',
  sendTo: '이 계정으로 전송',

  address: '주소',
  copyAddress: '주소 복사',
  hex: '계정(16진수)',
  copyHex: '16진수 계정 복사',
  addrNote: '주소와 16진수는 같은 계정의 두 표기이며, 컨트랙트는 16진수만 있습니다.',

  noAssets: '자산 없음',
  balanceCaption: '자산 잔액',
  available: '사용 가능',
  lockedFees: '잠금 해제 대기 보상과 수수료',
  lockedFeesHint: '해당 블록이 비트코인에 기록되면 잠금 해제',
  unlockedTotal: '잠금 해제됨(누적)',

  nonceHint: '다음 작업이 써야 하는 nonce',
  sent: '보낸 작업',
  policy: '로컬 정책',
  policyValue: (fee: string) => `경로 B 최저 대납 ${fee}\u00a0KSA`,

  history: '작업 기록',
  direction: '방향',
  out: '보냄',
  noRecords: '기록 없음',

  locked: {
    title: '보상과 수수료의 잠금과 해제',
    caption: '잠긴 블록 보상과 수수료',
    fee: '보상과 수수료',
    unlocked: '잠금 해제됨',
    settled: '정산됨, 잠금 해제 항목 대기',
    waiting: '잠김: 비트코인 기록 대기',
    carriedFor: (producer: string) => `${producer} 대신 탑재`,
  },
};

export default account;
