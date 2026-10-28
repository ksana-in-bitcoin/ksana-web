import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitLabels, fitTopBar, TOP_FOLDS } from './fit';

/**
 * A tab's label in a phone's bottom bar at 320 px: its words `wide` px wide at its full size, in the 60 px its tab leaves it. Set
 * smaller (its `--fit`), they take that share of their width; what does not fit is cut off at the tab's edge
 */
function label(wide: number) {
  const props = new Map<string, string>();
  const shown = () => Math.round(wide * Number(props.get('--fit') ?? 1));
  return {
    style: {
      setProperty: (name: string, value: string) => void props.set(name, value),
      removeProperty: (name: string) => void props.delete(name),
    },
    get clientWidth() {
      return Math.min(60, shown());
    },
    get scrollWidth() {
      return shown();
    },
    fit: () => props.get('--fit') ?? '',
    /** Its words made wider, as by the reader's own letter and word spacing */
    widen: (to: number) => {
      wide = to;
    },
  };
}

type Label = ReturnType<typeof label>;

/** The bar, holding its labels */
const bar = (labels: Label[]) => ({ querySelectorAll: () => labels }) as unknown as HTMLElement;

let observers: { report: () => void; watched: unknown[]; stopped: boolean }[] = [];
let frames = new Map<number, () => void>();

/** The next frame: the work put off to it */
const nextFrame = () => {
  const due = [...frames.values()];
  frames = new Map();
  for (const run of due) run();
};

beforeEach(() => {
  observers = [];
  frames = new Map();
  let id = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      watched: unknown[] = [];
      stopped = false;
      constructor(readonly report: () => void) {
        observers.push(this);
      }
      observe(el: unknown) {
        this.watched.push(el);
      }
      disconnect() {
        this.stopped = true;
      }
    },
  );
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
    frames.set(++id, run);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (at: number) => frames.delete(at));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('A phone’s bottom bar', () => {
  it('sets a label longer than its tab smaller until it fits, down to 70% of its size, and leaves one that fits as it is', () => {
    const labels = [label(51), label(70), label(87)];
    fitLabels(bar(labels));
    expect(labels.map((l) => l.fit())).toEqual(['', '0.85', '0.7']);
  });

  it('fits a label again in the frame after its own size changes, as under a reader’s own spacing set once the page is drawn', () => {
    const labels = [label(51), label(57)];
    const nav = bar(labels);
    fitLabels(nav);
    expect(labels.map((l) => l.fit())).toEqual(['', '']);
    // The bar keeps its width: what changes is a label's own size, which is watched as the bar is
    const [watch] = observers;
    expect(watch?.watched).toEqual([nav, ...labels]);
    labels[1]?.widen(70);
    watch?.report();
    watch?.report();
    // Not in the observer's own report, which would have to put off the change the fitting makes to the label's size: once, after it
    expect(labels[1]?.fit()).toBe('');
    expect(frames.size).toBe(1);
    nextFrame();
    expect(labels.map((l) => l.fit())).toEqual(['', '0.85']);
  });

  it('stops watching when the bar goes, and drops a fitting put off to the next frame', () => {
    const labels = [label(57)];
    const stop = fitLabels(bar(labels));
    labels[0]?.widen(70);
    observers[0]?.report();
    stop();
    expect(observers[0]?.stopped).toBe(true);
    expect(frames.size).toBe(0);
    expect(labels[0]?.fit()).toBe('');
  });
});

/**
 * A desktop window's top bar: its tools need `need[fold]` px at each step of folding (the playground's link gone, then the search box
 * folded into its icon with the chip's source, the language and the theme gone, then the wallet button's words), and have `room` px
 * beside the brand and the links. The tools' box gives way, never wider than the room; what does not fit runs past it
 */
function topBar(room: number, need: number[]) {
  const attrs = new Map<string, string>();
  const fold = () => Number(attrs.get('data-fold') ?? 0);
  const nav = { name: 'nav' };
  const parts = [{ name: 'search' }, { name: 'chip' }, { name: 'wallet' }];
  const tools = {
    children: parts,
    get clientWidth() {
      return Math.min(room, need[fold()] ?? 0);
    },
    get scrollWidth() {
      return need[fold()] ?? 0;
    },
  };
  const el = {
    querySelector: (selector: string) => (selector === '.topbar-tools' ? tools : selector === '.nav' ? nav : null),
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
  };
  return {
    el: el as unknown as HTMLElement,
    nav,
    parts,
    fold: () => attrs.get('data-fold') ?? '',
    /** The window made wider or narrower */
    resize: (to: number) => {
      room = to;
    },
    /** Its words made wider, as by the reader's own letter and word spacing */
    widen: (to: number[]) => {
      need = to;
    },
  };
}

describe('A desktop window’s top bar', () => {
  it('stays as it is where its parts fit, and folds a step at a time until they do, the last step however little room is left', () => {
    const need = [640, 510, 380, 250];
    expect(TOP_FOLDS).toBe(3);
    expect(
      [700, 640, 600, 510, 500, 380, 300, 250, 100].map((room) => {
        const bar = topBar(room, need);
        fitTopBar(bar.el);
        return bar.fold();
      }),
    ).toEqual(['', '', '1', '1', '2', '2', '3', '3', '3']);
  });

  it('folds again in the frame after a part’s own size changes, as under a reader’s own spacing set once the page is drawn', () => {
    const bar = topBar(560, [520, 420, 330, 200]);
    fitTopBar(bar.el);
    expect(bar.fold()).toBe('');
    // The window keeps its width: what changes is the parts' own sizes, which are watched as the bar is
    const [watch] = observers;
    expect(watch?.watched).toEqual([bar.el, bar.nav, ...bar.parts]);
    bar.widen([640, 510, 380, 250]);
    watch?.report();
    watch?.report();
    expect(bar.fold()).toBe('');
    expect(frames.size).toBe(1);
    nextFrame();
    expect(bar.fold()).toBe('1');
  });

  it('unfolds where the window widens, as far as its parts then fit', () => {
    const bar = topBar(300, [640, 510, 380, 250]);
    fitTopBar(bar.el);
    expect(bar.fold()).toBe('3');
    bar.resize(520);
    observers[0]?.report();
    nextFrame();
    expect(bar.fold()).toBe('1');
    bar.resize(1000);
    observers[0]?.report();
    nextFrame();
    expect(bar.fold()).toBe('');
  });

  it('stops watching when the bar goes, and drops a fitting put off to the next frame', () => {
    const bar = topBar(700, [640, 510, 380, 250]);
    const stop = fitTopBar(bar.el);
    bar.resize(300);
    observers[0]?.report();
    stop();
    expect(observers[0]?.stopped).toBe(true);
    expect(frames.size).toBe(0);
    expect(bar.fold()).toBe('');
  });
});
