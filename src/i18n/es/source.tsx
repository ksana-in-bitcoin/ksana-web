import type { ReactNode } from 'react';
import type { Messages } from '..';

const source: Messages['source'] = {
  title: 'Fuente de datos',
  state: { live: 'Conectado', connecting: 'Conectando…', error: 'Sin conexión' },
  tip: (height: string) => `Último bloque #${height}`,
  push: { ws: 'Push por WebSocket', poll: 'Sondeo cada 2.5 s' },
  lastSync: (ago: string) => `Sincronizado ${ago}`,
  indexer: (url: ReactNode) => <>Indexador {url}</>,
  indexerHalted: (reason: string) => `Detenido: ${reason}`,
  btc: (url: ReactNode) => <>RPC de Bitcoin {url}</>,
  noBtc: 'Sin RPC de Bitcoin: la ruta C y las recargas usan la interfaz de la billetera o UTXO introducidas a mano',
  noIndexer: 'Sin indexador; la página Verificar no puede comparar el state_root',
  fromLink: 'Indicado en el enlace de la página: se usa solo en esta pestaña y no se guarda. Otro nodo que conectes aquí sí se guarda.',

  kind: { sim: 'Simulador', rpc: 'RPC del nodo' },
  simHint: 'No requiere servicios; al recargar se genera una cadena nueva',
  nodeUrl: 'JSON-RPC del nodo',
  nodeUrlHint: 'El nodo debe permitir esta página con --rpc-cors, o usa un proxy del mismo origen (p. ej., /rpc)',
  indexerUrl: 'JSON-RPC del indexador (opcional)',
  indexerUrlHint: 'El indexador no acepta otros orígenes; usa un proxy del mismo origen',
  btcUrl: 'RPC de Bitcoin (opcional)',
  btcUrlHint: 'Ruta de proxy del mismo origen al JSON-RPC de bitcoind; las credenciales quedan en el proxy. La ruta C y las recargas lo usan para listar UTXO y difundir',
  network: 'Red',
  devnet: 'devnet (regtest)',

  action: {
    connect: 'Conectar nodo',
    reconnect: 'Reconectar',
    toSim: 'Usar el simulador',
    regenerate: 'Regenerar cadena simulada',
  },

  error: {
    noUrl: 'Escribe la URL JSON-RPC del nodo',
    otherNetwork: (node: string, chainId: string, chosen: string) =>
      `El nodo está en ${node} (chain_id ${chainId}), no en ${chosen}. Elige ${node} como red o conéctate a un nodo de ${chosen}.`,
    mainnet: (chainId: string) => `El nodo está en mainnet (chain_id ${chainId}). Esta página aún no admite mainnet; conéctate a un nodo de devnet o signet.`,
    unknownChain: (chainId: string) => `El nodo indica chain_id ${chainId}, que no pertenece a ninguna red de Ksana; revisa la dirección.`,
    rpc: (code: string, message: string) => `El nodo devolvió el error ${code}: ${message}`,
    timeout: (url: string) => `Tiempo agotado al conectar con ${url}; verifica que el nodo esté en marcha y reintenta`,
    unreachable: (url: string, origin: string) =>
      `No se pudo conectar con ${url}. Verifica que el nodo esté en marcha y que permita ${origin} con --rpc-cors.`,
    offline: (url: string) => `No se pudo conectar con ${url}: revisa la conexión de red.`,
    unavailable: (url: string, status: string) => `El nodo no responde por ahora: ${url} devolvió HTTP ${status}.`,
    thisPage: 'el origen de esta página',
  },
};

export default source;
