import type { Messages } from '..';

const shell: Messages['shell'] = {
  skipToMain: '본문으로 건너뛰기',

  mainNav: '주 메뉴',
  nav: {
    overview: '개요',
    blocks: '블록',
    ops: '작업',
    settlements: '정산',
    verify: '검증',
    wallet: '지갑',
    explorer: '탐색기',
    playground: 'Playground',
  },
  playground: '스마트 계약 Playground: 브라우저에서 계약을 수정·컴파일·배포합니다(새 탭에서 열림)',

  theme: '테마',
  themes: { system: '시스템 설정', light: '라이트', dark: '다크' },
  themeNow: (current: string) => `테마: ${current}`,
  themeSwitch: (current: string, next: string) => `테마: ${current}, 클릭하면 ${next} 테마로 전환`,

  top: {
    connectWallet: '지갑 연결',
    myWallet: '내 지갑',
    walletTitle: (account: string) => `내 지갑 · 계정 ${account}`,
    pending: (n: number) => `작업 ${n}건 포함 대기`,
    closeSearch: '검색 닫기',
    simTitle: 'regtest 콘솔과 데이터 소스 설정 열기',
    simLabel: (chainId: string) => `네트워크 devnet, chain_id ${chainId}, 브라우저 내 시뮬레이터. regtest 콘솔 열기`,
    sim: '시뮬레이터',
    node: '노드',
    nodeTitle: (url: string, state: string) => `노드 ${url}: ${state}`,
    nodeLabel: (chain: string, state: string) => `네트워크 ${chain}, 노드 데이터 소스, ${state}. 데이터 소스 설정 열기`,
  },

  strip: {
    label: '체인 상태',
    disconnected: '노드 연결 끊김',
    disconnectedSince: (ago: string) => `노드 연결 끊김 · 마지막 데이터 ${ago}`,
    backlogFull: '정산 적체 상한 도달, 빠른 경로 일시 중지',
    fast: 'Ksana',
    settled: '정산됨',
    btcTipHint: '노드가 BTC 최신 블록을 제공하지 않아 알려진 데이터로 추정',
    btcTipRead: '비트코인 RPC에서 30초마다 읽고, 그 사이에는 노드의 새 블록을 따름',
    backlog: (waited: number, limit: number) => `정산 적체 ${waited}/${limit}`,
    backlogHint: '가장 오래된 블록의 데이터가 비트코인에 기록된 것으로 셈해지기까지 기다린 BTC 블록 수. 다음 블록의 앵커가 데이터가 든 BTC 블록에 닿으면 셈합니다',
    settleFee: '정산 수수료율',
    settleFeeHint: '노드가 정산 트랜잭션에 적용하는 수수료율, BTC 시장 수수료율 아님',
    fee: '수수료율',
    feeHint: 'BTC 추정 수수료율',
    minFee: (rate: string) => `블록 포함 하한 ${rate}`,
    noIndexer: '인덱서 미연결',
    indexer: { ok: '인덱서 일치', mismatch: '인덱서 불일치', halted: '인덱서 중지됨', none: '인덱서 비교 전', unreachable: '인덱서 응답 없음', stalled: '인덱서 정체' },
    mempool: '멤풀',
    pendingHint: '이 페이지에서 제출해 아직 포함되지 않은 작업만 표시',
    sourceNode: (host: string) => `데이터 소스: 노드 ${host}`,
    sourceSim: '데이터 소스: 브라우저 내 시뮬레이터',
  },

  toast: {
    close: '알림 닫기',
    // Korean word order: amount + unit + action (5 KSA 전송)
    what: (verb: string, amount: string, symbol: string) => `${amount}\u00a0${symbol} ${verb}`,
    failed: '작업 실행 실패',
    dropped: '작업이 멤풀에서 제거됨',
    skipped: '병렬 블록에서 작업을 건너뜀',
    received: (amount: string, symbol: string) => `${amount}\u00a0${symbol} 받음`,
    large: '고액 기준 이상: BTC 최종 확정 후 입금 완료로 간주하세요',
    deepNext: '다음 단계: BTC 최종 확정',
    finalTakenBack: 'BTC 최종 확정이 철회됨',
    finalTakenBackBody: '노드가 더 이상 BTC 최종 확정으로 보고하지 않음: BTC 최종 확정을 다시 기다리세요',
    from: (name: string) => `보낸 계정: ${name}`,
  },

  update: {
    title: '이 페이지의 새 버전이 있음',
    body: '페이지를 새로고침하면 사용할 수 있습니다',
    language: (name: string) => `페이지를 새로고침하면 새 버전이 ${name} 언어로 열립니다`,
    reload: '새로고침',
    missed: (name: string) => `${name} 언어를 불러오지 못함`,
    missedBody: '서버가 응답하지 않음: 연결을 확인하고 다시 시도하세요',
  },

  /** The node's network started over from another genesis block while the page was open (app/store.ts, `readAnew`) */
  startedOver: {
    title: '네트워크가 새 제네시스 블록부터 다시 시작됨',
    body: '페이지가 노드의 체인을 다시 읽었습니다. 이전의 블록, 작업, 잔액은 이 체인에 없습니다',
  },

  console: {
    sim: 'regtest 콘솔',
    rpc: '데이터 소스와 노드',
    loaded: (n: number) => `최근 체인 블록 ${n}개를 불러왔으며, 이전 블록은 열 때 조회합니다`,
    disconnect: '지갑 연결 해제',
    disconnectDemo: '데모 지갑 연결 해제',
    events: '최근 이벤트',
    needWallet: '지갑을 연결하면 검열 시나리오를 쓸 수 있습니다',
  },

  scenario: {
    mine: {
      title: (seconds: number) => `비트코인 블록 생성 · 평균 ${seconds}초에 한 블록`,
      hint: '연속으로 채굴하면 적체 상한에 잠시 걸릴 수 있습니다',
      button: (n: number) => `블록 ${n}개 채굴`,
    },
    fee: {
      title: 'BTC 수수료율 급등',
      hint: '정산 트랜잭션이 BTC 멤풀에서 정체되고, 적체가 차면 빠른 경로가 일시 중지됩니다',
      toggle: '수수료율 급등',
      cpfp: 'P2A 앵커로 CPFP',
      cpfpCount: (n: number) => `P2A 앵커로 CPFP(${n})`,
      cpfpDone: (n: number) => `트랜잭션 ${n}건 가속, 다음 BTC 블록에서 확인`,
      backlog: (waited: number, limit: number) => `적체 ${waited} / ${limit} BTC 블록`,
      paused: '빠른 경로 일시 중지됨',
    },
    censor: {
      title: '블록 생성자가 내 계정 검열',
      hint: '블록 생성자가 내 빠른 경로 작업을 더 이상 포함하지 않습니다',
      toggle: '내 계정 검열',
    },
    offline: {
      title: '블록 생성자 오프라인',
      hint: (name: string) => `${name}의 블록 생성이 멈추고, 정산은 다른 노드가 대신 브로드캐스트합니다`,
      toggle: (name: string) => `${name} 오프라인`,
    },
  },

  footer: {
    tagline: '고속 레인에서 순식간에 확인되고, 마침내 비트코인에 영원히 새겨집니다.',
    fromSim: '데이터는 브라우저 내 시뮬레이터에서 오며, 새로고침하면 체인이 새로 생성됩니다',
    fromNode: (url: string) => `데이터 출처: 노드 ${url}`,
    build: '빌드',
    buildHint: '이 페이지를 빌드한 git 커밋. 검증 절차는 README.md의 「Verify this page」',
  },

  connecting: {
    eyebrow: '연결 중',
    title: '노드에 연결하는 중…',
    failedEyebrow: '연결 실패',
    failedTitle: '노드에 연결할 수 없습니다',
    wrongNetworkTitle: '노드가 다른 네트워크에 있습니다',
    detail: (message: string) => `오류 상세: ${message}`,
    retrying: '이 페이지는 2.5초마다 다시 시도하며, 노드가 응답하면 바로 열립니다.',
    settings: '데이터 소스 설정',
    useSim: '브라우저 내 시뮬레이터 사용',
    switchTo: (chain: string) => `${chain} 네트워크로 전환`,
  },
  linkSource: {
    eyebrow: '데이터 소스',
    title: '이 링크가 지정한 노드에서 읽을까요?',
    body: '이 링크는 페이지가 평소 읽는 노드 대신 아래 주소에서 데이터를 읽도록 요청합니다. 그러면 페이지에 보이는 모든 것(잔액, 작업, 확인 진행 상황)이 그곳에서 오고, 지갑으로 서명한 내용도 그곳으로 전송됩니다. 직접 운영하거나 운영자를 신뢰할 때만 그렇게 하세요.',
    node: '노드',
    indexer: '인덱서',
    btc: '비트코인 RPC',
    network: '네트워크',
    note: '어느 쪽을 골라도 저장되지 않으며, 이 탭에서만 유효합니다.',
    keep: '평소 노드 계속 사용',
    follow: '이 노드에서 읽기',
  },
  /** A node an earlier version of the page saved, perhaps from a link (store.ts, `savedSource`): asked about once */
  savedSource: {
    eyebrow: '데이터 소스',
    title: '이전에 저장된 노드에서 계속 읽을까요?',
    body: '이 페이지의 이전 버전이 아래 주소를 데이터 소스로 저장했습니다. 이전 버전은 링크가 지정한 노드도 데이터 소스 패널에서 고른 것과 똑같이 저장했기 때문에, 열어 본 링크에서 온 것일 수 있습니다. 페이지에 보이는 모든 것(잔액, 작업, 확인 진행 상황)이 그곳에서 오고, 지갑으로 서명한 내용도 그곳으로 전송됩니다. 직접 고른 것일 때만 계속 사용하세요.',
    node: '노드',
    indexer: '인덱서',
    btc: '비트코인 RPC',
    network: '네트워크',
    note: '한 번만 묻습니다. 데이터 소스 패널에서 언제든 바꿀 수 있습니다.',
    keep: '이 페이지의 노드 사용',
    follow: '계속 읽기',
  },
};

export default shell;
