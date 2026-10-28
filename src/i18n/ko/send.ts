import type { Messages } from '..';

const send: Messages['send'] = {
  eyebrow: '지갑',
  title: '보내기',
  step: (n: number, total: number) => `${total}단계 중 ${n}단계`,

  to: {
    section: '받는 계정과 금액',
    label: '받는 계정',
    placeholder: 'Taproot 주소 또는 16진수 계정',
    hint: '붙여 넣은 뒤 앞뒤 8자리와 계정 인장을 확인하세요',
    headTail: '앞뒤',
    asAddress: '해당 주소',
    notTaproot: 'Taproot 주소(bc1p / tb1p / bcrt1p)만 쓸 수 있습니다',
    wrongNetwork: (net: string) => `이 주소는 현재 네트워크(${net})의 주소가 아닙니다`,
    badAddress: '유효하지 않은 주소이며, 한 자리를 잘못 옮겨 적었을 수 있습니다',
    badChars: '0–9와 a–f만 쓸 수 있습니다',
    badLength: (n: number) => `64자리여야 합니다(현재 ${n}자리)`,
    notOnCurve: '유효한 계정이 아니며, 한 자리를 잘못 옮겨 적었을 수 있습니다',
    self: '받는 계정이 내 계정입니다',
    noRecord: '체인에 기록이 없는 계정이니 앞뒤 자리를 다시 확인하세요',
  },

  recent: {
    title: '최근 보낸 계정',
    sentBefore: (n: number, ago: string) => `이전에 ${n}회 보냈고 마지막은 ${ago}`,
  },

  amount: {
    max: '전액',
    available: '사용 가능',
    // No particle after the symbol (KSA는 / TKN은 would change with the pronunciation)
    integer: (symbol: string) => `${symbol} 금액은 정수로만 입력할 수 있습니다`,
    decimals: (symbol: string, n: number) => `${symbol} 금액은 소수점 이하 ${n}자리까지 가능합니다`,
    notNumber: '금액은 12.5처럼 숫자로 입력해야 합니다',
    positive: '금액은 0보다 커야 합니다',
    overBalance: (amount: string, symbol: string) => `사용 가능 잔액 ${amount}\u00a0${symbol} 초과`,
    withFee: '잔액이 금액과 대납 수수료를 함께 내기에 부족합니다',
  },

  path: {
    section: '제출 방식',
    more: '다른 제출 방식',
    tagDefault: '기본',
    tagRecommended: '추천',
    tagCensorship: '검열 저항',
    speedFast: (s: number) => `약 ${s}초 후 반영`,
    speedNative: (n: number) => `BTC ${n}회 확인 후 강제 포함`,
    paused: '일시 중지됨',
    mayNotInclude: '포함되지 않을 수 있음',
    backlog: '정산 적체 중, 해소 전까지 포함되지 않음',
    censored: '블록 생성자가 최근 내 작업을 포함하지 않음',
    sameNonce: '같은 nonce로 다시 보내려면 경로 C만 가능',
    ksaShort: '대납 수수료를 낼 KSA 부족',
    noOutputC: '채굴 수수료를 낼 BTC 출력 없음',
    nativeGas: (max: string) => `경로 C의 max_gas는 ${max} 이하여야 합니다`,
    nativeWaiting: (nonce: string) => `경로 C 작업(nonce ${nonce})이 아직 BTC 확인을 기다리는 중입니다. 포함되면 경로 C를 다시 쓸 수 있습니다`,
    feeSpike: 'BTC 수수료율 높음',
  },


  sponsor: {
    label: '대납 수수료',
    suggestedTag: '권장값, 고급 옵션에서 변경 가능',
    customTag: '직접 입력한 금액',
    custom: '대납 수수료',
    hint: (amount: string) => `비워 두면 권장값 ${amount}\u00a0KSA(최근 20개 블록 경로 B 수수료의 중앙값)를 씁니다`,
    hintRate: (amount: string) => `비워 두면 권장값 ${amount}\u00a0KSA(노드가 최근 20개 블록에서 구한 수수료율을 이 전송에 적용한 값)를 씁니다`,
    hintMin: (amount: string) => `비워 두면 권장값 ${amount}\u00a0KSA(노드의 최저 수수료)를 씁니다`,
    invalid: '수수료는 0보다 큰 KSA 금액이어야 합니다',
    belowMin: '일부 블록 생성자의 최저 금액보다 낮으면 다른 블록 생성자가 포함할 때까지 기다려야 합니다',
  },

  native: {
    feeRate: '수수료율',
    feeRateHint: (rate: string) => `기본값은 노드의 정산 수수료율 ${rate}\u00a0sat/vB`,
    feeRateRange: (cap: string) => `수수료율은 1~${cap}\u00a0sat/vB로 입력하세요`,
    utxos: 'BTC 출력',
    loading: '지갑 주소의 출력을 읽는 중…',
    source: { btc_rpc: '비트코인 RPC에서', unisat: '지갑에서', manual: '직접 입력' },
    available: (sats: string, n: number) => `사용 가능 ${sats}\u00a0sat (출력 ${n}개)`,
    unconfirmed: (sats: string, n: number) => `미확인: ${sats}\u00a0sat (출력 ${n}개), BTC 블록에 포함되면 사용할 수 있습니다`,
    need: (sats: string) => `최소 ${sats}\u00a0sat 필요`,
    short: (sats: string) => `BTC 출력이 부족합니다. 최소 ${sats}\u00a0sat 필요`,
    manualNeeded: 'BTC 출력을 직접 입력해야 합니다',
    loadFailed: (detail: string) => `BTC 출력을 읽을 수 없음: ${detail}`,
    manualLabel: '출력 직접 입력',
    manualPlaceholder: 'txid:vout:sat, 한 줄에 하나',
    manualHint: '비트코인 RPC도 지갑의 UTXO API도 없을 때 입력',
  },

  nativeRates: (rate: string, min: string) => `BTC 수수료율 ${rate}\u00a0sat/vB · 블록 포함 하한 ${min}\u00a0sat/vB`,

  advanced: {
    title: '고급 옵션',
    gasHint: (n: string) => `초과하면 실행이 실패하고 수수료는 그대로 차감되며, 전송 1건은 ${n}을 씁니다`,
    gasRange: (min: string, max: string) => `max_gas는 ${min}~${max} 사이여야 합니다`,
  },

  nonce: {
    title: (nonce: string) => `같은 nonce(${nonce})로 경로 C 전환`,
    race: '먼저 포함된 한 건만 반영되며, 기존 작업이 먼저 포함되면 이 작업의 채굴 수수료는 돌려받지 못합니다',
    fixed: (nonce: string) => `${nonce}(지정)`,
  },

  summary: {
    title: '요약',
    needTo: '받는 계정을 먼저 입력하세요',
    needAmount: '이어서 금액을 입력하세요',
    readingBalance: '잔액을 읽는 중…',
    badFee: '수수료가 잘못되었습니다',
    badGas: 'max_gas 범위 초과',
    badRate: '수수료율 범위 초과',
    unavailable: (path: string, reason: string) => `경로 ${path} 사용 불가: ${reason}`,
    needUtxo: '먼저 채굴 수수료를 낼 BTC 출력을 준비하세요',
    waitUtxo: 'BTC 블록이 BTC 출력을 확인할 때까지 기다리세요',
  },

  review: {
    title: '확인 후 서명',
    edit: '돌아가서 수정',
    signing: '서명 중…',
    submit: '서명 후 제출',
    to: '받는 계정',
    signedBy: (wallet: string) => `${wallet} 서명`,
    signedLocal: '로컬 개발 키 서명',
    lockB: '실행 전에 KSA 잔액에서 차감',
    lockC: 'BTC 트랜잭션을 브로드캐스트하며, 잔돈은 내 주소로 돌아옵니다',
    warnings: '주의',
    large: (threshold: string, eta: string) => `고액 기준(${threshold}\u00a0KSA)에 도달해, BTC 최종 확정까지 ${eta} 걸립니다`,
    afterNative: (nonce: string) => `아직 BTC 확인을 기다리는 경로 C 작업(nonce ${nonce}) 다음의 nonce를 씁니다. 그 작업 바로 뒤에 포함됩니다`,
    network: (name: string, id: string) => `네트워크 ${name}(chain_id ${id})`,
    raw: '서명할 VmOp',
    minUnit: '최소 단위',
    sigHash: '서명 해시',
    /** Path C: on the review page there is no carrying transaction yet, so the sighash can't be given in advance */
    sigHashNative: '서명할 때 운반 트랜잭션의 첫 입력으로 계산됩니다(D-086). 아직 없습니다',
  },

  error: {
    transferOnly: '전송만 지원합니다',
    disconnected: '지갑 연결이 끊어졌으니 다시 연결하세요',
    walletDeclined: (detail: string) => `지갑이 서명하지 않음: ${detail}`,
    rpc: {
      invalid: '노드 거부: 유효하지 않은 작업',
      policy: '노드 거부: 이 노드의 정책에 맞지 않음',
      params: '노드 거부: 형식 오류',
      internal: '노드 내부 오류',
    },
    rpcCode: (code: string) => `노드 오류 ${code}`,
    retrySuggested: '권장값으로 다시 시도',
    node: (what: string, detail: string) => `${what}(${detail})`,
  },

  toast: {
    submitted: '서명 후 제출됨',
    broadcast: '서명 후 BTC에 브로드캐스트됨',
  },

  sent: {
    broadcastNative: 'BTC에 브로드캐스트됨',
    failedFoot: '수수료는 차감되었고 전송은 반영되지 않았습니다',
    droppedFoot: '체인에 기록되지 않았고 수수료도 차감되지 않았습니다',
    failedFootB: (fee: string, amount: string) => `수수료 ${fee}는 차감되었고, ${amount} 전송은 반영되지 않아 그 금액은 잔액에 남아 있습니다`,
    failedFootC: (amount: string) => `채굴 수수료는 BTC 채굴자에게 지급되어 환불되지 않으며, ${amount} 전송은 반영되지 않아 그 금액은 잔액에 남아 있습니다`,
    againWait: '이 전송이 확인된 뒤에 다음 전송을 보내세요',
    latency: (d: string) => `빠른 확인까지 ${d}`,
    waited: '블록 생성자는 포함하지 않을 수 있으며, 경로 C는 블록 생성자가 필요 없습니다',
    resendC: '경로 C로 다시 제출',
    next: '다음 단계',
    again: '한 번 더 보내기',
    backToWallet: '지갑으로 돌아가기',
    tx: 'BTC 트랜잭션',
    manualBroadcast: '브로드캐스트 수단이 없습니다. 이 트랜잭션을 직접 전파하세요:',
    copyRaw: '원시 트랜잭션 복사',
  },
};

export default send;
