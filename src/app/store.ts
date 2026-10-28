import { useSyncExternalStore } from 'react';
import { Devnet } from '../chain/sim/engine';
import { type DeviceStore, RpcChain } from '../chain/rpc/chain';
import type { Chain, SourcePref } from '../chain/source';
import { deploymentSource, deploymentUnknown } from './deployment';

/**
 * Data source: the in-browser devnet simulator (default), or a ksana-node (with an optional ksana-indexer) connected through the
 * @ksana/sdk JSON-RPC client.
 * With `?rpc=<node URL>` in the address bar (optionally `&indexer=<indexer URL>&btc=<Bitcoin RPC>&chain=devnet|signet`) the node is
 * connected directly, for that visit: a link must not point the page at a node of its choosing for good, so only a choice made in the
 * data source panel is remembered. On a copy published for a network (deployment.json) a link naming other addresses than the copy's
 * own is not followed until the reader agrees, and the answer holds for the tab (`useAskedSource`, `answerLink`). Earlier versions
 * remembered a link's node as they did a choice: a node one of them saved, other than the copy's own, is asked about once
 * (`savedSource`, `useRecheckedSource`, `answerSaved`).
 * The Bitcoin RPC (a same-origin proxy path such as /btc) is only for the wallet's path C and top-ups: listing UTXOs, fee rates and
 * broadcasting (D-070).
 */
function readQuerySource(): SourcePref | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const url = q.get('rpc');
    if (!url) return q.get('source') === 'sim' ? { kind: 'sim' } : null;
    const indexer = q.get('indexer');
    const btc = q.get('btc');
    return withoutUsers({ kind: 'rpc', url, chain: q.get('chain') === 'signet' ? 'signet' : 'devnet', ...(indexer ? { indexerUrl: indexer } : {}), ...(btc ? { btcUrl: btc } : {}) }, window.location.href);
  } catch {
    return null;
  }
}

/**
 * An address without the user part a link can put before its host: "https://signet.ksana.network@node.example/" reads as the first
 * name, and is the second; `fetch` refuses an address with one anyway (the review of M36)
 */
export function withoutUser(u: string, base: string): string {
  try {
    const url = new URL(u, base);
    if (!url.username && !url.password) return u;
    url.username = '';
    url.password = '';
    return url.href;
  } catch {
    return u;
  }
}

/**
 * An address as the page shows it: resolved against the page, so that the signet page's "/rpc" names its server, and without a user
 * part (`withoutUser`)
 */
export function shownAddress(u: string): string {
  if (typeof location === 'undefined') return u;
  try {
    return new URL(withoutUser(u, location.href), location.href).href;
  } catch {
    return u;
  }
}

/** A source's addresses without their user parts (`withoutUser`) */
function withoutUsers<T extends SourcePref | null>(pref: T, base: string): T {
  if (pref?.kind !== 'rpc') return pref;
  const at = (u: string) => withoutUser(u, base);
  return { ...pref, url: at(pref.url), ...(pref.indexerUrl ? { indexerUrl: at(pref.indexerUrl) } : {}), ...(pref.btcUrl ? { btcUrl: at(pref.btcUrl) } : {}) };
}

/** The address bar's parameters that name a data source */
const SOURCE_PARAMS = ['rpc', 'indexer', 'btc', 'chain', 'source'];
/** The link's data source this tab agreed to read from, so that a reload does not ask again */
const AGREED = 'ksana:linkSource';
/** The data source chosen in the panel (localStorage `ksana:dataSource`) */
const SAVED = 'dataSource';
/** Where earlier versions kept it, a link's node among what they kept (`ksana:source`; `savedSource`) */
const EARLIER = 'source';

