import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focused, holdReadersPlace, inView } from './anchor';

/** An element laid out from `top` to `top + height` in the viewport, with its children */
interface Box {
  name: string;
  top: number;
  height: number;
  children: Box[];
  getBoundingClientRect(): { top: number; bottom: number; height: number };
}

function box(name: string, top: number, height: number, children: Box[] = []): Box {
  return { name, top, height, children, getBoundingClientRect: () => ({ top, bottom: top + height, height }) };
}

const names = (path: Element[]) => path.map((e) => (e as unknown as Box).name);
const el = (b: Box) => b as unknown as Element;

describe('the element a page holds in place as content arrives above it', () => {
  // A page scrolled so that the top bar ends at 60 px: its heading and the first two rows of a list are above it
  const rows = [box('row1', -70, 60), box('row2', -10, 60), box('row3', 50, 60), box('row4', 110, 60)];
  const page = box('main', -300, 1200, [box('head', -300, 120), box('list', -160, 400, [box('caption', -160, 30), box('body', -130, 370, rows)])]);

  it('is the first one in view under the top bar, found in the ones that start above it', () => {
    // The second row ends at 50 px, under the bar; the third, from 50 to 110 px, is partly in view, and has nothing in it to go into
    expect(names(inView(el(page), 60))).toEqual(['list', 'body', 'row3']);
    // Under a bar ending at 50 px the third row is the first to start in view
    expect(names(inView(el(page), 50))).toEqual(['list', 'body', 'row3']);
    // With no bar the second row is the first partly in view
    expect(names(inView(el(page), 0))).toEqual(['list', 'body', 'row2']);
  });

  it('goes into a row partly in view, down to what starts in view', () => {
    const row = box('row', 20, 80, [box('badge', 22, 20), box('summary', 44, 50, [box('amount', 46, 18), box('party', 70, 18)])]);
    expect(names(inView(el(box('main', -100, 400, [row])), 66))).toEqual(['row', 'summary', 'party']);
    // Where the amount reaches below the bar too, it comes first
    expect(names(inView(el(box('main', -100, 400, [row])), 50))).toEqual(['row', 'summary', 'amount']);
  });

  it('passes over what is drawn over the page, and what takes no room', () => {
    const summary = box('summary', 60, 300);
    const gone = box('gone', 70, 0);
    const form = box('form', 80, 600);
    const page = box('main', -200, 1000, [summary, gone, form]);
    expect(names(inView(el(page), 60, (e) => e === el(summary)))).toEqual(['form']);
  });

  it('is none where nothing reaches below the bar', () => {
    expect(inView(el(box('main', -900, 800, [box('a', -900, 400), box('b', -500, 400)])), 60)).toEqual([]);
  });
});

/** An element a finger is put on, with listeners of its own: a touch's end goes to it even once it has left the page */
function element() {
  const heard = new Map<string, ((e: object) => void)[]>();
  return {
    addEventListener: (type: string, fn: (e: object) => void) => heard.set(type, [...(heard.get(type) ?? []), fn]),
    fire: (type: string, e: object) => {
      for (const fn of heard.get(type) ?? []) fn(e);
    },
  };
}

/**
 * A page of rows `height` px tall from `listTop` in the document, the top bar ending at 60 px, scrolled as WebKit scrolls: to whole
 * pixels. Its clock, its touches, its scrolls and its rows arriving at the head of the list are the test's
 */
