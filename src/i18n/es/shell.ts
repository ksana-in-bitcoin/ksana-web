import type { Messages } from '..';

const shell: Messages['shell'] = {
  skipToMain: 'Ir al contenido',

  mainNav: 'Navegación principal',
  nav: {
    overview: 'Resumen',
    blocks: 'Bloques',
    ops: 'Operaciones',
    settlements: 'Liquidaciones',
    verify: 'Verificar',
    wallet: 'Billetera',
    explorer: 'Explorador',
    playground: 'Playground',
  },
  playground: 'Playground de contratos: edita, compila y despliega contratos en el navegador; se abre en una pestaña nueva',

  theme: 'Tema',
  themes: { system: 'Sistema', light: 'Claro', dark: 'Oscuro' },
  themeNow: (current: string) => `Tema: ${current}`,
  themeSwitch: (current: string, next: string) => `Tema: ${current}; haz clic para cambiar a ${next}`,

  top: {
    connectWallet: 'Conectar billetera',
    myWallet: 'Mi billetera',
    walletTitle: (account: string) => `Mi billetera · Cuenta ${account}`,
    pending: (n: number) => (n === 1 ? '1 operación pendiente de inclusión' : `${n} operaciones pendientes de inclusión`),
    closeSearch: 'Cerrar búsqueda',
    simTitle: 'Abrir la consola regtest y los ajustes de la fuente',
    simLabel: (chainId: string) => `Red devnet, chain_id ${chainId}, simulador del navegador; abrir la consola regtest`,
    sim: 'Simulador',
    node: 'Nodo',
    nodeTitle: (url: string, state: string) => `Nodo ${url}: ${state}`,
    nodeLabel: (chain: string, state: string) => `Red ${chain}, fuente: nodo, estado: ${state}; abrir los ajustes de la fuente`,
  },

  strip: {
    label: 'Estado de la cadena',
    disconnected: 'Sin conexión con el nodo',
    disconnectedSince: (ago: string) => `Sin conexión con el nodo · Datos de ${ago}`,
    backlogFull: 'Atasco de liquidación al límite; rutas rápidas en pausa',
    fast: 'Ksana',
    settled: 'Liquidado',
    btcTipHint: 'El nodo no da el último bloque de BTC; se estima con los datos conocidos',
    btcTipRead: 'Leído del RPC de Bitcoin cada 30 segundos; entre lecturas, sigue los bloques nuevos del nodo',
    backlog: (waited: number, limit: number) => `Atasco de liquidación ${waited}/${limit}`,
    backlogHint: 'Bloques BTC que llevan esperando los datos del bloque más antiguo para contar como en Bitcoin, lo que ocurre cuando el ancla del siguiente bloque llega al bloque BTC que los contiene',
    settleFee: 'Liquidación',
    settleFeeHint: 'Tasa con la que el nodo paga sus liquidaciones, no la tasa del mercado de BTC',
    fee: 'Tasa',
    feeHint: 'Tasa de comisión estimada de BTC',
    minFee: (rate: string) => `Umbral de inclusión ${rate}`,
    noIndexer: 'Sin indexador',
    indexer: { ok: 'Indexador coincide', mismatch: 'Indexador no coincide', halted: 'Indexador detenido', none: 'Indexador aún sin comparar', unreachable: 'Indexador sin respuesta', stalled: 'Indexador estancado en' },
    mempool: 'Mempool',
    pendingHint: 'Solo operaciones enviadas desde esta página y aún no incluidas',
    sourceNode: (host: string) => `Fuente: nodo ${host}`,
    sourceSim: 'Fuente: simulador del navegador',
  },

  toast: {
    close: 'Cerrar aviso',
    what: (verb: string, amount: string, symbol: string) => `${verb} de ${amount}\u00a0${symbol}`,
    failed: 'La operación falló',
    dropped: 'La operación se descartó de la mempool',
    skipped: 'La operación se omitió en un bloque paralelo',
    received: (amount: string, symbol: string) => `Recibiste ${amount}\u00a0${symbol}`,
    large: 'Alcanza el umbral de importe alto; espera a que sea final en BTC antes de darlo por recibido',
    deepNext: 'Siguiente: final en BTC',
    finalTakenBack: 'Final en BTC retirado',
    finalTakenBackBody: 'El nodo ya no lo da por final en BTC; espera de nuevo a que sea final en BTC',
    from: (name: string) => `De ${name}`,
  },

  update: {
    title: 'Hay una versión nueva de esta página',
    body: 'Vuelve a cargar la página para usarla',
    language: (name: string) => `Vuelve a cargar la página para usarla y pasar a ${name}`,
    reload: 'Volver a cargar',
    missed: (name: string) => `No se pudo cargar ${name}`,
    missedBody: 'El servidor no respondió; revisa la conexión y vuelve a intentarlo',
  },

  /** The node's network started over from another genesis block while the page was open (app/store.ts, `readAnew`) */
  startedOver: {
    title: 'La red volvió a empezar desde otro bloque génesis',
    body: 'La página volvió a leer la cadena del nodo: los bloques, las operaciones y los saldos de antes no están en ella',
  },

  testnet: 'La red de pruebas puede volver a empezar desde otro bloque génesis en cualquier momento, sin sus saldos ni sus contratos',

  console: {
    sim: 'Consola regtest',
    rpc: 'Fuente de datos y nodo',
    loaded: (n: number) =>
      n === 1
        ? 'Se cargó el último bloque de cadena; los anteriores se consultan al abrirlos'
        : `Se cargaron los últimos ${n} bloques de cadena; los anteriores se consultan al abrirlos`,
    disconnect: 'Desconectar billetera',
    disconnectDemo: 'Desconectar billetera demo',
    events: 'Eventos recientes',
    needWallet: 'Conecta la billetera para usar el escenario de censura',
  },

  scenario: {
    mine: {
      title: (seconds: number) => `Bloques de Bitcoin · Uno cada ${seconds} s en promedio`,
      hint: 'Minar varios seguidos puede activar brevemente el límite de atasco',
      button: (n: number) => (n === 1 ? 'Minar 1 bloque' : `Minar ${n} bloques`),
    },
    fee: {
      title: 'Tasas de BTC disparadas',
      hint: 'Las liquidaciones se atascan en la mempool de BTC; con el atasco al límite, las rutas rápidas se pausan',
      toggle: 'Tasas disparadas',
      cpfp: 'CPFP con ancla P2A',
      cpfpCount: (n: number) => `CPFP con ancla P2A (${n})`,
      cpfpDone: (n: number) =>
        n === 1
          ? '1 transacción acelerada; se confirma en el siguiente bloque BTC'
          : `${n} transacciones aceleradas; se confirman en el siguiente bloque BTC`,
      backlog: (waited: number, limit: number) => `Atasco ${waited} / ${limit} ${limit === 1 ? 'bloque BTC' : 'bloques BTC'}`,
      paused: 'Rutas rápidas en pausa',
    },
    censor: {
      title: 'Los productores censuran mi cuenta',
      hint: 'Los productores dejan de incluir tus operaciones de ruta rápida',
      toggle: 'Censurar mi cuenta',
    },
    offline: {
      title: 'Productor fuera de línea',
      hint: (name: string) => `${name} deja de producir bloques; otros nodos difunden sus liquidaciones`,
      toggle: (name: string) => `${name} fuera de línea`,
    },
  },

  footer: {
    tagline: 'Ksana confirma en un instante y Bitcoin lo guarda para siempre.',
    fromSim: 'Datos del simulador del navegador; al recargar se genera una cadena nueva',
    fromNode: (url: string) => `Datos del nodo ${url}`,
    build: 'Compilación',
    buildHint: 'Commit de git del que se compiló esta página; véase README.md, “verificar esta página”',
  },

  connecting: {
    eyebrow: 'Conectando',
    title: 'Conectando con el nodo…',
    failedEyebrow: 'Error de conexión',
    failedTitle: 'No se pudo conectar con el nodo',
    wrongNetworkTitle: 'El nodo está en otra red',
    detail: (message: string) => `Detalles del error: ${message}`,
    retrying: 'La página lo vuelve a intentar cada 2.5 segundos y se abre en cuanto el nodo responda.',
    settings: 'Ajustes de la fuente',
    useSim: 'Usar el simulador del navegador',
    switchTo: (chain: string) => `Cambiar a ${chain}`,
  },
  linkSource: {
    eyebrow: 'Fuente de datos',
    title: '¿Leer del nodo que indica este enlace?',
    body: 'Este enlace pide a la página que lea de las direcciones de abajo en lugar del nodo que usa normalmente. Todo lo que la página muestre después (saldos, operaciones, cuánto están confirmadas) vendría de ellas, y lo que firme tu billetera se les enviaría. Hazlo solo si las administras tú o confías en quien lo hace.',
    node: 'Nodo',
    indexer: 'Indexador',
    btc: 'RPC de Bitcoin',
    network: 'Red',
    note: 'No se guarda nada en ningún caso: la respuesta vale para esta pestaña.',
    keep: 'Seguir con el nodo habitual',
    follow: 'Leer de este nodo',
  },
  /** A node an earlier version of the page saved, perhaps from a link (store.ts, `savedSource`): asked about once */
  savedSource: {
    eyebrow: 'Fuente de datos',
    title: '¿Seguir leyendo del nodo guardado antes?',
    body: 'Una versión anterior de esta página guardó las direcciones de abajo como fuente de datos. Las versiones anteriores guardaban el nodo que indicaba un enlace igual que una elección hecha en el panel de fuente de datos, así que pueden venir de un enlace que abriste. Todo lo que la página muestre (saldos, operaciones, cuánto están confirmadas) vendría de ellas, y lo que firme tu billetera se les enviaría. Consérvalas solo si las elegiste tú.',
    node: 'Nodo',
    indexer: 'Indexador',
    btc: 'RPC de Bitcoin',
    network: 'Red',
    note: 'Se pregunta una sola vez; el panel de fuente de datos puede cambiarlo cuando quieras.',
    keep: 'Usar el nodo de esta página',
    follow: 'Seguir leyendo de él',
  },
};

export default shell;
