import type { Messages } from '..';

const search: Messages['search'] = {
  results: (q: string) => `‘${q}’ 검색 결과`,
  none: (q: string) => `‘${q}’ 검색 결과 없음`,
  count: (n: number) => `${n}건`,
  howTo: '이렇게 검색할 수 있습니다:',

  tipSep: ': ',
  tips: {
    height: { label: 'Ksana 블록', text: '높이(예: 128, #128), 같은 높이의 병렬 블록도 함께 표시' },
    hash: { label: '블록 해시, op_id, BTC txid', text: '64자리 16진수, 앞 4자리만 입력해도 자동 완성' },
    /** prefix is the network's Taproot address prefix, such as tb1p */
    account: { label: '계정', text: (prefix: string) => `Taproot 주소(${prefix}…) 또는 64자리 16진수` },
    name: { label: '이름', text: '블록 생성자(devnet-1), 컨트랙트(AMM), 포싯' },
  },

  miss: {
    aboveTip: (tip: string) => `이 페이지가 아는 한, 이 높이의 Ksana 블록은 아직 없습니다. 체인의 최신 블록은 #${tip}입니다.`,
    aboveTips: (tip: string, btcTip: string) => `이 페이지가 아는 한, 두 체인 모두 이 높이의 블록이 아직 없습니다. Ksana 최신 블록은 #${tip}, 비트코인 최신 블록은 #${btcTip}입니다.`,
    notTaproot: (prefix: string) =>
      `비트코인 주소이지만 Taproot 주소가 아니어서 Ksana 계정이 아닙니다. 계정은 ${prefix}로 시작하는 Taproot 주소입니다. 여기서 지갑을 쓰려면 지갑에서 Taproot 계정으로 전환하세요.`,
    noKey: '이 Taproot 주소는 Ksana 계정이 될 수 없습니다. 이 주소에 해당하는 키가 없어 누구도 서명할 수 없습니다.',
    otherNetwork: (nets: string, net: string, prefix: string) =>
      `비트코인 ${nets} 주소이지만, 이 페이지의 네트워크는 BTC ${net}에서 동작합니다. 이 네트워크의 계정은 ${prefix}로 시작하는 Taproot 주소입니다.`,
    viewAddress: (site: string) => `${site}에서 이 주소 보기`,
    or: (a: string, b: string) => `${a} 또는 ${b}`,
    comma: ', ',
  },

  notFound: {
    eyebrow: '찾을 수 없음',
    // "입니다" doesn't change with the final consonant of the preceding syllable, so any noun can precede it
    title: (what: string) => `존재하지 않는 ${what}입니다`,
    page: '페이지',
    badPath: '주소가 잘못되었거나 페이지가 이동되었을 수 있습니다.',
    badOpId: '작업 ID(op_id)는 16진수 64자리입니다. 이 값은 아닙니다.',
    badAccount: (prefix: string) => `계정은 ${prefix}로 시작하는 Taproot 주소이거나 16진수 64자리입니다. 이 값은 둘 다 아닙니다.`,
    ahead: (tip: string) => `이 높이는 체인의 최신 블록 #${tip}보다 위입니다. 블록이 아직 생성되지 않았습니다.`,
    sim: '새로고침하면 시뮬레이션 체인이 새로 생성되어 이전 링크의 해시는 더 이상 유효하지 않습니다.',
    home: '개요로 돌아가기',
  },
};

export default search;
