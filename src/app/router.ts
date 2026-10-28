import { useCallback, useState, useSyncExternalStore, type MouseEvent } from 'react';

/**
 * Hash-based routing: deployable on static hosting, and works inside restricted preview frames.
 * Falls back to in-memory routing when writing location.hash fails.
 */

export type Route =
  | { name: 'overview' }
  | { name: 'blocks'; page: number }
  | { name: 'block'; id: string }
  | { name: 'ops'; tab: 'latest' | 'mempool' }
  | { name: 'op'; id: string }
  | { name: 'account'; id: string }
  | { name: 'contract'; id: string }
  /** A built-in asset, a KS-20 token or a KS-721 collection, by its ID (D-123) */
  | { name: 'asset'; id: string }
  | { name: 'settlements'; tab: 'settlement' | 'native' | 'headers' }
  | { name: 'tx'; id: string; block?: string }
  | { name: 'btc'; height: number }
  | { name: 'verify' }
  | { name: 'wallet' }
  | { name: 'send'; to?: string; asset?: string; path?: string; nonce?: string; amount?: string; gas?: string }
  | { name: 'receive' }
  /** Opened on a lock of an exchange contract: the points page's link to the lock its seller made (D-126) */
  | { name: 'topup'; exchange?: string; lock?: string }
  | { name: 'settings' }
  | { name: 'search'; q: string }
  | { name: 'notfound'; path: string };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart = '/', queryPart = ''] = raw.split('?');
  const q = new URLSearchParams(queryPart);
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b] = parts;
  switch (a) {
    case undefined:
      return { name: 'overview' };
    case 'blocks':
      return { name: 'blocks', page: Math.max(1, Number(q.get('page') ?? 1) || 1) };
    case 'block':
      return b ? { name: 'block', id: b } : { name: 'blocks', page: 1 };
    case 'ops':
      return { name: 'ops', tab: q.get('tab') === 'mempool' ? 'mempool' : 'latest' };
    case 'op':
      return b ? { name: 'op', id: b } : { name: 'ops', tab: 'latest' };
    case 'account':
      return b ? { name: 'account', id: b } : { name: 'overview' };
    case 'contract':
      return b ? { name: 'contract', id: b } : { name: 'overview' };
    case 'asset':
      return b ? { name: 'asset', id: b } : { name: 'overview' };
    case 'settlements': {
      const tab = q.get('tab');
      return { name: 'settlements', tab: tab === 'native' || tab === 'headers' ? tab : 'settlement' };
    }
    case 'tx': {
      if (!b) return { name: 'settlements', tab: 'settlement' };
      // The block that names the transaction, by height or hash, which the page reads where it has not loaded it (`txRoute`)
      const block = q.get('block');
      return block && /^(\d+|[0-9a-fA-F]{64})$/.test(block) ? { name: 'tx', id: b, block: block.toLowerCase() } : { name: 'tx', id: b };
    }
    case 'btc':
      return b && /^\d+$/.test(b) ? { name: 'btc', height: Number(b) } : { name: 'settlements', tab: 'settlement' };
    case 'verify':
      return { name: 'verify' };
    case 'wallet':
      if (b === 'send') {
        const r: Route = { name: 'send' };
        for (const k of ['to', 'asset', 'path', 'nonce', 'amount', 'gas'] as const) {
          const v = q.get(k);
          if (v) r[k] = v;
        }
        return r;
      }
      if (b === 'receive') return { name: 'receive' };
      if (b === 'topup') {
        const r: Route = { name: 'topup' };
        const exchange = q.get('exchange');
        const lock = q.get('lock');
        if (exchange && /^[0-9a-fA-F]{64}$/.test(exchange)) r.exchange = exchange.toLowerCase();
        if (lock && /^\d{1,20}$/.test(lock)) r.lock = lock;
        return r;
      }
      if (b === 'settings') return { name: 'settings' };
      return { name: 'wallet' };
    case 'search':
      return { name: 'search', q: q.get('q') ?? '' };
    default:
      return { name: 'notfound', path: pathPart };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'overview':
      return '#/';
    case 'blocks':
      return route.page > 1 ? `#/blocks?page=${route.page}` : '#/blocks';
    case 'block':
      return `#/block/${route.id}`;
    case 'ops':
      return route.tab === 'mempool' ? '#/ops?tab=mempool' : '#/ops';
    case 'op':
      return `#/op/${route.id}`;
    case 'account':
      return `#/account/${route.id}`;
    case 'contract':
      return `#/contract/${route.id}`;
    case 'asset':
      return `#/asset/${route.id}`;
    case 'settlements':
      return route.tab === 'settlement' ? '#/settlements' : `#/settlements?tab=${route.tab}`;
    case 'tx':
      return route.block ? `#/tx/${route.id}?block=${route.block}` : `#/tx/${route.id}`;
    case 'btc':
      return `#/btc/${route.height}`;
    case 'verify':
      return '#/verify';
    case 'wallet':
      return '#/wallet';
    case 'send': {
      const q = new URLSearchParams();
      if (route.to) q.set('to', route.to);
      if (route.asset) q.set('asset', route.asset);
      if (route.path) q.set('path', route.path);
      if (route.nonce) q.set('nonce', route.nonce);
      if (route.amount) q.set('amount', route.amount);
      if (route.gas) q.set('gas', route.gas);
      const s = q.toString();
      return s ? `#/wallet/send?${s}` : '#/wallet/send';
    }
    case 'receive':
      return '#/wallet/receive';
    case 'topup': {
      const q = new URLSearchParams();
      if (route.exchange) q.set('exchange', route.exchange);
      if (route.lock) q.set('lock', route.lock);
      const s = q.toString();
      return s ? `#/wallet/topup?${s}` : '#/wallet/topup';
    }
    case 'settings':
      return '#/wallet/settings';
    case 'search':
      return `#/search?q=${encodeURIComponent(route.q)}`;
    case 'notfound':
      return `#${route.path}`;
  }
}

