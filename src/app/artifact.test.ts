import { describe, expect, it } from 'vitest';
import { outsideRefs } from '../../scripts/style-refs.mjs';

// The single-file preview's guard (scripts/inline-artifact.mjs), on stylesheets written as Vite and lightningcss build them
describe('the single-file preview’s stylesheet', () => {
  it('may carry data URLs, in any case, and point at fragments of the page', () => {
    expect(outsideRefs('@font-face{src:url(data:font/woff2;base64,d09GMgABAAA)}a{background:url(DATA:image/png;base64,iVBORw0)}b{filter:url(#blur)}')).toEqual([]);
  });

  it('may carry an SVG Vite inlined with its own url(#id) inside: a gradient, a clip path, a mask', () => {
    const svg = "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%3e%3clinearGradient%20id='g'/%3e%3crect%20fill='url(%23g)'%20clip-path='url(%23c)'%20mask='url(%23m)'/%3e%3c/svg%3e";
    expect(outsideRefs(`.x{background:url("${svg}")}.y{background:url('${svg.replace(/'/g, "\\'")}')}`)).toEqual([]);
  });

  it('refuses an @import, which Vite leaves only for a file it does not inline', () => {
    expect(outsideRefs('@import "https://fonts.example/a.css";@import url(https://fonts.example/b.css) screen;a{color:red}')).toEqual([
      '@import "https://fonts.example/a.css"',
      '@import url(https://fonts.example/b.css) screen',
    ]);
  });

  it('refuses a url() of a file, quoted or not, in any case, a quote in its name included', () => {
    const style = "a{background:url(./a.png)}b{background:URL(\"https://x.example/b.png\")}c{background:url(//cdn.example/c.png)}d{background:url('./it\\'s.png')}e{src:url(./it\\'s.woff2)}";
    expect(outsideRefs(style)).toEqual(['./a.png', 'https://x.example/b.png', '//cdn.example/c.png', "./it\\'s.png", "./it\\'s.woff2"]);
  });
});
