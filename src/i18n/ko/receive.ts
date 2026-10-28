import type { Messages } from '..';

const receive: Messages['receive'] = {
  title: '받기',
  one: '이 주소 하나로 KSA, 컨트랙트 자산, BTC를 모두 받습니다.',
  card: '받기 정보',
  qr: '주소 QR 코드',
  address: (net: string) => `주소 · Taproot · ${net}`,
  hex: '계정(16진수) · 컨트랙트 인자용',
  checkEdges: '앞뒤 8자리 확인: ',
  copyAddress: '주소 복사',
  copyHex: '16진수 계정 복사',
  btcUse: '받은 BTC로 경로 C의 채굴 수수료도 낼 수 있습니다.',

  rules: {
    title: '입금 인정 기준',
    below: (amount: string) => `${amount}\u00a0KSA 미만: 빠른 확인으로 충분`,
    above: '기준 이상: BTC 최종 확정까지 대기',
    aboveEta: (net: string, eta: string) => `${net} ${eta}, 메인넷 약 110분`,
    edit: '기준 변경',
  },
  faucet: 'devnet 포싯에서 받기',
  faucetHosted: (net: string) => `${net} 포싯에서 테스트 KSA 받기`,
  faucetFailed: '포싯이 KSA를 보내지 못했습니다',
  faucetWhy: {
    claimed: (wait: string) => `이 계정은 이미 테스트 KSA를 받았습니다. ${wait} 후에 다시 요청할 수 있습니다`,
    tooOften: (wait: string) => `이 연결에서 보낸 요청이 너무 많습니다. ${wait} 후에 다시 시도하세요`,
    busy: (wait: string) => `포싯이 바쁩니다. ${wait} 후에 다시 시도하세요`,
    today: '이 연결에서 오늘 테스트 KSA를 너무 많이 요청했습니다. 나중에 다시 시도하세요',
    empty: '포싯의 테스트 KSA가 모두 소진되었습니다. 나중에 다시 시도하세요',
    down: '포싯이 지금 작동하지 않습니다. 나중에 다시 시도하세요',
    noAnswer: '포싯이 응답하지 않습니다. 연결을 확인하고 다시 시도하세요',
  },
  back: '지갑으로 돌아가기',

  recent: {
    title: '최근 받은 내역',
    empty: '아직 받은 전송 없음',
    emptyFaucet: '상대에게 주소를 보내거나 포싯에서 받으세요.',
    emptyShare: '상대에게 주소를 보내세요.',
    from: (who: string) => `보낸 계정: ${who}`,
    big: '고액 · BTC 최종 확정 대기',
    final: '입금 완료로 간주 가능',
    belowThreshold: '설정한 기준으로는 입금 완료',
  },
};

export default receive;
