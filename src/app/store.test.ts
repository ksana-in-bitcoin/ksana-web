import { describe, expect, it, vi } from 'vitest';
import { sameSource, savedSource, shownAddress, startingSource, withoutUser } from './store';
import type { SourcePref } from '../chain/source';

const BASE = 'https://signet.ksana.network/#/blocks';
const OWN: SourcePref = { kind: 'rpc', url: '/rpc', chain: 'signet', indexerUrl: '/indexer', btcUrl: '/btc' };
const OTHER: SourcePref = { kind: 'rpc', url: 'https://node.example/rpc', chain: 'signet', btcUrl: 'https://node.example/btc' };
const SAVED: SourcePref = { kind: 'rpc', url: 'http://127.0.0.1:18545', chain: 'devnet' };

describe('the data source a page starts with', () => {
  it('a link on a copy published for a network names another node: asked first, the page starting where it would have', () => {
    expect(startingSource({ link: OTHER, own: OWN, agreed: null, saved: null }, BASE)).toEqual({ source: OWN, fromLink: false, asked: OTHER });
    // A node chosen in the data source panel stays the one in use while the reader answers
    expect(startingSource({ link: OTHER, own: OWN, agreed: null, saved: SAVED }, BASE)).toEqual({ source: SAVED, fromLink: false, asked: OTHER });
  });

  it('a link this tab agreed to, the copy’s own addresses or the simulator: taken for the visit without asking', () => {
    expect(startingSource({ link: OTHER, own: OWN, agreed: OTHER, saved: null }, BASE)).toEqual({ source: OTHER, fromLink: true, asked: null });
    const own = { kind: 'rpc', url: 'https://signet.ksana.network/rpc', chain: 'signet', indexerUrl: '/indexer', btcUrl: 'https://signet.ksana.network/btc' } as const;
    expect(startingSource({ link: own, own: OWN, agreed: null, saved: SAVED }, BASE)).toEqual({ source: own, fromLink: true, asked: null });
    expect(startingSource({ link: { kind: 'sim' }, own: OWN, agreed: null, saved: null }, BASE)).toEqual({ source: { kind: 'sim' }, fromLink: true, asked: null });
  });

  it('a copy with no network of its own (the development server) takes a link’s node for the visit', () => {
    expect(startingSource({ link: SAVED, own: null, agreed: null, saved: null }, 'http://localhost:5173/')).toEqual({ source: SAVED, fromLink: true, asked: null });
  });

  it('a copy that could not read its deployment.json asks about a link’s node, and starts where it would have without the link', () => {
    expect(startingSource({ link: OTHER, own: 'unknown', agreed: null, saved: null }, BASE)).toEqual({ source: { kind: 'sim' }, fromLink: false, asked: OTHER });
    expect(startingSource({ link: OTHER, own: 'unknown', agreed: null, saved: SAVED }, BASE)).toEqual({ source: SAVED, fromLink: false, asked: OTHER });
    // The node this tab agreed to, or the simulator, is taken as before
    expect(startingSource({ link: OTHER, own: 'unknown', agreed: OTHER, saved: null }, BASE)).toEqual({ source: OTHER, fromLink: true, asked: null });
    expect(startingSource({ link: { kind: 'sim' }, own: 'unknown', agreed: null, saved: null }, BASE)).toEqual({ source: { kind: 'sim' }, fromLink: true, asked: null });
    expect(startingSource({ link: null, own: 'unknown', agreed: null, saved: null }, BASE)).toEqual({ source: { kind: 'sim' }, fromLink: false, asked: null });
  });

  it('without a link: the panel’s choice, else the copy’s own network, else the simulator', () => {
    expect(startingSource({ link: null, own: OWN, agreed: OTHER, saved: SAVED }, BASE).source).toEqual(SAVED);
    expect(startingSource({ link: null, own: OWN, agreed: null, saved: { kind: 'sim' } }, BASE).source).toEqual({ kind: 'sim' });
    expect(startingSource({ link: null, own: OWN, agreed: null, saved: null }, BASE)).toEqual({ source: OWN, fromLink: false, asked: null });
    expect(startingSource({ link: null, own: null, agreed: null, saved: { kind: 'rpc', url: '', chain: 'devnet' } }, BASE).source).toEqual({ kind: 'sim' });
  });

  it('two sources are the same where they read from the same addresses, on the same network', () => {
    expect(sameSource(OWN, { ...OWN, url: 'https://signet.ksana.network/rpc' }, BASE)).toBe(true);
    expect(sameSource(OWN, { ...OWN, chain: 'devnet' }, BASE)).toBe(false);
    expect(sameSource(OWN, { kind: 'rpc', url: '/rpc', chain: 'signet', btcUrl: '/btc' }, BASE)).toBe(false);
    expect(sameSource(OWN, { ...OWN, btcUrl: 'https://node.example/btc' }, BASE)).toBe(false);
    expect(sameSource({ kind: 'sim' }, { kind: 'sim' }, BASE)).toBe(true);
    expect(sameSource({ kind: 'sim' }, OWN, BASE)).toBe(false);
  });
});

