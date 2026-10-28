import type { Stage } from '../chain/views';
import { createStore, loadPref, savePref, useStore } from './store';

// —— Theme: follow system / light / dark ——

export type ThemePref = 'system' | 'light' | 'dark';

export const themeStore = createStore<ThemePref>(loadPref<ThemePref>('theme', 'system'));

/**
 * The browser's own bars (index.html's theme-color, one per system scheme), as index.html gives them: where its first script applied a
 * theme chosen on the page before the first paint, each bar keeps its own colour in `data-color`
 */
let barColors: Map<HTMLMetaElement, string> | undefined;

export function applyTheme(t: ThemePref) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  // A theme chosen on the page colors the browser's bars too, where they would otherwise follow the system's scheme
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  barColors ??= new Map(metas.map((m) => [m, m.dataset.color ?? m.content]));
  const chosen = t === 'system' ? undefined : metas.find((m) => m.media.includes(t));
  for (const m of metas) m.content = barColors.get(chosen ?? m) ?? m.content;
}

export function setTheme(t: ThemePref) {
  themeStore.set(t);
  savePref('theme', t);
  applyTheme(t);
}

export function useTheme(): ThemePref {
  return useStore(themeStore);
}

// —— Wallet preferences and connection state (stored only on this device; private keys never pass through here) ——

export interface WalletPrefs {
  connected: boolean;
  /** Large-amount threshold (in KSA base units): incoming payments above it are advised to wait for BTC finality */
  largeThreshold: string;
  hideBalances: boolean;
}

/** largeThreshold is in KSA base units (8 decimals, D-066): default 10,000 KSA */
const defaults: WalletPrefs = { connected: false, largeThreshold: (10_000n * 10n ** 8n).toString(), hideBalances: false };

export const walletStore = createStore<WalletPrefs>({ ...defaults, ...loadPref<Partial<WalletPrefs>>('wallet', {}) });

export function updateWallet(patch: Partial<WalletPrefs>) {
  walletStore.set((prev) => {
    const next = { ...prev, ...patch };
    savePref('wallet', next);
    return next;
  });
}

export function useWalletPrefs(): WalletPrefs {
  return useStore(walletStore);
}

// —— Recently used recipients (stored only on this device, separated by network and sending account): picking one guards against address poisoning better than checking the head and tail (UI/UX review §2.3) ——

export interface RecentRecipient {
  /** The account as hex */
  id: string;
  /** The account's address form (empty when there is none) */
  address: string;
  count: number;
  lastAt: number;
}

const RECENT_MAX = 8;
const recentKey = (chainId: number, me: string) => `recent:${chainId}:${me}`;

export function recentRecipients(chainId: number, me: string): RecentRecipient[] {
  const list = loadPref<unknown>(recentKey(chainId, me), []);
  if (!Array.isArray(list)) return [];
  return (list as RecentRecipient[]).filter((r) => r && typeof r.id === 'string' && typeof r.lastAt === 'number').sort((a, b) => b.lastAt - a.lastAt);
}

export function rememberRecipient(chainId: number, me: string, r: { id: string; address: string }) {
  const list = recentRecipients(chainId, me);
  const now = Date.now();
  const hit = list.find((x) => x.id === r.id);
  const next = hit
    ? list.map((x) => (x.id === r.id ? { ...x, address: r.address || x.address, count: x.count + 1, lastAt: now } : x))
    : [{ id: r.id, address: r.address, count: 1, lastAt: now }, ...list];
  savePref(recentKey(chainId, me), next.sort((a, b) => b.lastAt - a.lastAt).slice(0, RECENT_MAX));
}

// —— Operations sent by the wallet in this session, for tracking and notifications ——

export const watchStore = createStore<string[]>([]);

export function watchOp(id: string) {
  watchStore.set((prev) => (prev.includes(id) ? prev : [...prev, id]));
}

// —— Toasts ——

export interface Toast {
  id: number;
  tone: 'qing' | 'mo' | 'zhu' | 'warn' | 'danger' | 'neutral';
  /** The status mark beside the title, where it is not the tone's own (the six-confirmation milestone, D-116) */
  mark?: Stage;
  title: string;
  body?: string;
  href?: string;
  /** A button that does what the toast offers (the reload of a newer version, app/update.ts) */
  action?: { label: string; run: () => void };
  /** Not dropped for later toasts: one that waits for its action, or that says what holds until it is closed (a network that started over, main.tsx) */
  keep?: boolean;
  at: number;
}

export const toastStore = createStore<Toast[]>([]);
let toastSeq = 0;

/** Shows a toast for `ttl` ms (0: until closed), and gives its ID, for one that what follows may make untrue (dismissToast) */
export function toast(t: Omit<Toast, 'id' | 'at'>, ttl = 6000): number {
  const id = ++toastSeq;
  // Keep at most two at a time so they do not pile up and cover the page, besides those kept (`keep`)
  toastStore.set((prev) => {
    const older = prev.filter((x) => !x.keep).slice(0, -1);
    return [...prev.filter((x) => !older.includes(x)), { ...t, id, at: Date.now() }];
  });
  if (ttl > 0) setTimeout(() => dismissToast(id), ttl);
  return id;
}

export function dismissToast(id: number) {
  toastStore.set((prev) => prev.filter((x) => x.id !== id));
}

// —— regtest console drawer ——

export const consoleStore = createStore<boolean>(false);