let current = readHash();
const listeners = new Set<() => void>();
/** Whether the route has changed since the page loaded (a redirect that replaces the entry aside) */
let moved = false;

export function routeChanged(): boolean {
  return moved;
}

function readHash(): string {
  try {
    return window.location.hash || '#/';
  } catch {
    return '#/';
  }
}

function notify() {
  for (const l of listeners) l();
}

/*
 * Where each page was left, by history entry: Back and Forward return to it (a list read halfway down, a block opened from it, then
 * Back), and so do a reload and a return from another site in the same tab, while a page reached by a link starts at its top. Each
 * entry carries a key in its state. The browser's own restoration is off on every entry: WebKit applies it before the change of
 * entry is announced, while the page being left is still drawn, and no browser waits for a page that loads its data first. WebKit
 * keeps the setting per entry and gives an entry made by a change of hash its own restoration back, so the router makes its entries
 * with pushState, which carries the setting over, and turns it off again on any entry it arrives at
 */
const positions = new Map<string, number>();
const SAVED = 'ksana:scroll';
let entry = '';
let restoring: { y: number; stop: () => void } | undefined;
/** The link that had focus when an entry was left (its href, and which of the page's links to that address), for a keyboard to go on from there on the way back */
const focusOf = new Map<string, { href: string; nth: number }>();
/** Where the page shown returns to: 0 for a page opened anew */
let returnTo = 0;

/** Whether the page shown is going back to where it was left, rather than opened at its top: its title then does not take focus */
export function returning(): boolean {
  return returnTo > 0;
}

function freshKey(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** The key of the history entry shown, given to it if it has none (one the address bar or an older build made) */
function entryKey(): string {
  const state: unknown = window.history.state;
  const known = state && typeof state === 'object' && 'ksanaEntry' in state ? state.ksanaEntry : undefined;
  if (typeof known === 'string') return known;
  const key = freshKey();
  window.history.replaceState({ ...(state && typeof state === 'object' ? state : {}), ksanaEntry: key }, '');
  return key;
}

/** Notes where the page shown stands, or where it was going while it waited for its page to be drawn */
function notePosition() {
  try {
    if (entry) {
      const y = restoring?.y ?? window.scrollY;
      positions.delete(entry);
      positions.set(entry, y);
    }
  } catch {
    /* ignore */
  }
}

/** The page's links to one address, in order (a result's head and its foot, a row's height and hash) */
function linksTo(href: string): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('main a[href]')].filter((a) => a.getAttribute('href') === href);
}

/** Notes where the page being left stands and which link had focus, and stops returning it to its place */
function rememberScroll() {
  notePosition();
  restoring?.stop();
  try {
    const active = document.activeElement;
    const href = active instanceof HTMLAnchorElement && active.closest('main') ? active.getAttribute('href') : null;
    if (entry && href && active instanceof HTMLAnchorElement) focusOf.set(entry, { href, nth: Math.max(0, linksTo(href).indexOf(active)) });
    else focusOf.delete(entry);
  } catch {
    /* ignore */
  }
}

/**
 * Gives focus back to the link the page was left from, where nothing else has it, without moving the page. False while the page
 * has yet to draw it
 */
function refocus(link: { href: string; nth: number }): boolean {
  const active = document.activeElement;
  if (active && active !== document.body) return true;
  const links = linksTo(link.href);
  const target = links[link.nth] ?? links[0];
  target?.focus({ preventScroll: true });
  return !!target;
}

/** Keeps the places for a reload, or for a phone that discards the tab while it is hidden (no pagehide then) */
function persistPositions() {
  notePosition();
  try {
    window.sessionStorage.setItem(SAVED, JSON.stringify(Object.fromEntries([...positions].slice(-50))));
  } catch {
    /* ignore */
  }
}

/**
 * Arriving at another history entry the router did not make the move to: Back, Forward, the history menu, an edited address.
 * Announced by popstate, then hashchange where the address changed (a move between two entries of the same address announces
 * only popstate); the second of the two finds the move already made
 */