describe('a node an earlier version saved, perhaps from a link (the review of M36)', () => {
  it('on a copy published for a network, another node than its own is asked about, and the page starts from its own', () => {
    expect(savedSource({ saved: null, earlier: OTHER, own: OWN }, BASE)).toEqual({ saved: null, recheck: OTHER, settle: false });
    expect(startingSource({ link: null, own: OWN, agreed: null, saved: null }, BASE).source).toEqual(OWN);
  });

  it('the copy’s own addresses, the simulator, or any node where the copy has no network of its own: kept as the panel’s choice', () => {
    const own: SourcePref = { ...OWN, url: 'https://signet.ksana.network/rpc' };
    expect(savedSource({ saved: null, earlier: own, own: OWN }, BASE)).toEqual({ saved: own, recheck: null, settle: true });
    expect(savedSource({ saved: null, earlier: { kind: 'sim' }, own: OWN }, BASE)).toEqual({ saved: { kind: 'sim' }, recheck: null, settle: true });
    expect(savedSource({ saved: null, earlier: SAVED, own: null }, 'http://localhost:5173/')).toEqual({ saved: SAVED, recheck: null, settle: true });
  });

  it('while the copy’s own is unknown, it stands for the visit and is kept for a later one to ask about', () => {
    expect(savedSource({ saved: null, earlier: OTHER, own: 'unknown' }, BASE)).toEqual({ saved: OTHER, recheck: null, settle: false });
  });

  it('a choice made in the panel since stands, and the earlier one goes; so does one that names no address', () => {
    expect(savedSource({ saved: SAVED, earlier: OTHER, own: OWN }, BASE)).toEqual({ saved: SAVED, recheck: null, settle: true });
    expect(savedSource({ saved: null, earlier: { kind: 'rpc', url: '', chain: 'signet' }, own: OWN }, BASE)).toEqual({ saved: null, recheck: null, settle: true });
    expect(savedSource({ saved: SAVED, earlier: null, own: OWN }, BASE)).toEqual({ saved: SAVED, recheck: null, settle: false });
    expect(savedSource({ saved: null, earlier: null, own: OWN }, BASE)).toEqual({ saved: null, recheck: null, settle: false });
  });
});

describe('an address with a user part before its host', () => {
  it('is read and shown without it, where the user part reads as a host it is not', () => {
    expect(withoutUser('https://signet.ksana.network@node.example/rpc', BASE)).toBe('https://node.example/rpc');
    expect(withoutUser('//me:secret@node.example/rpc', BASE)).toBe('https://node.example/rpc');
    expect(withoutUser('/rpc', BASE)).toBe('/rpc');
    expect(withoutUser('https://node.example/rpc', BASE)).toBe('https://node.example/rpc');
  });

  it('is shown resolved against the page: the signet page reads from "/rpc", which says nothing of its server', () => {
    vi.stubGlobal('location', { origin: 'https://signet.ksana.network', href: 'https://signet.ksana.network/?lang=en#/btc/327022' });
    try {
      expect(shownAddress('/rpc')).toBe('https://signet.ksana.network/rpc');
      expect(shownAddress('https://signet.ksana.network@node.example/rpc')).toBe('https://node.example/rpc');
      expect(shownAddress('http://127.0.0.1:18545')).toBe('http://127.0.0.1:18545/');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
