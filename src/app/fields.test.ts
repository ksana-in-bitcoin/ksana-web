import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The page's own components, as written (their tests aside)
const sources = Object.entries(import.meta.glob<string>('../**/*.tsx', { query: '?raw', import: 'default', eager: true })).filter(([path]) => !path.endsWith('.test.tsx'));

/** The page's stylesheets, as written (a test is given a stylesheet's import as an empty one) */
const styles = new URL('../styles/', import.meta.url);
const sheets = readdirSync(styles).filter((name) => name.endsWith('.css')).map((name) => [name, readFileSync(new URL(name, styles), 'utf8')] as const);

/** A source without its comments, where a field named in one is no field (a `//` after a colon or a quote is a URL's or a string's, and stays) */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

/** The `<input>` and `<textarea>` elements written in a source, as their JSX */
const fieldsOf = (source: string) => [...code(source).matchAll(/<(?:input|textarea)\b[\s\S]*?\/>/g)].map((m) => m[0]);

/** A field that takes text: a textarea, or an input of no type, a textual one, or one set by an expression */
const textual = (field: string) => {
  const type = /(?<![\w-])type=(?:"([^"]*)"|\{)/.exec(field);
  return !type || type[1] === undefined || /^(text|search|url|email|tel|password)$/.test(type[1]);
};

/** A field that opens a keypad of digits, where nothing is capitalized or corrected */
const numeric = (field: string) => {
  const mode = /inputMode=("[^"]*"|\{[^}]*\})/.exec(field)?.[1];
  const words = mode ? [...mode.matchAll(/['"](\w+)['"]/g)].map((m) => m[1]) : [];
  return words.length > 0 && words.every((w) => w === 'numeric' || w === 'decimal');
};

describe('text fields', () => {
  // The page has no field for prose: each takes an address, a hash, an ID, a URL or a list of outputs. iOS capitalizes the first letter
  // typed into a field and corrects words unless told not to, and "Tb1p…", in mixed case, is no address
  it('keep what is typed, capitalized and corrected by nothing', () => {
    const checked: string[] = [];
    const missing: string[] = [];
    for (const [path, source] of sources) {
      for (const field of fieldsOf(source)) {
        if (!textual(field) || numeric(field)) continue;
        checked.push(field);
        if (!field.includes('autoCapitalize="off"') || !field.includes('autoCorrect="off"')) missing.push(`${path}: ${field.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }
    expect(missing).toEqual([]);
    for (const id of ['send-to', 'send-utxos', 'topup-exchange', 'topup-manual', 'call-arg']) expect(checked.some((f) => f.includes(`id="${id}"`))).toBe(true);
    expect(checked.some((f) => f.includes('type="search"'))).toBe(true);
  });

  it('are read from the code, not from its comments, and only those that take text', () => {
    const source = `// <input id="a" />\n/* <input id="b" /> */\nconst u = 'https://x.example//y';\n<input id="c" placeholder="https://x.example" />\n<textarea id="d" />`;
    expect(fieldsOf(source).map((f) => /id="(\w)"/.exec(f)?.[1])).toEqual(['c', 'd']);
    expect(['<input />', '<input type="url" />', '<input type={kind} />', '<textarea />'].every(textual)).toBe(true);
    expect(['<input type="checkbox" />', '<input type="radio" />', '<input type="range" />', '<input type="file" />'].some(textual)).toBe(false);
  });

  // Forced colors (Windows' high contrast themes) drop box shadows and give a border the colour it has unfocused: a field, and the
  // search box, ringed by a shadow alone showed no focus at all there
  it('show their focus under forced colors, which draw an outline', () => {
    // Every rule of the stylesheets, at any depth and without their comments, that names a focus among its selectors and draws a shadow
    const rings = sheets.flatMap(([path, css]) =>
      [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .map(([, selectors = '', body = '']) => ({ path, selector: selectors.trim().replace(/\s+/g, ' '), body }))
        .filter((r) => r.selector.includes(':focus') && /(^|;)\s*box-shadow:(?!\s*none\b)/.test(r.body)),
    );
    expect(rings.map((r) => r.selector)).toEqual(
      expect.arrayContaining(['.input:focus', '.input[aria-invalid="true"]:focus', '.search-field:focus-within']),
    );
    // A field marked invalid is a field, with the outline `.input:focus` gives it
    for (const r of rings.filter((r) => r.selector !== '.input[aria-invalid="true"]:focus')) {
      expect(r.body, `${r.path}: ${r.selector}`).toMatch(/(^|;)\s*outline: 2px solid transparent;/);
    }
  });
});
