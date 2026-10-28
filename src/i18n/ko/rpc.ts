import type { Messages } from '..';

const rpc: Messages['rpc'] = {
  pending: '이 작업은 아직 노드의 멤풀에 있으며, 포함되면 상세 정보가 자동으로 표시됩니다.',
  missing: {
    block: '노드에 이 블록이 없습니다',
    op: (confs: number) =>
      `노드가 이 작업을 알지 못합니다. 경로 C 작업은 BTC 트랜잭션이 ${confs}회 확인되고 블록에 포함된 뒤에야 노드가 알게 됩니다. 그 밖의 작업은 받은 적이 없거나 멤풀에서 제거되었을 수 있습니다. 이 페이지가 자동으로 다시 확인합니다.`,
    account: '이 계정을 조회할 수 없습니다',
    asset: '노드에 이 자산이 없습니다. 내장 자산이 아니며, 노드의 인덱스도 이 ID의 토큰이나 컬렉션을 알지 못합니다',
  },
  badBlockId: '형식 오류: 블록은 10진수 높이나 64자리 16진수 해시로 지정하세요',
  dropped: '노드가 이 작업을 더 이상 알지 못하며, 멤풀에서 제거되었을 수 있습니다',
  notRequeued: '노드의 멤풀에 더 이상 남아 있지 않음',
  indexerDown: (message: string) => `인덱서 사용 불가: ${message}`,
  btcRpcDown: (message: string) => `비트코인 RPC 사용 불가: ${message}`,
  btcRpcNotJson: (method: string, status: number) => `비트코인 RPC ${method}: JSON이 아닌 응답(HTTP ${status})`,
  btcRpcFailed: (method: string, code: number, message: string) => `비트코인 RPC ${method} 실패(${code}): ${message}`,
  btcRpcHttp: (method: string, status: number) => `비트코인 RPC ${method} 실패: HTTP ${status}`,
  btcRpcWrongChain: (url: string, chain: string, expected: string) =>
    `비트코인 RPC(${url})는 BTC ${chain}에 있지만 이 페이지의 네트워크는 BTC ${expected}에서 동작하므로, UTXO 조회와 브로드캐스트에 사용하지 않습니다. 데이터 소스 설정에서 비트코인 RPC를 BTC ${expected}의 bitcoind로 지정하거나, 비우고 UTXO를 직접 입력한 뒤 직접 브로드캐스트하세요.`,
  skipped: '건너뜀',
  unaccepted: '아직 체인 블록에 병합되지 않음',
  producer: (n: number) => `블록 생성자 ${n}`,
  assetSymbol: (id: string) => `자산 ${id}`,
  assetName: (head: string, tail: string) => `자산 ${head}…${tail}`,
};

export default rpc;
