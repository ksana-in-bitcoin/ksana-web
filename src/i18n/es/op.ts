import type { Messages } from '..';

const op: Messages['op'] = {
  head: {
    mine: 'Tu operación',
    toMe: 'Para ti',
    execFailed: 'Ejecución fallida',
    liveStatus: (status: string) => `Estado actual: ${status}`,
  },

  banner: {
    failed: (reason: string) => `Ejecución fallida: ${reason}`,
    failedCharged: 'La comisión se cobra igual y el nonce queda usado; el resto de los cambios se revirtió.',
    failedNative: 'El estado no cambió; la comisión pagada a los mineros de BTC no se devuelve.',
    failedNativeUsed: 'El nonce queda usado y la comisión pagada a los mineros de BTC no se devuelve; el resto de los cambios se revirtió.',
    skipped: 'Omitida: no se ejecutó ni se cobró comisión',
    dropped: 'Descartada de la mempool: no entrará en la cadena ni se cobrará comisión',
    waitedBody: 'Los productores pueden no incluirla; la ruta C no los necesita.',
    resendNative: 'Reenviar por ruta C',
    large: 'Importe alto recibido: mejor espera a que sea final en BTC',
    largeBody: 'El importe alcanza tu umbral de importe alto.',
  },

  journey: {
    title: 'De confirmado a final',
    fastLatency: 'Del envío a la confirmación rápida:',
  },

  vmop: {
    sigHash: 'Hash de firma',
    size: 'Tamaño codificado',
    bytes: (n: string) => (n === '1' ? '1 byte' : `${n} bytes`),
    cap: (n: string) => `Límite ${n}`,
    /** Before the gas an executed op used, under its max_gas */
    gasUsed: 'Usado',
    minerFee: (sats: string, rate: string) => `${sats}\u00a0sats (${rate}\u00a0sat/vB)`,
    name: 'Nombre',
    code: 'Código',
    wasm: (n: string) => (n === '1' ? '1 byte de WASM' : `${n} bytes de WASM`),
  },

  exec: {
    title: 'Ejecución',
    block: 'Bloque',
    entry: (index: number) => `Entrada #${index}`,
    accepted: 'Altura de aceptación',
    fastDepth: 'Profundidad en Ksana',
    confs: (n: number) => (n === 1 ? '1 confirmación' : `${n.toLocaleString('en-US')} confirmaciones`),
    events: 'Eventos',
    nativeTx: 'Transacción nativa',
    closure: 'Cierre liquidado',
  },

  raw: 'Datos sin procesar (JSON)',
};

export default op;
