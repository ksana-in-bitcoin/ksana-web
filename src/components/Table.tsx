import { useEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { inWindow, keyboardFocus } from '../app/anchor';
import { href, navigate, useRoute, type Route } from '../app/router';
import { useT } from '../i18n';
import { flashing, freshKeys } from '../lib/fresh';

/**
 * A row that opens its page wherever it is pressed, as its link does, unless the press lands on a link or a control of its own, ends
 * a selection of its text or is made with a modifier key. On a phone a row is a card a finger takes as one: its words alone are a
 * target of about 20 px in a row of 64. A mouse and touch convenience: the keyboard and a screen reader go by the row's own link
 */
export function rowOpener(to: Route | undefined): ((e: MouseEvent<HTMLElement>) => void) | undefined {
  if (!to) return undefined;
  return (e) => {
    // A press with a modifier key is left to the browser, as a link's is (`onLinkClick`): a shift-press extends a selection, and a
    // command- or control-press, which on a link opens a new tab, on a row that is no link opens nothing rather than leaving the page
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, select, textarea')) return;
    if (window.getSelection()?.toString()) return;
    navigate(to);
  };
}

/** How far the ring of focus is drawn past what has the focus (`:focus-visible` in base.css: a 2 px outline 2 px out) */
const RING = 4;

/**
 * A link or a button the keyboard moves to in a table that scrolls within itself comes whole into the table's view, ring and all, the
 * table's 12 px clear of the edge where it has room to scroll (`scroll-padding-inline`). The browser scrolls the table only to one it
 * hides but for those 12 px, and leaves one it shows in part where it is, its ring cut at the table's edge: the Spanish settlements' BTC
 * blocks at 768 px under a reader's own wider spacing
 */
export function revealFocus(e: FocusEvent<HTMLElement>): void {
  const wrap = e.currentTarget;
  const target = e.target as HTMLElement;
  if (target === wrap || wrap.scrollWidth <= wrap.clientWidth) return;
  const shown = wrap.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  if (r.left - RING >= shown.left && r.right + RING <= shown.right) return;
  if (keyboardFocus(target)) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** A newly appearing row flashes qing once: the Ksana instant. The rows of a list, by their keys, to draw marked as new */
export function useFreshKeys(keys: string[]): Set<string> {
  const prev = useRef<Set<string> | null>(null);
  const marked = useRef(new Map<string, number>());
  const fresh = flashing(marked.current, freshKeys(prev.current, keys), Date.now());
  prev.current = new Set(keys);
  return fresh;
}

/** What `useHold` keeps of its list from one drawing to the next */
export interface Hold<T> {
  /**
   * The rows the list showed when the keyboard came into it, and the page it came in on; `away`, while the focus does not show
   * (`lookAt`), the key of the row it is on
   */
  held: { at: string; rows: T[]; away?: string } | null;
  /** The rows the list shows */
  shown: T[];
  /** The page the list is shown on, by its address */
  at: string;
  /** The list's box, once the focus has come into it */
  box?: Element;
  /** The look at where the focus went, once it has gone */
  timer?: number;
  /** The look at whether the focus shows, in the next frame */
  frame?: number;
}

/**
 * The rows a list draws of `rows`, the list as it is now, on the page `at` (`useHold`): while it is held, those it showed when the
 * keyboard came, in their order, each as the list has it now where it still has it and as it last had it where it has let it go; while
 * the focus does not show, the list as it is now, the row the focus is on kept in its place (`kept`). Another page lets go
 */
export function heldRows<T>(hold: Hold<T>, rows: T[], keyOf: (row: T) => string, at: string): T[] {
  if (hold.held && hold.held.at !== at) hold.held = null;
  const held = hold.held;
  if (held?.away !== undefined) hold.shown = kept(hold.shown, rows, keyOf, held.away);
  else if (held) {
    const now = new Map(rows.map((r) => [keyOf(r), r]));
    held.rows = held.rows.map((r) => now.get(keyOf(r)) ?? r);
    hold.shown = held.rows;
  } else hold.shown = rows;
  hold.at = at;
  return hold.shown;
}

/**
 * `rows`, the list as it is now, with the row `key` where the list has let it go, in the place it had among `before`, the rows last
 * drawn: before the nearest of the rows after it there that the list still has, else after the nearest before it, else at the end
 */
export function kept<T>(before: T[], rows: T[], keyOf: (row: T) => string, key: string): T[] {
  if (rows.some((r) => keyOf(r) === key)) return rows;
  const i = before.findIndex((r) => keyOf(r) === key);
  const row = before[i];
  if (row === undefined) return rows;
  const place = new Map(rows.map((r, j) => [keyOf(r), j]));
  const of = (r: T | undefined) => (r === undefined ? undefined : place.get(keyOf(r)));
  for (let j = i + 1; j < before.length; j++) {
    const k = of(before[j]);
    if (k !== undefined) return [...rows.slice(0, k), row, ...rows.slice(k)];
  }
  for (let j = i - 1; j >= 0; j--) {
    const k = of(before[j]);
    if (k !== undefined) return [...rows.slice(0, k + 1), row, ...rows.slice(k + 1)];
  }
  return [...rows, row];
}

/**
 * What a list's box does as the focus comes and goes (`useHold`): the keyboard coming in holds the rows it shows (`:focus-visible`; a
 * press on a link opens its page), and the focus leaving lets them go, `redraw` drawing the list as it is now. Where the focus went is
 * known once it has gone: the window losing the focus leaves it where it was, to come back to (`lookAt`)
 */
export function holdOnFocus<T>(hold: Hold<T>, redraw: () => void) {
  return {
    onFocus: (e: FocusEvent<HTMLElement>) => {
      window.clearTimeout(hold.timer);
      hold.box = e.currentTarget;
      if ((!hold.held || hold.held.away !== undefined) && keyboardFocus(e.target)) hold.held = { at: hold.at, rows: hold.shown };
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      const box = e.currentTarget;
      if (e.relatedTarget && box.contains(e.relatedTarget)) return;
      window.clearTimeout(hold.timer);
      hold.timer = window.setTimeout(() => {
        if (!hold.held || box.contains(document.activeElement)) return;
        hold.held = null;
        redraw();
      });
    },
  };
}

/**
 * A held list's look at its focus (`useHold`), in the frame after the page scrolls, the window is resized or gets the focus back, or
 * the focus comes into the list: while the focus does not show, as the reader has scrolled it out of the window or under a bar, the
 * reader is not reading the list, which goes on as it is now, but for the row the focus is on (by its `data-key`), kept in its place
 * for the keyboard to go on from (`heldRows`); and it holds again what it shows once the focus shows again. A window without the focus
 * changes nothing: the reader may be reading it still, beside another window or in its address bar, and at the very top of a page,
 * where the browser does not anchor scrolling, the focus would sink with a list going on, out of the window. Whether the list is to be
 * drawn again
 */
export function lookAt<T>(hold: Hold<T>): boolean {
  const held = hold.held;
  const box = hold.box;
  const a = document.activeElement;
  if (!held || !box || !a || !box.contains(a) || !document.hasFocus()) return false;
  const row = a.closest('[data-key]');
  const key = row && box.contains(row) ? row.getAttribute('data-key') : null;
  if (key === null) return false;
  if (keyboardFocus(a) && inWindow(a)) {
    if (held.away !== undefined) hold.held = { at: held.at, rows: hold.shown };
    return false;
  }
  if (held.away === key) return false;
  held.away = key;
  return true;
}

/** A look at the focus of a held list in the next frame (`lookAt`), drawing the list again where it changes */
function lookLater<T>(hold: Hold<T>, redraw: () => void): void {
  if (hold.frame || !hold.held) return;
  hold.frame = requestAnimationFrame(() => {
    hold.frame = 0;
    if (lookAt(hold)) redraw();
  });
}

/**
 * A list's rows as drawn, held while the keyboard is in the list and its focus shows. A row arriving at the top of a live list (the
 * latest blocks or operations, a settlement, an entry in the pool) moved the link the keyboard was on down a row, under a phone's bottom
 * bar and out of the window, and at the end of a list that keeps its length took the link away with its row, and the focus with it; in
 * the pool, the row of an operation that leaves it. Held, the list keeps the rows it showed, in their order, each as the list has it
 * now, those that would have left it too (`gone`, drawn grey); when the focus leaves the list it lets go, and the rows that arrived
 * meanwhile come in, flashing in a list that marks its new rows. Another page lets go as well. While the reader has scrolled the focus
 * out of the window or under a bar, the list goes on as it is now, but for the row the focus is on (`lookAt`); a window that loses the
 * focus leaves the list as it was. `focus` goes on the list's box, `data-key` on each row
 */
export function useHold<T>(rows: T[], keyOf: (row: T) => string) {
  const at = href(useRoute());
  const [hold] = useState<Hold<T>>(() => ({ held: null, shown: rows, at }));
  const [, setDrawn] = useState(0);
  const redraw = () => setDrawn((n) => n + 1);
  useEffect(() => {
    const look = () => lookLater(hold, () => setDrawn((n) => n + 1));
    const events = ['scroll', 'resize', 'focus'] as const;
    for (const type of events) window.addEventListener(type, look, { passive: true });
    return () => {
      for (const type of events) window.removeEventListener(type, look);
      if (hold.frame) cancelAnimationFrame(hold.frame);
      hold.frame = 0;
      window.clearTimeout(hold.timer);
    };
  }, [hold]);
  const shown = heldRows(hold, rows, keyOf, at);
  const listed = shown === rows ? null : new Set(rows.map(keyOf));
  const { onFocus, onBlur } = holdOnFocus(hold, redraw);
  return {
    rows: shown,
    /** A row the list as it is now no longer has, which the hold keeps */
    gone: (row: T) => listed !== null && !listed.has(keyOf(row)),
    focus: {
      onFocus: (e: FocusEvent<HTMLElement>) => {
        onFocus(e);
        lookLater(hold, redraw);
      },
      onBlur,
    },
  };
}

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** `gone`: a row the list as it is now no longer has, which a hold keeps (`useHold`) */
  render: (row: T, gone: boolean) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
  /**
   * On narrow screens: primary is the card's title line, hide is hidden, the rest are laid out as "label value" on the lines below.
   * Values that speak for themselves (a status badge, a time) drop the label: bare keeps its place, corner sits at the right end of
   * the title line, end at the right end of the lines below.
   */
  mobile?: 'primary' | 'hide' | 'inline' | 'bare' | 'corner' | 'end';
  /** The label before this row's value on a narrow screen, when it differs from `label`: undefined where the value names itself */
  mobileLabel?: (row: T) => string | undefined;
  /**
   * On a tablet held upright (721–1023 px), where every column would run the table past the page: hide steps aside, for a detail
   * the row's own page shows
   */
  tablet?: 'hide';
  /**
   * Beside another column in a narrow desktop window (981–1239 px, until the page has its full width), where the table's column is
   * 527 to 676 px wide and every column would run the table past it: hide steps aside as well, for a detail the row's own page shows
   */
  narrow?: 'hide';
  className?: string;
}

/**
 * Data table: a table on wide screens, which scrolls within itself where it is wider than its place (as under a reader's own wider
 * text spacing); on narrow screens (≤ 720px) each row becomes a compact card, with no horizontal scrolling.
 * The whole row is clickable; links and buttons inside the row can still be focused individually with the keyboard, and while the
 * keyboard is in the table its rows hold still (`useHold`), those the list has let go drawn grey (`row-gone`).
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  rowTo,
  flash = false,
  caption,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** `gone` as for a column's `render` */
  rowTo?: (row: T, gone: boolean) => Route | undefined;
  /** A row arriving above those shown flashes once (`useFreshKeys`), as in the lists of blocks and operations */
  flash?: boolean;
  caption?: string;
  empty?: ReactNode;
}) {
  const t = useT();
  const { rows: shown, gone, focus } = useHold(rows, rowKey);
  const fresh = useFreshKeys(flash ? shown.map(rowKey) : []);
  // A row the list no longer has is said so where a phone's card shows the row's title, a table its first column
  const titled = Math.max(0, columns.findIndex((c) => c.mobile === 'primary'));
  if (shown.length === 0 && empty) return <>{empty}</>;
  return (
    <div
      className="table-wrap"
      onFocus={(e) => {
        focus.onFocus(e);
        revealFocus(e);
      }}
      onBlur={focus.onBlur}
    >
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`${c.align ? `al-${c.align}` : ''} ${c.tablet ? `t-${c.tablet}` : ''} ${c.narrow ? `n-${c.narrow}` : ''} ${c.className ?? ''}`}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const left = gone(row);
            const to = rowTo?.(row, left);
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={`${to ? 'row-link' : ''} ${fresh.has(key) ? 'row-new' : ''} ${left ? 'row-gone' : ''}`}
                data-key={key}
                onClick={rowOpener(to)}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    data-label={c.mobileLabel ? c.mobileLabel(row) : typeof c.label === 'string' ? c.label : undefined}
                    className={`${c.align ? `al-${c.align}` : ''} ${c.mobile ? `m-${c.mobile}` : ''} ${c.tablet ? `t-${c.tablet}` : ''} ${c.narrow ? `n-${c.narrow}` : ''} ${c.className ?? ''}`}
                  >
                    {c.render(row, left)}
                    {left && i === titled && <span className="sr-only">{t.ui.goneSr}</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
