import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Amount, Figures, PathBadge, WebAddress } from './Values';

describe('An amount', () => {
  // 80,661.08938801 Wizards, in base units under its ID until the node names it
  const value = 8_066_108_938_801n;

  it('in an asset the node has yet to name shows as being read, never as its base units', () => {
    const html = renderToStaticMarkup(createElement(Amount, { value, asset: { decimals: 0, symbol: 'Asset 0841ac', pending: true } }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('>…<');
    expect(html).not.toContain('066');
    // Named, in its decimals; and an asset the node could not name, in base units under its ID
    expect(renderToStaticMarkup(createElement(Amount, { value, asset: { decimals: 8, symbol: 'Wizards' } }))).toContain('80,<wbr/>661');
    expect(renderToStaticMarkup(createElement(Amount, { value, asset: { decimals: 0, symbol: 'Asset 0841ac' } }))).toContain('8,<wbr/>066,<wbr/>108');
  });
});

describe('Figures in running text', () => {
  const html = (text: string) => renderToStaticMarkup(createElement(Figures, { text }));

  it('are set in the monospace face, and the words around them in the face of the text', () => {
    expect(html('4 · #385 – #387, incl. 1 parallel block')).toBe(
      '<span class="num">4</span> · <span class="num">#385</span> – <span class="num">#387</span>, incl. <span class="num">1</span> parallel block',
    );
    expect(html('4 block bodies')).toBe('<span class="num">4</span> block bodies');
  });

  it('keep their commas, decimal point and a parallel block’s prime, but not a full stop after them', () => {
    expect(html('gas 206,858 / declared limits 520,000')).toBe('gas <span class="num">206,858</span> / declared limits <span class="num">520,000</span>');
    expect(html('data 1.51 KiB')).toBe('data <span class="num">1.51</span> KiB');
    expect(html('Settled up to #385′.')).toBe('Settled up to <span class="num">#385′</span>.');
    expect(html('No figures')).toBe('No figures');
  });
});

describe('A path badge', () => {
  it('gives a screen reader the path’s name, not its letter alone, and nothing where the name stands beside it', () => {
    const alone = renderToStaticMarkup(createElement(PathBadge, { path: 'B' }));
    expect(alone).toContain('aria-hidden="true">B</span>');
    expect(alone).toContain('<span class="sr-only">Path B · Sponsored</span>');
    expect(alone).not.toMatch(/^<span[^>]*aria-hidden/);
    const named = renderToStaticMarkup(createElement(PathBadge, { path: 'C', named: true }));
    expect(named).toMatch(/^<span class="path-badge path-badge--C"[^>]* aria-hidden="true">/);
    expect(named).not.toContain('sr-only');
  });
});

describe('A web address', () => {
  const html = (url: string) => renderToStaticMarkup(createElement(WebAddress, { url }));

  it('may break after its "//" and before a "." or a "/", never inside a name', () => {
    expect(html('https://signet.ksana.network/rpc')).toBe('https://<wbr/>signet<wbr/>.ksana<wbr/>.network<wbr/>/rpc');
    expect(html('http://127.0.0.1:18545/')).toBe('http://<wbr/>127<wbr/>.0<wbr/>.0<wbr/>.1:18545/');
  });

  it('as a path alone, breaks before its parts only', () => {
    expect(html('/rpc')).toBe('/rpc');
    expect(html('/node/rpc')).toBe('/node<wbr/>/rpc');
  });
});
