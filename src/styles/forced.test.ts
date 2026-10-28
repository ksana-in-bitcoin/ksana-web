import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Rule {
  selectors: string[];
  body: string;
  /** Inside an `@media` block that asks for forced colors (Windows' high contrast themes) */
  forced: boolean;
}

/**
 * A stylesheet's rules in their order, at any depth, without its comments: each with its selectors and its declarations, read from
 * the file (a test is given a stylesheet's import as an empty one)
 */
const rulesOf = (name: string): Rule[] => {
  const css = readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const walk = (text: string, forced: boolean) => {
    for (let at = 0; ; ) {
      const open = text.indexOf('{', at);
      if (open < 0) return;
      const prelude = text.slice(at, open).trim();
      // The block runs to the brace that closes it, past the blocks nested in it
      let end = open + 1;
      for (let depth = 1; end < text.length && depth > 0; end++) depth += text[end] === '{' ? 1 : text[end] === '}' ? -1 : 0;
      const inner = text.slice(open + 1, end - 1);
      if (prelude.startsWith('@')) walk(inner, forced || (prelude.startsWith('@media') && /forced-colors:\s*active/.test(prelude)));
      else rules.push({ selectors: prelude.split(',').map((s) => s.trim().replace(/\s+/g, ' ')), body: inner, forced });
      at = end;
    }
  };
  walk(css, false);
  return rules;
};

/** The two stylesheets in the order the page loads them (main.tsx), the later one winning where two rules are equally specific */
const rules = [...rulesOf('components.css'), ...rulesOf('pages.css')];

/** What forced colors give a selector: the declarations of every rule under them that names it */
const forced = (selector: string) =>
  rules
    .filter((r) => r.forced && r.selectors.includes(selector))
    .map((r) => r.body)
    .join('');

/** Whether a selector's rule under forced colors comes after every other rule that names it, which it would lose to otherwise */
const last = (selector: string) => {
  const named = rules.filter((r) => r.selectors.includes(selector));
  return named.length > 0 && named[named.length - 1]?.forced === true;
};

/** The colours forced colors leave as they are: the theme's own */
const system = /\b(Canvas|CanvasText|Highlight|GrayText|LinkText)\b/;

describe('Under forced colors', () => {
  it('the marks drawn as boxes of colour keep their grounds, painted in the colours of the theme', () => {
    // Each mark, and the box that keeps its colours (`forced-color-adjust: none`, inherited): the mark or the one holding it
    const marks = [
      ['.net-dot', '.net-dot'],
      ['.net-chip--rpc.net-chip--connecting .net-dot', '.net-chip--rpc.net-chip--connecting .net-dot'],
      ['.net-chip--rpc.net-chip--error .net-dot', '.net-chip--rpc.net-chip--error .net-dot'],
      ['.source-status--live .net-dot', '.net-dot'],
      ['.ticks i.on', '.ticks i'],
      ['.meter .meter-fill', '.meter'],
      ['.tracker-node--done .tracker-shape--qing', '.tracker-node--done .tracker-shape--qing'],
      ['.tracker-node--active .tracker-shape--seal', '.tracker-node--active .tracker-shape--seal'],
      ['.tracker-node--skipped::before', '.tracker-node--skipped::before'],
      ['.spark i', '.spark'],
      ['.mix-B', '.mix'],
      ['.mix-C', '.mix'],
      ['.gas-bar span', '.gas-bar'],
      ['.split-out-bar', '.split-out-bar'],
      ['.split-out-mark', '.split-out-mark'],
      ['.dot-sep', '.dot-sep'],
      ['.txs--on_btc .txs-dot', '.txs--on_btc .txs-dot'],
      ['.txs--stuck .txs-dot', '.txs--stuck .txs-dot'],
      ['.nav-link[aria-current="page"]::after', '.nav-link[aria-current="page"]::after'],
      ['.vf-arrow::after', '.vf-arrow::after'],
    ] as const;
    for (const [mark, keeper] of marks) {
      expect(forced(mark), mark).toMatch(system);
      expect(forced(keeper), keeper).toMatch(/forced-color-adjust: none;/);
      expect(last(mark), `${mark} comes last`).toBe(true);
    }
    // The step in progress at its full strength, in its highlight
    expect(forced('.tracker-node--active .tracker-shape--qing')).toMatch(/opacity: 1;/);
    // The wallet's split keeps the colours its key's marks keep, which forced colors leave alone in an SVG; its outflow, keyed by a
    // box as well, takes the same colour in both
    expect(forced('.split-final') + forced('.split-fast')).toBe('');
    expect(forced('.split-out-bar')).toBe(forced('.split-out-mark'));
    // What a shadow or a ground alone marked: the selected tab, the lock chosen, the suggestion picked by the arrow keys
    expect(forced('.tab--on')).toMatch(/border: 1px solid CanvasText;/);
    expect(forced('.lock-row--active')).toMatch(/outline: 1px solid CanvasText;/);
    expect(forced('.search-hit--on')).toMatch(/outline: 2px solid Highlight;/);
    // A menu's arrow, drawn with gradients that forced colors drop: the system's own
    expect(forced('select.input')).toMatch(/appearance: auto;/);
  });

  it('are read from every block that asks for them, nested ones too, and from every rule naming a selector', () => {
    const sample = rules.filter((r) => r.forced);
    // The arrowheads of a phone's Verify page, in a block of their own (forced colors and a narrow screen)
    expect(sample.filter((r) => r.selectors.includes('.vf-arrow::after'))).toHaveLength(2);
    expect(rules.some((r) => !r.forced && r.selectors.includes('.vf-arrow::after'))).toBe(true);
  });
});
