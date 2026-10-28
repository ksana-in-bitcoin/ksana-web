import type { Messages } from '..';

const search: Messages['search'] = {
  results: (q: string) => `Resultados de “${q}”`,
  none: (q: string) => `Sin resultados para “${q}”`,
  count: (n: number) => (n === 1 ? '1 resultado' : `${n} resultados`),
  howTo: 'Puedes buscar:',

  // The bold category is directly followed by the description, so it ends with a space
  tipSep: ': ',
  tips: {
    height: { label: 'Bloque Ksana', text: 'altura, como 128 o #128; incluye los bloques paralelos de esa altura' },
    hash: { label: 'Hash de bloque, op_id, txid de BTC', text: '64 dígitos hexadecimales; con los 4 primeros ya hay sugerencias' },
    /** prefix is the network's Taproot address prefix, such as tb1p */
    account: { label: 'Cuenta', text: (prefix: string) => `dirección Taproot (${prefix}…) o 64 dígitos hexadecimales` },
    name: { label: 'Nombre', text: 'productor (devnet-1), contrato (AMM), faucet' },
  },

  miss: {
    aboveTip: (tip: string) => `Por lo que sabe esta página, aún no hay ningún bloque Ksana a esta altura: el último de la cadena es el #${tip}.`,
    aboveTips: (tip: string, btcTip: string) => `Por lo que sabe esta página, aún no hay ningún bloque a esta altura en ninguna de las dos cadenas: el último de Ksana es el #${tip}, y el de Bitcoin, el #${btcTip}.`,
    notTaproot: (prefix: string) =>
      `Es una dirección de Bitcoin, pero no Taproot, así que no es una cuenta de Ksana: una cuenta es una dirección Taproot, que empieza por ${prefix}. Para usar aquí una billetera, cambia a una cuenta Taproot en tu billetera.`,
    noKey: 'Esta dirección Taproot no puede ser una cuenta de Ksana: no hay ninguna clave detrás de ella, así que nadie puede firmar por ella.',
    otherNetwork: (nets: string, net: string, prefix: string) =>
      `Es una dirección de Bitcoin ${nets}, pero la red de esta página funciona sobre BTC ${net}: sus cuentas son direcciones Taproot que empiezan por ${prefix}.`,
    viewAddress: (site: string) => `Ver la dirección en ${site}`,
    or: (a: string, b: string) => `${a} o ${b}`,
    comma: ', ',
  },

  notFound: {
    eyebrow: 'Sin resultados',
    title: (what: string) => `No se encontró: ${what}`,
    page: 'página',
    badPath: 'Puede que la URL esté mal escrita o que la página se haya movido.',
    badOpId: 'Un ID de operación (op_id) tiene 64 dígitos hexadecimales; este no.',
    badAccount: (prefix: string) => `Una cuenta es una dirección Taproot, que empieza por ${prefix}, o 64 dígitos hexadecimales; esto no es ninguna de las dos.`,
    ahead: (tip: string) => `Esta altura está por encima del último bloque de la cadena, el #${tip}: el bloque aún no se ha producido.`,
    sim: 'Al recargar se genera una cadena simulada nueva y los hashes de los enlaces antiguos dejan de valer.',
    home: 'Ir al resumen',
  },
};

export default search;
