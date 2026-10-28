import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RpcTransportError } from '@ksana/sdk';
import { explainRpcError } from '../app/SourcePanel';
import { t } from '../i18n';
import { LookupView, lookupShown } from './Lookup';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** The chain the page draws from: a node's, whose connection a test sets */
const view = vi.hoisted(() => ({ chain: { kind: 'rpc', config: { url: 'http://node.test' }, conn: { state: 'live' }, retry: () => {} } }));
vi.mock('../app/store', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/store')>()), useChain: () => view.chain }));

/** Text as the markup has it */
const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

describe("What a page opened from a link shows of its lookup", () => {
  const loading = { state: 'loading' as const };
  const missing = { state: 'missing' as const, message: 'No such block' };
  const failed = { state: 'error' as const, message: 'node unreachable' };

  it('the lookup while it reads, even once what it asked for is in the cache: it ends once the assets it came upon are named', () => {
    expect(lookupShown(loading, false)).toBe(loading);
    expect(lookupShown(loading, true)).toBe(loading);
  });

  it('the page itself once the object is in and no lookup reads; the lookup asked for, before its first answer, while it is not', () => {
    expect(lookupShown(undefined, true)).toBeUndefined();
    expect(lookupShown(undefined, false)).toEqual({ state: 'loading' });
  });

  it('a lookup that found nothing or failed, unless the object came in since (a pending operation included later)', () => {
    expect(lookupShown(missing, false)).toBe(missing);
    expect(lookupShown(failed, false)).toBe(failed);
    expect(lookupShown(missing, true)).toBeUndefined();
    expect(lookupShown(failed, true)).toBeUndefined();
  });
});

describe('A page being looked up', () => {
  it('takes the screen, the footer below it, as the page that follows has it', () => {
    expect(source('./Lookup.tsx')).toContain('<div className="page narrow-page page--lookup" aria-busy="true">');
    expect(source('../styles/pages.css')).toMatch(/\n\.page--lookup \{\n {2}min-height: 100vh;\n\}/);
  });
});

describe('A page whose lookup failed', () => {
  const lost = new RpcTransportError('ksana_getBlock: request failed: Load failed');
  const failed = { state: 'error' as const, message: lost.message, error: lost };
  const html = () => renderToStaticMarkup(createElement(LookupView, { kind: 'block', id: '3', lookup: failed, path: '/block/3' }));

  it("says why in words, the error's own text below, on the screen it was looked up on", () => {
    view.chain.conn = { state: 'live' };
    const page = html();
    expect(page).toContain(escaped(explainRpcError(lost, 'http://node.test')));
    expect(page).toContain(escaped(t().shell.connecting.detail(lost.message)));
    expect(page).toContain('class="page narrow-page page--lookup"');
    expect(page).not.toContain(escaped(t().ui.lookupAgain));
  });

  it('says it is looked up again once the node answers, where the page says the node is disconnected', () => {
    view.chain.conn = { state: 'error' };
    expect(html()).toContain(escaped(t().ui.lookupAgain));
  });
});

describe('A page that shows commit transactions without their fee', () => {
  it('asks for what they spend each time it draws the chain anew, so that a read that failed is tried again a minute on (`askCommitFees`)', () => {
    // These tests run no effects: the hook's is keyed on the chain's version as well as on the commits
    expect(source('./Lookup.tsx')).toContain(
      "  const drawn = sim.getVersion();\n  useEffect(() => {\n    if (sim.kind === 'rpc' && key) void sim.askCommitFees(key.split(','));\n  }, [sim, key, drawn]);",
    );
  });
});
