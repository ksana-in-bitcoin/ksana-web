import type { ReactNode } from 'react';
import type { Messages } from '..';

const contract: Messages['contract'] = {
  // Korean particles change with whether the preceding syllable ends in a consonant (batchim), so no particle is attached here; written as "배포자 … · 배포 블록 …"
  deployed: (by: ReactNode, at: ReactNode) => (
    <>
      배포자 {by} · 배포 블록 {at}
    </>
  ),
  seeking: '배포를 찾는 중…',
  rpcNote: '노드는 컨트랙트 메타데이터를 제공하지 않으니, 읽기 전용 호출은 ksana-cli나 SDK를 이용하세요.',
  playground: 'Playground에서 열기',
  playgroundHint: '예제 계약은 전용 화면에서 열리고, 다른 계약은 소스의 ABI를 붙여 넣으면 호출할 수 있습니다',
  /** Node data source: the calls and asset transfers to the contract, from the node's listing (D-111) */
  history: '호출과 입금',
  noHistory: '호출이나 입금이 없습니다',

  idHint: 'sha256(배포자 ‖ nonce ‖ code_hash)',
  code: '코드',
  codeBytes: (n: string) => `${n}바이트`,
  deployOp: '배포 작업',
  methods: '메서드',
  issued: '발행 자산',
  supply: '총량',
  holdings: '컨트랙트 보유',

  read: {
    title: '읽기 전용 호출',
    eyebrow: '체인에 기록되지 않음, 수수료 없음',
    method: '메서드',
    arg: '인자',
    call: '호출',
    ok: '반환값',
    error: '오류',
  },
  argHint: {
    balance_of: 'account: 주소 또는 64자리 16진수',
    claimed: 'account: 주소 또는 64자리 16진수',
    quote: 'amount_in: KSA 수량',
    get_lock: 'lock: 잠금 번호',
    lock_of_script: 'script: 16진수 지불 스크립트',
    balance: 'seller: 주소 또는 64자리 16진수',
    lock_count: 'seller: 주소 또는 64자리 16진수',
    locks_of: 'seller: 주소 또는 64자리 16진수',
  },
  result: {
    notIssued: '자산이 아직 발행되지 않았습니다',
    needAccount: 'account 인자에는 Taproot 주소 또는 64자리 16진수가 필요합니다',
    needAmount: (decimals: number) => `amount_in 인자에는 양의 KSA 수량(소수점 이하 최대 ${decimals}자리)이 필요합니다`,
    needLock: 'lock 인자에는 잠금 번호(0 이상의 정수)가 필요합니다',
    noLock: '이 번호의 잠금이 없습니다: 컨트랙트가 호출을 실패시킵니다',
    needScript: 'script 인자에는 16진수 지불 스크립트가 필요합니다',
    needSeller: 'seller 인자에는 Taproot 주소 또는 64자리 16진수가 필요합니다',
    notSimulated: '시뮬레이터는 이 메서드에 응답하지 않습니다. 노드에서는 컨트랙트가 응답합니다',
    quote: (ksaIn: string, tknOut: string) => `${ksaIn}\u00a0KSA → ${tknOut}\u00a0TKN(수수료 0.3% 포함)`,
  },

  recent: '최근 호출',
  noCalls: '호출 없음',
};

export default contract;
