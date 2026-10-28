import type { Messages } from '..';
import coins from './coins';

const wallet: Messages['wallet'] = {
  title: 'Billetera',
  address: 'Dirección',
  copyAddress: 'Copiar dirección',
  accountHex: 'Cuenta (hexadecimal)',
  copyAccountHex: 'Copiar cuenta hexadecimal',

  connect: {
    title: 'Conectar billetera',
    noCustody: 'Ksana solo pide firmas; no custodia tus activos.',
    points: {
      key: 'Tu cuenta es tu dirección Taproot',
      topup: '¿Sin KSA? Recarga con BTC',
      pathC: 'Si todos los productores te rechazan, la ruta\u00a0C sigue funcionando',
    },
    /** The line under each point; n is the BTC confirmations after which Ksana blocks must include a Path C operation */
    pointNotes: {
      key: 'Tu billetera de Bitcoin firma por ella: sin clave privada ni frase semilla nuevas, y una sola dirección recibe KSA y BTC.',
      topup: 'Un vendedor bloquea KSA para ti, y la transacción de Bitcoin que le paga también los reclama.',
      pathC: (n: number) =>
        `Una operación por la ruta C viaja en una transacción de Bitcoin que envías tú: tras ${n}\u00a0${n === 1 ? 'confirmación' : 'confirmaciones'} de BTC, los bloques de Ksana deben incluirla.`,
    },
    go: 'Conectar',
    waiting: 'Esperando a la billetera…',
    demoName: 'Clave de desarrollo local',
    demoNote: 'Cuenta de prueba preasignada en el génesis',
    demoConnected: 'Cuenta demo conectada',
    needsNode: 'Requiere un nodo',
    switchSource: 'Cambiar fuente',
    lastUsed: 'Última usada',
    localOnly: 'Solo regtest local',
    notDetected: 'Extensión no detectada',
    notDetectedTouch: 'No detectada',
    install: 'Instala la extensión y recarga esta página.',
    openInApp: {
      unisat: 'Abre esta página en el navegador de la app de Unisat o de OneKey.',
      xverse: 'Abre esta página en el navegador de la app de Xverse.',
    },
    failed: (name: string) => `No se pudo conectar con ${name}`,
    network: (net: string, prefix: string) => `Cambia la billetera a ${net}: las direcciones empiezan con ${prefix}.`,
    mockHint: 'En regtest local puedes usar la billetera de clave de prueba:',
    mockParam: '?wallet=mock&key=<clave privada>',
    mockIcon: 'P',
    mockName: 'Billetera de clave de prueba',
    unisatNote: 'Cuenta Taproot (P2TR)',
    xverseNote: 'Usa la dirección Ordinals (P2TR)',
    mockNote: 'La clave privada viene de la barra de direcciones y solo queda en la memoria de esta página.',
    xverseMessage: 'Conectar billetera Ksana',
    noMockKey: 'No hay clave privada de prueba en la barra de direcciones',
    keyRefusedTitle: 'No se usó la clave del enlace',
    keyRefused:
      'La billetera de clave de prueba es solo para regtest local. La página quitó la clave de la barra de direcciones, pero una clave en un enlace también llega al servidor que sirve la página: no la uses para una cuenta con fondos.',
    wrongNetwork: (addr: string, net: string) => `La dirección ${addr}… no es de ${net}; cambia la red de Bitcoin en tu billetera.`,
    wrongChain: (wallet: string, chain: string, net: string) =>
      `${wallet} está en ${chain}, pero la red de esta página funciona sobre BTC ${net}; cambia la red de Bitcoin de tu billetera a ${net}.`,
    notTaproot: 'La cuenta de tu billetera no es una dirección Taproot; cambia a una cuenta Taproot en tu billetera.',
    notBip86: 'La dirección Taproot de tu billetera no es la estándar de su clave (BIP86); elige otra cuenta Taproot en tu billetera.',
    switched: (wallet: string) => `${wallet} cambió de cuenta`,
    switchedTo: (addr: string) => `Esta página muestra ahora ${addr}.`,
    left: (wallet: string) => `${wallet} desconectada`,
    signSwitched: (wallet: string) => `No se firmó nada: ${wallet} está en otra cuenta, no en la que mostraba esta página. Revisa los datos y vuelve a firmar.`,
    signSwitchedLeft: (wallet: string) => `No se firmó nada: ${wallet} está en otra cuenta, no en la que mostraba esta página. Vuelve a conectarla para usar esa cuenta.`,
  },

  home: {
    eyebrowDemo: 'Billetera · Cuenta demo',
    eyebrow: (name: string) => `Billetera · ${name}`,
    title: 'Mi billetera',
    viewInExplorer: 'Ver en el explorador de bloques',
    send: 'Enviar',
    showBalances: 'Mostrar saldos',
    hideBalances: 'Ocultar saldos',
  },

  alert: {
    backlogTitle: 'Atasco de liquidación al límite; rutas rápidas en pausa',
    backlog: (rate: string) =>
      `Los saldos ya vigentes no cambian; si te urge, usa la ruta C (comisión de minería a la tasa actual de ${rate}\u00a0sat/vB).`,
    censoredTitle: 'Los productores no incluyen tus operaciones de ruta rápida (escenario de demostración)',
    censored: 'Los productores pueden no incluirlas; la ruta C no los necesita.',
  },

  balances: {
    ksa: 'Ksana · KSA',
    btc: (net: string) => `${coins.bitcoin} · ${net}`,
    loading: (at: string, final: string) =>
      `Cargando bloques anteriores (ya en #${at}, límite final #${final}); el saldo final en BTC aún está incompleto.`,
    finalShort: 'Final',
    utxoCount: (n: number) => `${n} UTXO`,
    btcInWallet: (name: string) => `Consulta tu saldo de BTC en ${name}.`,
    empty: 'Aún no hay KSA: recarga con BTC o pide que te envíen a tu dirección.',
    noIndexerNote: '“BTC final” es entonces solo la palabra del nodo',
    tokens: 'Tokens',
    btcUnconfirmed: (amount: string) => `${amount}\u00a0sats sin confirmar`,
    btcReading: 'Leyendo el saldo de BTC…',
    ksaReading: 'Leyendo el saldo de KSA…',
    btcFailed: 'No se pudo leer el saldo de BTC',
    btcStale: 'No se pudo leer el saldo de BTC más reciente',
    btcRefresh: 'Actualizar el saldo de BTC',
    emptyFaucet: 'Aún no hay KSA: pide KSA de prueba o recarga con BTC.',
  },

  split: {
    allFinal: 'Todo el saldo es final en BTC',
    finalBalance: 'Saldo final en BTC',
    inflow: 'Recibido, aún no final',
    outflow: 'Enviado y comisiones, aún no final',
    total: 'Saldo actual (disponible ya)',
    unreadAll: 'Puede que no todo sea final en BTC: una llamada a un contrato aún no final puede haber pagado a este saldo, por un importe que la página no puede leer.',
    unreadMore: 'Una llamada a un contrato aún no final puede haber pagado también a este saldo, por un importe que la página no puede leer; el saldo final en BTC es entonces menor.',
  },

  inflight: {
    title: 'En curso',
    eyebrow: (n: number) => `Aún no final en BTC · ${n}`,
    failed: 'Ejecución fallida',
    resend: 'Usar ruta C',
    skipped: 'Omitida; espera una nueva inclusión',
    stuck: 'Atascada; ver detalles',
    eta: (eta: string) => `Final en ${eta}`,
    waitInclusion: 'Esperando inclusión',
    waitSettlement: 'Esperando liquidación',
  },

  activity: {
    title: 'Actividad',
    filter: 'Filtrar',
    out: 'Enviado',
    in: 'Recibido',
    empty: 'Sin registros',
  },

  utxos: {
    title: 'Salidas BTC',
    output: 'Salida',
    change: 'Cambio de liquidación',
    showSpent: 'Mostrar gastadas',
    empty: 'Sin salidas BTC',
    emptyHint: (section: string) => `Pide BTC de regtest en “${section}”.`,
    state: {
      available: 'Disponible',
      unconfirmed: 'Sin confirmar',
      spent: 'Gastada',
    },
  },

  info: {
    address: 'Dirección',
    signing: 'Método de firma',
    signingValue: 'BIP322 simple',
    disconnect: 'Desconectar billetera',
  },

  settings: {
    title: 'Confirmación de recepción',
    threshold: 'Umbral de importe alto',
    save: 'Guardar',
    saved: 'Guardado',
    hint: 'Bajo el umbral basta la confirmación rápida; desde el umbral, te recordamos esperar a que sea final en BTC.',
  },

  native: {
    noUtxo: 'No hay salidas BTC disponibles',
    unconfirmed: 'Tus salidas BTC aún no están confirmadas: espera a que un bloque BTC las incluya y vuelve a intentarlo',
    feeRateTooHigh: (rate: string, cap: string) => `Una tarifa de ${rate}\u00a0sat/vB supera el límite de esta página, ${cap}\u00a0sat/vB: no se firmó nada. Usa una tarifa más baja`,
  },

  faucet: {
    title: 'Activos de prueba',
    hint: (s: number) => `KSA llega en ~${s} s; BTC espera al siguiente bloque BTC.`,
    claim: 'Pedir 5,000\u00a0KSA y 0.1\u00a0BTC',
    requested: 'Solicitado al faucet',
    claimHosted: 'Pedir KSA de prueba',
    claimed: 'Pedido, en camino',
    console: 'Consola regtest',
  },

  playground: {
    title: 'Playground de contratos',
    body: 'Edita, compila y despliega contratos inteligentes desde el navegador. Un token, una colección NFT, un AMM, préstamos, una multifirma y un vesting, cada uno con su propia página, en la signet pública.',
    open: 'Abrir el playground',
  },
};

export default wallet;