function page(o: { height: number; rows: number; listTop: number; scrollY: number }) {
  let y = o.scrollY;
  let clock = 0;
  let changed: (() => void) | undefined;
  const listeners = new Map<string, ((e: object) => void)[]>();
  const frames: (() => void)[] = [];
  const moves: number[] = [];
  const rect = (top: number, height: number) => ({ top, bottom: top + height, height, width: 300 });
  const rows: { children: never[]; isConnected: boolean; getBoundingClientRect: () => ReturnType<typeof rect> }[] = [];
  const row = () => {
    const self = { children: [] as never[], isConnected: true, getBoundingClientRect: () => rect(o.listTop + rows.indexOf(self) * o.height - y, o.height) };
    return self;
  };
  for (let i = 0; i < o.rows; i++) rows.push(row());
  const list = { children: rows, isConnected: true, getBoundingClientRect: () => rect(o.listTop - y, rows.length * o.height) };
  const main = { children: [list], isConnected: true, getBoundingClientRect: () => rect(-y, o.listTop + rows.length * o.height) };
  const fire = (type: string, e: object = {}) => {
    for (const fn of listeners.get(type) ?? []) fn(e);
  };
  const flush = () => {
    while (frames.length) frames.shift()?.();
  };
  vi.stubGlobal('window', {
    get scrollY() {
      return y;
    },
    scrollX: 0,
    innerHeight: 844,
    scrollTo: (_x: number, to: number) => {
      y = Math.max(0, Math.round(to));
      moves.push(y);
    },
    addEventListener: (type: string, fn: (e: object) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
  });
  vi.stubGlobal('document', {
    getElementById: (id: string) => (id === 'root' ? {} : id === 'main' ? main : null),
    querySelector: (q: string) => (q === '.topbar' ? { getBoundingClientRect: () => rect(0, 60) } : null),
    addEventListener: () => {},
    activeElement: null,
    documentElement: { setAttribute: () => {}, removeAttribute: () => {} },
  });
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(fn: () => void) {
        changed = fn;
      }
      observe() {}
    },
  );
  vi.stubGlobal('ResizeObserver', undefined);
  vi.stubGlobal('CSS', { supports: () => false });
  vi.stubGlobal('getComputedStyle', () => ({ position: 'static' }));
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => frames.push(fn));
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  holdReadersPlace();
  return {
    moves,
    /** The time, in ms */
    at: (ms: number) => {
      clock = ms;
    },
    /** A scroll that is not the page's own, by `dy` px, with its next frame */
    scroll: (dy: number) => {
      y = Math.max(0, y + dy);
      fire('scroll');
      flush();
    },
    /** A finger put on the screen, on an element, with `others` still on it: the element */
    touch: (others = 0) => {
      const target = element();
      fire('touchstart', { touches: Array.from({ length: others + 1 }, () => ({})), target });
      return target;
    },
    /** A finger lifted, `others` staying on the screen */
    letGo: (others = 0) => fire('touchend', { touches: Array.from({ length: others }, () => ({})) }),
    /** A finger lifted from an element that has left the page: its touch's end goes to the element alone */
    letGoFrom: (target: ReturnType<typeof element>) => target.fire('touchend', { touches: [] }),
    /** A row arriving at the head of the list, and the scroll event the page's own scroll fires after it */
    arrive: () => {
      const before = moves.length;
      rows.unshift(row());
      changed?.();
      if (moves.length > before) fire('scroll');
      flush();
    },
    /** The first row in view under the bar */
    read: () => rows.find((r) => r.getBoundingClientRect().bottom > 60),
    top: (r: { getBoundingClientRect: () => { top: number } } | undefined) => r?.getBoundingClientRect().top ?? Number.NaN,
  };
}

describe("the page's own scroll anchoring, where the browser has none", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the row read where it stood to under a pixel as rows of a fractional height arrive above it, however many', () => {
    const p = page({ height: 52.5, rows: 60, listTop: 200, scrollY: 1000 });
    p.scroll(0);
    const read = p.read();
    const top = p.top(read);
    for (let i = 1; i <= 40; i++) {
      p.at(i * 1000);
      p.arrive();
    }
    expect(p.moves).toHaveLength(40);
    expect(Math.abs(p.top(read) - top)).toBeLessThan(1);
  });

  it('leaves a finger and a fling alone, what arrives meanwhile moving the rows in view, and holds the place again once they end', () => {
    const p = page({ height: 52.5, rows: 60, listTop: 200, scrollY: 1000 });
    p.scroll(0);
    p.at(1000);
    p.touch();
    p.touch(1);
    p.arrive();
    // One of two fingers lifted, the other still on the screen
    p.at(1050);
    p.letGo(1);
    p.at(1300);
    p.arrive();
    expect(p.moves).toEqual([]);
    p.at(1400);
    p.letGo();
    // the fling's frames
    for (let t = 1416; t <= 1700; t += 16) {
      p.at(t);
      p.scroll(12);
      if (t === 1608) p.arrive();
    }
    expect(p.moves).toEqual([]);
    const read = p.read();
    const top = p.top(read);
    p.at(1860);
    p.arrive();
    expect(p.moves).toHaveLength(1);
    expect(Math.abs(p.top(read) - top)).toBeLessThan(1);
  });

  it('moves nothing either just after a finger is lifted, before the fling it starts has scrolled the page', () => {
    const p = page({ height: 52.5, rows: 60, listTop: 200, scrollY: 1000 });
    p.scroll(0);
    p.at(1000);
    p.touch();
    p.at(1040);
    p.letGo();
    p.at(1050);
    p.arrive();
    expect(p.moves).toEqual([]);
    const read = p.read();
    const top = p.top(read);
    p.at(1300);
    p.arrive();
    expect(p.moves).toHaveLength(1);
    expect(Math.abs(p.top(read) - top)).toBeLessThan(1);
  });

  it('hears a finger lifted from a row that left the page meanwhile, which the window does not', () => {
    const p = page({ height: 52.5, rows: 60, listTop: 200, scrollY: 1000 });
    p.scroll(0);
    p.at(1000);
    const row = p.touch();
    p.arrive();
    // The row under the finger was pushed out of the list, or drawn anew: the touch's end goes to it alone
    p.at(1100);
    p.letGoFrom(row);
    const read = p.read();
    const top = p.top(read);
    p.at(1400);
    p.arrive();
    expect(p.moves).toHaveLength(1);
    expect(Math.abs(p.top(read) - top)).toBeLessThan(1);
  });

  it("takes a scroll the page made itself (back where the reader left it) for none of theirs, and holds nothing at the page's top", () => {
    const p = page({ height: 52.5, rows: 60, listTop: 200, scrollY: 0 });
    p.at(1000);
    p.arrive();
    expect(p.moves).toEqual([]);
    p.scroll(1500);
    p.at(1010);
    p.arrive();
    expect(p.moves).toHaveLength(1);
  });
});

