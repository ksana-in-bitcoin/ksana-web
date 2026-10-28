import type { Messages } from '..';

const tx: Messages['tx'] = {
  notFoundRpc: 'El nodo no busca transacciones por txid; ábrela desde la página de su bloque o en un explorador de Bitcoin.',
  /** Its title: the transaction may well exist */
  notFoundRpcTitle: 'Aquí no se puede consultar esta transacción de BTC',
  /** A link to a public Bitcoin explorer's page for the transaction; site is its name */
  viewOn: (site: string) => `Verla en ${site}`,

  eyebrow: (kind: string) => `Transacción BTC · ${kind}`,
  forBlock: 'Bloque Ksana',

  pair: {
    commit: 'Liquidación · Transacción de compromiso',
    reveal: 'Liquidación · Transacción de revelación',
    commitTx: 'Transacción de compromiso',
    revealTx: 'Transacción de revelación',
    hint: 'El compromiso fija primero un compromiso; la revelación lleva la carga en su testigo.',
  },

  stuck: {
    title: 'Atascada en la mempool de BTC',
    bumpAnchor: 'Acelerar con ancla P2A',
    bumpChange: 'CPFP con el cambio',
    bumpedAnchor: (n: number) =>
      n === 1
        ? 'Se agregó 1 transacción hija CPFP; se confirmarán juntas en el siguiente bloque BTC'
        : `Se agregaron ${n} transacciones hijas CPFP; se confirmarán juntas en el siguiente bloque BTC`,
    bumpedChange: 'Se agregó una transacción hija CPFP con el cambio; se confirmarán juntas en el siguiente bloque BTC',
    bumpFailed: 'No hay salidas que gastar; no se puede hacer CPFP',
  },

  partial: {
    title: 'El nodo solo da parte de esta transacción',
    more: 'Ve el contenido completo en un explorador de Bitcoin.',
  },

  replacedBy: 'Reemplazada por',
  invalidRebuilt: 'La liquidación se reconstruyó; nadie tiene que volver a firmar.',
  rescueBanner: {
    rebuilt: 'Liquidación reconstruida por el productor',
    rescue: 'Liquidación de rescate',
  },

  structure: 'Estructura de la transacción',

  payload: {
    title: 'Carga útil',
    type: 'Tipo de carga',
    headers: 'Cabeceras',
    bodies: 'Cuerpos',
    dataSize: 'Tamaño de datos',
    chunks: 'Fragmentos de datos',
    none: 'Sin datos de Ksana',
  },

  details: {
    title: 'Transacción',
    vsize: 'Tamaño virtual',
    broadcastAt: (time: string) => `Difundida a las ${time}`,
    otherVersions: 'Otras versiones del bloque',
    author: {
      rebuilder: 'Reconstructor',
      rescuer: 'Rescatador',
      user: 'Usuario',
      funder: 'Financiador',
    },
  },

  diagram: {
    inputs: 'Entradas',
    outputs: 'Salidas',
    inRole: {
      producer: 'Fondos del productor',
      commit: 'De la transacción de compromiso',
      payer: 'Entrada de pago',
      anchor: 'Ancla P2A (transacción padre)',
    },
    outRole: {
      change: 'Cambio',
      commitment: 'Salida de compromiso',
      anchor: 'Ancla P2A',
      payment: 'Pago',
    },
    producerChange: 'Cambio del productor',
    anyone: 'Gastable por cualquiera',
    commitmentHint: 'La gasta la transacción de revelación',
    opReturn: {
      native: 'NativeOp: una VmOp',
      headers: (n: number) => `Headers: ${n === 1 ? '1 cabecera' : `${n} cabeceras`}`,
      settlement: (headers: number, entries: number) =>
        `${headers === 1 ? '1 cabecera' : `${headers} cabeceras`} + ${entries === 1 ? '1 entrada' : `${entries} entradas`}`,
      empty: 'OP_RETURN vacío',
    },
    chunks: (n: number) => (n === 1 ? '1 fragmento de datos' : `${n} fragmentos de datos`),
    envelope: {
      title: 'Sobre del testigo',
      headers: (n: number) => (n === 1 ? '1 cabecera de bloque' : `${n} cabeceras de bloque`),
      bodies: (n: number) => (n === 1 ? '1 cuerpo de bloque' : `${n} cuerpos de bloque`),
    },
  },
};

export default tx;
