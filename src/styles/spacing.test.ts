import { readFileSync } from 'node:fs';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Devnet } from '../chain/sim/engine';
import { t } from '../i18n';

const view = vi.hoisted(() => ({ chain: undefined as unknown }));
vi.mock('../app/store', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/store')>()), useChain: () => view.chain }));
const { Blocks } = await import('../pages/Blocks');
const { Ops } = await import('../pages/Ops');
const { Overview } = await import('../pages/Overview');
const { Verify } = await import('../pages/Verify');

/** The simulator's pages drawn from one chain, with history enough for more than one page of blocks */
view.chain = new Devnet({ seed: 34, now: Date.UTC(2026, 9, 1, 8, 0, 0), historyMs: 40 * 60_000 });
const drawn = <P extends object>(page: FunctionComponent<P>, props: P) => renderToStaticMarkup(createElement(page, props));

/** The opening tags of the elements of a class in a page's markup */
const tagsOf = (html: string, name: string) => html.match(new RegExp(`<[a-z]+ [^>]*class="(?:[^"]* )?${name}(?: [^"]*)?"[^>]*>`, 'g')) ?? [];

/** A file as written, by its path from here (a test is given a stylesheet's import as an empty one) */
const text = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

/** The declarations of the first rule of this selector outside an at-rule, comments left out */
const rule = (name: string, selector: string) =>
  text(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(`\n${selector} {`)[1]
    ?.split('}')[0] ?? '';

/** The declarations of the first rule of this selector in an at-rule of this prelude at the top level, comments left out */
const within = (name: string, prelude: string, selector: string) =>
  text(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(`\n${prelude} {`)
    .slice(1)
    .map((block) => block.split('\n}')[0] ?? '')
    .find((block) => block.includes(`\n  ${selector} {`))
    ?.split(`\n  ${selector} {`)[1]
    ?.split('}')[0] ?? '';

/**
 * Text set with a reader's own spacing, as WCAG 1.4.12 asks a page to bear without losing anything: lines 1.5 times the size of the
 * text, paragraphs twice it apart, letters 0.12 of it and words 0.16
 */
describe('Under a reader’s own text spacing', () => {
  it('the Verify page’s button to the console or the data source’s settings wraps its label, a sentence, rather than run off a phone', () => {
    const html = drawn(Verify, {});
    const label = `<span>${t().verify.self.console}</span></button>`;
    expect(html).toContain(label);
    const button = html.slice(html.lastIndexOf('<button ', html.indexOf(label)), html.indexOf(label));
    expect(button).toMatch(/^<button type="button" class="btn [^"]*\bbtn--wrap\b/);
    const wrap = rule('components.css', '.btn--wrap');
    expect(wrap).toMatch(/\n\s*white-space: normal;/);
    expect(wrap).toMatch(/\n\s*max-width: 100%;/);
  });

  it('the block page’s entry figures wrap within one longer than the line rather than run off the page, each kept whole where it fits', () => {
    const part = rule('pages.css', '.entry-sums > span');
    expect(part).toMatch(/\n\s*display: inline-block;/);
    expect(part).toMatch(/\n\s*max-width: 100%;/);
    expect(part).not.toMatch(/white-space: nowrap;/);
  });

  it('a list’s pagination puts its second button below where the three do not fit on a line, rather than run off the page', () => {
    expect(rule('pages.css', '.pagination')).toMatch(/\n\s*flex-wrap: wrap;/);
  });

  it('a list’s pagination wraps the page it is at between its buttons before it puts a button below, as it did before it wrapped', () => {
    // The blocks list's: the newer page's button, the page it is at and the older page's button
    const pagination = drawn(Blocks, { page: 1 }).split('<nav class="pagination"')[1]?.split('</nav>')[0] ?? '';
    const parts = pagination.match(/<a [^>]*class="btn |<span class="[^"]*\bpagination-page\b/g) ?? [];
    expect(parts.map((part) => (part.startsWith('<a ') ? 'button' : 'page'))).toEqual(['button', 'page', 'button']);
    const page = rule('pages.css', '.pagination-page');
    expect(page).toMatch(/\n\s*flex: 1 1 0;/);
    expect(page).toMatch(/\n\s*max-width: max-content;/);
  });

  it('an account’s address goes below its label where the two do not fit side by side, rather than each be cut short', () => {
    expect(rule('components.css', '.acct-ref-text')).toMatch(/\n\s*flex-wrap: wrap;/);
  });

  it('the overview’s latest operations put the time below the signer where the two do not fit, rather than cut the address’s tail', () => {
    expect(rule('pages.css', '.op-line-meta')).toMatch(/\n\s*flex-wrap: wrap;/);
  });

  it('the overview’s latest operations carry the dot before the time with it, rather than leave it at the end of the signer’s line', () => {
    const metas = drawn(Overview, {}).split('<div class="op-line-meta">').slice(1);
    expect(metas.length).toBeGreaterThan(0);
    for (const meta of metas) {
      // The signer, then the time led by its dot in one piece, laid out as one item of the line
      expect(meta).toMatch(/^<a [^>]*class="acct-ref"[\s\S]*?<\/a><span class="op-line-when"><span class="dot-sep" aria-hidden="true"><\/span><time [^>]*>[^<]*<\/time><\/span><\/div>/);
    }
    const when = rule('pages.css', '.op-line-when');
    expect(when).toMatch(/\n\s*display: inline-flex;/);
    expect(when).toMatch(/\n\s*gap: 8px;/);
  });

  it('a table wider than its place scrolls within itself rather than take the page sideways, keeping in view what a row draws past its ends', () => {
    const wrap = rule('components.css', '.table-wrap');
    expect(wrap).toMatch(/\n\s*overflow-x: auto;/);
    expect(wrap).toMatch(/\n\s*overflow-y: hidden;/);
    // A row's band under the pointer reaches past its ends by as much as the table keeps either side, taken out of the page's gutter,
    // and as much is kept clear of a link the keyboard moves to, for its ring
    const hover = within('components.css', '@media (hover: hover)', '.table tbody tr.row-link:hover td:first-child');
    const band = hover.match(/\n\s*box-shadow: -(\d+)px 0 0 /)?.[1];
    expect(band).toBeDefined();
    for (const declaration of [`padding-inline: ${band}px;`, `margin-inline: -${band}px;`, `scroll-padding-inline: ${band}px;`]) {
      expect(wrap).toContain(`\n  ${declaration}`);
    }
    const gutters = [...text('tokens.css').matchAll(/--gutter: max\((\d+)px, /g)].map((m) => Number(m[1]));
    expect(gutters.length).toBeGreaterThan(0);
    expect(Number(band)).toBeLessThanOrEqual(Math.min(...gutters));
  });

  it('a table only a few px wider than its place runs into the room past its end rather than scroll, keeping room there for a ring', () => {
    // Without any spacing of the reader's own, the Spanish settlements at 1,024 px are 1.6 px wider than their place
    const slack = Number(rule('components.css', '.table-wrap > .table').match(/\n\s*margin-inline-end: -(\d+)px;/)?.[1]);
    const room = Number(rule('components.css', '.table-wrap').match(/\n\s*padding-inline: (\d+)px;/)?.[1]);
    const focus = rule('base.css', ':focus-visible');
    const ring = Number(focus.match(/\n\s*outline: (\d+)px /)?.[1]) + Number(focus.match(/\n\s*outline-offset: (\d+)px;/)?.[1]);
    expect(slack).toBeGreaterThanOrEqual(2);
    expect(room - slack).toBeGreaterThanOrEqual(ring);
  });

  it('a table on a phone puts an account whole below its label where the two do not fit, rather than cut its shortened address again', () => {
    // The operations list's sender: the account is the cell's own child, as the rule asks
    const html = drawn(Ops, { tab: 'latest' });
    const rows = html.match(/<tr class="row-link/g)?.length ?? 0;
    expect(rows).toBeGreaterThan(0);
    expect(html.match(new RegExp(`<td data-label="${t().ui.sender}"[^>]*><a [^>]*class="acct-ref"`, 'g'))).toHaveLength(rows);
    const cell = within('components.css', '@media (max-width: 720px)', '.table td:not(.m-primary)[data-label]:has(> .acct-ref)');
    expect(cell).toMatch(/\n\s*flex-wrap: wrap;/);
  });

  it('the connect page puts a wallet’s tag below its name where the two do not fit, rather than run past the card', () => {
    expect(rule('pages.css', '.connect-title')).toMatch(/\n\s*flex-wrap: wrap;/);
  });

  it('the connect page’s three points widen a column to its heading’s longest phrase, the other two giving way, rather than run past it', () => {
    // Columns of an automatic minimum, not of none (`minmax(0, 1fr)`), and each point a grid whose own column is as wide as it needs
    expect(rule('pages.css', '.explain-grid')).toMatch(/\n\s*grid-template-columns: repeat\(3, 1fr\);/);
    expect(rule('pages.css', '.explain-grid > div')).not.toMatch(/grid-template-columns/);
  });

  it('the top bar folds where its parts do not fit, a step at a time as narrower windows do, rather than run past the window', () => {
    // Set by `fitTopBar` in app/fit.ts: the playground's link, then the search box and the chip's source, then the wallet button's words
    const two = '.topbar-inner:is([data-fold="2"], [data-fold="3"])';
    expect(rule('pages.css', '.topbar-inner[data-fold] .nav .out-link')).toMatch(/\n\s*display: none;/);
    expect(rule('pages.css', `${two} :is(.search--md, .net-chip-label, .theme-top)`)).toMatch(/\n\s*display: none;/);
    expect(rule('pages.css', `${two} .search-btn`)).toMatch(/\n\s*display: inline-flex;/);
    expect(rule('pages.css', '.topbar-inner[data-fold="3"] :is(.connect-label, .wallet-chip .amount)')).toMatch(/\n\s*display: none;/);
    // The wallet button keeps to its icon, square, but a phone's keeps its 40 px
    const button = '.topbar-inner[data-fold="3"] .connect-btn';
    expect(within('pages.css', '@media (min-width: 480.02px)', button)).toMatch(/\n\s*width: 30px;\n\s*padding: 0;/);
    expect(rule('pages.css', button)).toBe('');
  });

  it('the blocks list on a phone puts a block’s shortened hash whole below its height where the two do not fit, rather than cut it again', () => {
    // Each row's height cell: the height, the parallel block's tag and the merge mark, then the hash
    const html = drawn(Blocks, { page: 1 });
    const rows = html.match(/<tr class="row-link/g)?.length ?? 0;
    expect(rows).toBeGreaterThan(0);
    expect(tagsOf(html, 'block-title')).toEqual(Array<string>(rows).fill('<span class="row gap-6 block-title">'));
    expect(within('components.css', '@media (max-width: 720px)', '.table .block-title')).toMatch(/\n\s*flex-wrap: wrap;/);
  });
});
