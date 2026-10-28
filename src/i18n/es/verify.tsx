import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Counts with thousands separators (same as fmtInt in lib/format; digits are written the same in every language) */
const int = (n: number) => n.toLocaleString('en-US');

const verify: Messages['verify'] = {
  eyebrow: 'Sin confiar en ningún nodo',
  title: 'Verificar',
  lead: 'El indexador solo lee datos de Bitcoin y vuelve a ejecutar cada bloque; lo acepta solo si el estado resultante es el state_root de su cabecera, y esta página comprueba que aceptó los bloques del nodo.',
  bitcoin: 'Bitcoin',

  flow: {
    label: 'Flujo de verificación',
    node: 'Nodo Ksana',
    settled: (height: ReactNode) => <>Ksana liquidado hasta el bloque {height}</>,
    readOnly: 'Solo lee BTC',
    indexer: 'Indexador independiente',
    noIndexer: 'Sin conexión: indica la URL del indexador en los ajustes de la fuente',
    halted: (reason: string) => `Indexador detenido: ${reason}`,
    ok: 'Todo coincide',
    okCompared: (n: number) => (n === 1 ? '1 comprobación en esta página; coincide' : `${int(n)} comprobaciones en esta página; todo coincide`),
    /** No check made yet */
    none: 'Aún sin comprobar',
    /** The indexer did not answer the last time the page asked */
    unreachable: 'No responde: no hay comprobación hasta que responda; la página vuelve a preguntar en cada actualización',
    /** The recent checks match; an older one did not, as the line under it says */
    okRecent: 'Las comprobaciones recientes coinciden',
    /** Checks that did not match, older than the recent ones the page keeps: failed of the n checks this page made, the latest at height */
    earlier: (failed: number, n: number, height: ReactNode) => {
      const of = `${int(failed)} de ${n === 1 ? 'la comprobación' : `las ${int(n)} comprobaciones`} de esta página`;
      return failed === 1 ? <>Antes, {of} no coincidió, en {height}</> : <>Antes, {of} no coincidieron, la última en {height}</>;
    },
    forked: 'Cadena distinta: el indexador aceptó otro bloque a esta altura; el del nodo podría ser inválido o estar en una rama sin liquidar',
    stalled: (height: ReactNode) => <>Aún no ejecuta {height}, aunque podría</>,
    mismatch: 'Hay discrepancias: Ksana podría tener bloques inválidos',
  },
  lag: (n: number, unwritten: number, depth: number) => {
    if (unwritten >= n) {
      return n === 1
        ? 'El indexador va 1 bloque por detrás del último bloque; ese bloque aún espera entrar en Bitcoin.'
        : `El indexador va ${int(n)} bloques por detrás del último bloque; esos bloques aún esperan entrar en Bitcoin.`;
    }
    const behind = `El indexador va ${int(n)} ${n === 1 ? 'bloque' : 'bloques'} por detrás del último bloque`;
    const next = depth === 1 ? 'el siguiente también ha entrado' : `los ${int(depth)} siguientes también han entrado`;
    if (unwritten === 0) return `${behind}: ejecuta cada bloque cuando ${next} en Bitcoin.`;
    const newest = unwritten === 1 ? 'el más reciente aún espera' : `los ${int(unwritten)} más recientes aún esperan`;
    return `${behind}: ${newest} entrar en Bitcoin, y ejecuta cada bloque cuando ${next}.`;
  },
  stall: (height: ReactNode, btc: ReactNode, depth: number) => (
    <>
      El indexador aún no ejecuta {height}, aunque los datos del bloque y las cabeceras de {depth === 1 ? 'el bloque siguiente' : `los ${int(depth)} siguientes`} están en Bitcoin desde {btc}: puede estar
      poniéndose al día o detenido por un fallo local, o haber juzgado inválido el bloque. Hasta que lo ejecute, solo el nodo respalda los bloques desde ahí.
    </>
  ),

  checks: {
    title: 'Comprobaciones recientes',
    caption: 'Comprobación de state_root',
    noIndexer: 'No hay indexador conectado',
    none: 'Aún no hay comprobaciones',
    nodeRoot: 'state_root del nodo',
    indexerRoot: 'state_root recalculado por el indexador',
    match: 'Coincide',
    forked: 'Cadena distinta',
    mismatch: 'No coincide',
    nodeBlock: (hash: string) => `Bloque de cadena del nodo a esta altura: ${hash}`,
    at: 'Comprobado',
  },

  confirm: {
    title: 'Dos confirmaciones',
    when: 'Condición',
    time: 'Tiempo típico',
    security: 'Seguridad basada en',
    fit: 'Ideal para',
    fastWhen: 'Inclusión en un bloque Ksana',
    fastSecurity: 'Hashrate PoW de Ksana',
    fastFit: 'Operaciones diarias de bajo importe',
    finalWhen: (confs: number) =>
      confs === 1
        ? 'Los datos tienen 1 confirmación de Bitcoin, y también el bloque BTC que lo decidió'
        : `Los datos tienen ${confs} confirmaciones de Bitcoin, y también el bloque BTC que lo decidió`,
    finalTime: (mainnet: string, network: string, now?: string) =>
      now === undefined ? (
        `Red principal: ${mainnet}`
      ) : (
        <>
          <span className="phrase">Red principal: {mainnet};</span> <span className="phrase">{network} ahora: {now}</span>
        </>
      ),
    finalFit: 'Importes altos y resultados que necesitan la garantía de Bitcoin',
    risk: 'Un ataque con la mayoría del hashrate de Ksana solo puede revertir bloques que aún no son finales en BTC.',
  },

  params: {
    title: 'Parámetros del protocolo',
    eyebrow: (chain: string) => `Parámetros de ${chain}`,
    name: 'Parámetro',
    value: 'Valor',
    note: 'Descripción',
    count: (n: number) => `${n} parámetros`,
  },

  self: {
    title: 'Verifícalo tú mismo',
    how: (indexer: ReactNode, txindex: ReactNode) => (
      <>
        Ejecuta {indexer} conectado a un bitcoind con {txindex} activado.
      </>
    ),
    btcTip: 'Último bloque',
    indexerAt: 'El indexador va por',
    console: 'Abrir la consola regtest y simular problemas',
    settings: 'Ajustes de fuente e indexador',
  },
};

export default verify;
