import type { Messages } from '..';

const ops: Messages['ops'] = {
  title: '작업',
  tabs: {
    label: '작업 보기',
    latest: '최신',
    mempool: '멤풀',
    pendingLocal: '포함 대기(이 페이지)',
  },

  filter: {
    label: '경로별 필터',
    all: '모든 경로',
    path: (path: string, label: string) => `${path} ${label}`,
    failedOnly: '실패만 보기',
    none: '조건에 맞는 작업 없음',
  },

  mempool: {
    localOnly: '이 페이지에서 제출해 아직 포함되지 않은 작업만 표시합니다.',
    minFees: (list: string) => `블록 생성자별 최저 대납 수수료: ${list}`,
    waited: '대기 시간',
    note: '설명',
    emptyLocal: '이 페이지에서 포함 대기 중인 작업 없음',
    empty: '멤풀이 비어 있음',
    total: (n: number) => `총 ${n}건`,
    why: {
      nativeConfirmed: 'BTC에서 확인됨, 다음 블록에 강제 포함',
      nativeWaiting: 'BTC 확인 대기',
      nativeConfs: (n: number, need: number) => `BTC 확인 ${n}/${need}, ${need}회 확인되면 강제 포함`,
      backlog: '정산 적체 상한 도달, 빠른 경로 일시 중지',
      censored: '블록 생성자가 이 계정을 포함하지 않음, 경로 C로 전환 가능',
      lowFee: (producers: string) => `${producers}의 최저 대납 수수료보다 낮음, 일부 블록 생성자만 포함`,
      nonce: (nonce: string) => `선행 nonce ${nonce}의 포함 대기`,
      gone: '더 이상 포함 대기 중 아님',
    },
  },
};

export default ops;