/** A part of a page laid out top to bottom from the top of the document: one with parts of its own takes their heights, one without its own */
interface Part {
  name: string;
  own: number;
  children: Part[];
  parentElement: Part | null;
  readonly isConnected: boolean;
  /** Drawn over the page as it scrolls */
  pinned?: boolean;
  /** Given the focus by the keyboard (`:focus-visible`) */
  keyboard?: boolean;
  getBoundingClientRect(): { top: number; bottom: number; height: number; width: number };
  matches(selector: string): boolean;
  contains(other: Part): boolean;
}

/** The page's scroll, which every part is drawn under */
let scrolled = 0;
/** Whether the window has the focus: none shows while it has not, as in Chromium (`:focus-visible`) */
let windowFocused = true;

function part(name: string, own: number, children: Part[] = []): Part {
  const height = (p: Part): number => (p.children.length ? p.children.reduce((sum, c) => sum + height(c), 0) : p.own);
  const top = (p: Part): number => {
    const parent = p.parentElement;
    if (!parent) return 0;
    let at = top(parent);
    for (const c of parent.children) {
      if (c === p) break;
      at += height(c);
    }
    return at;
  };
  const self: Part = {
    name,
    own,
    children,
    parentElement: null,
    get isConnected(): boolean {
      const parent = self.parentElement;
      return parent ? parent.children.includes(self) && parent.isConnected : name === 'root';
    },
    getBoundingClientRect: () => {
      const t = top(self) - scrolled;
      return { top: t, bottom: t + height(self), height: height(self), width: 300 };
    },
    matches: (selector) => selector === ':focus-visible' && !!self.keyboard && windowFocused,
    contains: (other) => {
      for (let p: Part | null = other; p; p = p.parentElement) if (p === self) return true;
      return false;
    },
  };
  for (const c of children) c.parentElement = self;
  return self;
}

/**
 * The overview on a phone, scrolled to `scrollY` under a top bar ending at 60 px, over a bottom bar from 780 px, in a browser that
 * anchors scrolling itself (`native`) or not: a heading, the latest blocks (ten rows of 76 px that keep their number), the head of the
 * latest operations with its link to them, and nine operations of 64 px. The focus, the scrolls and the changes are the test's
 */
