// What a stylesheet built by Vite still asks for outside itself: the single-file preview's guard (scripts/inline-artifact.mjs)

const URL_RE = /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^'"\\)\s])*))\s*\)/gi;

/**
 * The references a built stylesheet makes outside itself: an `@import`, which Vite leaves only for a file it does not inline, and a
 * `url()`, quoted or not and in any case, that is neither a data URL nor a fragment of the page (`url(#blur)`). A quoted data URL is
 * set aside first: an SVG Vite inlined keeps its own `url(#gradient)` inside, which is the image's and not the stylesheet's.
 * @param {string} style
 * @returns {string[]}
 */
export function outsideRefs(style) {
  const refs = new Set();
  const bare = style
    .replace(/"data:(?:\\.|[^"\\])*"|'data:(?:\\.|[^'\\])*'/gi, '"data:"')
    .replace(/@import\s*([^;]*);?/gi, (_, what) => {
      refs.add(`@import ${what.trim()}`);
      return '';
    });
  for (const m of bare.matchAll(URL_RE)) {
    const ref = m[1] ?? m[2] ?? m[3] ?? '';
    if (!/^(data:|#)/i.test(ref)) refs.add(ref);
  }
  return [...refs];
}
