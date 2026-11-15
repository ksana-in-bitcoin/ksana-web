import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Block, Entry } from '../chain/types';
import { EntryCounts } from './Lists';

describe('The entry counts of a block', () => {
  const block = (...entries: Entry[]): Block => ({ entries: entries.map((entry) => ({ entry }) as Block['entries'][number]) }) as Block;
  const text = (b: Block) => renderToStaticMarkup(createElement(EntryCounts, { block: b })).replace(/<[^>]+>/g, ' ');
  const sponsored: Entry = { kind: 'Sponsored', opId: '0x01' };
  const aggregate: Entry = { kind: 'Aggregate', s: '0x02' };
  const unlock: Entry = { kind: 'Unlock', height: 1, index: 0 };

  it('do not take the aggregate entry for an unlock (core D-154)', () => {
    const html = renderToStaticMarkup(createElement(EntryCounts, { block: block(sponsored, aggregate) }));
    expect(html).not.toMatch(/unlock/i);
    expect(text(block(sponsored, aggregate))).toMatch(/2\s+B1/);
  });

  it('show the one unlock of a block that has path B entries too, once', () => {
    const html = renderToStaticMarkup(createElement(EntryCounts, { block: block(unlock, sponsored, aggregate) }));
    expect(html).toContain('>unlock<');
    expect(html).not.toContain('×');
    expect(html).toContain('Unlock 1');
  });
});
