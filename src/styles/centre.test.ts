import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IconEyeOff, IconSettings } from '../components/icons';
import { Button, ButtonLink } from '../components/ui';

/** A stylesheet as written (a test is given a stylesheet's import as an empty one) */
const css = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

type Rule = { at: string[]; selector: string; body: string };

/** A stylesheet's rules in its order, comments left out: each with the at-rules around it, its selector and its declarations */
const rulesOf = (name: string): Rule[] => {
  const text = css(name).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const at: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '}') {
      at.pop();
      start = i + 1;
    } else if (text[i] === '{') {
      const head = (text.slice(start, i).split(';').pop() ?? '').trim().replace(/\s+/g, ' ');
      if (head.startsWith('@')) at.push(head);
      else {
        // A rule's declarations hold no braces
        const end = text.indexOf('}', i);
        rules.push({ at: [...at], selector: head, body: text.slice(i + 1, end) });
        i = end;
      }
      start = i + 1;
    }
  }
  return rules;
};

/** The two stylesheets in the order the page loads them (main.tsx), the later one winning where two rules are equally specific */
const rules = [...rulesOf('components.css'), ...rulesOf('pages.css')];

// The page's own components, as written (their tests aside)
const sources = Object.entries(import.meta.glob<string>('../**/*.tsx', { query: '?raw', import: 'default', eager: true })).filter(([path]) => !path.endsWith('.test.tsx'));

/**
 * The `<Button>` and `<ButtonLink>` elements written in a source, comments left out: each with its opening tag, which ends at the first
 * `>` outside an attribute's string or expression, and what it holds
 */
const buttonsOf = (source: string) => {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  return [...text.matchAll(/<(Button|ButtonLink)\b/g)].map((m) => {
    let depth = 0;
    let end = m.index + m[0].length;
    for (; end < text.length; end++) {
      const c = text[end];
      if (c === '>' && depth === 0) break;
      // A string's own braces and `>` are none of the tag's
      if (c === '"' || (depth > 0 && c === "'")) end = text.indexOf(c, end + 1);
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      if (end < 0) break;
    }
    const open = end < 0 ? '' : text.slice(m.index, end + 1);
    const closed = open.endsWith('/>');
    return { open, holds: closed || end < 0 ? '' : text.slice(end + 1, text.indexOf(`</${m[1]}>`, end)) };
  });
};

/** A declaration's value from the rules of this selector under exactly these at-rules: the last that sets it, which wins over the others */
const value = (selector: string, prop: string, at: string[] = []) =>
  rules
    .filter((r) => r.selector === selector && r.at.join(' ') === at.join(' '))
    .map((r) => r.body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`))?.[1]?.trim())
    .filter((v) => v !== undefined)
    .pop() ?? '';

describe('An icon alone in its control stands in its middle', () => {
  it('in the top bar’s search button, which the bar draws as a row in place of the icon button’s own grid', () => {
    expect(value('.icon-btn', 'display')).toBe('inline-grid');
    expect(value('.icon-btn', 'place-items')).toBe('center');
    // A row centres what it holds along it by justify-content alone: place-items says nothing there, and the search icon had stood at
    // the start of its button, 4 px left of its middle on a phone
    const tools = '.topbar-tools > .icon-btn, .topbar-tools > .wallet-chip, .topbar-tools > .btn, .theme-top';
    expect(value(tools, 'display')).toBe('inline-flex');
    expect(value(tools, 'justify-content')).toBe('center');
    // Where the bar folds the search box into its icon, the icon's button is the same row
    expect(value('.topbar-inner:is([data-fold="2"], [data-fold="3"]) .search-btn', 'display')).toBe('inline-flex');
  });

  it('in a button or a button link that shows its icon alone, named by its aria-label rather than by words inside it', () => {
    // A button keeps 7 px between its icon and its words: words for a screen reader alone, inside it, left an empty place after the
    // gap, and the wallet's eye, its gear and the refresh of its BTC balance stood 3.5 px left of their buttons' middles
    expect(value('.btn', 'gap')).toBe('7px');
    const eye = renderToStaticMarkup(createElement(Button, { variant: 'ghost', icon: createElement(IconEyeOff), 'aria-label': 'Hide balances' }));
    expect(eye).toMatch(/^<button type="button" class="btn btn--ghost btn--md " aria-label="Hide balances"><svg [^>]*>[\s\S]*<\/svg><\/button>$/);
    const gear = renderToStaticMarkup(
      createElement(ButtonLink, { to: { name: 'settings' }, variant: 'ghost', icon: createElement(IconSettings), 'aria-label': 'Settings' }),
    );
    expect(gear).toMatch(/^<a href="#\/wallet\/settings" class="btn btn--ghost btn--md " aria-label="Settings"><svg [^>]*>[\s\S]*<\/svg><\/a>$/);
    for (const html of [eye, gear]) expect(html).not.toContain('<span');
    // Every one written in the page that shows its icon alone is drawn so: none holds words for a screen reader alone, each is named by
    // its aria-label (WEB_DESIGN §6)
    const buttons = sources.flatMap(([path, source]) => buttonsOf(source).map((b) => ({ path, ...b })));
    expect(buttons.filter((b) => !b.open.endsWith('>'))).toEqual([]);
    expect(buttons.length).toBeGreaterThan(60);
    const alone = buttons.filter((b) => b.holds.replace(/<span className="sr-only">[\s\S]*?<\/span>/g, '').trim() === '');
    expect(alone.filter((b) => b.holds.trim() !== '' || !/\saria-label=\{/.test(b.open))).toEqual([]);
    // Among them the wallet's three and the blocks page's jump to a height
    for (const label of ['prefs.hideBalances ? h.showBalances : h.hideBalances', 't.settings.title', 'b.btcRefresh', 'm.jump']) {
      expect(alone.some((b) => b.open.includes(` aria-label={${label}}`)), label).toBe(true);
    }
  });

  it('in the wallet’s chip where it shows its seal alone, on a phone, where the top bar folds and until its balance is known', () => {
    const phone = ['@media (max-width: 860px)'];
    expect(value('.nav, .topbar .search--md, .net-chip-label, .wallet-chip .amount', 'display', phone)).toBe('none');
    expect(value('.wallet-chip', 'padding-inline', phone)).toBe('10px');
    expect(value('.topbar-inner[data-fold="3"] :is(.connect-label, .wallet-chip .amount)', 'display')).toBe('none');
    expect(value('.topbar-inner[data-fold="3"] .wallet-chip', 'padding-inline')).toBe('10px');
    // The chip leaves its balance out until the node has answered for the account (Shell.tsx), at any width
    expect(value('.wallet-chip:not(:has(.amount))', 'padding-inline')).toBe('10px');
    // Beside its balance the chip has less room on its seal's side, which had put the seal alone 2 px left of the chip's middle; the
    // room either side now comes to the same, so the top bar keeps its width
    const [, right, , left] = value('.wallet-chip', 'padding').split(' ').map(parseFloat);
    expect([left, right]).toEqual([8, 12]);
    expect((left ?? 0) + (right ?? 0)).toBe(2 * parseFloat(value('.wallet-chip', 'padding-inline', phone)));
  });
});