function overview(o: { native: boolean; scrollY: number }) {
  scrolled = o.scrollY;
  windowFocused = true;
  let changed: (() => void) | undefined;
  let active: Part | null = null;
  let arrived = 0;
  const frames: (() => void)[] = [];
  const moves: number[] = [];
  const attrs = new Map<string, string>();
  const heard = new Map<string, (() => void)[]>();
  const blocks = part('blocks', 0, Array.from({ length: 10 }, (_, i) => part(`block${i}`, 76)));
  const gap = part('gap', 60);
  const allOps = part('allOps', 40);
  const ops = part('ops', 0, Array.from({ length: 9 }, (_, i) => part(`op${i}`, 64)));
  const bar = part('sendBar', 0, [part('review', 48)]);
  bar.pinned = true;
  const main = part('main', 0, [part('head', 120), blocks, part('opsHead', 0, [gap, allOps]), ops, bar]);
  const theme = part('theme', 40);
  const root = part('root', 0, [main, part('footer', 0, [theme])]);
  const fire = (target: Map<string, (() => void)[]>, type: string) => {
    for (const fn of target.get(type) ?? []) fn();
  };
  const listen = (target: Map<string, (() => void)[]>) => (type: string, fn: () => void) => target.set(type, [...(target.get(type) ?? []), fn]);
  const windowHeard = new Map<string, (() => void)[]>();
  const flush = () => {
    while (frames.length) frames.shift()?.();
  };
  const rect = (top: number, height: number) => ({ top, bottom: top + height, height, width: 390 });
  vi.stubGlobal('window', {
    get scrollY() {
      return scrolled;
    },
    scrollX: 0,
    innerHeight: 844,
    scrollTo: (_x: number, to: number) => {
      scrolled = Math.max(0, Math.round(to));
      moves.push(scrolled);
    },
    addEventListener: listen(windowHeard),
  });
  vi.stubGlobal('document', {
    getElementById: (id: string) => (id === 'root' ? root : id === 'main' ? main : null),
    querySelector: (q: string) => (q === '.topbar' ? { getBoundingClientRect: () => rect(0, 60) } : q === '.bottomnav' ? { getBoundingClientRect: () => rect(780, 64) } : null),
    addEventListener: listen(heard),
    get activeElement() {
      return active;
    },
    hasFocus: () => windowFocused,
    documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) },
  });
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(fn: () => void) {
        changed = fn;
      }
      observe() {}
    },
  );
  vi.stubGlobal('ResizeObserver', undefined);
  vi.stubGlobal('CSS', { supports: (prop: string) => o.native && prop === 'overflow-anchor' });
  vi.stubGlobal('getComputedStyle', (p: Part) => ({ position: p.pinned ? 'sticky' : 'static' }));
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => frames.push(fn));
  vi.spyOn(performance, 'now').mockImplementation(() => 10_000);
  holdReadersPlace();
  /** A change to the page, and the scroll event the page's own scroll fires after it, with its frame */
  const change = (fn: () => void) => {
    const before = moves.length;
    fn();
    changed?.();
    if (moves.length > before) fire(windowHeard, 'scroll');
    flush();
  };
  return {
    root,
    moves,
    allOps,
    theme,
    review: bar.children[0],
    op: (i: number) => ops.children[i],
    /** Whether the root asks the browser to anchor scrolling to the focus */
    asked: () => attrs.get('data-place') === 'focus',
    /** The focus moved to `p`, by the keyboard or not, and where the browser then scrolls it (`scrollY`), before the next frame */
    focus: (p: Part | undefined, o: { keyboard: boolean; scrollY?: number }) => {
      if (active) fire(heard, 'focusout');
      active = p ?? null;
      if (p) p.keyboard = o.keyboard;
      if (p) fire(heard, 'focusin');
      if (o.scrollY !== undefined) scrolled = o.scrollY;
    },
    /** The next frame, with the scroll event of a scroll before it */
    frame: () => {
      fire(windowHeard, 'scroll');
      flush();
    },
    /** The window losing the focus or getting it back, the focus told of it, before the next frame */
    windowFocus: (has: boolean) => {
      windowFocused = has;
      if (active) fire(heard, has ? 'focusin' : 'focusout');
    },
    /** A scroll that is not the page's own, by `dy` px, with its next frame */
    scroll: (dy: number) => {
      scrolled = Math.max(0, scrolled + dy);
      fire(windowHeard, 'scroll');
      flush();
    },
    /** A block arriving at the head of the latest blocks, the oldest leaving at their end */
    arrive: () =>
      change(() => {
        const row = part(`new${arrived++}`, 76);
        row.parentElement = blocks;
        blocks.children.unshift(row);
        blocks.children.pop();
      }),
    /** The head of the latest operations growing by `dy` px, above their link */
    grow: (dy: number) => change(() => (gap.own += dy)),
    /** A part taken out of the page, the focus with it where it was in it, with no focus event heard */
    remove: (q: Part) =>
      change(() => {
        const parent = q.parentElement;
        parent?.children.splice(parent.children.indexOf(q), 1);
        if (active && q.contains(active)) active = null;
      }),
    top: (p: Part | undefined) => p?.getBoundingClientRect().top ?? Number.NaN,
  };
}