function arrive() {
  let key = '';
  try {
    key = entryKey();
    window.history.scrollRestoration = 'manual';
  } catch {
    key = '';
  }
  const next = readHash();
  if (key === entry && next === current) return;
  rememberScroll();
  current = next;
  moved = true;
  entry = key;
  returnTo = positions.get(key) ?? 0;
  notify();
  const link = focusOf.get(key);
  restoreScroll(returnTo, 3000, link ? () => refocus(link) : undefined);
}

/**
 * Goes to y once the page is drawn tall enough to reach it (or within a quarter of a screen of it, which the bars of a phone's browser
 * take or give back): in the first frame for a page whose data the page holds, later for one that loads it first, for up to `patience`
 * ms. Until then the page shows its top. A reader who scrolls, taps or types meanwhile stays where they are. `arrived` runs in each
 * frame the page stands there or near it (a page that has grown shorter since it was left stops short), until it returns true
 */
function restoreScroll(y: number, patience: number, arrived?: () => boolean) {
  restoring?.stop();
  try {
    window.scrollTo(0, 0);
    if (y <= 0) return;
    const quit = new AbortController();
    const until = performance.now() + patience;
    let frame = 0;
    let set = 0;
    const mine = {
      y,
      stop: () => {
        quit.abort();
        cancelAnimationFrame(frame);
        if (restoring === mine) restoring = undefined;
      },
    };
    restoring = mine;
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(type, mine.stop, { passive: true, signal: quit.signal });
    const step = () => {
      // Moved since the last frame by something other than this restore (the scroll bar, a find in the page)
      if (Math.abs(window.scrollY - set) > 1) return mine.stop();
      const room = document.documentElement.scrollHeight - window.innerHeight;
      const near = room >= y - window.innerHeight / 4;
      if (near) window.scrollTo(0, Math.min(y, room));
      set = window.scrollY;
      if (near && arrived?.()) arrived = undefined;
      if (room >= y - 1 || performance.now() >= until) mine.stop();
      else frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  try {
    entry = entryKey();
    window.history.scrollRestoration = 'manual';
  } catch {
    /* Without a writable history (previews) the browser keeps its own restoration */
  }
  try {
    const saved: unknown = JSON.parse(window.sessionStorage.getItem(SAVED) ?? '{}');
    if (saved && typeof saved === 'object') for (const [k, y] of Object.entries(saved)) if (typeof y === 'number' && Number.isFinite(y)) positions.set(k, y);
  } catch {
    /* ignore */
  }
  // A reload, or a return from another site, finds the page's data loading
  const left = positions.get(entry);
  if (left) restoreScroll(left, 6000);
  window.addEventListener('pagehide', persistPositions);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistPositions();
  });
  window.addEventListener('popstate', arrive);
  window.addEventListener('hashchange', arrive);
}

export function navigate(to: Route | string, opts: { replace?: boolean } = {}) {
  const target = typeof to === 'string' ? to : href(to);
  if (target === current) return;
  rememberScroll();
  current = target;
  returnTo = 0;
  if (!opts.replace) moved = true;
  try {
    if (opts.replace) window.history.replaceState(window.history.state, '', target);
    else {
      // The new entry is keyed as it is made, so that leaving it notes where it was left
      entry = '';
      const key = freshKey();
      window.history.pushState({ ksanaEntry: key }, '', target);
      entry = key;
    }
  } catch {
    /* In a restricted environment only the in-memory route is updated */
  }
  notify();
  restoreScroll(0, 0);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => current, () => current);
  return parseRoute(hash);
}

/** The key of the history entry shown: it changes with each entry, also between two entries of one address (the history menu) */
export function useEntry(): string {
  return useSyncExternalStore(subscribe, () => entry, () => entry);
}

/** What pages keep for their history entries, the last 20 */
const entryStates = new Map<string, unknown>();

/**
 * State kept for the history entry the page was opened on, as a send's result: Back from the operation's page finds the result
 * again, where an empty form read as if nothing had been sent. It is read as the page mounts, so a page that keeps it is keyed by
 * its entry (`useEntry`). Kept in memory: a reload starts the page anew
 */
export function useEntryState<T>(name: string, initial: T): [T, (next: T) => void] {
  const [key] = useState(() => (entry ? `${name}:${entry}` : ''));
  const [value, setValue] = useState<T>(() => (key && entryStates.has(key) ? (entryStates.get(key) as T) : initial));
  const set = useCallback(
    (next: T) => {
      if (key) {
        entryStates.delete(key);
        entryStates.set(key, next);
        for (const old of [...entryStates.keys()].slice(0, -20)) entryStates.delete(old);
      }
      setValue(next);
    },
    [key],
  );
  return [value, set];
}

/** For <a>: a plain click goes through the router, a modifier-key click is left to the browser */
export function onLinkClick(e: MouseEvent<HTMLAnchorElement>, to: Route | string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(to);
}
