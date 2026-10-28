import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale, t } from '../i18n';
import { toast, toastStore } from './prefs';
import { languageMissed, mainScriptOf, newerScript, watchForUpdates } from './update';

// A language pack that is no longer on the server: the older page's, after a newer version was published
vi.mock('../i18n/ko', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

const PAGE = 'https://signet.ksana.network/';
const OWN = `${PAGE}assets/index-hU0kh0Uw.js`;

/** index.html as the build writes it: the deployment's read and the frame's scripts before the main one */
const indexHtml = (script: string) =>
  `<!doctype html><html lang="en"><head><script>window.__ksanaDeployment = fetch('deployment.json', { cache: 'no-cache' });</script>` +
  `<script type="module" crossorigin src="${script}"></script><link rel="stylesheet" crossorigin href="./assets/style-CZSwywfH.css"></head>` +
  `<body><div id="root"></div></body></html>`;

describe('The main script an index.html names', () => {
  it('is its module script, resolved against the page', () => {
    expect(mainScriptOf(indexHtml('./assets/index-hU0kh0Uw.js'), PAGE)).toBe(OWN);
    expect(mainScriptOf(indexHtml('./assets/index-hU0kh0Uw.js'), `${PAGE}?lang=es`)).toBe(OWN);
    expect(mainScriptOf(`<script type=module src=/assets/index-e91y61nr.js></script>`, PAGE)).toBe(`${PAGE}assets/index-e91y61nr.js`);
    expect(mainScriptOf(`<script src='./x.js' type='module'></script>`, PAGE)).toBe(`${PAGE}x.js`);
  });

  it('is none where the page has no module script file: an error page, the single-file preview', () => {
    expect(mainScriptOf('<html><body>502 Bad Gateway</body></html>', PAGE)).toBe(null);
    expect(mainScriptOf('<script src="./a.js"></script><script type="module">import "./b.js";</script>', PAGE)).toBe(null);
  });
});

describe('A newer version of the page', () => {
  const serving = (status: number, body: string) => vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

  it('is one whose index.html names another main script', async () => {
    const same = serving(200, indexHtml('./assets/index-hU0kh0Uw.js'));
    expect(await newerScript(OWN, PAGE, same)).toBe(null);
    expect(same).toHaveBeenCalledWith(PAGE, { cache: 'no-cache' });
    expect(await newerScript(OWN, PAGE, serving(200, indexHtml('./assets/index-e91y61nr.js')))).toBe(`${PAGE}assets/index-e91y61nr.js`);
  });

  it('is none where index.html cannot be read', async () => {
    expect(await newerScript(OWN, PAGE, serving(404, 'Not Found'))).toBe(null);
    expect(await newerScript(OWN, PAGE, serving(502, indexHtml('./assets/index-e91y61nr.js')))).toBe(null);
    const lost = vi.fn(async () => {
      throw new TypeError('Load failed');
    }) as unknown as typeof fetch;
    expect(await newerScript(OWN, PAGE, lost)).toBe(null);
  });
});

describe('A page watching for a newer version', () => {
  let served = './assets/index-hU0kh0Uw.js';
  let reads = 0;
  let away = false;
  let show: () => void = () => undefined;
  let stop: () => void = () => undefined;
  const reload = vi.fn();
  const settle = () => vi.advanceTimersByTimeAsync(0);
  const notices = () => toastStore.get().filter((x) => x.keep);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { location: { reload } });
    toastStore.set([]);
    served = './assets/index-hU0kh0Uw.js';
    reads = 0;
    away = false;
    stop = watchForUpdates({
      own: OWN,
      page: PAGE,
      fetch: (async () => {
        reads++;
        return new Response(indexHtml(served));
      }) as unknown as typeof fetch,
      hidden: () => away,
      shown: (fn) => {
        show = fn;
        return () => (show = () => undefined);
      },
    });
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads its index.html as it comes into view a minute after its last read, and every ten minutes while in view', async () => {
    await vi.advanceTimersByTimeAsync(30_000);
    show();
    await settle();
    expect(reads).toBe(0);
    await vi.advanceTimersByTimeAsync(31_000);
    show();
    await settle();
    expect(reads).toBe(1);
    // Out of view the ten minutes pass by; in view they read
    away = true;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(reads).toBe(1);
    away = false;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(reads).toBe(2);
    expect(toastStore.get()).toEqual([]);
  });

  it('tells of a newer version once, with the reload, and the notice stays until it is closed', async () => {
    served = './assets/index-e91y61nr.js';
    await vi.advanceTimersByTimeAsync(60_000);
    show();
    await settle();
    const u = t().shell.update;
    expect(notices()).toMatchObject([{ tone: 'neutral', title: u.title, body: u.body, action: { label: u.reload } }]);
    const [first] = notices();
    first?.action?.run();
    expect(reload).toHaveBeenCalledOnce();
    // Later toasts do not push it out, nor does the hour that passes
    for (let i = 0; i < 3; i++) toast({ tone: 'qing', title: `op ${i}` });
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(notices().map((x) => x.id)).toEqual([first?.id]);
    // Read again, the same newer version is not told of twice; a version newer still replaces the notice
    show();
    await settle();
    expect(notices().map((x) => x.id)).toEqual([first?.id]);
    served = './assets/index-Q1nrw0Ab.js';
    await vi.advanceTimersByTimeAsync(60_000);
    show();
    await settle();
    expect(notices()).toHaveLength(1);
    expect(notices()[0]?.id).not.toBe(first?.id);
    // A notice closed stays closed for its version
    toastStore.set([]);
    await vi.advanceTimersByTimeAsync(60_000);
    show();
    await settle();
    expect(notices()).toEqual([]);
  });

  it('stops reading once stopped, and takes its notice down', async () => {
    served = './assets/index-e91y61nr.js';
    await vi.advanceTimersByTimeAsync(60_000);
    show();
    await settle();
    expect(notices()).toHaveLength(1);
    stop();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    show();
    await settle();
    expect(reads).toBe(1);
    expect(notices()).toEqual([]);
  });

  it('reads nothing where the page has no main script file', async () => {
    stop();
    const fetchFn = vi.fn();
    stop = watchForUpdates({ own: null, fetch: fetchFn as unknown as typeof fetch, shown: () => () => undefined });
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a language that does not load asks for the reload where a newer version is out, and is said otherwise', async () => {
    served = './assets/index-e91y61nr.js';
    await languageMissed('Español');
    const u = t().shell.update;
    expect(notices()).toMatchObject([{ title: u.title, body: u.language('Español'), action: { label: u.reload } }]);
    // The same version read again by the page coming into view is not told of twice
    await vi.advanceTimersByTimeAsync(60_000);
    show();
    await settle();
    expect(notices()).toHaveLength(1);
    toastStore.set([]);
    served = './assets/index-hU0kh0Uw.js';
    stop();
    stop = watchForUpdates({ own: OWN, page: PAGE, fetch: (async () => new Response(indexHtml(served))) as unknown as typeof fetch, shown: () => () => undefined });
    await languageMissed('Español');
    expect(toastStore.get()).toMatchObject([{ tone: 'warn', title: u.missed('Español'), body: u.missedBody }]);
    expect(notices()).toEqual([]);
  });
});

describe('A language picked in the menu that does not load', () => {
  it('leaves the page in its language, and is remembered with ?lang= taken off the address', async () => {
    const saved = new Map<string, string>();
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { href: 'https://signet.ksana.network/?lang=en#/ops', search: '?lang=en' },
      localStorage: { setItem: (k: string, v: string) => saved.set(k, v), getItem: (k: string) => saved.get(k) ?? null },
      history: { state: null, replaceState },
    });
    try {
      const before = t();
      expect(await setLocale('ko')).toBe(false);
      expect(t()).toBe(before);
      expect(saved.get('ksana:locale')).toBe(JSON.stringify('ko'));
      expect(replaceState).toHaveBeenCalledWith(null, '', 'https://signet.ksana.network/#/ops');
      expect(await setLocale('es')).toBe(true);
      expect(t().shell.update.reload).toBe('Volver a cargar');
      expect(await setLocale('en', false)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
