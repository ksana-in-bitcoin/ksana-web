import type { Messages } from '..';

const op: Messages['op'] = {
  head: {
    mine: '내 작업',
    toMe: '나에게 전송',
    execFailed: '실행 실패',
    liveStatus: (status: string) => `현재 상태: ${status}`,
  },

  banner: {
    failed: (reason: string) => `실행 실패: ${reason}`,
    failedCharged: '수수료는 그대로 차감되고 nonce도 사용되었으며, 나머지 변경은 되돌려졌습니다.',
    failedNative: '상태는 바뀌지 않았으며, BTC 채굴자에게 낸 수수료는 돌려받을 수 없습니다.',
    failedNativeUsed: 'nonce는 사용되었고 BTC 채굴자에게 낸 수수료는 돌려받을 수 없으며, 나머지 변경은 되돌려졌습니다.',
    skipped: '건너뜀: 실행되지 않았고 수수료도 차감되지 않았습니다',
    dropped: '멤풀에서 제거됨: 체인에 기록되지 않으며 수수료도 차감되지 않습니다',
    waitedBody: '블록 생성자는 이 작업을 포함하지 않을 수 있으며, 경로 C는 블록 생성자가 필요 없습니다.',
    resendNative: '경로 C로 다시 제출',
    large: '고액 입금: BTC 최종 확정까지 기다리세요',
    largeBody: '금액이 설정한 고액 기준에 도달했습니다.',
  },

  journey: {
    title: '빠른 확인에서 BTC 최종 확정까지',
    fastLatency: '제출부터 빠른 확인까지',
  },

  vmop: {
    sigHash: '서명 해시',
    size: '인코딩 길이',
    bytes: (n: string) => `${n}바이트`,
    cap: (n: string) => `상한 ${n}`,
    /** Before the gas an executed op used, under its max_gas */
    gasUsed: '사용량',
    minerFee: (sats: string, rate: string) => `${sats}\u00a0sats(${rate}\u00a0sat/vB)`,
    name: '이름',
    code: '코드',
    wasm: (n: string) => `${n}바이트 WASM`,
  },

  exec: {
    title: '실행',
    block: '포함 블록',
    entry: (index: number) => `항목 #${index}`,
    accepted: '수락 높이',
    fastDepth: 'Ksana 깊이',
    confs: (n: number) => `${n.toLocaleString('en-US')}회 확인`,
    events: '이벤트',
    nativeTx: '네이티브 트랜잭션',
    closure: '정산 클로저',
  },

  raw: '원시 데이터(JSON)',
};

export default op;
