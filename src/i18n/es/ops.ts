import type { Messages } from '..';

const ops: Messages['ops'] = {
  title: 'Operaciones',
  tabs: {
    label: 'Vista de operaciones',
    latest: 'Recientes',
    mempool: 'Mempool',
    pendingLocal: 'Pendientes (esta página)',
  },

  filter: {
    label: 'Filtrar por ruta',
    all: 'Todas las rutas',
    path: (path: string, label: string) => `${path} ${label}`,
    failedOnly: 'Solo fallidas',
    none: 'Ninguna operación coincide',
  },

  mempool: {
    localOnly: 'Solo se muestran operaciones enviadas desde esta página y aún no incluidas.',
    minFees: (list: string) => `Comisión de patrocinio mínima por productor: ${list}`,
    waited: 'Espera',
    note: 'Nota',
    emptyLocal: 'No hay operaciones pendientes de esta página',
    empty: 'La mempool está vacía',
    total: (n: number) => `Total: ${n}`,
    why: {
      nativeConfirmed: 'Confirmada en BTC; inclusión forzada en el siguiente bloque',
      nativeWaiting: 'Esperando confirmación en BTC',
      nativeConfs: (n: number, need: number) => `${n}\u00a0de\u00a0${need} ${need === 1 ? 'confirmación' : 'confirmaciones'} en BTC; inclusión forzada al tener ${need}`,
      backlog: 'Atasco de liquidación al límite; rutas rápidas en pausa',
      censored: 'Los productores no incluyen esta cuenta; se puede usar la ruta C',
      lowFee: (producers: string) => `Por debajo del mínimo de ${producers}; solo algunos productores la incluirán`,
      nonce: (nonce: string) => `Esperando que se incluya el nonce ${nonce}`,
      gone: 'Ya no está en espera',
    },
  },
};

export default ops;