/** Writes the source a link named back into the address bar (a reload keeps it), or with `null` takes the link's parameters out */
function writeSourceParams(pref: SourcePref | null) {
  try {
    const url = new URL(window.location.href);
    for (const k of SOURCE_PARAMS) url.searchParams.delete(k);
    if (pref?.kind === 'sim') url.searchParams.set('source', 'sim');
    if (pref?.kind === 'rpc') {
      url.searchParams.set('rpc', pref.url);
      if (pref.indexerUrl) url.searchParams.set('indexer', pref.indexerUrl);
      if (pref.btcUrl) url.searchParams.set('btc', pref.btcUrl);
      url.searchParams.set('chain', pref.chain);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* Ignored when the address bar is not writable (preview environments) */
  }
}

/** Whether two data sources read from the same places: the same kind, and for a node the same addresses (resolved against `base`) and network */
export function sameSource(a: SourcePref, b: SourcePref, base: string): boolean {
  if (a.kind === 'sim' || b.kind === 'sim') return a.kind === b.kind;
  const at = (u: string | undefined) => {
    if (!u) return '';
    try {
      return new URL(u, base).href;
    } catch {
      return u;
    }
  };
  return a.chain === b.chain && at(a.url) === at(b.url) && at(a.indexerUrl) === at(b.indexerUrl) && at(a.btcUrl) === at(b.btcUrl);
}

/**
 * Where the page starts: a source named in the link (`link`), for this visit; else the one chosen in the panel (`saved`); else the copy's
 * own (`own`, deployment.json) or the simulator. A link naming a node other than the copy's own, and other than one this tab agreed to,
 * waits for the reader (`asked`) while the page starts where it would have without the link; so does any node a link names on a copy
 * that could not read its deployment.json (`own` unknown), which may be one published for a network
 */
export function startingSource(o: { link: SourcePref | null; own: SourcePref | null | 'unknown'; agreed: SourcePref | null; saved: SourcePref | null }, base: string): { source: SourcePref; fromLink: boolean; asked: SourcePref | null } {
  const { link, agreed, saved } = o;
  const own = o.own === 'unknown' ? null : o.own;
  const usual: SourcePref = saved?.kind === 'rpc' && typeof saved.url === 'string' && saved.url ? saved : saved?.kind === 'sim' ? saved : (own ?? { kind: 'sim' });
  if (!link) return { source: usual, fromLink: false, asked: null };
  const published = o.own !== null;
  if (link.kind === 'rpc' && published && !(own && sameSource(link, own, base)) && !(agreed && sameSource(link, agreed, base))) return { source: usual, fromLink: false, asked: link };
  return { source: link, fromLink: true, asked: null };
}

/** Whether a saved source can be read from: the simulator, or a node with an address */
function usable(pref: SourcePref | null): pref is SourcePref {
  return pref?.kind === 'sim' || (pref?.kind === 'rpc' && typeof pref.url === 'string' && pref.url !== '');
}

/**
 * The source chosen in the panel (`saved`), or one an earlier version saved (`earlier`), which earlier versions also saved from a link
 * naming a node (the review of M32, F-15, and of M36). On a copy published for a network, a node an earlier version saved other
 * than the copy's own is not read from until the reader agrees (`recheck`). Anything else an earlier version saved stands, kept from
 * then on as the panel's choice (`settle`: the earlier key is done with), except while the copy's own is unknown, when it stands for
 * the visit only
 */
export function savedSource(o: { saved: SourcePref | null; earlier: SourcePref | null; own: SourcePref | null | 'unknown' }, base: string): { saved: SourcePref | null; recheck: SourcePref | null; settle: boolean } {
  const saved = usable(o.saved) ? o.saved : null;
  const earlier = usable(o.earlier) ? o.earlier : null;
  if (saved || !earlier) return { saved, recheck: null, settle: o.earlier !== null };
  if (o.own === 'unknown') return { saved: earlier, recheck: null, settle: false };
  if (earlier.kind === 'rpc' && o.own && !sameSource(earlier, o.own, base)) return { saved: null, recheck: earlier, settle: false };
  return { saved: earlier, recheck: null, settle: true };
}

/** The top-up claims the wallet broadcast and the times of the BTC blocks read as the tip, remembered on this device across reloads (`DeviceStore`) */
const deviceStore: DeviceStore = { load: (key) => loadPref<unknown>(key, null), save: savePref };

function create(pref: SourcePref): Chain {
  if (pref.kind !== 'rpc') return new Devnet();
  // The node's calls go out in batches: a phone's first load takes a few round trips rather than a dozen (batch.ts)
  const made: RpcChain = new RpcChain(
    { url: pref.url, chain: pref.chain, ...(pref.indexerUrl ? { indexerUrl: pref.indexerUrl } : {}), ...(pref.btcUrl ? { btcUrl: pref.btcUrl } : {}) },
    { batch: true, claims: deviceStore, btcTimes: deviceStore, startedOver: () => readAnew(made) },
  );
  return made;
}

let source: SourcePref = { kind: 'sim' };
/** Whether the source came from the address bar, for this visit (nothing saved) */
let fromLink = false;
/** A link's node the reader has not yet agreed to read from */
let asked: SourcePref | null = null;
/** A node an earlier version saved, which the reader has not yet agreed to read from */
let recheck: SourcePref | null = null;
let current: Chain | null = null;
const chainListeners = new Set<() => void>();
/** What hears that the node's network started over while the page was open (`readAnew`) */
const startedOverListeners = new Set<() => void>();

/** The current data source (created from the address bar and local settings, and started, on the first call) */
export function chain(): Chain {
  if (!current) {
    let agreed: SourcePref | null = null;
    try {
      const kept: unknown = JSON.parse(window.sessionStorage.getItem(AGREED) ?? 'null');
      if (kept && typeof kept === 'object' && 'kind' in kept && (kept.kind === 'rpc' || kept.kind === 'sim')) agreed = kept as SourcePref;
    } catch {
      /* ignore */
    }
    const own = deploymentUnknown() ? 'unknown' : deploymentSource();
    const earlier = withoutUsers(loadPref<SourcePref | null>(EARLIER, null), window.location.href);
    const kept = savedSource({ saved: loadPref<SourcePref | null>(SAVED, null), earlier, own }, window.location.href);
    if (kept.settle) {
      if (kept.saved) savePref(SAVED, kept.saved);
      dropPref(EARLIER);
    }
    const start = startingSource({ link: readQuerySource(), own, agreed, saved: kept.saved }, window.location.href);
    source = start.source;
    fromLink = start.fromLink;
    asked = start.asked;
    // Asked about where the page would read from it: not while a link names the source
    recheck = start.fromLink || start.asked ? null : kept.recheck;
    current = create(source);
    current.start();
  }
  return current;
}

export function currentSource(): SourcePref {
  chain();
  return source;
}

/** Whether the current source came from the page's link, used for this visit and not saved */
export function sourceFromLink(): boolean {
  chain();
  return fromLink;
}

/**
 * Switch data source: stop the old one, start the new one. A choice made on the page is remembered, and takes the link's parameters
 * out of the address bar; the link's own source (`fromLink`) stays in the address bar and in this tab only
 */
export function switchSource(pref: SourcePref, opts: { fromLink?: boolean } = {}) {
  current?.stop();
  source = pref;
  fromLink = opts.fromLink === true;
  asked = null;
  recheck = null;
  if (fromLink) {
    try {
      window.sessionStorage.setItem(AGREED, JSON.stringify(pref));
    } catch {
      /* ignore */
    }
  } else {
    savePref(SAVED, pref);
    dropPref(EARLIER);
  }
  // The link's source stays in the address bar as the link wrote it, unless it changed here (another network)
  const named = readQuerySource();
  if (!fromLink || !named || !sameSource(named, pref, window.location.href)) writeSourceParams(fromLink ? pref : null);
  current = create(pref);
  current.start();
  for (const l of chainListeners) l();
}

/** The reader's answer to a link naming another node: read from it in this tab, or stay where the page started (the link's parameters taken out) */
export function answerLink(follow: boolean) {
  if (!asked) return;
  if (follow) {
    switchSource(asked, { fromLink: true });
    return;
  }
  asked = null;
  writeSourceParams(null);
  for (const l of chainListeners) l();
}

/**
 * The reader's answer about a node an earlier version saved: read from it, kept from then on as the panel's choice, or forget it and
 * stay with the copy's own, where the page started
 */
export function answerSaved(keep: boolean) {
  const node = recheck;
  if (!node) return;
  if (keep) {
    switchSource(node);
    return;
  }
  recheck = null;
  dropPref(EARLIER);
  for (const l of chainListeners) l();
}

/**
 * The node's network started over from another genesis block (`RpcChain`'s `startedOver`): what the page read belongs to the chain
 * before, so the same source is read anew, as on a reload, and the page says why (`onStartedOver`)
 */
function readAnew(from: Chain) {
  if (current !== from) return;
  current = create(source);
  current.start();
  for (const l of chainListeners) l();
  for (const l of startedOverListeners) l();
}

/** Calls `fn` each time the node's network turns out to have started over, once the page reads it anew */
export function onStartedOver(fn: () => void): () => void {
  startedOverListeners.add(fn);
  return () => {
    startedOverListeners.delete(fn);
  };
}

/** Notifies after a data source switch (including a reconnect) */
export function subscribeChain(fn: () => void) {
  chainListeners.add(fn);
  return () => {
    chainListeners.delete(fn);
  };
}

export function useChain(): Chain {
  const c = useSyncExternalStore(subscribeChain, chain, chain);
  useSyncExternalStore(c.subscribe, c.getVersion, c.getVersion);
  return c;
}

export function useSource(): SourcePref {
  useSyncExternalStore(subscribeChain, chain, chain);
  return source;
}

/** A link's node waiting for the reader's answer (see `answerLink`) */
export function useAskedSource(): SourcePref | null {
  const read = () => {
    chain();
    return asked;
  };
  return useSyncExternalStore(subscribeChain, read, read);
}

/** A node an earlier version saved, waiting for the reader's answer (see `answerSaved`) */
export function useRecheckedSource(): SourcePref | null {
  const read = () => {
    chain();
    return recheck;
  };
  return useSyncExternalStore(subscribeChain, read, read);
}

// —— A clock that ticks once a second, for "x seconds ago" and countdowns ——

let now = Date.now();
const nowListeners = new Set<() => void>();
let nowTimer: ReturnType<typeof setInterval> | null = null;

function subscribeNow(fn: () => void) {
  nowListeners.add(fn);
  if (!nowTimer) {
    nowTimer = setInterval(() => {
      now = Date.now();
      for (const l of nowListeners) l();
    }, 1000);
  }
  return () => {
    nowListeners.delete(fn);
    if (nowListeners.size === 0 && nowTimer) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribeNow, () => now, () => now);
}

// —— Small subscribable state ——

export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
      for (const l of listeners) l();
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// —— localStorage holds only what this device keeps for its user (preferences, recent recipients, top-up claims); reads and writes can fail (private mode, preview environments) ——

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`ksana:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    window.localStorage.setItem(`ksana:${key}`, JSON.stringify(value));
  } catch {
    /* A failed preference save does not affect use */
  }
}

export function dropPref(key: string) {
  try {
    window.localStorage.removeItem(`ksana:${key}`);
  } catch {
    /* As a failed save */
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
