import type { ReactNode } from 'react';
import type { Messages } from '..';

const contract: Messages['contract'] = {
  deployed: (by: ReactNode, at: ReactNode) => (
    <>
      Desplegado por {by} en {at}
    </>
  ),
  seeking: 'Buscando su despliegue…',
  rpcNote: 'El nodo no da los metadatos del contrato; para llamadas de solo lectura usa ksana-cli o el SDK.',
  playground: 'Abrir en el playground',
  playgroundHint: 'El contrato de un ejemplo se abre allí en su propia página; cualquier otro recibe formularios del ABI de su código',
  /** Node data source: the calls and asset transfers to the contract, from the node's listing (D-111) */
  history: 'Llamadas y transferencias recibidas',
  noHistory: 'Sin llamadas ni transferencias recibidas',

  idHint: 'sha256(desplegador ‖ nonce ‖ code_hash)',
  code: 'Código',
  codeBytes: (n: string) => (n === '1' ? '1 byte' : `${n} bytes`),
  deployOp: 'Operación de despliegue',
  methods: 'Métodos',
  issued: 'Activos emitidos',
  supply: 'Suministro total',
  holdings: 'Saldos del contrato',

  read: {
    title: 'Llamada de solo lectura',
    eyebrow: 'Fuera de la cadena, sin comisión',
    method: 'Método',
    arg: 'Argumento',
    call: 'Llamar',
    ok: 'Resultado',
    error: 'Error',
  },
  argHint: {
    balance_of: 'account: dirección o 64 dígitos hexadecimales',
    claimed: 'account: dirección o 64 dígitos hexadecimales',
    quote: 'amount_in: cantidad de KSA',
    get_lock: 'lock: número de bloqueo',
    lock_of_script: 'script: script de pago en hexadecimal',
    balance: 'seller: dirección o 64 dígitos hexadecimales',
    lock_count: 'seller: dirección o 64 dígitos hexadecimales',
    locks_of: 'seller: dirección o 64 dígitos hexadecimales',
  },
  result: {
    notIssued: 'El activo aún no se emitió',
    needAccount: 'account debe ser una dirección Taproot o 64 dígitos hexadecimales',
    needAmount: (decimals: number) => `amount_in debe ser una cantidad positiva de KSA, con ${decimals} decimales como máximo`,
    needLock: 'lock debe ser un número de bloqueo, un entero desde 0',
    noLock: 'No hay ningún bloqueo con este número: el contrato rechaza la llamada',
    needScript: 'script debe ser el script de pago en hexadecimal',
    needSeller: 'seller debe ser una dirección Taproot o 64 dígitos hexadecimales',
    notSimulated: 'El simulador no responde a este método; en un nodo responde el contrato',
    quote: (ksaIn: string, tknOut: string) => `${ksaIn}\u00a0KSA → ${tknOut}\u00a0TKN (incluye 0.3% de comisión)`,
  },

  recent: 'Llamadas recientes',
  noCalls: 'No se encontraron llamadas',
};

export default contract;