describe("the keyboard's focus, the reader's place where it shows in the window", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is found as the elements it is in down to it: none for a press, a focus outside the page or one on what is drawn over it', () => {
    const p = overview({ native: true, scrollY: 600 });
    const root = p.root as unknown as Element;
    const names = (path: Element[]) => path.map((e) => (e as unknown as Part).name);
    p.focus(p.op(2), { keyboard: true });
    expect(names(focused(root))).toEqual(['main', 'ops', 'op2']);
    // The footer's, below the page
    p.focus(p.theme, { keyboard: true });
    expect(names(focused(root))).toEqual(['footer', 'theme']);
    p.focus(p.op(2), { keyboard: false });
    expect(focused(root)).toEqual([]);
    // The send page's Review on its bar while the bar is pinned at the foot
    p.focus(p.review, { keyboard: true });
    expect(focused(root)).toEqual([]);
    p.focus(undefined, { keyboard: true });
    expect(focused(root)).toEqual([]);
  });

  it('is the keyboard’s as the window last had it while the window does not have the focus, though none shows', () => {
    const p = overview({ native: true, scrollY: 600 });
    const root = p.root as unknown as Element;
    const names = (path: Element[]) => path.map((e) => (e as unknown as Part).name);
    p.focus(p.op(2), { keyboard: true });
    p.frame();
    p.windowFocus(false);
    p.frame();
    expect([names(focused(root)), p.asked()]).toEqual([['main', 'ops', 'op2'], true]);
    p.windowFocus(true);
    p.frame();
    expect([names(focused(root)), p.asked()]).toEqual([['main', 'ops', 'op2'], true]);
    // A press's focus is none, whether the window has the focus or not
    p.focus(p.op(2), { keyboard: false });
    p.windowFocus(false);
    p.frame();
    expect([focused(root), p.asked()]).toEqual([[], false]);
  });

  it('is held by the page itself while the window does not have the focus, rather than the first thing in view', () => {
    const p = overview({ native: false, scrollY: 600 });
    p.focus(p.op(0), { keyboard: true });
    p.frame();
    p.windowFocus(false);
    p.frame();
    const top = p.top(p.op(0));
    for (let i = 0; i < 3; i++) p.arrive();
    expect([p.moves, p.top(p.op(0))]).toEqual([[], top]);
  });

  it('is held where it stands as a list above it that keeps its length takes a row, rather than the first thing in view', () => {
    // Without anchoring of the browser's own: with no focus the first block row in view is held, and the operations below move up a row
    const p = overview({ native: false, scrollY: 600 });
    p.frame();
    p.arrive();
    expect(p.moves).toEqual([676]);
    // The keyboard on the first operation, 304 px below the top bar's foot
    p.focus(p.op(0), { keyboard: true });
    p.frame();
    const top = p.top(p.op(0));
    for (let i = 0; i < 5; i++) p.arrive();
    expect(p.moves).toEqual([676]);
    expect(p.top(p.op(0))).toBe(top);
    // What grows above it moves the page instead
    p.grow(30);
    expect(p.moves).toEqual([676, 706]);
    expect(p.top(p.op(0))).toBe(top);
  });

  it('asks a browser that anchors scrolling itself to anchor it to the focus while that shows in the window, and moves nothing itself', () => {
    const p = overview({ native: true, scrollY: 600 });
    p.frame();
    p.arrive();
    expect([p.asked(), p.moves]).toEqual([false, []]);
    // A press puts the focus on a link: the browser anchors as it does by itself
    p.focus(p.allOps, { keyboard: false });
    p.frame();
    p.arrive();
    expect([p.asked(), p.moves]).toEqual([false, []]);
    p.focus(p.allOps, { keyboard: true });
    expect(p.asked()).toBe(true);
    p.frame();
    p.arrive();
    p.grow(20);
    expect([p.asked(), p.moves]).toEqual([true, []]);
    // Scrolled out of the window by the reader, the focus is no place of theirs, and back in it is again
    p.scroll(900);
    expect(p.asked()).toBe(false);
    p.scroll(-900);
    expect(p.asked()).toBe(true);
    // Taken out of the page with what it was in, it is let go in the frame after
    p.remove(p.allOps);
    expect([p.asked(), p.moves]).toEqual([false, []]);
  });

  it('asks for the focus from the moment the keyboard moves it, before the browser has scrolled it into view', () => {
    // The keyboard moves to the last operation, below the bottom bar
    const p = overview({ native: true, scrollY: 600 });
    p.frame();
    p.focus(p.op(8), { keyboard: true });
    expect(p.top(p.op(8))).toBeGreaterThan(780);
    expect(p.asked()).toBe(true);
    // The browser scrolls it up to 12 px above the bottom bar
    p.focus(p.op(8), { keyboard: true, scrollY: 788 });
    p.frame();
    expect([p.top(p.op(8)), p.asked()]).toEqual([704, true]);
    // Moved by a script that scrolls nothing, it stays out of the window, and is let go in the next frame
    p.focus(p.op(0), { keyboard: true, scrollY: 1700 });
    expect(p.asked()).toBe(true);
    p.frame();
    expect(p.asked()).toBe(false);
  });

  it('is held by the page itself from the moment the keyboard moves it, where the browser scrolled it to, before the next frame', () => {
    // The keyboard moves to the last operation, below the bottom bar, and the browser scrolls it up to 12 px above that bar; the head of
    // the list grows before the next frame (a list letting go of its rows as the focus leaves it)
    const p = overview({ native: false, scrollY: 600 });
    p.focus(p.op(8), { keyboard: true, scrollY: 788 });
    const top = p.top(p.op(8));
    expect(top).toBe(704);
    p.grow(76);
    expect(p.moves).toEqual([864]);
    expect(p.top(p.op(8))).toBe(top);
  });

  it('leaves the first thing in view held where the focus shows nowhere, with no anchoring of the browser’s own', () => {
    const p = overview({ native: false, scrollY: 600 });
    p.focus(p.op(0), { keyboard: true });
    p.frame();
    // The reader scrolls back up to the top of the blocks, the focus below the window
    p.scroll(-480);
    expect(p.top(p.op(0))).toBeGreaterThan(780);
    p.arrive();
    expect(p.moves).toEqual([196]);
  });
});

