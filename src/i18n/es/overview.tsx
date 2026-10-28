import type { ReactNode } from 'react';
import type { Messages } from '..';

const overview: Messages['overview'] = {
  eyebrow: 'Dos carriles · Ksana y Bitcoin',
  title: 'Confirmado al instante. Final en Bitcoin.',
  latestBlocks: 'Últimos bloques',
  allBlocks: 'Ver todos',
  latestOps: 'Últimas operaciones',
  allOps: 'Ver todas',
  /** The latest ops column when the recent blocks hold none */
  noRecentOps: 'No hay operaciones en los bloques recientes',

  vitals: 'Indicadores de red',
  blockGap: (n: number) => (n ? `Intervalo · ${n === 1 ? 'último bloque' : `últimos ${n} bloques`}` : 'Intervalo'),
  target: (s: string) => `Objetivo ${s}`,
  /** In place of the target when most recent blocks are empty: s is the target time, formatted */
  idleTarget: (s: string) => `En reposo; ~${s} cuando hay operaciones`,
  mempool: 'Mempool',
  pendingLocal: 'Pendientes · Desde esta página',
  pendingLocalHint: 'Solo operaciones enviadas desde esta página y aún no incluidas',
  opsUnit: (n: number) => (n === 1 ? 'op.' : 'ops.'),
  fee: 'Comisión sugerida',
  feePathB: 'Comisión de patrocinio sugerida (ruta B)',
  feePathC: 'Comisión de minería (ruta C)',
  feeBasis: (gas: string, rate: string) => `Una transferencia, max_gas\u00a0${gas} · Tasa BTC ${rate}\u00a0sat/vB`,
  backlog: 'Atasco de liquidación',
  backlogOf: (limit: number) => `/ ${limit} ${limit === 1 ? 'bloque BTC' : 'bloques BTC'}`,
  backlogTicks: (n: number, limit: number) => `Atasco ${n} / ${limit}`,
  backlogFull: 'Al límite: rutas rápidas en pausa',
  backlogOldest: (block: string) => `Datos más antiguos sin liquidar: ${block}`,
  backlogLanded: (block: string, confs: number) => `Datos más antiguos: ${block} · en Bitcoin; salen del atasco con ${confs === 1 ? '1 confirmación' : `${confs} confirmaciones`}`,
  backlogNone: 'Sin atasco',
  settleRate: 'Tasa de liquidación',
  settleRateMeter: (rate: string) => `Tasa de liquidación ${rate}\u00a0sat/vB`,
  consensusMin: (rate: string) => `Mínimo de consenso ${rate}\u00a0sat/vB`,
  btcRate: 'Tasa de comisión BTC',
  btcRateMeter: (rate: string) => `Tasa ${rate}\u00a0sat/vB`,
  feeSpike: (floor: string, rate: string) => `Umbral de inclusión ${floor}\u00a0sat/vB: las liquidaciones a ${rate}\u00a0sat/vB se atascan`,
  feeFloor: (floor: string, min: string) => `Umbral de inclusión ${floor}\u00a0sat/vB · Liquidación mín. ${min}\u00a0sat/vB`,

  rail: {
    range: 'Rango de tiempo',
    fast: 'Ksana',
    btc: 'Bitcoin',
    lanes: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">Arriba, {fast}</span>: un bloque cada ~{secs} s; <span className="nobr">abajo, {btc}</span>
      </>
    ),
    /** The same while the fast lane is idle (most recent blocks empty) */
    lanesIdle: (fast: ReactNode, btc: ReactNode, secs: number) => (
      <>
        <span className="nobr">Arriba, {fast}</span>: un bloque cada ~{secs} s cuando hay operaciones, más lento en reposo; <span className="nobr">abajo, {btc}</span>
      </>
    ),
    /** Below the chart while the fast lane is idle: secs is the target time, mins the slowest empty block's expected time */
    idle: (secs: number, mins: number) =>
      `En reposo: sin operaciones, Ksana produce sobre todo bloques vacíos, cada uno más lento que el anterior, hasta uno cada ~${mins}\u00a0min. Cada vez que una liquidación llega a Bitcoin, un bloque abona después las recompensas de los bloques que liquidó y la ralentización vuelve a empezar; una operación obtiene un bloque en ~${secs}\u00a0s.`,
    aria: (fast: string, settled: string, final: string, btc: string) =>
      `Gráfico de dos carriles: Ksana #${fast}, liquidado #${settled}, final en BTC #${final}, BTC #${btc}`,
    now: 'Ahora',
    entries: (n: number) => (n === 1 ? '1 entrada' : `${n} entradas`),
    entriesForced: (n: number) => `${n === 1 ? '1 entrada' : `${n} entradas`}, con inclusión forzada`,
    skipped: (n: number) => (n === 1 ? '1 entrada omitida' : `${n} entradas omitidas`),
    ksanaTxs: (n: number) => (n === 1 ? '1 transacción de Ksana' : `${n} transacciones de Ksana`),
    noKsanaTxs: 'Sin transacciones de Ksana',
    confs: (n: number) => (n === 1 ? '1 confirmación' : `${n.toLocaleString('en-US')} confirmaciones`),
    settled: (h: string) => `Liquidado #${h}`,
    final: (h: string) => `Final #${h}`,
    settledFinal: (h: string) => `Liquidado · Final #${h}`,
    legend: 'Leyenda',
    barHeight: 'Altura de barra = entradas',
  },
};

export default overview;
