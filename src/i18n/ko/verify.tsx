import type { ReactNode } from 'react';
import type { Messages } from '..';

const int = (n: number) => n.toLocaleString('en-US');

const verify: Messages['verify'] = {
  eyebrow: '어떤 노드도 신뢰할 필요 없음',
  title: '검증',
  lead: '인덱서는 비트코인의 데이터만 읽어 각 블록을 다시 실행하고, 계산된 상태가 헤더의 state_root와 같을 때만 블록을 받아들입니다. 이 페이지는 인덱서가 노드의 블록을 받아들였는지 대조합니다.',
  bitcoin: '비트코인',

  flow: {
    label: '검증 경로',
    node: 'Ksana 노드',
    settled: (height: ReactNode) => <>Ksana {height}까지 정산됨</>,
    readOnly: 'BTC만 읽음',
    indexer: '독립 인덱서',
    noIndexer: '미연결: 데이터 소스 설정에서 인덱서 주소를 입력하세요',
    halted: (reason: string) => `인덱서 중지됨: ${reason}`,
    ok: '모두 일치',
    okCompared: (n: number) => (n === 1 ? '이 페이지에서 1회 검증, 일치' : `이 페이지에서 ${int(n)}회 검증, 모두 일치`),
    /** No check made yet */
    none: '아직 검증하지 않음',
    /** The indexer did not answer the last time the page asked */
    unreachable: '응답 없음: 응답할 때까지 검증할 수 없으며, 페이지는 갱신할 때마다 다시 묻습니다',
    /** The recent checks match; an older one did not, as the line under it says */
    okRecent: '최근 검증은 일치',
    /** Checks that did not match, older than the recent ones the page keeps: failed of the n checks this page made, the latest at height */
    earlier: (failed: number, n: number, height: ReactNode) =>
      failed === 1 ? (
        <>그 이전에 이 페이지의 검증 {int(n)}회 중 1회 불일치 ({height})</>
      ) : (
        <>그 이전에 이 페이지의 검증 {int(n)}회 중 {int(failed)}회 불일치 (마지막은 {height})</>
      ),
    forked: '체인 블록 불일치: 인덱서가 이 높이에서 다른 블록을 받아들였습니다. 노드의 블록이 무효이거나 정산되지 않은 분기에 있을 수 있습니다',
    stalled: (height: ReactNode) => <>{height}을(를) 실행할 수 있는데도 아직 실행하지 않음</>,
    mismatch: '불일치 발견: Ksana에 무효 블록이 있을 수 있습니다',
  },
  lag: (n: number, unwritten: number, depth: number) => {
    if (unwritten >= n) return `인덱서가 최신 블록보다 ${int(n)}블록 뒤처져 있으며, 이 블록들은 아직 비트코인 기록을 기다리는 중입니다.`;
    if (unwritten === 0) return `인덱서가 최신 블록보다 ${int(n)}블록 뒤처져 있습니다. 각 블록은 그 뒤의 ${int(depth)}블록도 비트코인에 기록된 뒤에 실행됩니다.`;
    return `인덱서가 최신 블록보다 ${int(n)}블록 뒤처져 있습니다. 최신 ${int(unwritten)}블록은 아직 비트코인 기록을 기다리는 중이고, 각 블록은 그 뒤의 ${int(depth)}블록도 기록된 뒤에 실행됩니다.`;
  },
  stall: (height: ReactNode, btc: ReactNode, depth: number) => (
    <>
      인덱서가 {height}을(를) 아직 실행하지 않았지만, 이 블록의 데이터와 뒤따르는 {int(depth)}개 블록의 헤더는 {btc}부터 비트코인에 있습니다. 따라잡는 중이거나 로컬 장애로 멈췄거나, 이 블록을 무효로 판정했을 수 있습니다. 실행될 때까지 이 블록부터는 노드만이 보증합니다.
    </>
  ),

  checks: {
    title: '최근 검증',
    caption: 'state_root 검증',
    noIndexer: '인덱서가 연결되지 않음',
    none: '아직 검증 기록 없음',
    nodeRoot: '노드의 state_root',
    indexerRoot: '인덱서가 재계산한 state_root',
    match: '일치',
    forked: '체인 블록 다름',
    mismatch: '불일치',
    nodeBlock: (hash: string) => `이 높이의 노드 체인 블록: ${hash}`,
    at: '검증 시각',
  },

  confirm: {
    title: '두 가지 확인',
    when: '조건',
    time: '일반적인 소요 시간',
    security: '보안 근거',
    fit: '적합한 용도',
    fastWhen: 'Ksana 블록에 포함',
    fastSecurity: 'Ksana의 PoW 해시파워',
    fastFit: '일상적인 소액 작업',
    finalWhen: (confs: number) => `데이터가 비트코인에서 ${confs}회 확인되고, 판정한 비트코인 블록도 ${confs}회 확인`,
    finalTime: (mainnet: string, network: string, now?: string) =>
      now === undefined ? (
        `메인넷 ${mainnet}`
      ) : (
        <>
          <span className="phrase">메인넷 {mainnet},</span> <span className="phrase">{network} 현재 {now}</span>
        </>
      ),
    finalFit: '고액, 비트코인의 보장이 필요한 결과',
    risk: 'Ksana 해시파워의 과반을 장악한 공격도 아직 BTC 최종 확정되지 않은 블록만 되돌릴 수 있습니다.',
  },

  params: {
    title: '프로토콜 매개변수',
    eyebrow: (chain: string) => `${chain} 매개변수`,
    name: '매개변수',
    value: '값',
    note: '설명',
    count: (n: number) => `매개변수 ${n}개`,
  },

  self: {
    title: '직접 검증',
    how: (indexer: ReactNode, txindex: ReactNode) => (
      <>
        {indexer}를 실행하고 {txindex}를 켠 bitcoind에 연결하면 됩니다.
      </>
    ),
    btcTip: '최신 블록',
    indexerAt: '인덱서 처리 위치',
    console: 'regtest 콘솔을 열어 이상 상황 만들기',
    settings: '데이터 소스와 인덱서 설정',
  },
};

export default verify;
