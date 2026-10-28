import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENSO } from '../components/Brand';

// What index.html does before the page's scripts have downloaded
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** index.html's inline script that holds `marker` */
function inlineScript(marker: string): string {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '').find((s) => s.includes(marker));
  if (!script) throw new Error(`index.html has no script with ${marker}`);
  return script;
}

const LIGHT = '#f1f4f3';
const DARK = '#0d1314';

/** Stand-ins for the document's root and the browser's two bars, as index.html gives them */
function themeStandIns() {
  const bars = [
    { media: '(prefers-color-scheme: light)', content: LIGHT, dataset: {} as Record<string, string> },
    { media: '(prefers-color-scheme: dark)', content: DARK, dataset: {} as Record<string, string> },
  ].map((b) => Object.assign(b, { getAttribute: (name: string) => (name === 'media' ? b.media : null) }));
  const root = { dataset: {} as Record<string, string | undefined> };
  return { bars, root, document: { documentElement: root, querySelectorAll: () => bars } };
}

/** index.html's script that applies a theme chosen on the page, run against the stand-ins and a storage holding `stored` */
function runThemeScript(s: ReturnType<typeof themeStandIns>, stored: string | null) {
  const localStorage = {
    getItem: (key: string) => {
      if (stored === 'throws') throw new Error('storage blocked');
      return key === 'ksana:theme' ? stored : null;
    },
  };
  new Function('document', 'localStorage', inlineScript('ksana:theme'))(s.document, localStorage);
}

function chooseTheme(stored: string | null) {
  const s = themeStandIns();
  runThemeScript(s, stored);
  return { theme: s.root.dataset.theme, bars: s.bars.map((b) => b.content), kept: s.bars.map((b) => b.dataset.color) };
}

describe("index.html's theme before the first paint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies a theme chosen on the page, and colours both of the browser's bars with it", () => {
    expect(chooseTheme('"dark"')).toEqual({ theme: 'dark', bars: [DARK, DARK], kept: [LIGHT, DARK] });
    expect(chooseTheme('"light"')).toEqual({ theme: 'light', bars: [LIGHT, LIGHT], kept: [LIGHT, DARK] });
  });

  it('leaves the system scheme to the stylesheet: no choice, "System", anything else, or no storage', () => {
    for (const stored of [null, '"system"', '"sepia"', 'dark', '{', 'throws'])
      expect(chooseTheme(stored), String(stored)).toEqual({ theme: undefined, bars: [LIGHT, DARK], kept: [undefined, undefined] });
  });

  it("hands each bar's own colour to the page's switch, which gives them back for System and colours both for Light or Dark", async () => {
    for (const [stored, to, theme, bars] of [
      ['"dark"', 'system', undefined, [LIGHT, DARK]],
      ['"dark"', 'light', 'light', [LIGHT, LIGHT]],
      ['"light"', 'system', undefined, [LIGHT, DARK]],
      ['"light"', 'dark', 'dark', [DARK, DARK]],
      [null, 'dark', 'dark', [DARK, DARK]],
    ] as const) {
      const s = themeStandIns();
      runThemeScript(s, stored);
      vi.stubGlobal('document', s.document);
      // prefs.ts reads the bars' colours once, on its first switch: a fresh copy for each page
      vi.resetModules();
      const { applyTheme } = await import('./prefs');
      applyTheme(to);
      expect({ theme: s.root.dataset.theme, bars: s.bars.map((b) => b.content) }, `${stored} then ${to}`).toEqual({ theme, bars });
    }
  });

  it('runs in the head, after the bars it colours, which give the colours the stylesheet draws the page with', () => {
    expect(html.indexOf('ksana:theme')).toBeGreaterThan(html.lastIndexOf('<meta name="theme-color"'));
    expect(html.indexOf('ksana:theme')).toBeLessThan(html.indexOf('</head>'));
    const tokens = source('../styles/tokens.css');
    expect(html).toContain(`content="${LIGHT}" media="(prefers-color-scheme: light)"`);
    expect(html).toContain(`content="${DARK}" media="(prefers-color-scheme: dark)"`);
    expect(tokens.toLowerCase()).toContain(LIGHT);
    expect(tokens.toLowerCase()).toContain(DARK);
  });

  it('keeps its names to itself, out of the scripts that come after it', () => {
    expect(inlineScript('ksana:theme').trim()).toMatch(/^\(function \(\) \{[\s\S]*\}\)\(\);$/);
  });
});

