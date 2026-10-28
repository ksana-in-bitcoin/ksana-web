import type { Messages } from '..';

const account: Messages['account'] = {
  mine: 'Mi cuenta',
  producerFee: (fee: string) => `Productor · Patrocinio desde ${fee}\u00a0KSA`,
  censored: 'Los productores no incluyen sus operaciones de ruta rápida (escenario de demostración)',
  sendTo: 'Enviar a esta cuenta',

  address: 'Dirección',
  copyAddress: 'Copiar dirección',
  hex: 'Cuenta (hexadecimal)',
  copyHex: 'Copiar cuenta hexadecimal',
  addrNote: 'La dirección y el hexadecimal son dos formas de la misma cuenta; los contratos solo tienen hexadecimal.',

  noAssets: 'Sin activos',
  balanceCaption: 'Saldos de activos',
  available: 'Disponible',
  lockedFees: 'Recompensas y comisiones por desbloquear',
  lockedFeesHint: 'Se desbloquean cuando su bloque llega a Bitcoin',
  unlockedTotal: 'Desbloqueado (total)',

  nonceHint: 'El nonce que debe usar su próxima operación',
  sent: 'Operaciones enviadas',
  policy: 'Política local',
  policyValue: (fee: string) => `Ruta B: patrocinio mín. ${fee}\u00a0KSA`,

  history: 'Historial',
  direction: 'Sentido',
  out: 'Enviado',
  noRecords: 'Sin registros',

  locked: {
    title: 'Bloqueo y desbloqueo de recompensas y comisiones',
    caption: 'Recompensas de bloque y comisiones bloqueadas',
    fee: 'Recompensa y comisiones',
    unlocked: 'Desbloqueado',
    settled: 'Liquidado; esperando la entrada de desbloqueo',
    waiting: 'Bloqueado hasta que el bloque llegue a Bitcoin',
    carriedFor: (producer: string) => `Llevado para ${producer}`,
  },
};

export default account;
