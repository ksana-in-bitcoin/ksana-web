import type { Messages } from '..';

const ui: Messages['ui'] = {
  copyWhat: (label: string, text: string) => `${label}: ${text}`,
  accountTitle: (address: string) => `Cuenta ${address}`,
  accountHex: (id: string) => `Hexadecimal ${id}`,
  contractTitle: (id: string) => `Contrato ${id}`,
  // Screen-reader text appended directly after the block number, so it starts with a space
  sideBlockSr: ' (bloque paralelo)',
  goneSr: ' (ya no está en esta lista)',
  issuedBy: 'Emitido por',
  lookalike: (coin: string) => `No es ${coin}: es un activo de un contrato con un nombre parecido`,

  emptyBlock: 'Bloque vacío',
  entryCounts: (b: number, c: number) => `Patrocinadas: ${b} · Inclusiones forzadas: ${c}`,
  entryCountsOther: (n: number) => ` · Desbloqueos: ${n}`,
  entryUnlock: 'desbloqueo',
  mergedCount: (n: number) => (n === 1 ? '1 bloque paralelo fusionado' : `${n} bloques paralelos fusionados`),
  btcAnchor: 'Ancla BTC',
  blockList: 'Lista de bloques',
  opList: 'Lista de operaciones',
  received: 'Recibido',
  arrowTo: 'a',
  arrowFrom: 'de',
  sender: 'Cuenta de origen',

  minerFee: 'Comisión de minería',
  minerFeeHint: 'Se paga a los mineros de BTC',
  feeRateCapped: (rate: string, cap: string) => `El nodo sugiere ${rate}\u00a0sat/vB; esta página usa como máximo ${cap}\u00a0sat/vB`,
  skipped: 'Omitida',
  awaitingMerge: 'Por fusionar',
  awaitingMergeHint: 'Se ejecuta al fusionarse',
  ok: 'Éxito',

  satsUnknown: 'El nodo no da este importe',
  entryKind: {
    Forced: 'Inclusión forzada',
    Sponsored: 'Patrocinada',
    Unlock: 'Desbloqueo',
  },

  progress: 'Progreso de la operación',
  stuck: 'Atascada',

  search: 'Buscar',
  searchPlaceholder: 'Altura, hash, op_id o dirección',
  searchResults: 'Resultados de búsqueda',
  searchNone: 'Sin resultados',

  lookupWhat: { block: 'bloque', op: 'operación', account: 'cuenta', asset: 'activo', contract: 'contrato', btcTx: 'transacción de BTC' },
  lookupErrorEyebrow: 'Error de consulta',
  lookupError: (what: string) => `No se pudo obtener: ${what}`,
  lookupLoadingEyebrow: 'Consultando',
  lookupLoading: (what: string) => `Consultando ${what}…`,
  /** Under a lookup that failed while the page says the node is disconnected: it is read again once the node answers */
  lookupAgain: 'La página lo vuelve a consultar en cuanto el nodo responda.',
  doc: {
    block: (height: string) => `Bloque #${height}`,
    btcBlock: (height: string) => `Bloque BTC #${height}`,
    btcTx: (txid: string) => `Transacción BTC ${txid}`,
    op: (id: string) => `Operación ${id}`,
    account: (address: string) => `Cuenta ${address}`,
    contract: (name: string) => `Contrato ${name}`,
    asset: (symbol: string) => `Activo ${symbol}`,
  },
  history: {
    reading: (h: string) => `Cargando bloques anteriores (ya en #${h})…`,
    from: (h: string) => `Solo se listan operaciones desde el bloque #${h}.`,
    earlier: 'Cargar bloques anteriores',
    listing: 'Obteniendo las operaciones del nodo…',
    listed: (n: string) => (Number(n) === 1 ? 'Se revisó la operación más reciente.' : `Se revisaron las ${n} operaciones más recientes.`),
    older: 'Revisar operaciones anteriores',
    showOlder: 'Mostrar operaciones anteriores',
    failed: (message: string) => `No se pudieron obtener las operaciones del nodo: ${message}`,
    retry: 'Reintentar',
  },
};

export default ui;
