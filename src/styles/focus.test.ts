import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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

/** A declaration's value from the rules of this selector under exactly these at-rules: the last that sets it, which wins over the others */
const value = (selector: string, prop: string, at: string[] = []) =>
  rules
    .filter((r) => r.selector === selector && r.at.join(' ') === at.join(' '))
    .map((r) => r.body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`))?.[1]?.trim())
    .filter((v) => v !== undefined)
    .pop() ?? '';

const tokens = css('tokens.css');

/** The pixels a length comes to, without a safe area (as on a desktop) and with the send page's bar as given */
const px = (length: string, footBar = 0): number => {
  const token = (name: string) => px(tokens.match(new RegExp(`\\n\\s*${name}: ([^;]+);`))?.[1] ?? 'NaN');
  const terms = length.replace(/^calc\((.*)\)$/, '$1').split(/ \+ (?![^(]*\))/);
  return terms.reduce((sum, term) => {
    if (/^env\(safe-area-inset-\w+, 0px\)$/.test(term)) return sum;
    if (term === 'var(--foot-bar, 0px)') return sum + footBar;
    const v = term.match(/^var\((--[\w-]+)\)$/);
    return sum + (v ? token(v[1] ?? '') : Number(term.match(/^(\d+)px$/)?.[1] ?? NaN));
  }, 0);
};

/** The root while the focus is in what scrolls under the bars (the status strip, the page and the footer), listed at no weight (`:where`) */
const content = 'html:has(:where(.strip, #main, .footer) :focus)';
/** The root while the focus is on what the send page's pinned bar holds (in the page): a class more, which outweighs the rule above */
const sendBar = 'html:has(.send-sticky :focus)';
const phone = ['@media (max-width: 860px)'];
const sideways = ['@media (max-height: 480px) and (pointer: coarse)'];

describe('What the keyboard moves to', () => {
  it('is scrolled clear of the top bar, which stays over the page, with room for its ring', () => {
    const room = value(content, 'scroll-padding-top');
    // The bar: its row, the line below it and, on an iPhone, the band of the status bar it reaches under
    const bar = px(value('.topbar-inner', 'height')) + px(value('.topbar', 'border-bottom').split(' ')[0] ?? '');
    expect(value('.topbar', 'position')).toBe('sticky');
    expect(value('.topbar', 'padding-top')).toBe('env(safe-area-inset-top, 0px)');
    expect(room).toContain('env(safe-area-inset-top, 0px)');
    expect(px(room)).toBeGreaterThanOrEqual(bar + 8);
    // Held sideways, a phone's top bar scrolls away with the page
    expect(value('.topbar', 'position', sideways)).toBe('static');
    expect(px(value(content, 'scroll-padding-top', sideways))).toBe(8);
  });

  it('stands clear of a phone’s bottom bar where the send page’s pinned bar stands, and above that bar while it is pinned', () => {
    const room = value(content, 'scroll-padding-bottom', phone);
    const bar = px(value('.bottomnav a', 'min-height', phone)) + px(value('.bottomnav', 'border-top', phone).split(' ')[0] ?? '');
    expect(value('.bottomnav', 'position', phone)).toBe('fixed');
    expect(room).toContain('env(safe-area-inset-bottom, 0px)');
    expect(px(room)).toBeGreaterThanOrEqual(bar + 8);
    expect(px(room)).toBe(px(value('.send-sticky', 'bottom', phone)));
    // The pinned bar's height and 8 px (`clearFootBar`), on a phone and in a narrow window without the bottom bar
    expect(px(room, 68)).toBe(px(room) + 68);
    expect(px(value(content, 'scroll-padding-bottom'), 68)).toBe(12 + 68);
  });

  it('leaves the bars’ own links and fields where they are: the root keeps room only while the focus is in what scrolls under them', () => {
    // Room kept always took what the bars hold, always in view, for hidden under them, and the page moved by half a window when it
    // took the focus. Room at the sides is a table's own, within which it scrolls (spacing.test.ts)
    const kept = rules.filter((r) => /(?:^|[;\s])scroll-padding(?:-top|-bottom|-block[\w-]*)?:/.test(r.body)).map((r) => r.selector);
    expect([...new Set(kept)].sort()).toEqual([content, sendBar].sort());
    // Nor does an element keep room of its own, which Chromium does not heed when the focus comes to it
    expect(rules.filter((r) => /(?:^|[;\s])scroll-margin/.test(r.body))).toEqual([]);
  });

  it('on the send page’s pinned bar is kept clear of the other bars, but not of the bar itself, which would move the page under it', () => {
    // Without the bar's own room (`--foot-bar`), on a phone and in a narrow window
    for (const at of [[], phone]) {
      const own = value(sendBar, 'scroll-padding-bottom', at);
      expect(own).not.toContain('--foot-bar');
      expect(px(own)).toBeGreaterThan(0);
      expect(px(own)).toBe(px(value(content, 'scroll-padding-bottom', at)));
    }
  });
});
