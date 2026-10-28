import type { Messages } from '..';
import coins from './coins';

const wallet: Messages['wallet'] = {
  title: '지갑',
  address: '주소',
  copyAddress: '주소 복사',
  accountHex: '계정(16진수)',
  copyAccountHex: '16진수 계정 복사',

  connect: {
    title: '지갑 연결',
    noCustody: 'Ksana는 서명만 요청하며, 자산을 보관하지 않습니다.',
    points: {
      key: '계정이 곧 내 Taproot 주소',
      topup: 'KSA가 없으면 BTC로 충전',
      pathC: '블록 생성자가 모두 거부해도 경로 C는 유효',
    },
    /** The line under each point; n is the BTC confirmations after which Ksana blocks must include a Path C operation */
    pointNotes: {
      key: '지금 쓰는 비트코인 지갑이 그대로 서명합니다. 새\u00a0개인키나 시드 문구가 필요 없고, 한 주소로 KSA와 BTC를 모두 받습니다.',
      topup: '판매자가 내 앞으로 KSA를 잠가 둡니다. 판매자에게 BTC를 지불하는 트랜잭션으로 KSA도 함께 받습니다.',
      pathC: (n: number) => `경로 C 작업은 내가 직접 보내는 비트코인 트랜잭션에 실립니다. BTC ${n}회 확인 후에는 Ksana 블록에 반드시 포함됩니다.`,
    },
    go: '연결',
    waiting: '지갑 대기 중…',
    demoName: '로컬 개발 키',
    demoNote: '제네시스 블록에서 미리 할당된 테스트 계정',
    demoConnected: '데모 계정 연결됨',
    needsNode: '노드 연결 후 사용 가능',
    switchSource: '데이터 소스 전환',
    lastUsed: '최근 사용',
    localOnly: '로컬 regtest 전용',
    notDetected: '확장 프로그램 없음',
    notDetectedTouch: '감지되지 않음',
    install: '확장 프로그램을 설치한 뒤 이 페이지를 새로고침하세요.',
    openInApp: {
      unisat: 'Unisat 또는 OneKey 앱 내 브라우저에서 이 페이지를 여세요.',
      xverse: 'Xverse 앱 내 브라우저에서 이 페이지를 여세요.',
    },
    failed: (name: string) => `${name} 연결 실패`,
    network: (net: string, prefix: string) => `지갑을 ${net} 네트워크로 전환하세요. 주소 접두사는 ${prefix}입니다.`,
    mockHint: '로컬 regtest에서는 테스트 개인키 지갑을 쓸 수 있습니다:',
    mockParam: '?wallet=mock&key=<개인키>',
    mockIcon: '테',
    mockName: '테스트 개인키 지갑',
    unisatNote: 'Taproot(P2TR) 계정',
    xverseNote: 'Ordinals 주소(P2TR) 사용',
    mockNote: '개인키는 주소 표시줄에서 읽어 이 페이지 메모리에만 둡니다.',
    xverseMessage: 'Ksana 지갑 연결',
    noMockKey: '주소 표시줄에 테스트 개인키가 없습니다',
    keyRefusedTitle: '링크의 개인키는 쓰지 않았습니다',
    keyRefused:
      '테스트 개인키 지갑은 로컬 regtest 전용입니다. 개인키는 주소 표시줄에서 지웠지만, 링크에 담긴 개인키는 이 페이지를 제공하는 서버에도 전달됩니다. 자산이 있는 계정에는 쓰지 마세요.',
    // The parenthesis is inserted between "지갑 주소" and the particle, so the particle follows "주소" ("가") and doesn't change with the address
    wrongNetwork: (addr: string, net: string) => `지갑 주소(${addr}…)가 ${net} 주소가 아닙니다. 지갑에서 비트코인 네트워크를 전환하세요.`,
    // The wallet's name goes in parentheses after "지갑", so the particle follows "지갑" ("이") and doesn't change with the name
    wrongChain: (wallet: string, chain: string, net: string) =>
      `지갑(${wallet})이 ${chain} 네트워크로 설정되어 있지만, 이 페이지의 네트워크는 BTC ${net}에서 동작합니다. 지갑을 ${net} 네트워크로 전환하세요.`,
    notTaproot: '지갑의 계정이 Taproot 주소가 아닙니다. 지갑에서 Taproot 계정으로 전환하세요.',
    notBip86: '지갑의 Taproot 주소가 키의 표준 주소(BIP86)가 아닙니다. 지갑에서 다른 Taproot 계정을 선택하세요.',
    switched: (wallet: string) => `지갑(${wallet}) 계정이 바뀌었습니다`,
    switchedTo: (addr: string) => `이 페이지에 이제 ${addr} 계정이 표시됩니다.`,
    left: (wallet: string) => `${wallet} 연결 해제`,
    signSwitched: (wallet: string) => `서명하지 않았습니다. 지갑(${wallet})이 이 페이지에 표시된 것과 다른 계정에 있습니다. 내용을 확인한 뒤 다시 서명하세요.`,
    signSwitchedLeft: (wallet: string) => `서명하지 않았습니다. 지갑(${wallet})이 이 페이지에 표시된 것과 다른 계정에 있습니다. 그 계정을 쓰려면 다시 연결하세요.`,
  },

  home: {
    eyebrowDemo: '지갑 · 데모 계정',
    eyebrow: (name: string) => `지갑 · ${name}`,
    title: '내 지갑',
    viewInExplorer: '블록 탐색기에서 보기',
    send: '보내기',
    showBalances: '잔액 표시',
    hideBalances: '잔액 숨기기',
  },

  alert: {
    backlogTitle: '정산 적체 상한 도달, 빠른 경로 일시 중지',
    backlog: (rate: string) => `반영된 잔액은 그대로이며, 급하면 현재 ${rate}\u00a0sat/vB의 채굴 수수료로 경로 C를 쓸 수 있습니다.`,
    censoredTitle: '블록 생성자가 내 빠른 경로 작업을 포함하지 않음(데모 시나리오)',
    censored: '블록 생성자는 포함하지 않을 수 있으며, 경로 C는 블록 생성자가 필요 없습니다.',
  },

  balances: {
    ksa: '고속 레인 · KSA',
    btc: (net: string) => `${coins.bitcoin} · ${net}`,
    loading: (at: string, final: string) => `이전 블록을 가져오는 중이므로(#${at}까지 완료, 최종 확정 경계 #${final}) BTC 최종 확정 잔액은 아직 완전하지 않습니다.`,
    finalShort: '최종',
    utxoCount: (n: number) => `UTXO ${n}개`,
    btcInWallet: (name: string) => `${name}에서 BTC 잔액을 확인하세요.`,
    empty: '아직 KSA가 없습니다. BTC로 충전하거나 이 주소로 받아 보세요.',
    noIndexerNote: '그동안 ‘BTC 최종’은 노드의 말일 뿐입니다',
    tokens: '토큰',
    btcUnconfirmed: (amount: string) => `그중 ${amount}\u00a0sats 미확인`,
    btcReading: 'BTC 잔액을 읽는 중…',
    ksaReading: 'KSA 잔액을 읽는 중…',
    btcFailed: '지금은 BTC 잔액을 읽을 수 없습니다',
    btcStale: '지금은 최신 BTC 잔액을 읽을 수 없습니다',
    btcRefresh: 'BTC 잔액 새로고침',
    emptyFaucet: '아직 KSA가 없습니다. 테스트 KSA를 받거나 BTC로 충전하세요.',
  },

  split: {
    allFinal: '잔액 전부 BTC 최종 확정됨',
    finalBalance: 'BTC 최종 확정 잔액',
    inflow: '입금, 최종 확정 전',
    outflow: '출금과 수수료, 최종 확정 전',
    total: '현재 잔액(즉시 사용 가능)',
    unreadAll: '전부 BTC 최종 확정이라고는 할 수 없습니다. 최종 확정 전인 컨트랙트 호출이 이 잔액에 지급했을 수 있으며, 그 금액은 페이지에서 읽을 수 없습니다.',
    unreadMore: '최종 확정 전인 컨트랙트 호출이 이 잔액에 더 지급했을 수 있으며, 그 금액은 페이지에서 읽을 수 없습니다. 그렇다면 BTC 최종 확정 잔액은 이보다 적습니다.',
  },

  inflight: {
    title: '진행 중',
    eyebrow: (n: number) => `BTC 최종 확정 전 · ${n}`,
    failed: '실행 실패',
    resend: '경로 C로 전환',
    skipped: '건너뜀, 다시 포함 대기',
    stuck: '정체, 상세 확인',
    eta: (eta: string) => `${eta} 후 최종 확정`,
    waitInclusion: '포함 대기',
    waitSettlement: '정산 대기',
  },

  activity: {
    title: '활동',
    filter: '필터',
    out: '보냄',
    in: '받음',
    empty: '기록 없음',
  },

  utxos: {
    title: 'BTC 출력',
    output: '출력',
    change: '정산 잔돈',
    showSpent: '사용된 출력 표시',
    empty: 'BTC 출력 없음',
    emptyHint: (section: string) => `‘${section}’에서 regtest BTC를 받으세요.`,
    state: {
      available: '사용 가능',
      unconfirmed: '미확인',
      spent: '사용됨',
    },
  },

  info: {
    address: '주소',
    signing: '서명 방식',
    signingValue: 'BIP322 simple',
    disconnect: '지갑 연결 해제',
  },

  settings: {
    title: '입금 확인',
    threshold: '고액 기준',
    save: '저장',
    saved: '저장됨',
    hint: '기준 미만 입금은 빠른 확인으로 충분하며, 기준 이상이면 BTC 최종 확정까지 기다리도록 알려 드립니다.',
  },

  native: {
    noUtxo: '사용 가능한 BTC 출력 없음',
    unconfirmed: 'BTC 출력이 아직 확인되지 않았습니다. BTC 블록에 포함된 뒤 다시 시도하세요',
    feeRateTooHigh: (rate: string, cap: string) => `수수료율 ${rate}\u00a0sat/vB는 이 페이지의 상한 ${cap}\u00a0sat/vB를 넘습니다. 아무것도 서명하지 않았습니다. 더 낮은 수수료율을 쓰세요`,
  },

  faucet: {
    title: '테스트 자산',
    hint: (s: number) => `KSA는 약 ${s}초면 입금되고, BTC는 다음 BTC 블록을 기다려야 합니다.`,
    claim: '5,000\u00a0KSA와 0.1\u00a0BTC 받기',
    requested: '포싯에 요청함',
    claimHosted: '테스트 KSA 받기',
    claimed: '요청함, 입금 대기 중',
    console: 'regtest 콘솔',
  },

  playground: {
    title: '스마트 계약 Playground',
    body: '브라우저에서 스마트 계약을 수정·컴파일·배포합니다. 토큰, NFT, AMM, 대출, 멀티시그, 베스팅 예제마다 전용 화면이 있고 공개 signet에서 동작합니다.',
    open: 'Playground 열기',
  },
};

export default wallet;
