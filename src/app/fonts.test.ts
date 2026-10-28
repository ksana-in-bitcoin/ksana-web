import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '../i18n';
import { loadFaces } from './fonts';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** What `loadFaces` asks `document.fonts` for, in the order asked */
function asked(locale: Locale): [string, string | undefined][] {
  const calls: [string, string | undefined][] = [];
  vi.stubGlobal('document', {
    fonts: {
      load: (font: string, text?: string) => {
        calls.push([font, text]);
        return Promise.resolve([]);
      },
    },
  });
  loadFaces(locale);
  return calls;
}

/** The @font-face rules of a stylesheet, each with its family, weight and the code point ranges it takes */
function faces(css: string) {
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
    const rule = m[1] ?? '';
    const prop = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(rule)?.[1]?.trim() ?? '';
    const ranges = prop('unicode-range')
      .split(',')
      .filter(Boolean)
      .map((r) => r.trim().replace(/^U\+/i, '').split('-').map((h) => parseInt(h, 16)));
    return { family: prop('font-family').replace(/["']/g, ''), weight: prop('font-weight'), ranges };
  });
}

const takes = (ranges: number[][], c: number) => ranges.length === 0 || ranges.some(([a = -1, b = a]) => c >= a && c <= b);

describe('the faces a page is first drawn in', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const FIGURES = [
    ['400 1em "IBM Plex Mono"', undefined],
    ['500 1em "IBM Plex Mono"', undefined],
    ['600 1em "IBM Plex Mono"', undefined],
  ];

  it("asks for the figures' three weights in every language, and the headings' Han file in Simplified Chinese", () => {
    for (const locale of ['en', 'es', 'zh-TW', 'ja', 'ko'] as const) expect(asked(locale), locale).toEqual(FIGURES);
    expect(asked('zh-CN')).toEqual([...FIGURES, ['600 1em "Ksana Serif"', '\u4e00']]);
  });

  it('names faces the stylesheets declare: the weights main.tsx imports, and the heading face with a file taking the character asked with', () => {
    const main = source('../main.tsx');
    for (const weight of [400, 500, 600]) {
      expect(main).toContain(`import '@fontsource/ibm-plex-mono/latin-${weight}.css';`);
      const css = source(`../../node_modules/@fontsource/ibm-plex-mono/latin-${weight}.css`);
      expect(faces(css).map((f) => [f.family, f.weight])).toEqual([['IBM Plex Mono', String(weight)]]);
    }
    const heading = faces(source('../styles/base.css')).filter((f) => f.family === 'Ksana Serif');
    expect(heading.filter((f) => takes(f.ranges, 0x4e00)).map((f) => f.weight)).toEqual(['500 900']);
    expect(heading.filter((f) => takes(f.ranges, 0x4e00) && takes(f.ranges, 0x41))).toEqual([]);
  });

  it('does nothing in a browser without font loading, and a face that fails to load leaves no rejection unhandled', async () => {
    vi.stubGlobal('document', {});
    expect(() => loadFaces('en')).not.toThrow();
    let asked = 0;
    vi.stubGlobal('document', {
      fonts: {
        load: () => {
          asked++;
          return Promise.reject(new Error('network'));
        },
      },
    });
    const unhandled: unknown[] = [];
    const note = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', note);
    try {
      expect(() => loadFaces('zh-CN')).not.toThrow();
      // Node reports a rejection no one handles once the microtasks have run, before the next task
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', note);
    }
    expect(asked).toBe(4);
    expect(unhandled).toEqual([]);
  });
});
