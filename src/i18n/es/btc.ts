import type { Messages } from '..';

const btc: Messages['btc'] = {
  what: 'bloque BTC',
  notFoundRpc: 'Esta altura es anterior al bloque BTC en el que se ancla el bloque génesis de Ksana, así que no contiene nada de Ksana: consúltalo en un explorador de Bitcoin.',
  notFoundAhead: 'Esta altura está por encima del último bloque BTC que conoce la página: el bloque aún no se ha minado o la página aún no lo ha alcanzado.',
  notFoundRpcTitle: 'Aquí no se puede consultar este bloque BTC',
  viewOn: (site: string) => `Verlo en ${site}`,

  eyebrow: (network: string) => `Bloque BTC · ${network}`,
  confs: (n: number) => (n === 1 ? '1 confirmación' : `${n.toLocaleString('en-US')} confirmaciones`),
  prev: 'Anterior',
  next: 'Siguiente',

  txsTitle: (n: number) => `Transacciones de Ksana (${n})`,
  txsHeading: 'Transacciones de Ksana',
  reading: 'Leyendo del nodo los bloques de Ksana a su alrededor…',
  readFailed: 'No se pudieron leer del nodo los bloques de Ksana a su alrededor',
  noKnownTxs: 'Sin transacciones de Ksana conocidas',
  noTxs: 'Sin transacciones de Ksana',
  col: {
    kind: 'Tipo',
    for: 'Corresponde a',
  },

  hash: 'Hash del bloque',
  timeApprox: 'Hora (aprox.)',
  explorer: 'Explorador externo',
  confirmations: 'Confirmaciones',
  headers: 'Cabeceras de bloques Ksana',
  bodies: 'Cuerpos de bloques Ksana',
  anchored: 'Bloques anclados aquí',
  anchoredCount: (n: number) => (n === 1 ? '1 bloque Ksana' : `${n} bloques Ksana`),
};

export default btc;
