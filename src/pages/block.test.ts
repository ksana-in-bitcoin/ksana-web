import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TokenBook } from '../chain/rpc/tokens';
import { Devnet } from '../chain/sim/engine';
import { headerCarrier, ownHeaderCarrier } from '../chain/views';

const view = vi.hoisted(() => ({ chain: undefined as unknown }));
vi.mock('../app/store', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/store')>()), useChain: () => view.chain }));
const { BlockDetail } = await import('./BlockDetail');
const { OpDetail } = await import('./OpDetail');

/** The simulator's chain as a node's, whose lookups named in `reading` still read */
function asNode(s: Devnet, reading: ReadonlySet<string>) {
  // A node's chain reads the standards' events by the declarations of the index (D-120); the pages ask it while they draw
  const tokenBook = new TokenBook({
    node: () => {
      throw new Error('no node');
    },
    now: () => 0,
    changed: () => undefined,
  });
  return new Proxy(s, {
    get(target, key) {
      if (key === 'kind') return 'rpc';
      if (key === 'tokenBook') return tokenBook;
      if (key === 'lookup') return (kind: string, id: string) => (reading.has(`${kind}:${id}`) ? { state: 'loading' } : undefined);
      if (key === 'request') return () => undefined;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

describe('A block or an operation page opened from a link', () => {
  const s = new Devnet({ seed: 33, now: Date.UTC(2026, 9, 1, 8, 0, 0), historyMs: 12 * 60_000, trafficPerSec: 0 });
  const block = s.blocks.find((b) => b.entries.some((e) => 'opId' in e.entry));
  const entry = block?.entries.find((e) => 'opId' in e.entry)?.entry;
  const op = entry && 'opId' in entry ? entry.opId : undefined;

  it('stays at "looking up" while its lookup reads, though what it asked for is in the cache, as an account page does', () => {
    // It drew as soon as the block or the operation was in: anything that drew the page meanwhile showed it without what its lookup
    // still read, a block without its merged blocks, an operation without the names of the assets it moves
    if (!block || !op) throw new Error('no block with an operation');
    const height = String(block.header.height);
    const pages = () => [createElement(BlockDetail, { id: height }), createElement(OpDetail, { id: op })].map((page) => renderToStaticMarkup(page));
    view.chain = asNode(s, new Set([`block:${height}`, `op:${op}`]));
    for (const html of pages()) expect(html).toMatch(/^<div class="page narrow-page page--lookup" aria-busy="true">/);
    // Once it has ended, the page itself
    view.chain = asNode(s, new Set());
    for (const html of pages()) expect(html).not.toContain('page--lookup');
  });
});

describe('A block page', () => {
  it('gives the BTC block of the settlement that carried an empty block\'s header with its confirmations, as it does every settlement it names', () => {
    const s = new Devnet({ seed: 33, now: Date.UTC(2026, 9, 1, 8, 0, 0), historyMs: 12 * 60_000, trafficPerSec: 0 });
    view.chain = s;
    // An empty block that sends no settlement of its own: a later block's settlement carried its header, and is on Bitcoin
    const empty = s.blocks.find((b) => {
      if (b.header.height === 0 || b.needsSettlement) return false;
      const carrier = headerCarrier(s, b);
      return carrier?.confirmedHeight !== undefined && !ownHeaderCarrier(b, carrier);
    });
    const at = empty && headerCarrier(s, empty)?.confirmedHeight;
    if (!empty || at === undefined) throw new Error('no empty block whose header a later settlement carried');
    const n = s.btcConfs(at);
    expect(n).toBeGreaterThan(0);
    const html = renderToStaticMarkup(createElement(BlockDetail, { id: String(empty.header.height) }));
    // It gave the block alone, where the page gives each other settlement's with its confirmations beside it
    const confs = `${n.toLocaleString('en-US')}\u00a0${n === 1 ? 'confirmation' : 'confirmations'}`;
    expect(html).toContain(`<a href="#/btc/${at}" class="btc-ref mono">BTC #${at.toLocaleString('en-US')}</a><span class="small soft">${confs}</span>`);
  });
});
