import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Devnet } from '../chain/sim/engine';
import type { BtcTx } from '../chain/types';

const view = vi.hoisted(() => ({ chain: undefined as unknown }));
vi.mock('../app/store', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/store')>()), useChain: () => view.chain }));
const { TxDiagram } = await import('./TxDetail');

/** The diagram's headings and boxes in the page's order: which side each is on, the row a wide screen gives it, and its first words */
function diagram(tx: BtcTx): string[] {
  const html = renderToStaticMarkup(createElement(TxDiagram, { tx }));
  const parts = html.split(/(?=<div class="txd-(?:head|box) )/).slice(1);
  return parts.map((part) => {
    const [, side, row] = /^<div class="[^"]*\btxd-(in|out)" style="--row:(\d+)"/.exec(part) ?? [];
    const words = part.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
    return `${side} ${row} ${words}`;
  });
}

describe('A transaction’s structure', () => {
  const s = new Devnet({ seed: 33, now: Date.UTC(2026, 9, 1, 8, 0, 0), historyMs: 12 * 60_000, trafficPerSec: 0 });
  view.chain = s;
  const reveal = [...s.allBtcTxs()].find((x) => x.kind === 'settlement' && x.commitTxid);
  const commit = reveal?.commitTxid ? s.getBtcTx(reveal.commitTxid) : undefined;

  it('gives the inputs under their heading, then the outputs under theirs, each box in its index’s row on a wide screen', () => {
    // On a phone, in this order, two boxes marked #0 had stood one above the other, only their roles telling the input from the output
    if (!commit) throw new Error('no commit transaction');
    expect(diagram(commit)).toEqual([
      'in 1 Inputs · 1',
      'in 2 #0 Producer funding',
      'out 1 Outputs · 2',
      'out 2 #0 Producer change',
      'out 3 #1 Commitment output',
    ]);
  });

  it('gives a reveal transaction’s envelope after its inputs, in the row below the longer side on a wide screen', () => {
    if (!reveal) throw new Error('no reveal transaction');
    expect(diagram(reveal)).toEqual([
      'in 1 Inputs · 1',
      'in 2 #0 From the',
      'in 4 Witness envelope KSN1',
      'out 1 Outputs · 2',
      'out 2 #0 P2A anchor',
      'out 3 #1 OP_RETURN Empty',
    ]);
  });

  it('takes one column on a phone, in the page’s order', () => {
    const css = readFileSync(new URL('../styles/pages.css', import.meta.url), 'utf8');
    const phone = css.split('\n@media (max-width: 720px) {\n  .txd {\n')[1]?.split('\n}\n')[0];
    expect(phone).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(phone).toContain('.txd-in,\n  .txd-out {\n    grid-row: auto;\n    grid-column: auto;\n  }');
  });
});
