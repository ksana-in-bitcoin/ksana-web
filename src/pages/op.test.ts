import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RawBytes } from './OpDetail';

describe('Bytes an operation carries that the page cannot read', () => {
  it('give their length on a line of its own below them, never beside a hex digit', () => {
    // A call's arguments on a node, 64 bytes: after the hex on its line, a phone's wrapping took its last digit down to the length,
    // which read "0 · 64 bytes"
    const hex = `${'00'.repeat(36)}65cd1d${'00'.repeat(25)}`;
    expect(renderToStaticMarkup(createElement(RawBytes, { hex }))).toBe(
      `<span class="raw-bytes"><span class="mono small break">${hex}</span><span class="soft small">64\u00a0bytes</span></span>`,
    );
  });
});
