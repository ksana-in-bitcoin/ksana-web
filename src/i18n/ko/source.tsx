import type { ReactNode } from 'react';
import type { Messages } from '..';

const source: Messages['source'] = {
  title: '데이터 소스',
  state: { live: '연결됨', connecting: '연결 중…', error: '연결 끊김' },
  tip: (height: string) => `최신 블록 #${height}`,
  push: { ws: 'WebSocket 푸시', poll: '2.5초마다 폴링' },
  lastSync: (ago: string) => `마지막 동기화 ${ago}`,
  indexer: (url: ReactNode) => <>인덱서 {url}</>,
  indexerHalted: (reason: string) => `중지됨: ${reason}`,
  btc: (url: ReactNode) => <>비트코인 RPC {url}</>,
  noBtc: '비트코인 RPC 없음: 경로 C와 충전은 지갑 인터페이스나 직접 입력한 UTXO를 사용합니다',
  noIndexer: '인덱서가 연결되지 않아 검증 페이지에서 상태 루트를 비교할 수 없습니다',
  fromLink: '페이지 링크로 지정됨: 이 탭에서만 쓰이고 저장되지 않습니다. 여기서 다른 노드에 연결하면 그 노드가 저장됩니다.',

  kind: { sim: '브라우저 내 시뮬레이터', rpc: '노드 RPC' },
  simHint: '별도 서비스가 필요 없으며, 새로고침하면 체인이 새로 생성됩니다',
  nodeUrl: '노드 JSON-RPC',
  nodeUrlHint: '노드에서 --rpc-cors로 이 페이지를 허용하거나, 동일 출처 프록시 경로(예: /rpc)를 입력하세요',
  indexerUrl: '인덱서 JSON-RPC(선택)',
  indexerUrlHint: '인덱서는 교차 출처 설정이 없어 동일 출처 프록시 경로만 입력할 수 있습니다',
  btcUrl: '비트코인 RPC(선택)',
  btcUrlHint: 'bitcoind JSON-RPC의 동일 출처 프록시 경로. 자격 증명은 프록시에 남고, 경로 C와 충전이 UTXO 조회와 브로드캐스트에 사용합니다',
  network: '네트워크',
  devnet: 'devnet(regtest)',

  action: {
    connect: '노드 연결',
    reconnect: '다시 연결',
    toSim: '시뮬레이터로 전환',
    regenerate: '시뮬레이션 체인 다시 생성',
  },

  error: {
    noUrl: '노드의 JSON-RPC 주소를 입력하세요',
    otherNetwork: (node: string, chainId: string, chosen: string) =>
      `노드는 ${node} 네트워크(chain_id ${chainId})에 있으며 선택한 ${chosen} 네트워크와 다릅니다. ${node} 네트워크로 바꾸거나 ${chosen} 노드에 연결하세요.`,
    mainnet: (chainId: string) => `노드는 mainnet(chain_id ${chainId})에 있습니다. 이 페이지는 아직 mainnet을 지원하지 않으니 devnet 또는 signet 노드에 연결하세요.`,
    unknownChain: (chainId: string) => `노드의 chain_id(${chainId})는 어떤 Ksana 네트워크에도 속하지 않습니다. 주소를 확인하세요.`,
    rpc: (code: string, message: string) => `노드 오류 ${code}: ${message}`,
    timeout: (url: string) => `${url} 연결 시간 초과: 노드가 실행 중인지 확인하고 다시 시도하세요`,
    unreachable: (url: string, origin: string) =>
      `${url}에 연결할 수 없습니다. 노드 실행 여부와 --rpc-cors의 ${origin} 허용 여부를 확인하세요.`,
    offline: (url: string) => `${url}에 연결할 수 없습니다. 네트워크 연결을 확인하세요.`,
    unavailable: (url: string, status: string) => `노드가 잠시 응답하지 않습니다(${url}: HTTP ${status}).`,
    thisPage: '이 페이지의 출처',
  },
};

export default source;