describe("index.html's icon for a phone's home screen", () => {
  it('names a 180 × 180 picture the build publishes beside the page, under the name Ksana', () => {
    const name = html.match(/<link rel="apple-touch-icon" href="\.\/([^"]+)" \/>/)?.[1];
    expect(name).toBe('apple-touch-icon.png');
    const png = readFileSync(new URL(`../../public/${name}`, import.meta.url));
    const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(String.fromCharCode(...png.subarray(1, 4))).toBe('PNG');
    // The width and the height, from the picture's IHDR chunk
    expect([header.getUint32(16), header.getUint32(20)]).toEqual([180, 180]);
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Ksana" />');
  });
});

describe("index.html's frame while the page's scripts download", () => {
  const frame = html.slice(html.indexOf('<div id="root">'), html.indexOf('<script type="module"'));
  /** Whether a source gives an element the class `name`: alone, or first before a class its caller adds */
  const gives = (where: string, name: string) => where.includes(`className="${name}"`) || where.includes(`className={\`${name} `);

  it('draws the mark the top bar draws', () => {
    expect(frame).toContain(`<path d="${ENSO.d}" fill="var(--ink)" />`);
    expect(frame).toContain(`<rect x="${ENSO.seal.x}" y="${ENSO.seal.y}" width="6.2" height="6.2" rx="0.8" fill="var(--zhu)" transform="${ENSO.seal.transform}" />`);
  });

  it("lays itself out with the top bar's, the connecting screen's and its title's classes, which the page then draws in its place", () => {
    const shell = source('./Shell.tsx');
    const app = source('./App.tsx');
    const brand = source('../components/Brand.tsx');
    const ui = source('../components/ui.tsx');
    for (const [name, where] of [
      ['topbar', shell],
      ['topbar-inner', shell],
      ['topbar-brand', shell],
      ['wordmark', brand],
      ['wordmark-text', brand],
      ['page narrow-page', app],
      ['page-head', ui],
      ['page-head-main', ui],
      ['eyebrow page-eyebrow', ui],
      ['page-title', ui],
      ['page-meta', ui],
      ['skeleton-lines', app],
    ] as const) {
      expect(frame, name).toContain(`class="${name}"`);
      expect(gives(where, name), name).toBe(true);
    }
    // The screen under the top bar is the connecting screen's as it waits, the footer below it
    expect(frame).toContain('<main class="app-main app-main--waiting">');
    expect(app).toContain("className={waiting ? 'app-main app-main--waiting' : 'app-main'}");
  });

  it('says nothing in a language, but the brand and what it says when the page cannot open', () => {
    const text = frame
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
      .replace(/<template[\s\S]*?<\/template>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .trim();
    expect(text).toBe('Ksana');
  });

  it("keeps a browser without scripts' message out of the busy frame, which it hides", () => {
    const busy = frame.slice(frame.indexOf('id="boot"'), frame.indexOf('<noscript>'));
    expect(busy).toContain('aria-busy="true"');
    expect(busy).not.toContain('needs JavaScript');
    expect(frame).toMatch(/<noscript>\s*<div class="page narrow-page"><p class="prose">This page reads the chain in your browser, and needs JavaScript to do so\.<\/p><\/div>\s*<\/noscript>/);
    expect(html).toContain('<noscript><style>#boot { display: none; }</style></noscript>');
  });
});

/** A stand-in for the elements index.html's notes script works with */
class El {
  readonly tagName: string;
  id = '';
  className = '';
  type = '';
  readonly attrs = new Map<string, string>();
  kids: El[] = [];
  parentNode: El | null = null;
  readonly text: string;
  onClick?: () => void;

  constructor(tag: string, attrs: Record<string, string> = {}, kids: El[] = [], text = '') {
    this.tagName = tag.toUpperCase();
    this.text = text;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'id') this.id = v;
      else this.attrs.set(k, v);
    }
    for (const kid of kids) this.appendChild(kid);
  }

  get firstChild(): El | null {
    return this.kids[0] ?? null;
  }

  appendChild(el: El): El {
    el.parentNode = this;
    this.kids.push(el);
    return el;
  }

  removeChild(el: El): El {
    this.kids = this.kids.filter((k) => k !== el);
    el.parentNode = null;
    return el;
  }

  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }

  removeAttribute(k: string) {
    this.attrs.delete(k);
  }

  addEventListener(_type: string, fn: () => void) {
    this.onClick = fn;
  }

  cloneNode(): El {
    return new El(this.tagName, Object.fromEntries(this.attrs), this.kids.map((k) => k.cloneNode()), this.text);
  }

  /** The selectors the script uses: `[data-note="…"]`, `.row` and `button` */
  querySelector(sel: string): El | null {
    for (const kid of this.kids) {
      const hit = sel === 'button' ? kid.tagName === 'BUTTON' : sel === '.row' ? (kid.attrs.get('class') ?? '').split(' ').includes('row') : sel === `[data-note="${kid.attrs.get('data-note')}"]`;
      if (hit) return kid;
      const deeper = kid.querySelector(sel);
      if (deeper) return deeper;
    }
    return null;
  }

  find(id: string): El | null {
    if (this.id === id) return this;
    for (const kid of this.kids) {
      const hit = kid.find(id);
      if (hit) return hit;
    }
    return null;
  }
}

