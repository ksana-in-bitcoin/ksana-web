import type { Locale } from '../i18n';

/**
 * The faces a page is first drawn in, asked for as soon as the page's script runs: the figures' (IBM Plex Mono, whose three weights
 * src/main.tsx imports) on every page, and in Simplified Chinese the Han file of the headings' (base.css; index.html asks for the
 * Latin one with the page). A browser downloads a face only for text it draws, so the first load drew a page's figures in the system's
 * monospace font and set them in their own a round trip later, which moved what is under a block's or an operation's title by 4 px.
 * Asked for here, they arrive while the page connects
 */
export function loadFaces(locale: Locale): void {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  const load = (font: string, text?: string) => {
    fonts.load(font, text).catch(() => undefined);
  };
  for (const weight of [400, 500, 600]) load(`${weight} 1em "IBM Plex Mono"`);
  // A character of the Han file's range: a Latin one would ask for the Latin file
  if (locale === 'zh-CN') load('600 1em "Ksana Serif"', '\u4e00');
}
