import type { Messages } from '..';

const settlements: Messages['settlements'] = {
  eyebrow: 'Ksana en Bitcoin',
  title: 'Liquidaciones',
  inMempool: 'Mempool de BTC',

  tabsLabel: 'Tipo de transacción',
  tab: {
    settlement: 'Liquidaciones',
    native: 'Nativas · Ruta C',
    other: 'Reenvíos y CPFP',
  },

  col: {
    block: 'Bloque Ksana',
    bodies: 'Cuerpos',
    headers: 'Cabeceras',
    data: 'Datos',
    user: 'Usuario',
    forced: 'Inclusión forzada',
    btcBlock: 'Bloque BTC',
  },
  waitingConf: 'Esperando confirmación',
  headersContent: (span: string, n: number) => `${n === 1 ? '1 cabecera' : `${n} cabeceras`}: ${span}`,
  cpfpContent: 'Acelera con CPFP:',
  commit: 'Transacción de compromiso',
  /** Before the fee rate of a settlement whose commit transaction's fee the page does not know: the fee shown is the reveal transaction's (D-081) */
  revealOnly: 'Solo revelación',
  empty: 'Aún no hay transacciones de este tipo',
  /** Node data source: header item, the number of blocks loaded whose BTC transactions the list holds */
  ofLoaded: (n: number) => (n === 1 ? 'Del bloque cargado' : `De los ${n.toLocaleString('en-US')} bloques cargados`),
  /** Node data source: none of this type in the blocks loaded (the chain may hold older ones) */
  emptyLoaded: 'Ninguna en los bloques cargados',

  status: {
    confs: (n: number) => (n === 1 ? '1 confirmación' : `${n.toLocaleString('en-US')} confirmaciones`),
    stuck: 'Atascada en la mempool de BTC',
    feeBelow: (rate: string, min: string) => `Tasa ${rate}\u00a0sat/vB, por debajo del umbral de inclusión ${min}\u00a0sat/vB`,
  },
};

export default settlements;