describe("index.html's notes when the page cannot open", () => {
  const template = html.slice(html.indexOf('<template id="boot-notes">'), html.indexOf('</template>'));
  const notes = Object.fromEntries([...template.matchAll(/<p class="prose" data-note="(\w+)">([^<]+)<\/p>/g)].map((m) => [m[1] ?? '', m[2] ?? ''] as const));
  const SCRIPT = 'https://signet.example/assets/index-abc.js';

  /** The frame and the notes as index.html gives them, with the script run against them; `loading` while the document is still read */
  function boot(readyState = 'complete') {
    const lines = new El('div', { class: 'skeleton-lines', 'aria-hidden': 'true' });
    const head = new El('div', { class: 'page-head', 'aria-hidden': 'true' });
    const frame = new El('div', { id: 'boot', class: 'page narrow-page', 'aria-busy': 'true' }, [head, lines]);
    const content = new El('fragment', {}, [
      ...Object.entries(notes).map(([note, text]) => new El('p', { class: 'prose', 'data-note': note }, [], text)),
      new El('div', { class: 'row wrap' }, [new El('button', { class: 'btn btn--primary btn--md' }, [], 'Reload')]),
    ]);
    const body = new El('body', {}, [new El('main', { class: 'app-main' }, [frame, Object.assign(new El('template', { id: 'boot-notes' }), { content })])]);
    const module = Object.assign(new El('script'), { type: 'module', src: SCRIPT });
    let onError: ((e: unknown) => void) | undefined;
    let onReady: (() => void) | undefined;
    let later: { fn: () => void; ms: number } | undefined;
    const location = { reload: vi.fn() };
    const document = {
      readyState,
      getElementById: (id: string) => body.find(id),
      createElement: (tag: string) => new El(tag),
      querySelector: (sel: string) => (sel === 'script[type="module"][src]' ? module : null),
      addEventListener: (type: string, fn: () => void) => {
        if (type === 'DOMContentLoaded') onReady = fn;
      },
    };
    const addEventListener = (type: string, fn: (e: unknown) => void, capture: boolean) => {
      if (type === 'error' && capture) onError = fn;
    };
    const setTimeout = (fn: () => void, ms: number) => {
      later = { fn, ms };
    };
    new Function('document', 'addEventListener', 'setTimeout', 'location', inlineScript('boot-note'))(document, addEventListener, setTimeout, location);
    const said = () => {
      const note = body.find('boot-note');
      return note && { role: note.attrs.get('role'), says: note.kids[0]?.text, button: note.querySelector('button')?.text, className: note.className };
    };
    return {
      frame,
      body,
      /** What the frame holds: its title's and lines' places, and the note */
      drawn: () => frame.kids.map((k) => (k === head ? 'head' : k === lines ? 'lines' : k.id)),
      location,
      said,
      error: (e: unknown) => onError?.(e),
      wait: () => later,
      ready: () => {
        document.readyState = 'interactive';
        onReady?.();
      },
    };
  }

  it('says in English that the page could not be downloaded, could not run, or is still loading, with a button that reloads', () => {
    expect(notes).toEqual({
      fetch: 'The page could not be downloaded. Check the connection, then reload it.',
      run: 'This browser could not run the page. Reload it, and if it still does not open, update the browser or use another one.',
      slow: 'The page is still loading. If it does not open, check the connection and reload it.',
    });
    // The page's own button, row and stack
    expect(template).toContain('<div class="row wrap"><button type="button" class="btn btn--primary btn--md"><span>Reload</span></button></div>');
    expect(source('../components/ui.tsx')).toContain('className={`btn btn--${variant} btn--${size} ${className}`}');
    expect(source('./App.tsx')).toContain('className="row wrap"');
    expect(source('../styles/base.css')).toContain('.stack {');
  });

  it("a failed download of the page's script: the lines give way to an alert, whose button reloads the page", () => {
    const b = boot();
    b.error({ target: Object.assign(new El('script'), { type: 'module' }) });
    expect(b.said()).toEqual({ role: 'alert', says: notes.fetch, button: 'Reload', className: 'stack' });
    expect(b.drawn()).toEqual(['boot-note']);
    expect(b.frame.attrs.has('aria-busy')).toBe(false);
    b.body.find('boot-note')?.querySelector('button')?.onClick?.();
    expect(b.location.reload).toHaveBeenCalledOnce();
  });

  it("an error from inside the page's own script, and only from it, says this browser could not run it", () => {
    const b = boot();
    b.error({ target: new El('img') });
    b.error({ target: Object.assign(new El('script'), { type: 'text/javascript' }) });
    b.error({ target: {}, filename: 'https://wallet.example/inject.js' });
    b.error({ target: {}, filename: '' });
    expect(b.said()).toBeNull();
    expect(b.drawn()).toEqual(['head', 'lines']);
    b.error({ target: {}, filename: SCRIPT });
    expect(b.said()).toMatchObject({ role: 'alert', says: notes.run });
    // The first failure stands
    b.error({ target: Object.assign(new El('script'), { type: 'module' }) });
    expect(b.said()).toMatchObject({ says: notes.run });
  });

  it('still loading after 15 seconds: a status under the lines, which go on, and which a failure then replaces', () => {
    const b = boot();
    expect(b.wait()?.ms).toBe(15_000);
    b.wait()?.fn();
    expect(b.said()).toEqual({ role: 'status', says: notes.slow, button: 'Reload', className: 'stack' });
    expect(b.drawn()).toEqual(['head', 'lines', 'boot-note']);
    expect(b.frame.attrs.get('aria-busy')).toBe('false');
    b.error({ target: Object.assign(new El('script'), { type: 'module' }) });
    expect(b.said()).toMatchObject({ role: 'alert', says: notes.fetch });
    expect(b.drawn()).toEqual(['boot-note']);
  });

  it('says nothing once the page has drawn itself in place of the frame', () => {
    const b = boot();
    b.frame.parentNode?.removeChild(b.frame);
    b.wait()?.fn();
    b.error({ target: Object.assign(new El('script'), { type: 'module' }) });
    expect(b.said()).toBeNull();
  });

  it('waits for the rest of the document when an error comes while it is still read', () => {
    const b = boot('loading');
    b.error({ target: Object.assign(new El('script'), { type: 'module' }) });
    expect(b.said()).toBeNull();
    b.ready();
    expect(b.said()).toMatchObject({ role: 'alert', says: notes.fetch });
  });
});
