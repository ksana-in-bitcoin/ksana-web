import type { Messages } from '..';

const blocks: Messages['blocks'] = {
  eyebrow: 'Ksana',
  title: 'Bloques',

  tip: (h: string) => `Último bloque #${h}`,
  avgInterval: (d: string, n: number) => `Intervalo medio ${d} (${n === 1 ? 'último bloque' : `últimos ${n} bloques`})`,
  empty: (n: number) => (n === 1 ? '1 vacío' : `${n.toLocaleString('en-US')} vacíos`),
  emptyOfLoaded: (n: number, loaded: number) =>
    `${n === 1 ? '1 vacío' : `${n.toLocaleString('en-US')} vacíos`} (de ${loaded.toLocaleString('en-US')} ${loaded === 1 ? 'cargado' : 'cargados'})`,
  side: (n: number, pct: string) => `${n === 1 ? '1 paralelo' : `${n.toLocaleString('en-US')} paralelos`} (${pct}%)`,
  sideOfLoaded: (n: number, loaded: number) =>
    `${n === 1 ? '1 paralelo' : `${n.toLocaleString('en-US')} paralelos`} (${n === 1 ? 'fusionado' : 'fusionados'} en ${loaded === 1 ? 'el 1 cargado' : `los ${loaded.toLocaleString('en-US')} cargados`})`,
  sideHint: 'Los bloques paralelos de una misma altura se fusionan en el siguiente bloque de cadena; no se descartan.',

  jump: 'Ir a altura',
  view: 'Vista de bloques',
  main: 'Cadena',
  sideTab: 'Bloques paralelos',
  hideEmpty: 'Ocultar vacíos',
  fetching: (n: number) =>
    n === 1 ? 'Pidiendo al nodo 1 bloque anterior…' : `Pidiendo al nodo ${n.toLocaleString('en-US')} bloques anteriores…`,
  noSide: 'Aún no hay bloques paralelos',
  noBlocks: 'Sin bloques',

  pagination: 'Paginación',
  newer: 'Más nuevos',
  older: 'Más antiguos',
  page: (p: number, total: number) => `Página ${p}\u00a0de\u00a0${total}`,
};

export default blocks;
