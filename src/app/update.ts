/**
 * A newer version of the page. core/signet/deploy.sh builds the signet's page again at every deploy (D-107), and a page left open while one
 * is published runs the version it loaded, while the files it loads on demand are the newer version's: the language packs, whose files
 * are named after the main script's, are gone, and a language picked in the older page does not load. The page reads its index.html as
 * it comes into view and every ten minutes while in view; where it names another main script than the page's own, a notice says that a
 * newer version is out, once, with a button that reloads the page; a language that does not load asks for the same (`languageMissed`)
 */
import { pageHidden, whenShown } from '../chain/rpc/btcTip';
import { t } from '../i18n';
import { dismissToast, toast } from './prefs';

/** How often a page in view reads its index.html, and how long after a read a page that comes into view leaves it be */
const EVERY_MS = 10 * 60_000;
const AGAIN_MS = 60_000;

/** The main script an index.html names (its `<script type="module" src>`), as a URL resolved against the page's */
export function mainScriptOf(html: string, page: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype\s*=\s*["']?module["'\s>]/i.test(tag)) continue;
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    const value = src?.[1] ?? src?.[2] ?? src?.[3];
    if (!value) continue;
    try {
      return new URL(value, page).href;
    } catch {
      return null;
    }
  }
  return null;
}

/** The main script the page's index.html names now, where it is not `own`: a newer version is out. Null where it is the same, and where the read fails */
export async function newerScript(own: string, page: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchFn(page, { cache: 'no-cache' });
    if (!res.ok) return null;
    const named = mainScriptOf(await res.text(), page);
    return named !== null && named !== own ? named : null;
  } catch {
    return null;
  }
}

export interface UpdateOptions {
  /** The page's main script (default: the document's); none where the page has no such file */
  own?: string | null;
  /** The page's index.html (default: the document's URL) */
  page?: string;
  fetch?: typeof fetch;
  now?: () => number;
  hidden?: () => boolean;
  shown?: (fn: () => void) => () => void;
}

interface Watching {
  own: string;
  page: string;
  fetch: typeof fetch;
  now: () => number;
  /** When the page last read its index.html, or began to watch */
  read: number;
}

let watching: Watching | null = null;
/** The newer main script the notice was given for, and the notice while it shows */
let told: string | null = null;
let notice: number | undefined;

/** The development server's page and the single-file preview have no main script file, and nothing newer to learn of */
function ownScript(): string | null {
  if (import.meta.env.DEV || typeof document === 'undefined') return null;
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src || null;
}

async function read(): Promise<string | null> {
  const w = watching;
  if (!w) return null;
  w.read = w.now();
  return newerScript(w.own, w.page, w.fetch);
}

/** Says that a newer version is out, `body` saying what the reload brings; it stays until it is closed or the page reloaded */
function announce(next: string, body: string) {
  const u = t().shell.update;
  told = next;
  if (notice !== undefined) dismissToast(notice);
  notice = toast({ tone: 'neutral', title: u.title, body, action: { label: u.reload, run: () => window.location.reload() }, keep: true }, 0);
}

/** Reads index.html unless it was read less than a minute ago; a newer version is told of once */
async function look() {
  const w = watching;
  if (!w || w.now() - w.read < AGAIN_MS) return;
  const next = await read();
  if (next !== null && next !== told) announce(next, t().shell.update.body);
}

/** Watches for a newer version (see the module's comment); gives what stops it */
export function watchForUpdates(options: UpdateOptions = {}): () => void {
  const own = options.own !== undefined ? options.own : ownScript();
  if (!own) return () => undefined;
  const now = options.now ?? Date.now;
  const hidden = options.hidden ?? pageHidden;
  watching = { own, page: options.page ?? window.location.href.replace(/#.*$/, ''), fetch: options.fetch ?? fetch, now, read: now() };
  const timer = setInterval(() => {
    if (!hidden()) void look();
  }, EVERY_MS);
  const unshown = (options.shown ?? whenShown)(() => void look());
  return () => {
    clearInterval(timer);
    unshown();
    watching = null;
    told = null;
    if (notice !== undefined) dismissToast(notice);
    notice = undefined;
  };
}

/**
 * A language picked in the menu did not load (`name`, as the menu gives it). Where a newer version is out, its pack is the newer
 * version's: the notice asks for the reload, after which the page opens in the language picked (setLocale remembers it). Otherwise the
 * failure is said
 */
export async function languageMissed(name: string): Promise<void> {
  const next = await read();
  const u = t().shell.update;
  if (next !== null) announce(next, u.language(name));
  else toast({ tone: 'warn', title: u.missed(name), body: u.missedBody });
}
