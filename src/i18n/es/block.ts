import type { Messages } from '..';

const block: Messages['block'] = {
  head: {
    eyebrow: 'Bloque Ksana',
    eyebrowSide: 'Bloque Ksana · Paralelo',
    anchor: 'Ancla',
    prev: 'Anterior',
    next: 'Siguiente',
  },

  side: {
    mergedBy: (h: string) => `Bloque paralelo, fusionado por #${h}`,
    waiting: 'Bloque paralelo, esperando fusión',
    sibling: 'Bloque de cadena a la misma altura',
  },

  header: {
    title: 'Cabecera',
    hash: 'Hash del bloque',
    genesis: 'Bloque génesis',
    indexerMatch: 'Coincide con el indexador',
    weight: 'Peso de bloque vacío',
    weightHint: 'Se duplica con bloques vacíos seguidos; suben la dificultad y la recompensa',
  },

  dag: {
    selectedParent: 'Padre seleccionado',
    mergedParent: 'Fusionado',
    acceptedBy: 'Bloque de cadena que lo fusionó',
    mergedStats: (entries: number, skipped: number) =>
      `${entries === 1 ? '1 entrada' : `${entries} entradas`} · ${skipped === 1 ? '1 omitida' : `${skipped} omitidas`}`,
    closure: 'Cierre liquidado',
  },

  settle: {
    title: 'Liquidación',
    own: 'Con transacción de liquidación propia',
    ownPair: 'Transacciones de compromiso y revelación',
    none: 'Sin liquidación propia',
    genesis: 'El bloque génesis no necesita liquidación.',
    bodyCarried: 'El cuerpo del bloque llega a Bitcoin con una liquidación posterior.',
    bodyCarriedLanded: 'El cuerpo del bloque llegó a Bitcoin con una liquidación posterior.',
    bodyCarrier: 'Liquidación que lleva el cuerpo',
    waiting: 'Espera una liquidación posterior',
    otherCarrier: 'Cuerpo llevado por otra transacción',
    bodyOther: 'El cuerpo del bloque llegó a Bitcoin en otra transacción.',
    bodyCarrierBlock: 'Liquidación del bloque',
    carried: 'Bloque vacío o solo con inclusiones forzadas: su cabecera llega a Bitcoin en otra transacción.',
    carriedOwn: 'Un bloque vacío o solo con inclusiones forzadas no necesita liquidación propia; este envía una para los cuerpos de bloques anteriores, y su cabecera va con ellos.',
    carrier: 'Transacción portadora',
    carrierOf: (block: string, kind: string) => `${kind} de ${block}`,
    otherBlock: 'otro bloque',
    noCarrier: 'Ninguna transacción lleva aún esta cabecera.',
    carrierUnloaded: 'La cabecera de este bloque llegó a Bitcoin con una transacción que esta página no ha encontrado.',
    notBuilt: 'La transacción de liquidación aún no se construyó.',
    rescue: 'Rescate / reconstrucción',
    confs: (n: number) => (n === 1 ? '1 confirmación' : `${n.toLocaleString('en-US')} confirmaciones`),
    commit: 'Transacción de compromiso',
    reveal: 'Transacción de revelación',
    /** The fee of a settlement's reveal transaction alone, where the page does not know its commit transaction's (D-081) */
    revealFee: 'Comisión de revelación',
    revealFeeHint: 'La transacción de compromiso también paga comisión, que esta página no puede sumar: no conoce el importe de la entrada que la financia',
    /** A settlement's fee by transaction, the amounts already formatted */
    feeParts: (commit: string, reveal: string) => `Compromiso ${commit}\u00a0sats + revelación ${reveal}\u00a0sats`,
    content: 'Contenido',
    contentHint: 'Ve el contenido completo en un explorador de Bitcoin',
    headers: 'Cabeceras incluidas',
    headerCount: (n: number) => `${n}`,
    bodies: 'Cuerpos incluidos',
    bodyCount: (n: number) => `${n}`,
    dataSize: 'Tamaño de datos',
    dataMeter: 'Datos de la liquidación',
    versions: (n: number) =>
      n === 1 ? 'Este bloque tuvo 1 transacción de liquidación:' : `Este bloque tuvo ${n} transacciones de liquidación:`,
  },

  entries: {
    title: (n: number) => `Entradas (${n})`,
    forced: 'Inclusión forzada · Desde BTC',
    system: 'Desbloqueo · se abonan las comisiones y recompensas de los bloques liquidados',
    fast: 'Rutas rápidas',
    unlockTo: (h: string, i: number) => `Hasta #${h} · índice ${i}`,
    unlockBlocks: (n: number) => (n === 1 ? '1 bloque' : `${n} bloques`),
    unlockTotal: 'total',
    skipped: (n: number) => (n === 1 ? '1 omitida' : `${n} omitidas`),
    gas: (used: string, sum: string) => `gas ${used} / límites declarados ${sum}`,
    data: (size: string) => `Datos ${size}`,
  },

  type: 'Tipo',
  raw: 'Datos sin procesar (JSON)',
};

export default block;
