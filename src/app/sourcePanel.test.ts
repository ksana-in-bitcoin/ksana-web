import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RpcTransportError } from '@ksana/sdk';
import { t } from '../i18n';

/** A node's chain as the data source panel reads it, connected, its tip read two seconds ago */
const view = vi.hoisted(() => {
  const config = { url: 'http://node.test/rpc', indexerUrl: 'http://node.test/indexer', btcUrl: 'http://node.test/btc', chain: 'signet' };
  return {
    now: 1_000_000,
    chain: {
      kind: 'rpc',
      config,
      ready: true,
      hasIndexer: true,
      indexerHalted: null,
      tip: { header: { height: 2307 } },
      conn: { state: 'live', ws: false, lastSync: 998_000 } as Record<string, unknown>,
    },
    pref: { kind: 'rpc', ...config },
  };
});
vi.mock('./store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store')>()),
  useChain: () => view.chain,
  useSource: () => view.pref,
  currentSource: () => view.pref,
  sourceFromLink: () => false,
  useNow: () => view.now,
}));
const { SourcePanel } = await import('./SourcePanel');

/** The text of each element with this role, its markup's tags left out */
function spoken(html: string, role: string): string[] {
  const out: string[] = [];
  let at = html.indexOf(`role="${role}"`);
  while (at >= 0) {
    const open = html.lastIndexOf('<', at);
    const tag = /^<(\w+)/.exec(html.slice(open))?.[1] ?? 'span';
    // Its end: the closing tag that brings the nesting of its own kind back to zero
    let depth = 0;
    let end = open;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    re.lastIndex = open;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) {
        end = m.index;
        break;
      }
    }
    out.push(html.slice(html.indexOf('>', at) + 1, end).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    at = html.indexOf(`role="${role}"`, end);
  }
  return out;
}

describe('The data source panel, to a screen reader', () => {
  const s = t().source;

  it('says the state and the node as they change, not the tip or the last read, which change with every read', () => {
    view.chain.conn = { state: 'live', ws: false, lastSync: 998_000 };
    const html = renderToStaticMarkup(createElement(SourcePanel));
    // Both are on the panel, outside what is said
    expect(html).toContain(s.tip('2,307'));
    expect(html).toContain(s.lastSync(''));
    const said = spoken(html, 'status');
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(s.state.live);
    expect(said[0]).toContain('node.test/rpc');
    expect(said[0]).not.toContain('2,307');
    expect(said[0]).not.toContain(s.lastSync(''));
    expect(spoken(html, 'alert')).toEqual([]);
  });

  it('says at once why the node cannot be reached', () => {
    const lost = new RpcTransportError('ksana_getChainInfo: request failed: Failed to fetch');
    view.chain.conn = { state: 'error', ws: false, lastSync: 998_000, message: lost.message, error: lost };
    const html = renderToStaticMarkup(createElement(SourcePanel));
    expect(spoken(html, 'status')[0]).toContain(s.state.error);
    const alert = spoken(html, 'alert');
    expect(alert).toHaveLength(1);
    expect(alert[0]).toContain('node.test');
  });
});
