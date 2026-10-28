import { readFileSync } from 'node:fs';
import type { FocusEvent, MouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Hold } from './Table';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../app/router', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/router')>()), navigate }));
const { heldRows, holdOnFocus, kept, lookAt, revealFocus, rowOpener } = await import('./Table');

/**
 * A press on a row: inside a link or a control of the row's own (`inside`), or on its words, with `selected` the page's selected text and
 * `keys` the modifier keys held
 */
function press(inside: 'a' | 'button' | null, selected = '', keys: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}): MouseEvent<HTMLElement> {
  vi.stubGlobal('window', { getSelection: () => ({ toString: () => selected }) });
  const target = { closest: (sel: string) => (inside && sel.split(', ').includes(inside) ? {} : null) };
  return { target, button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...keys } as unknown as MouseEvent<HTMLElement>;
}

afterEach(() => {
  navigate.mockClear();
  vi.unstubAllGlobals();
});

describe('rowOpener', () => {
  const op = { name: 'op', id: 'ab'.repeat(32) } as const;

  it('opens the row’s page from a press on its words or beside them', () => {
    rowOpener(op)?.(press(null));
    expect(navigate).toHaveBeenCalledWith(op);
  });

  it('leaves a press on a link or a control of the row’s own to it', () => {
    rowOpener(op)?.(press('a'));
    rowOpener(op)?.(press('button'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens nothing for a press that ends a selection of the row’s text', () => {
    rowOpener(op)?.(press(null, 'f8ce6b48'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves a press with a modifier key to the browser, as a link does', () => {
    for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) rowOpener(op)?.(press(null, '', { [key]: true }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('gives a row with no page of its own nothing to do', () => {
    expect(rowOpener(undefined)).toBeUndefined();
  });
});

describe('revealFocus', () => {
  /**
   * The focus coming to what spans `left` to `right` in a table that shows 0 to 400 px of itself and scrolls `scroll` px more, from the
   * keyboard or from a press; what it scrolls into view
   */
  function focus(left: number, right: number, { scroll = 40, keyboard = true } = {}) {
    const scrollIntoView = vi.fn();
    const wrap = { scrollWidth: 400 + scroll, clientWidth: 400, getBoundingClientRect: () => ({ left: 0, right: 400 }) };
    const target = {
      matches: (sel: string) => sel === ':focus-visible' && keyboard,
      getBoundingClientRect: () => ({ left, right }),
      scrollIntoView,
    };
    revealFocus({ currentTarget: wrap, target } as unknown as FocusEvent<HTMLElement>);
    return scrollIntoView;
  }

  it('brings a link the keyboard moves to whole into a table that scrolls within itself, where the table shows it in part', () => {
    // Past the table's right edge, as the Spanish settlements' BTC blocks are at 768 px under a reader's own spacing; past its left edge
    expect(focus(330, 400.7)).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(focus(-30, 50)).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('brings in a link whose ring alone the table’s edge cuts', () => {
    expect(focus(330, 398)).toHaveBeenCalledOnce();
    expect(focus(2, 80)).toHaveBeenCalledOnce();
  });

  it('leaves a link the table shows whole with its ring, one a press focused, and a table that does not scroll as they are', () => {
    expect(focus(4, 396)).not.toHaveBeenCalled();
    expect(focus(330, 400.7, { keyboard: false })).not.toHaveBeenCalled();
    expect(focus(330, 400.7, { scroll: 0 })).not.toHaveBeenCalled();
  });

  it('leaves the focus alone in a browser that cannot tell the keyboard’s from a press’s', () => {
    const scrollIntoView = vi.fn();
    const wrap = { scrollWidth: 440, clientWidth: 400, getBoundingClientRect: () => ({ left: 0, right: 400 }) };
    const target = {
      matches: () => {
        throw new SyntaxError('unknown pseudo-class');
      },
      getBoundingClientRect: () => ({ left: 330, right: 400.7 }),
      scrollIntoView,
    };
    expect(() => revealFocus({ currentTarget: wrap, target } as unknown as FocusEvent<HTMLElement>)).not.toThrow();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('a list held while the keyboard is in it', () => {
  type Row = { id: string; stage: string };
  const row = (id: string, stage = 'fast'): Row => ({ id, stage });
  const key = (r: Row) => r.id;

  it('draws the list as it is while nothing holds it', () => {
    const hold: Hold<Row> = { held: null, shown: [], at: '#/' };
    const rows = [row('a'), row('b')];
    expect(heldRows(hold, rows, key, '#/')).toBe(rows);
    expect(hold.shown).toBe(rows);
  });

  it('keeps the rows it showed, in their order, each as the list has it now, and those the list has let go', () => {
    const hold: Hold<Row> = { held: { at: '#/', rows: [row('c'), row('d'), row('e')] }, shown: [], at: '#/' };
    // Two rows arrive at the top of a list of three, which lets d and e go, and c's stage changes; then another arrives
    expect(heldRows(hold, [row('a'), row('b'), row('c', 'final')], key, '#/')).toEqual([row('c', 'final'), row('d'), row('e')]);
    expect(heldRows(hold, [row('z'), row('a'), row('b')], key, '#/')).toEqual([row('c', 'final'), row('d'), row('e')]);
  });

  it('lets go on another page', () => {
    const hold: Hold<Row> = { held: { at: '#/blocks', rows: [row('c')] }, shown: [row('c')], at: '#/blocks' };
    const rows = [row('a')];
    expect(heldRows(hold, rows, key, '#/blocks/2')).toBe(rows);
    expect(hold.held).toBeNull();
  });

  /** A list's box showing the rows `shown`, its links and what lies outside it, the focus and the looks it leaves for later */
  function list(shown = [row('c'), row('d')]) {
    const hold: Hold<Row> = { held: null, shown, at: '#/' };
    const redraw = vi.fn();
    const later = new Map<number, () => void>();
    let next = 1;
    let active: unknown = null;
    vi.stubGlobal('window', {
      setTimeout: (fn: () => void) => {
        later.set(next, fn);
        return next++;
      },
      clearTimeout: (id?: number) => void (id !== undefined && later.delete(id)),
    });
    vi.stubGlobal('document', {
      get activeElement() {
        return active;
      },
    });
    const node = (keyboard: boolean) => ({ matches: (sel: string) => sel === ':focus-visible' && keyboard });
    const [first, second, outside, body] = [node(true), node(true), node(true), node(false)];
    const inside = new Set<unknown>([first, second]);
    const box = { contains: (n: unknown) => inside.has(n) };
    const handlers = holdOnFocus(hold, redraw);
    return {
      hold,
      redraw,
      first,
      second,
      outside,
      body,
      /** The focus coming to a link of the list, from the keyboard or from a press */
      focus: (to: object, keyboard = true) => {
        active = to;
        handlers.onFocus({ currentTarget: box, target: node(keyboard) } as unknown as FocusEvent<HTMLElement>);
      },
      /** The focus leaving a link of the list for `to` (null: nothing, or another window), `active` then holding it */
      blur: (to: object | null, now: object) => {
        active = now;
        handlers.onBlur({ currentTarget: box, relatedTarget: to } as unknown as FocusEvent<HTMLElement>);
      },
      /** The looks left for later, taken */
      flush: () => {
        for (const [id, fn] of [...later]) {
          later.delete(id);
          fn();
        }
      },
    };
  }

  it('holds the rows it shows when the keyboard comes into it, not when a press does', () => {
    const l = list();
    l.focus(l.first, false);
    expect(l.hold.held).toBeNull();
    l.focus(l.first);
    expect(l.hold.held).toEqual({ at: '#/', rows: [row('c'), row('d')] });
  });

  it('holds them as the keyboard moves from row to row, and keeps the focus where another window takes it', () => {
    const l = list();
    l.focus(l.first);
    l.blur(l.second, l.second);
    l.focus(l.second);
    l.flush();
    // The window losing the focus leaves it where it was, to come back to; the look at the window lets the list go on meanwhile (`lookAt`)
    l.blur(null, l.second);
    l.flush();
    expect(l.hold.held).not.toBeNull();
    expect(l.redraw).not.toHaveBeenCalled();
  });

  it('lets go once the focus has left the list, by the keyboard or a press elsewhere, and draws the list as it is now', () => {
    const l = list();
    l.focus(l.first);
    l.blur(l.outside, l.outside);
    expect(l.hold.held).not.toBeNull();
    l.flush();
    expect(l.hold.held).toBeNull();
    expect(l.redraw).toHaveBeenCalledOnce();
    // A press on the page's words gives the focus to nothing
    l.focus(l.second);
    l.blur(null, l.body);
    l.flush();
    expect(l.hold.held).toBeNull();
    expect(l.redraw).toHaveBeenCalledTimes(2);
  });

  it('holds on where the focus comes back before it is known to have gone', () => {
    const l = list();
    l.focus(l.first);
    l.blur(null, l.outside);
    l.focus(l.first);
    l.flush();
    expect(l.hold.held).not.toBeNull();
    expect(l.redraw).not.toHaveBeenCalled();
  });

  it('holds again what it shows where the keyboard moves the focus in it while it goes on as it is', () => {
    const l = list([row('a'), row('c'), row('d')]);
    l.focus(l.first);
    if (l.hold.held) l.hold.held.away = 'c';
    l.focus(l.second);
    expect(l.hold.held).toEqual({ at: '#/', rows: [row('a'), row('c'), row('d')] });
  });
});

describe('a held list whose focus is not shown', () => {
  type Row = { id: string };
  const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));
  const key = (r: Row) => r.id;
  const ids = (list: Row[]) => list.map(key).join('');

  it('keeps the row the focus is on in its place among the rows the list has now', () => {
    // A list of six that keeps its length, the focus on its last row: two blocks arrive, and it goes after the last row still there
    expect(ids(kept(rows('6', '5', '4', '3', '2', '1'), rows('8', '7', '6', '5', '4', '3'), key, '1'))).toBe('8765431');
    // Every row around it gone: at the end
    expect(ids(kept(rows('6', '5', '4', '3', '2', '1'), rows('c', 'b', 'a', '9', '8', '7'), key, '4'))).toBe('cba9874');
    // The pool: an operation included, before the nearest row after it still waiting; one included with those before it
    expect(ids(kept(rows('a', 'b', 'c', 'd'), rows('a', 'b', 'd', 'e'), key, 'c'))).toBe('abcde');
    expect(ids(kept(rows('a', 'b', 'c'), rows('c', 'd'), key, 'b'))).toBe('bcd');
  });

  it('draws the list as it is where the list still has the row', () => {
    const now = rows('z', 'a', 'b');
    expect(kept(rows('a', 'b'), now, key, 'b')).toBe(now);
  });

  it('goes on as the list is now, the row the focus is on kept, until it is held again', () => {
    const hold: Hold<Row> = { held: { at: '#/', rows: rows('c', 'd', 'e'), away: 'e' }, shown: rows('c', 'd', 'e'), at: '#/' };
    expect(ids(heldRows(hold, rows('a', 'b', 'c'), key, '#/'))).toBe('abce');
    expect(ids(heldRows(hold, rows('z', 'a', 'b'), key, '#/'))).toBe('zabe');
    // Held again where the focus shows: what it shows now
    hold.held = { at: '#/', rows: hold.shown };
    expect(ids(heldRows(hold, rows('y', 'z', 'a'), key, '#/'))).toBe('zabe');
  });

  /**
   * A list held while the keyboard is in it, its row `key` focused, the top bar ending at 60 px and a phone's bottom bar starting at
   * 760: the focus `at` its top in the viewport, from the keyboard, in a window that has the focus or not
   */
  function look(o: { at: number; keyboard?: boolean; windowFocus?: boolean; inRow?: boolean; held?: boolean; away?: string }) {
    const box = { contains: (n: unknown) => n === focus || n === rowEl };
    const rowEl = { getAttribute: (name: string) => (name === 'data-key' ? 'c' : null) };
    const focus = {
      matches: (sel: string) => sel === ':focus-visible' && (o.keyboard ?? true),
      closest: (sel: string) => (sel === '[data-key]' && (o.inRow ?? true) ? rowEl : null),
      getBoundingClientRect: () => ({ top: o.at, bottom: o.at + 20 }),
    };
    vi.stubGlobal('window', { innerHeight: 844 });
    vi.stubGlobal('document', {
      activeElement: focus,
      hasFocus: () => o.windowFocus ?? true,
      querySelector: (sel: string) =>
        sel === '.topbar' ? { getBoundingClientRect: () => ({ bottom: 60 }) } : sel === '.bottomnav' ? { getBoundingClientRect: () => ({ top: 760, height: 84 }) } : null,
    });
    const shown = rows('b', 'c', 'd');
    const hold: Hold<Row> = {
      held: (o.held ?? true) ? { at: '#/', rows: shown, ...(o.away ? { away: o.away } : {}) } : null,
      shown,
      at: '#/',
      box: box as unknown as Element,
    };
    return { hold, changed: lookAt(hold) };
  }

  it('lets the list go on where the reader has scrolled the focus out of the window or under a bar', () => {
    // Above the window, under the top bar, under the bottom bar, below the window
    for (const at of [-40, 35, 765, 900]) {
      const { hold, changed } = look({ at });
      expect(changed).toBe(true);
      expect(hold.held?.away).toBe('c');
    }
  });

  it('leaves it as it was where the window has lost the focus, which shows no focus meanwhile', () => {
    // At the very top of a page the browser does not anchor scrolling: a list going on would let the focus sink out of the window
    for (const away of [undefined, 'c']) {
      for (const at of [300, 900]) {
        const { hold, changed } = look({ at, keyboard: false, windowFocus: false, ...(away ? { away } : {}) });
        expect(changed).toBe(false);
        expect(hold.held?.away).toBe(away);
      }
    }
  });

  it('holds it while the focus shows, and again what it shows once the focus is back in the window', () => {
    const shown = look({ at: 300 });
    expect(shown.changed).toBe(false);
    expect(shown.hold.held?.away).toBeUndefined();
    const back = look({ at: 300, away: 'c' });
    expect(back.changed).toBe(false);
    expect(back.hold.held).toEqual({ at: '#/', rows: rows('b', 'c', 'd') });
  });

  it('draws nothing again for a look that changes nothing, a list not held, or a focus in no row of it', () => {
    expect(look({ at: -40, away: 'c' }).changed).toBe(false);
    expect(look({ at: -40, held: false }).changed).toBe(false);
    expect(look({ at: -40, inRow: false }).changed).toBe(false);
  });
});

/**
 * Links less tall than a fingertip, one above the other: WCAG 2.2 asks that a circle 24 px across around the middle of each meets no
 * other target, nor the circle of another so small (2.5.8). Each line is its line height tall, and a link centred on it
 */
describe('links one above the other', () => {
  const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const rule = (path: string, selector: string) => css(path).split(`\n${selector} {`)[1]?.split('}')[0];
  const px = (body: string | undefined, prop: string) => Number(body?.match(new RegExp(`(?:^|\\n)\\s*${prop}: (\\d+)px;`))?.[1]);
  const tokens = css('../styles/tokens.css');
  const lineHeight = Number(css('../styles/base.css').match(/\n\nbody \{[^}]*line-height: ([\d.]+);/)?.[1]);
  const line = (size: string) => px(tokens, size) * lineHeight;
  // A pixel more than WCAG asks leaves some to spare
  const atLeast = (x: number, min: number) => expect(Math.round(x * 10) / 10).toBeGreaterThanOrEqual(min + 1);

  it('keep an operation’s link and its signer apart in the overview’s latest operations', () => {
    // The summary's line in the small size, the signer's in the label size: the two links' middles are half of each line and the gap
    // apart, whatever their widths
    atLeast(line('--fs-small') / 2 + px(rule('../styles/pages.css', '.op-line-main'), 'gap') + line('--fs-label') / 2, 24);
  });

  it('keep a settlement’s commit transaction clear of its reveal transaction', () => {
    // Where its label is short (Chinese), the commit transaction's ID, on a line in the label size, sits right under the reveal
    // transaction's: its middle is the stack's gap, the line's margin and half the line below the reveal transaction
    const below = px(rule('../styles/components.css', '.cell-stack'), 'gap') + px(rule('../styles/pages.css', '.tx-commit'), 'margin-top') + line('--fs-label') / 2;
    atLeast(below, 12);
  });
});