describe('the browser’s own anchoring while the root asks it to anchor to the focus', () => {
  const rules = () =>
    ['base.css', 'components.css', 'pages.css'].flatMap((name) => {
      const css = readFileSync(new URL(`../styles/${name}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: (m[1] ?? '').trim().split(/\s*,\s*/), body: (m[2] ?? '').trim() }));
    });

  it('leaves out of its choice every element the focus is not in, and the pseudo-elements of those it is in, and nothing else in the stylesheets', () => {
    expect(rules().filter((r) => /overflow-anchor/.test(r.body))).toEqual([
      {
        selectors: ["html[data-place='focus'] :not(:focus-within)", "html[data-place='focus'] :focus-within::before", "html[data-place='focus'] :focus-within::after"],
        body: 'overflow-anchor: none;',
      },
    ]);
  });

  it('finds every absolutely placed pseudo-element in an element placed itself, which leaves it out with it', () => {
    // Chromium walks what is placed against the window apart from the rest: a pseudo-element placed so would have to be left out by name.
    // Each of these stands in its element, which the rule named beside it places (`position: relative`)
    const all = rules();
    const placed = all
      .filter((r) => /position:\s*(absolute|fixed)/.test(r.body))
      .flatMap((r) => r.selectors)
      .filter((s) => /::(before|after)$/.test(s));
    const own: Record<string, string> = {
      '.nav-link[aria-current="page"]::after': '.nav-link',
      '.tracker-node--active .tracker-shape::after': '.tracker-node--active .tracker-shape',
      '.vf-arrow::before': '.vf-arrow',
      '.vf-arrow::after': '.vf-arrow',
      '.copy-btn:not(.copy-btn--labelled)::after': '.copy-btn:not(.copy-btn--labelled)',
      '.input-max::after': '.input-max',
      'details > summary::after': 'details > summary',
    };
    expect(placed).toEqual(Object.keys(own));
    for (const [pseudo, el] of Object.entries(own)) {
      expect([pseudo, all.some((r) => r.selectors.includes(el) && /position:\s*relative/.test(r.body))]).toEqual([pseudo, true]);
    }
  });
});
