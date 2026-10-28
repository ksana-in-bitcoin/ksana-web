import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Devnet } from '../chain/sim/engine';
import { t } from '../i18n';
import { olderBeyond, olderFocus, olderWaits, reachWords } from './HistoryReach';

const view = vi.hoisted(() => ({ chain: undefined as unknown }));
vi.mock('../app/store', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/store')>()), useChain: () => view.chain }));
const { LATEST_ROWS, Ops } = await import('../pages/Ops');
const { Account, HISTORY_ROWS } = await import('../pages/Account');
const { AssetPage, HISTORY_ROWS: ASSET_ROWS } = await import('../pages/Asset');

/** The rows of the list a page draws */
const rowsOf = (html: string) => (html.match(/<tr class="row-link/g) ?? []).length;

describe('A history list that is full', () => {
  it('has older rows to show where the page holds one beyond them or the node lists further, and none while it fills', () => {
    expect(olderBeyond(61, 60, undefined)).toBe(true);
    expect(olderBeyond(60, 60, undefined)).toBe(false);
    expect(olderBeyond(30, 60, undefined)).toBe(false);
    const listing = { source: 'listing', loading: false, complete: false, paused: false, listed: 60 } as const;
    expect(olderBeyond(60, 60, listing)).toBe(true);
    expect(olderBeyond(61, 60, { ...listing, complete: true })).toBe(true);
    expect(olderBeyond(60, 60, { ...listing, complete: true })).toBe(false);
    // Filling after a reader asked for more: the listing reads on, and the button comes back below the rows it brings
    expect(olderBeyond(90, 120, { ...listing, loading: true })).toBe(false);
    // From a node without the listings (D-110): the blocks below those read
    expect(olderBeyond(60, 60, { source: 'blocks', loading: false, from: 120 })).toBe(true);
    expect(olderBeyond(60, 60, { source: 'blocks', loading: false, from: 0 })).toBe(false);
  });

  it('has the node read further at the press where the rows wait for more than it reads by itself', () => {
    const listing = { source: 'listing', loading: false, complete: false, paused: false, listed: 600 } as const;
    // A listing reads on by itself once the list is short, up to what the view may list
    expect(olderWaits(60, 60, listing)).toBe(false);
    expect(olderWaits(60, 60, { ...listing, paused: true })).toBe(true);
    expect(olderWaits(60, 60, { ...listing, error: 'timed out' })).toBe(true);
    expect(olderWaits(60, 60, { ...listing, paused: true, loading: true })).toBe(false);
    // The page holds a row beyond those shown: the press shows it, and a short list says the rest
    expect(olderWaits(61, 60, { ...listing, paused: true })).toBe(false);
    expect(olderWaits(60, 60, { source: 'blocks', loading: false, from: 120 })).toBe(true);
    expect(olderWaits(60, 60, { source: 'blocks', loading: true, from: 120 })).toBe(false);
    // The simulator holds every operation
    expect(olderWaits(60, 60, undefined)).toBe(false);
  });

  it('moves the focus as the older rows a reader asked for come, from where the reader left it, and not while they are read', () => {
    const free = { reading: false, next: false, stays: false, free: true };
    expect(olderFocus({ ...free, next: true })).toBe('next');
    expect(olderFocus({ ...free, next: true, reading: true })).toBe('next');
    // A reader who went on elsewhere keeps their place, as the rows come or after
    expect(olderFocus({ ...free, next: true, free: false })).toBe('none');
    // While the source reads them, though nothing came yet: the request does not lapse
    expect(olderFocus({ ...free, reading: true })).toBe('wait');
    expect(olderFocus({ ...free, reading: true, free: false })).toBe('wait');
    // Nothing came: the last row takes the focus where the button goes, which would take the focus with it, and none where it stays
    expect(olderFocus(free)).toBe('last');
    expect(olderFocus({ ...free, stays: true })).toBe('none');
    expect(olderFocus({ ...free, free: false })).toBe('none');
  });

  it('says how far the list reaches, with the button that reads further, as it says above the list', () => {
    const h = t().ui.history;
    const listing = { source: 'listing', loading: false, complete: false, paused: false, listed: 600 } as const;
    expect(reachWords({ ...listing, loading: true }, true, h)).toEqual({ words: 'Fetching the operations from the node\u2026' });
    expect(reachWords({ ...listing, error: 'timed out' }, true, h)).toEqual({ words: 'Could not fetch the operations from the node: timed out', more: 'Try again' });
    expect(reachWords({ ...listing, paused: true }, false, h)).toEqual({ words: 'Looked through the latest 600\u00a0operations.', more: 'Look through older operations' });
    // A full list says nothing of a listing that stopped: its button shows the older rows the page holds, or reads on
    expect(reachWords({ ...listing, paused: true }, true, h)).toBeUndefined();
    expect(reachWords(listing, false, h)).toBeUndefined();
    const blocks = { source: 'blocks', loading: false, from: 1200 } as const;
    expect(reachWords({ ...blocks, loading: true }, true, h)).toEqual({ words: 'Fetching older blocks (at #1,200)\u2026' });
    expect(reachWords(blocks, false, h)).toEqual({ words: 'Only operations in blocks from #1,200 onward are listed.', more: 'Fetch older blocks' });
    expect(reachWords({ ...blocks, from: 0 }, false, h)).toBeUndefined();
  });

  it('on the operations page and an account page offers older operations, where it gave its newest 60 or 50 alone', () => {
    const s = new Devnet({ seed: 34, now: Date.UTC(2026, 9, 1, 8, 0, 0), historyMs: 40 * 60_000 });
    view.chain = s;
    const latest = renderToStaticMarkup(createElement(Ops, { tab: 'latest' }));
    expect(rowsOf(latest)).toBe(LATEST_ROWS);
    expect(latest).toContain('>Show older operations</span></button>');
    // Under it from the start, empty, the live region that says how far the list reaches once a reader has asked
    expect(latest).toContain('<div class="pagination older-rows"><p class="small muted" aria-live="polite"></p><button');
    // The account with the most operations, more than the page lists at first
    const counts = [...s.accounts].map(([id, acc]) => [id, acc.opIds.length] as const).sort((a, b) => b[1] - a[1]);
    const [busiest, n] = counts[0] ?? ['', 0];
    expect(n).toBeGreaterThan(HISTORY_ROWS);
    const account = renderToStaticMarkup(createElement(Account, { id: busiest }));
    expect(rowsOf(account)).toBe(HISTORY_ROWS);
    expect(account).toContain('>Show older operations</span></button>');
    // A list that is not full has none: an account with fewer operations than the page lists
    const quiet = [...s.accounts].find(([, acc]) => acc.opIds.length > 0 && acc.opIds.length < HISTORY_ROWS);
    if (!quiet) throw new Error('no account with a short history');
    expect(renderToStaticMarkup(createElement(Account, { id: quiet[0] }))).not.toContain('Show older operations');
  });

  it("on an asset's page offers older operations below its newest 50", () => {
    const s = new Devnet({ seed: 34, now: Date.UTC(2026, 9, 1, 8, 0, 0), historyMs: 40 * 60_000 });
    view.chain = s;
    // The built-in assets other than KSA, by the operations that move them: a transfer of it or funds of it attached to a call
    const moves = (asset: string) =>
      s.opOrder.filter((id) => {
        const a = s.getOp(id)?.op.action;
        return !!a && (a.kind === 'AssetTransfer' ? a.asset === asset : !!a.funds?.some((f) => f.asset === asset));
      }).length;
    const assets = [...s.assets.keys()].filter((id) => !/^0+$/.test(id)).map((id) => [id, moves(id)] as const);
    const busy = assets.find(([, n]) => n > ASSET_ROWS);
    if (!busy) throw new Error('no asset with a long history');
    const page = renderToStaticMarkup(createElement(AssetPage, { id: busy[0] }));
    expect(rowsOf(page)).toBe(ASSET_ROWS);
    expect(page).toContain('>Show older operations</span></button>');
    const still = assets.find(([, n]) => n < ASSET_ROWS);
    if (!still) throw new Error('no asset with a short history');
    expect(renderToStaticMarkup(createElement(AssetPage, { id: still[0] }))).not.toContain('Show older operations');
  });
});
