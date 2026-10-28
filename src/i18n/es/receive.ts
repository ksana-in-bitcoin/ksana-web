import type { Messages } from '..';

const receive: Messages['receive'] = {
  title: 'Recibir',
  one: 'Esta única dirección recibe KSA, activos de contratos y BTC.',
  card: 'Datos para recibir',
  qr: 'Código QR de la dirección',
  address: (net: string) => `Dirección · Taproot · ${net}`,
  hex: 'Cuenta (hexadecimal) · para argumentos de contratos',
  // Directly followed by the first and last 8 characters, so it ends with a space
  checkEdges: 'Revisa los 8 primeros y 8 últimos: ',
  copyAddress: 'Copiar dirección',
  copyHex: 'Copiar cuenta hexadecimal',
  btcUse: 'El BTC recibido también paga la comisión de minería de la ruta C.',

  rules: {
    title: 'Cuándo se considera recibido',
    below: (amount: string) => `Menos de ${amount}\u00a0KSA: basta la confirmación rápida`,
    above: 'Desde el umbral: espera a que sea final en BTC',
    aboveEta: (net: string, eta: string) => `${net}: ${eta}; red principal: ~110 min`,
    edit: 'Cambiar umbral',
  },
  faucet: 'Pedir al faucet de devnet',
  faucetHosted: (net: string) => `Pedir KSA de prueba al faucet de ${net}`,
  faucetFailed: 'El faucet no envió KSA',
  faucetWhy: {
    claimed: (wait: string) => `Esta cuenta ya recibió sus KSA de prueba; puede pedir de nuevo dentro de ${wait}`,
    tooOften: (wait: string) => `Demasiadas solicitudes desde esta conexión; vuelve a intentarlo dentro de ${wait}`,
    busy: (wait: string) => `El faucet está ocupado; vuelve a intentarlo dentro de ${wait}`,
    today: 'Esta conexión ya pidió KSA de prueba demasiadas veces hoy; vuelve a intentarlo más tarde',
    empty: 'Al faucet se le acabaron los KSA de prueba; vuelve a intentarlo más tarde',
    down: 'El faucet no funciona en este momento; vuelve a intentarlo más tarde',
    noAnswer: 'El faucet no respondió; revisa la conexión y vuelve a intentarlo',
  },
  back: 'Volver a la billetera',

  recent: {
    title: 'Recibido recientemente',
    empty: 'Aún no has recibido transferencias',
    emptyFaucet: 'Comparte tu dirección o pide al faucet.',
    emptyShare: 'Comparte tu dirección con quien te envía.',
    from: (who: string) => `De ${who}`,
    big: 'Importe alto · Esperando final en BTC',
    final: 'Puedes darlo por recibido',
    belowThreshold: 'Según tu umbral, ya puedes darlo por recibido',
  },
};

export default receive;
