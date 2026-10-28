import type { Messages } from '..';

/** Block list (pages/Blocks.tsx) */
const blocks: Messages['blocks'] = {
  eyebrow: 'Ksana',
  title: 'Blocks',

  /** Header stats; h is a formatted height, d a formatted duration */
  tip: (h: string) => `Tip #${h}`,
  avgInterval: (d: string, n: number) => `Avg block time ${d} (last ${n} ${n === 1 ? 'block' : 'blocks'})`,
  empty: (n: number) => `${n.toLocaleString('en-US')} empty`,
  emptyOfLoaded: (n: number, loaded: number) => `${n.toLocaleString('en-US')} empty (of ${loaded.toLocaleString('en-US')} loaded)`,
  /** pct is a formatted percentage (e.g. "2.1") */
  side: (n: number, pct: string) => `${n.toLocaleString('en-US')} parallel (${pct}%)`,
  /** The node data source: the parallel blocks the loaded blocks merged, which is all the page knows of */
  sideOfLoaded: (n: number, loaded: number) => `${n.toLocaleString('en-US')} parallel (merged by the ${loaded.toLocaleString('en-US')} loaded)`,
  sideHint: 'Parallel blocks at the same height are merged by the next chain block, not discarded.',

  jump: 'Go to height',
  view: 'Block view',
  main: 'Main chain',
  sideTab: 'Parallel blocks',
  hideEmpty: 'Hide empty blocks',
  fetching: (n: number) => `Fetching ${n.toLocaleString('en-US')} older ${n === 1 ? 'block' : 'blocks'} from the node…`,
  noSide: 'No parallel blocks yet',
  noBlocks: 'No blocks',

  pagination: 'Pagination',
  newer: 'Newer',
  older: 'Older',
  page: (p: number, total: number) => `Page ${p}\u00a0of\u00a0${total}`,
};

export default blocks;
