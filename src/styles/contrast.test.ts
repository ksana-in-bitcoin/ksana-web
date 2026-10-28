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
      const head = (text.slice(start, i).split(';').pop() ?? '').trim();
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

/** The declarations of every rule of this selector outside an at-rule, of which there is one at least */
const rule = (name: string, selector: string) => {
  const bodies = rulesOf(name)
    .filter((r) => r.at.length === 0 && r.selector === selector)
    .map((r) => r.body);
  expect(bodies.length, `${name}: ${selector}`).toBeGreaterThan(0);
  return bodies.join('\n');
};

type Theme = 'light' | 'dark';

/**
 * The custom properties tokens.css gives the page's root where the system asks for this theme and this contrast and the page has this
 * theme chosen, or none, as the cascade picks them: of the rules whose conditions hold, the one of the highest specificity and, of those,
 * the last
 */
const page = (system: Theme, chosen?: Theme, asked: 'no-preference' | 'more' = 'no-preference'): Record<string, string> => {
  // The conditions tokens.css asks of the system; one of a width or a pointer does not hold here, as no colour is set under it
  const conditions: Record<string, boolean> = { '(prefers-color-scheme: dark)': system === 'dark', '(prefers-contrast: more)': asked === 'more' };
  const selectors: Record<string, boolean> = {
    ':root': true,
    ':root[data-theme="dark"]': chosen === 'dark',
    ':root:not([data-theme="light"])': chosen !== 'light',
  };
  const won: Record<string, { value: string; specificity: number }> = {};
  for (const r of rulesOf('tokens.css').filter((r) => r.selector.startsWith(':root'))) {
    const matches = selectors[r.selector];
    if (matches === undefined) throw new Error(`a selector of the root this test does not read: ${r.selector}`);
    const holds = r.at.every((a) => a.startsWith('@media ') && a.slice(7).split(' and ').every((c) => conditions[c] ?? false));
    if (!matches || !holds) continue;
    // `:root` counts as a class, and so does an attribute, also within `:not()`
    const specificity = r.selector.split(/:root|\[/).length - 1;
    for (const [, name = '', value = ''] of r.body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      if (specificity >= (won[name]?.specificity ?? 0)) won[name] = { value: value.trim(), specificity };
    }
  }
  return Object.fromEntries(Object.entries(won).map(([name, { value }]) => [name, value]));
};

/** The relative luminance of a colour written as #rrggbb, as WCAG reckons it */
const luminance = (hex: string | undefined) => {
  if (hex === undefined || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a colour written as #rrggbb: ${hex}`);
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG's contrast ratio of two colours */
const contrast = (a: string | undefined, b: string | undefined) => {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Each way a page is given its theme: the one its system asks for, or the one chosen on the page over either */
const THEMED = (['light', 'dark'] as const).flatMap((system) =>
  ([undefined, 'light', 'dark'] as const).map((chosen) => ({ system, chosen, theme: chosen ?? system, label: `${system} system, ${chosen ?? 'no'} theme chosen` })),
);

/** What a field sits on: the page, a card, and the inset ground of path C's details, where its fee rate and its outputs are typed */
const FIELD_GROUNDS = ['bg', 'surface', 'surface-2'];

describe('A field', () => {
  it('has an edge 3:1 at least against what it sits on, in either theme (WCAG 1.4.11)', () => {
    for (const { system, chosen, theme, label } of THEMED) {
      const t = page(system, chosen);
      // The page takes the theme it is given: dark grounds where it is the dark one
      expect(luminance(t.bg) < 0.2, label).toBe(theme === 'dark');
      for (const ground of FIELD_GROUNDS) expect(contrast(t['line-field'], t[ground]), `${label}, on ${ground}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws that edge: a text field, a menu, the search box and the language menu', () => {
    for (const [name, selector] of [
      ['pages.css', '.input'],
      ['components.css', '.search-field'],
      ['pages.css', '.lang-select-input'],
    ] as const) {
      expect(rule(name, selector), selector).toContain('border: 1px solid var(--line-field);');
    }
  });

  // Its edge turns the accent, a change of hue more than of lightness: 1.6:1 from the resting edge in the light theme
  it('shows its focus by a ring outside its edge, 3:1 at least from what it sits on, of the error where it is marked invalid', () => {
    for (const [name, selector, ring] of [
      ['pages.css', '.input:focus', 'qing'],
      ['components.css', '.search-field:focus-within', 'qing'],
      ['pages.css', '.input[aria-invalid="true"]:focus', 'danger'],
    ] as const) {
      expect(rule(name, selector), selector).toContain(`box-shadow: 0 0 0 1px var(--${ring}), 0 0 0 4px var(--${ring}-soft);`);
      for (const { system, chosen, label } of THEMED) {
        const t = page(system, chosen);
        for (const ground of FIELD_GROUNDS) expect(contrast(t[ring], t[ground]), `${selector}, ${label}, on ${ground}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('A placeholder', () => {
  it('is drawn in the muted ink, 4.5:1 at least on a field in either theme, rather than in the browser’s own grey', () => {
    for (const { system, chosen, label } of THEMED) {
      const t = page(system, chosen);
      expect(contrast(t['ink-3'], t.surface), label).toBeGreaterThanOrEqual(4.5);
    }
    for (const [name, selector] of [
      ['pages.css', '.input::placeholder'],
      ['components.css', '.search-field input::placeholder'],
    ] as const) {
      // Firefox draws a placeholder fainter unless told otherwise
      expect(rule(name, selector), selector).toMatch(/\n\s*color: var\(--ink-3\);\n\s*opacity: 1;/);
    }
  });
});

/** Each ground text and marks sit on: the page, a card, the status strip and a hovered row */
const GROUNDS = ['bg', 'surface', 'surface-2', 'hover'];

/** What Increase Contrast raises, and the least it takes each to on every ground */
const RAISED: Record<string, number> = { 'ink-2': 9, 'ink-3': 7, 'line-field': 4.5, 'ink-4': 3.5, 'line-strong': 3.2, line: 2 };

describe('Increase Contrast', () => {
  it('takes the muted text to 7:1, a field’s edge to 4.5:1, the faintest ink to 3.5:1 and the lines to 2:1, on every ground', () => {
    for (const { system, chosen, label } of THEMED) {
      const t = page(system, chosen);
      const more = page(system, chosen, 'more');
      for (const [name, least] of Object.entries(RAISED)) {
        // Each a step nearer the ink than the theme's own
        expect(contrast(more[name], t.bg), `${label}: ${name}`).toBeGreaterThan(contrast(t[name], t.bg));
        for (const ground of GROUNDS) expect(contrast(more[name], more[ground]), `${label}: ${name} on ${ground}`).toBeGreaterThanOrEqual(least);
      }
      // The grounds and the colours of certainty stay as they are
      for (const name of Object.keys(t).filter((n) => !(n in RAISED) && n !== 'mark-empty')) expect(more[name], `${label}: ${name}`).toBe(t[name]);
    }
  });

  it('gives a theme the same whether the system asks for it or it is chosen on the page', () => {
    for (const { system, chosen, theme, label } of THEMED) {
      for (const asked of ['no-preference', 'more'] as const) {
        expect(page(system, chosen, asked), `${label}, ${asked}`).toEqual(page(theme, theme, asked));
      }
    }
  });

  it('raises a mark’s empty part less than the lines, so that what fills a tick or a bar stays 3:1 from it', () => {
    for (const { system, chosen, label } of THEMED) {
      const t = page(system, chosen);
      const more = page(system, chosen, 'more');
      // Without it the empty part is drawn as the light line
      expect(t['mark-empty'], label).toBe(t.line);
      for (const ground of GROUNDS) {
        expect(contrast(more['mark-empty'], more[ground]), `${label}: on ${ground}`).toBeGreaterThan(contrast(t['mark-empty'], t[ground]));
      }
      // A tick's colours, the gas bar's and the split bar's
      for (const fill of ['qing', 'mo', 'zhu', 'warn', 'danger', 'ink-3']) {
        expect(contrast(more['mark-empty'], more[fill]), `${label}: ${fill}`).toBeGreaterThanOrEqual(3);
      }
    }
    for (const [name, selector] of [
      ['components.css', '.ticks i'],
      ['pages.css', '.gas-bar'],
      ['pages.css', '.split-bar'],
      ['pages.css', '.mix-empty'],
    ] as const) {
      expect(rule(name, selector), selector).toContain('background: var(--mark-empty);');
    }
  });
});
