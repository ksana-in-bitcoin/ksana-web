import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeaderList } from './Carried';

describe('The headers a payload carries', () => {
  it('are counted by name, the count alone where the page knows none of their blocks', () => {
    // A payload whose blocks the page has yet to read: "3 block headers", with no dot after it before heights it does not have
    const text = renderToStaticMarkup(createElement(HeaderList, { count: 3, blocks: [] })).replace(/<[^>]+>/g, '');
    expect(text).toBe('3\u00a0block headers');
  });
});
