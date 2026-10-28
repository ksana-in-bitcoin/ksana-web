import type { Messages } from '..';

const rpc: Messages['rpc'] = {
  pending: 'Esta operación sigue en la mempool del nodo; los detalles aparecerán cuando se incluya.',
  missing: {
    block: 'El nodo no tiene este bloque',
    op: (confs: number) =>
      `El nodo no conoce esta operación. Una operación de ruta C solo la conoce cuando su transacción BTC tiene ${confs === 1 ? '1 confirmación' : `${confs} confirmaciones`} y un bloque la incluye; cualquier otra quizá nunca llegó o se descartó de la mempool. Esta página vuelve a comprobarlo sola.`,
    account: 'No se encontró esta cuenta',
    asset: 'El nodo no tiene este activo: no es un activo integrado, y el índice del nodo no conoce ningún token ni colección con este ID',
  },
  badBlockId: 'Formato no válido: usa una altura decimal o un hash hexadecimal de 64 dígitos',
  dropped: 'El nodo ya no conoce esta operación; quizá se descartó de la mempool',
  notRequeued: 'el nodo ya no la tiene en su mempool',
  indexerDown: (message: string) => `Indexador no disponible: ${message}`,
  btcRpcDown: (message: string) => `RPC de Bitcoin no disponible: ${message}`,
  btcRpcNotJson: (method: string, status: number) => `El RPC de Bitcoin ${method} devolvió una respuesta que no es JSON (HTTP ${status})`,
  btcRpcFailed: (method: string, code: number, message: string) => `El RPC de Bitcoin ${method} falló (${code}): ${message}`,
  btcRpcHttp: (method: string, status: number) => `El RPC de Bitcoin ${method} falló: HTTP ${status}`,
  btcRpcWrongChain: (url: string, chain: string, expected: string) =>
    `El RPC de Bitcoin (${url}) está en BTC ${chain}, pero la red de esta página funciona sobre BTC ${expected}, así que no se usa para listar UTXO ni difundir. Apunta el RPC de Bitcoin de los ajustes de la fuente a un bitcoind de BTC ${expected}, o vacíalo para introducir los UTXO a mano y difundir tú mismo.`,
  skipped: 'Omitida',
  unaccepted: 'Aún no fusionada en un bloque de cadena',
  producer: (n: number) => `Productor ${n}`,
  assetSymbol: (id: string) => `Activo ${id}`,
  assetName: (head: string, tail: string) => `Activo ${head}…${tail}`,
};

export default rpc;
