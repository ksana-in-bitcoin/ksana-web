import type { Messages } from '..';

const sim: Messages['sim'] = {
  label: {
    faucet: 'Faucet de devnet',
    operator: 'Operador de devnet',
    demo: 'Cuenta demo',
    share: 'Cuenta de participación en bloques',
    seller: 'Vendedor de KSA',
    contract: (name: string) => `Contrato · ${name}`,
    tknContract: 'Token TKN',
    ammContract: 'AMM',
    triggerContract: 'Disparador de pago BTC',
    exchangeContract: 'Cambio de KSA',
  },
  name: {
    tknContract: 'Token de ejemplo TKN',
    ammContract: 'AMM de producto constante (KSA/TKN)',
    triggerContract: 'Emisión disparada por pago BTC',
    exchangeContract: 'Cambio de KSA (BTC por KSA)',
    tknAsset: 'Token de ejemplo',
    passAsset: 'Comprobante de pago BTC',
  },

  reject: {
    tooLarge: (size: number) => `Operación demasiado grande: ${size} ${size === 1 ? 'byte' : 'bytes'} (límite 64 KiB)`,
    nativeGas: (max: string) => `El max_gas de la ruta C no puede superar ${max}`,
    feeLow: (min: string) => `La comisión de patrocinio no puede ser menor que ${min}\u00a0KSA`,
    ksa: 'El saldo de KSA no alcanza para la comisión de patrocinio',
    noUtxo: 'No hay UTXO de BTC disponible para la comisión de minería',
    lockNotOpen: 'El bloqueo no está en Open',
    lockMissing: 'No se encontró este bloqueo',
    sats: 'El pago debe ser mayor que 0',
    notBeneficiary: 'Solo la cuenta beneficiaria del bloqueo puede recargar',
    nonceUsed: (nonce: string) => `El nonce ${nonce} ya se usó`,
  },

  exec: {
    skipped: (reason: string) => `Omitida: ${reason}`,
    unaccepted: 'Aún no fusionada en un bloque de cadena',
    thisBlock: 'este bloque',
    duplicate: (where: string) => `Inclusión duplicada; ya se ejecutó en ${where}`,
    nonceConflict: (cur: string, op: string) => `Conflicto de nonce: la cuenta va en ${cur} y la operación trae ${op}`,
    ksaShort: 'El saldo de KSA no alcanza para la comisión de patrocinio',
    unknownOp: 'Operación desconocida',
    nonceMismatch: (cur: string, op: string) => `nonce no coincide: la cuenta va en ${cur} y la operación trae ${op}`,
    outOfGas: (max: string) => `La ejecución superó max_gas (${max})`,
    trap: 'Trap del contrato: unreachable',
    noAsset: 'El activo no existe',
    balanceShort: (symbol: string) => `Saldo de ${symbol} insuficiente`,
    noContract: 'El contrato no existe',
    liquidityShort: 'Saldo insuficiente para agregar liquidez',
    slippage: (out: string, min: string) => `Deslizamiento excesivo: se obtendrían ${out}, menos que min_out ${min}`,
    headerShallow: (min: number, h: string, depth: number) =>
      `btc_header solo lee bloques con profundidad ≥ ${min}; BTC #${h} tiene profundidad ${depth}`,
    lockNotOpen: 'El bloqueo no está en Open',
    alreadyUnlocked: 'El cursor de desbloqueo ya pasó esta posición',
    unlockNotSettled: 'El bloque objetivo aún no está en la clausura liquidada',
    mergedUnlock: 'La entrada de desbloqueo de un bloque paralelo no se ejecuta; solo la entrada de desbloqueo propia del bloque de cadena mueve el cursor',
    fundsShort: (symbol: string) => `Saldo de ${symbol} insuficiente para los fondos adjuntos`,
    noMethod: (method: string) => `El contrato no tiene el método ${method}`,
    lockInvalid: 'Parámetros de bloqueo inválidos: cantidad y precio deben ser mayores que 0 y el vencimiento, posterior a la altura de anclaje',
    scriptUsed: 'Otro bloqueo ya usa este script de cobro',
    exchangeShort: 'Saldo disponible insuficiente en el contrato de intercambio',
    notNative: 'Solo una operación por la ruta C puede reclamar los KSA de un bloqueo',
    noPayment: 'La transacción no tiene ninguna salida que pague a la dirección del bloqueo',
    notSeller: 'Solo el vendedor puede liberar el bloqueo',
    notExpired: (h: string) => `El bloqueo solo puede liberarse después del BTC #${h}`,
  },

  dropped: {
    nonceUsed: (nonce: string) => `Otra operación de la misma cuenta ya usó el nonce ${nonce}`,
  },

  note: {
    commit: 'Transacción de compromiso',
    reveal: 'Transacción de revelación',
    carriedBodies: (n: number) => (n === 1 ? 'Lleva 1 cuerpo de bloque' : `Lleva ${n} cuerpos de bloque`),
    rebuiltOffline: 'Productor fuera de línea; la reconstruyó otro nodo',
    carriedElsewhere: 'Los datos de su carga ya están en cadena en otra transacción; no se difunde',
  },

  event: {
    sideBlock: (hash: string, h: string) => `bloque paralelo ${hash} (#${h})`,
    backlogOn: (block: string, n: number) =>
      `Atasco de liquidación: ${block} lleva ${n === 1 ? '1 bloque BTC' : `${n} bloques BTC`} esperando; rutas rápidas en pausa`,
    backlogOff: 'Atasco de liquidación resuelto; rutas rápidas reanudadas',
    merged: (h: string, n: number) => `#${h} fusionó ${n === 1 ? '1 bloque paralelo' : `${n} bloques paralelos`}`,
    // Appended directly to the previous sentence, so it starts with a comma
    mergedSkipped: (n: number) =>
      n === 1 ? ', omitió 1 entrada duplicada o en conflicto' : `, omitió ${n} entradas duplicadas o en conflicto`,
    rescue: (block: string) => `La transacción de liquidación de ${block} quedó inválida; se inició una liquidación de rescate`,
    headers: (n: number) => (n === 1 ? 'Reenvío de 1 cabecera' : `Reenvío de ${n} cabeceras`),
    settledTo: (h: string) => `Liquidado hasta #${h}`,
    finalTo: (h: string) => `Final en BTC hasta #${h}`,
    btcBlock: (h: string, n: number) =>
      `Nuevo bloque BTC #${h} con ${n === 1 ? '1 transacción de Ksana' : `${n} transacciones de Ksana`}`,
    mined: (n: number) => (n === 1 ? 'regtest: 1 bloque BTC minado a mano' : `regtest: ${n} bloques BTC minados a mano`),
    faucet: 'Faucet: envió 5,000\u00a0KSA y 0.1\u00a0BTC',
    unlock: (h: string, amount: string) => `Desbloqueado hasta #${h}, ${amount}\u00a0KSA en total`,
    emptyWeight: (w: number) => `Peso de bloque vacío ×${w}`,
    topUp: (sats: string, ksa: string) => `Recarga: pagó ${sats}\u00a0sats y recibió ${ksa}\u00a0KSA`,
    censorOn: 'Escenario: los productores dejan de incluir esta cuenta',
    censorOff: 'Escenario: los productores vuelven a incluir esta cuenta',
    feeSpikeOn: 'Escenario: la tasa de BTC sube a 40\u00a0sat/vB y las liquidaciones se atascan',
    feeSpikeOff: 'Escenario: la tasa de BTC vuelve a bajar',
    cpfpMany: (n: number) =>
      n === 1 ? 'CPFP con ancla P2A para 1 transacción atascada' : `CPFP con ancla P2A para ${n} transacciones atascadas`,
    cpfpOne: 'CPFP para la transacción atascada',
    offline: (name: string) => `Escenario: ${name} fuera de línea`,
    online: 'Escenario: el productor vuelve a estar en línea',
  },
};

export default sim;
