import type { Messages } from '..';

const send: Messages['send'] = {
  eyebrow: 'Billetera',
  title: 'Enviar',
  step: (n: number, total: number) => `Paso ${n}\u00a0de\u00a0${total}`,

  to: {
    section: 'Destinatario e importe',
    label: 'Cuenta de destino',
    placeholder: 'Dirección Taproot o hexadecimal',
    hint: 'Después de pegar, revisa los 8 primeros y 8 últimos dígitos, y el sello de cuenta',
    headTail: 'Inicio y fin',
    asAddress: 'Dirección',
    notTaproot: 'Solo se admiten direcciones Taproot (bc1p / tb1p / bcrt1p)',
    wrongNetwork: (net: string) => `Esta dirección no pertenece a la red actual (${net})`,
    badAddress: 'Dirección inválida; quizá hay un carácter mal copiado',
    badChars: 'Solo puede contener 0–9 y a–f',
    badLength: (n: number) => `Debe tener 64 dígitos; tiene ${n}`,
    notOnCurve: 'No es una cuenta válida; quizá hay un dígito mal copiado',
    self: 'El destinatario es tu propia cuenta',
    noRecord: 'Esta cuenta no tiene registros en la cadena; revisa de nuevo el inicio y el fin',
  },

  recent: {
    title: 'Enviado recientemente a',
    sentBefore: (n: number, ago: string) => (n === 1 ? `Ya enviaste aquí una vez, ${ago}` : `Ya enviaste aquí ${n} veces; la última ${ago}`),
  },

  amount: {
    max: 'Máximo',
    available: 'Disponible',
    integer: (symbol: string) => `${symbol} solo admite números enteros`,
    decimals: (symbol: string, n: number) => (n === 1 ? `${symbol} admite hasta 1 decimal` : `${symbol} admite hasta ${n} decimales`),
    notNumber: 'El importe debe escribirse en cifras, como 12.5',
    positive: 'El importe debe ser mayor que 0',
    overBalance: (amount: string, symbol: string) => `Supera el saldo disponible de ${amount}\u00a0${symbol}`,
    withFee: 'El saldo no alcanza para el importe más la comisión de patrocinio',
  },

  path: {
    section: 'Forma de envío',
    more: 'Más formas de envío',
    tagDefault: 'Por defecto',
    tagRecommended: 'Recomendada',
    tagCensorship: 'Anticensura',
    speedFast: (s: number) => `Se aplica en ~${s} s`,
    speedNative: (n: number) =>
      n === 1 ? 'Inclusión forzada tras 1 confirmación BTC' : `Inclusión forzada tras ${n} confirmaciones BTC`,
    paused: 'En pausa',
    mayNotInclude: 'Puede no incluirse',
    backlog: 'Atasco de liquidación: no se incluye hasta que se resuelva',
    censored: 'Los productores no han incluido tus operaciones últimamente',
    sameNonce: 'Reenviar con el mismo nonce solo es posible por la ruta C',
    ksaShort: 'Tu saldo de KSA no alcanza para la comisión de patrocinio',
    noOutputC: 'No hay salidas BTC disponibles para la comisión de minería',
    nativeGas: (max: string) => `El max_gas de la ruta C no puede superar ${max}`,
    nativeWaiting: (nonce: string) => `Tu operación por la ruta C (nonce ${nonce}) aún espera sus confirmaciones BTC; la ruta C vuelve a estar disponible cuando se incluya`,
    feeSpike: 'Tasa de BTC elevada',
  },


  sponsor: {
    label: 'Comisión de patrocinio',
    suggestedTag: 'Valor sugerido; se cambia en Opciones avanzadas',
    customTag: 'Importe personalizado',
    custom: 'Comisión de patrocinio',
    hint: (amount: string) => `Déjalo vacío para usar el valor sugerido de ${amount}\u00a0KSA: la mediana de las comisiones de la ruta B en los últimos 20 bloques`,
    hintRate: (amount: string) => `Déjalo vacío para usar el valor sugerido de ${amount}\u00a0KSA: la tasa de comisión que el nodo toma de los últimos 20 bloques, aplicada a esta transferencia`,
    hintMin: (amount: string) => `Déjalo vacío para usar el valor sugerido de ${amount}\u00a0KSA, la comisión mínima del nodo`,
    invalid: 'La comisión debe ser un importe en KSA mayor que 0',
    belowMin: 'Por debajo del mínimo de un productor, habrá que esperar a que otro incluya la operación',
  },

  native: {
    feeRate: 'Tarifa',
    feeRateHint: (rate: string) => `Por defecto, la tarifa de liquidación del nodo: ${rate}\u00a0sat/vB`,
    feeRateRange: (cap: string) => `Introduce una tarifa de 1\u00a0a\u00a0${cap}\u00a0sat/vB`,
    utxos: 'Salidas BTC',
    loading: 'Leyendo las salidas de tu dirección…',
    source: { btc_rpc: 'del RPC de Bitcoin', unisat: 'de la billetera', manual: 'introducidas a mano' },
    available: (sats: string, n: number) => `${sats}\u00a0sats disponibles (${n} ${n === 1 ? 'salida' : 'salidas'})`,
    unconfirmed: (sats: string, n: number) => `Aún sin confirmar: ${sats}\u00a0sats (${n} ${n === 1 ? 'salida' : 'salidas'}), utilizables cuando un bloque BTC ${n === 1 ? 'la incluya' : 'las incluya'}`,
    need: (sats: string) => `Se necesitan al menos ${sats}\u00a0sats`,
    short: (sats: string) => `Salidas BTC insuficientes; se necesitan al menos ${sats}\u00a0sats`,
    manualNeeded: 'Hay que introducir las salidas BTC a mano',
    loadFailed: (detail: string) => `No se pudieron leer las salidas BTC: ${detail}`,
    manualLabel: 'Introducir salidas a mano',
    manualPlaceholder: 'txid:vout:sats, una por línea',
    manualHint: 'Para cuando no hay RPC de Bitcoin ni API de UTXO en la billetera',
  },

  nativeRates: (rate: string, min: string) => `Tasa BTC ${rate}\u00a0sat/vB · Umbral de inclusión ${min}\u00a0sat/vB`,

  advanced: {
    title: 'Opciones avanzadas',
    gasHint: (n: string) => `Si se supera, la ejecución falla y la comisión se cobra igual; una transferencia usa ${n}`,
    gasRange: (min: string, max: string) => `max_gas debe estar entre ${min}\u00a0y\u00a0${max}`,
  },

  nonce: {
    title: (nonce: string) => `Ruta C con el mismo nonce (${nonce})`,
    race: 'Solo vale la que se incluya primero; si se incluye antes la original, la comisión de minería de esta no se devuelve',
    fixed: (nonce: string) => `${nonce} (fijo)`,
  },

  summary: {
    title: 'Resumen del envío',
    needTo: 'Primero indica la cuenta de destino',
    needAmount: 'Luego indica el importe',
    readingBalance: 'Leyendo tu saldo…',
    badFee: 'Comisión no válida',
    badGas: 'max_gas fuera de rango',
    badRate: 'Tarifa fuera de rango',
    unavailable: (path: string, reason: string) => `Ruta ${path} no disponible: ${reason}`,
    needUtxo: 'Primero aporta salidas BTC que cubran la comisión de minería',
    waitUtxo: 'Espera a que un bloque BTC confirme tus salidas',
  },

  review: {
    title: 'Revisar y firmar',
    edit: 'Editar',
    signing: 'Firmando…',
    submit: 'Firmar y enviar',
    to: 'a',
    signedBy: (wallet: string) => `Firma con ${wallet}`,
    signedLocal: 'Firma con clave de desarrollo local',
    lockB: 'Se descuenta de tu saldo de KSA antes de ejecutarse',
    lockC: 'Se difundirá una transacción BTC; el cambio vuelve a tu dirección',
    warnings: 'Atención',
    large: (threshold: string, eta: string) => `Alcanza el umbral de importe alto (${threshold}\u00a0KSA); será final en BTC en ${eta}`,
    afterNative: (nonce: string) => `Usa el nonce siguiente al de tu operación por la ruta C (nonce ${nonce}), que aún espera sus confirmaciones BTC; esta se incluye justo después`,
    network: (name: string, id: string) => `Red ${name} (chain_id ${id})`,
    raw: 'La VmOp que firmas',
    minUnit: 'Unidad mínima',
    sigHash: 'Hash de firma',
    /** Path C: on the review page there is no carrying transaction yet, so the sighash can't be given in advance */
    sigHashNative: 'Se calcula al firmar a partir de la primera entrada de la transacción portadora (D-086); todavía no existe',
  },

  error: {
    transferOnly: 'Solo se admiten transferencias',
    disconnected: 'La billetera se desconectó; vuelve a conectarla',
    walletDeclined: (detail: string) => `La billetera no firmó: ${detail}`,
    rpc: {
      invalid: 'Rechazada por el nodo: operación inválida',
      policy: 'Rechazada por el nodo: no cumple su política',
      params: 'Rechazada por el nodo: formato incorrecto',
      internal: 'Error interno del nodo',
    },
    rpcCode: (code: string) => `El nodo devolvió el error ${code}`,
    retrySuggested: 'Reintentar con el valor sugerido',
    node: (what: string, detail: string) => `${what} (${detail})`,
  },

  toast: {
    submitted: 'Firmada y enviada',
    broadcast: 'Firmada y difundida a BTC',
  },

  sent: {
    broadcastNative: 'Difundida a BTC',
    failedFoot: 'La comisión se cobró igual; la transferencia no se aplicó',
    droppedFoot: 'No entró en la cadena ni se cobró comisión',
    failedFootB: (fee: string, amount: string) => `Se cobró la comisión de ${fee}; la transferencia de ${amount} no se aplicó y ese importe sigue en tu saldo`,
    failedFootC: (amount: string) => `La comisión de minería fue para los mineros de BTC y no se devuelve; la transferencia de ${amount} no se aplicó y ese importe sigue en tu saldo`,
    againWait: 'Espera a la confirmación rápida de esta operación antes de enviar otra',
    latency: (d: string) => `Confirmación rápida en ${d}`,
    waited: 'Los productores pueden no incluirla; la ruta C no los necesita',
    resendC: 'Reenviar por ruta C',
    next: 'Siguiente paso',
    again: 'Enviar otra',
    backToWallet: 'Volver a la billetera',
    tx: 'Transacción BTC',
    manualBroadcast: 'No hay forma de difundirla desde aquí; difunde esta transacción tú mismo:',
    copyRaw: 'Copiar transacción en bruto',
  },
};

export default send;
