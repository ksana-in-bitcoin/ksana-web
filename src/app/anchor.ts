/** How long after the reader's last scroll, or after they let go of the screen or turned a wheel, they are taken to be scrolling still */
const SETTLE_MS = 150;

/** Whether the keyboard gave it the focus, where the browser can tell (`:focus-visible`, which Safari before 15.4 does not know) */
export function keyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

/**
 * Scroll anchoring where the browser has none: WebKit before Safari 27 (`overflow-anchor`, September 2026), so an iPhone, or a Mac, on
 * iOS or macOS 26 or older. There a block or an operation that arrived above the reader's place in a live list pushed what they were
 * reading down the screen a row at a time, on the operations page of a busy chain several times a second, and so did a section that
 * loaded or grew above it. The page keeps the first thing in view under the top bar where it stood, as the other browsers do by
 * themselves, but not while the reader scrolls. At the very top of the page nothing is held: what arrives there is meant to be seen.
 *
 * The keyboard's focus, where it shows in the window, is the reader's place, held rather than the first thing in view. That was often
 * a row of a live list that keeps its length, above the focus (on a phone scrolled to the overview's latest operations, a row of the
 * latest blocks), and each row arriving at the head of that list, another leaving at its end, moved the focus up a row, until the list
 * had left the window. A browser that anchors scrolling itself is asked to anchor it to the focus meanwhile (`data-place` on the root,
 * components.css), and moves the page itself.
 */
export function holdReadersPlace(): void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  const root = document.getElementById('root');
  if (!root) return;
  // A change to the page is held before it is drawn: the observer's records come once the change is made, and a size's once it is laid out
  const changes = (fn: () => void) => {
    new MutationObserver(fn).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fn).observe(root);
  };
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('overflow-anchor', 'auto')) {
    anchorToFocus(root, changes);
    return;
  }
  // The element held in place and the ones it was found in, each with its top in the document when placed: where the element itself
  // is replaced (a status that changed) or no longer drawn, the innermost of them still drawn stands for it
  let held: { el: Element; at: number }[] = [];
  let frame = 0;
  // How far the element held stands from its place, below it where positive, by what the page could not take up: less than a pixel, or
  // the part of a move that a scroll position in whole pixels (WebKit's) leaves over. It goes into the next move rather than being lost
  // with each, which rows of a fractional height, arriving one after another, would add up
  let carry = 0;
  // Where the page's own scrolling left the page: the scroll event it fires is not the reader's
  let ours: number | undefined;
  // While the reader scrolls (a finger on the screen, a fling or a wheel's turn going on) the page moves nothing itself: a script's
  // scroll stops a fling in WebKit on iOS. What arrives meanwhile moves the rows in view, as with no anchoring, and the place is held
  // again from where the reader stops
  let touching = false;
  let input = Number.NEGATIVE_INFINITY;
  let reading = Number.NEGATIVE_INFINITY;
  const scrolling = (now: number) => touching || now - input < SETTLE_MS || now - reading < SETTLE_MS;
  // `moved`: the keyboard has just moved the focus (`readersFocus`)
  const place = (moved = false) => {
    frame = 0;
    held = [];
    const main = document.getElementById('main');
    if (!main || window.scrollY <= 0) {
      carry = 0;
      return;
    }
    const focus = readersFocus(root, moved);
    const path = focus.length > 0 ? focus : inView(main, shown().top, pinned);
    for (const el of path) held.push({ el, at: el.getBoundingClientRect().top + window.scrollY });
  };
  const hold = () => {
    if (scrolling(performance.now())) {
      carry = 0;
      place();
      return;
    }
    for (let i = held.length - 1; i >= 0; i--) {
      const h = held[i];
      if (!h || !h.el.isConnected) continue;
      const r = h.el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const from = window.scrollY;
      const moved = r.top + from - h.at + carry;
      if (from > 0 && Math.abs(moved) >= 1) {
        window.scrollTo(window.scrollX, from + moved);
        if (window.scrollY !== from) ours = window.scrollY;
      }
      // What a whole-pixel position left over; more than that (the page's end) is not carried
      const rest = moved - (window.scrollY - from);
      carry = Math.abs(rest) < 1 ? rest : 0;
      break;
    }
    place();
  };
  const later = () => {
    if (!frame) frame = requestAnimationFrame(() => place());
  };
  // Placed again once a frame while the page scrolls; a change to the page in between is measured in the document, where scrolling
  // moves nothing. A scroll not the page's own starts again from where it leaves the page, and is the reader's where it comes with a
  // finger on the screen or soon after a touch, a wheel's turn or another of theirs, a fling's frames among them
  window.addEventListener(
    'scroll',
    () => {
      const now = performance.now();
      if (window.scrollY === ours) ours = undefined;
      else {
        carry = 0;
        if (touching || now - input < SETTLE_MS || now - reading < SETTLE_MS) reading = now;
      }
      later();
    },
    { passive: true },
  );
  // Placed as the keyboard moves the focus, and again in the next frame, where the browser has scrolled it into view; one that leaves
  // the page, in the next frame too
  document.addEventListener(
    'focusin',
    () => {
      place(true);
      later();
    },
    true,
  );
  document.addEventListener('focusout', later, true);
  // Heard before anything on the page can stop them; a finger lifted while another stays on the screen does not end the touch. A
  // touch ends on the element it started on, even one that has left the page meanwhile (a row pushed out of a list, or drawn anew),
  // where the window no longer hears it: it is listened for there too
  const touches = (e: Event) => {
    touching = (e as TouchEvent).touches.length > 0;
    if (!touching) input = performance.now();
  };
  const ends = ['touchend', 'touchcancel'] as const;
  window.addEventListener(
    'touchstart',
    (e) => {
      touches(e);
      for (const type of ends) e.target?.addEventListener(type, touches, { passive: true });
    },
    { passive: true, capture: true },
  );
  for (const type of ends) window.addEventListener(type, touches, { passive: true, capture: true });
  window.addEventListener('wheel', () => (input = performance.now()), { passive: true, capture: true });
  changes(hold);
}

/**
 * Where the browser anchors scrolling itself: the root asks it to anchor to the keyboard's focus while that is the reader's place
 * (`data-place`, components.css), from the moment the focus moves, before anything on the page answers the move (a list letting go of
 * its rows as the focus leaves it, Table.tsx) and before the browser scrolls it into view. Asked again in the frame after the page
 * scrolls or changes, or the focus moves: where the focus has left the window (as one a script moved there without scrolling), or the
 * page, the browser anchors as it does by itself
 */
function anchorToFocus(root: Element, changes: (fn: () => void) => void): void {
  let marked = false;
  let frame = 0;
  const place = (moved: boolean) => {
    const on = readersFocus(root, moved).length > 0;
    if (on === marked) return;
    marked = on;
    if (on) document.documentElement.setAttribute('data-place', 'focus');
    else document.documentElement.removeAttribute('data-place');
  };
  const later = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place(false);
    });
  };
  window.addEventListener('scroll', later, { passive: true });
  window.addEventListener('resize', later, { passive: true });
  document.addEventListener(
    'focusin',
    () => {
      place(true);
      later();
    },
    true,
  );
  document.addEventListener('focusout', later, true);
  changes(later);
}

/**
 * What is fixed to the window or sticks to an edge of it, stuck or not (the bars, a sheet, the send summary, the send button's bar on a
 * phone): where it stands in the window is not the reader's place in the page
 */
function pinned(el: Element): boolean {
  const p = getComputedStyle(el).position;
  return p === 'fixed' || p === 'sticky';
}

/** Where the window shows the page, in the viewport: below the top bar, and above a phone's bottom bar */
function shown(): { top: number; bottom: number } {
  const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const foot = document.querySelector('.bottomnav')?.getBoundingClientRect();
  return { top: Math.max(0, top), bottom: foot && foot.height > 0 ? foot.top : window.innerHeight };
}

/**
 * The keyboard's focus in the page (`root`) where it is the reader's place, after the elements it is in there (`focused`): where it
 * shows in the window between the bars, or where it has just moved (`moved`). The browser scrolls a focus the keyboard moved into view
 * once its focus events are heard; one a script moved without scrolling (the page's title, the link a page went back to) is looked at
 * again in the next frame, where it stands. None otherwise
 */
function readersFocus(root: Element, moved: boolean): Element[] {
  const path = focused(root);
  const last = path[path.length - 1];
  return !last || moved || inWindow(last) ? path : [];
}

/** Whether the window shows `el`, or a part of it, between the bars (`shown`) */
export function inWindow(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const view = shown();
  return r.bottom > view.top && r.top < view.bottom;
}

/** The element the keyboard gave the focus, as last seen while the window had the focus (`focused`) */
let keyboards: Element | null = null;

/**
 * The keyboard's focus in `root`, after the elements it is in there, from the outermost: none where the focus came from a press, or is
 * on what is fixed to the window or sticks to an edge of it (`pinned`). A window without the focus shows none (`:focus-visible`), though
 * the reader may be reading it still, beside another window or in its address bar: there the focus is the keyboard's as it was when the
 * window last had the focus, and the page holds it as before
 */
export function focused(root: Element): Element[] {
  const a = document.activeElement;
  if (typeof document.hasFocus !== 'function' || document.hasFocus()) keyboards = a && keyboardFocus(a) ? a : null;
  if (!a || a === root || !root.contains(a) || a !== keyboards) return [];
  const path: Element[] = [];
  for (let el: Element | null = a; el && el !== root; el = el.parentElement) {
    if (pinned(el)) return [];
    path.unshift(el);
  }
  return path;
}

/**
 * The element a browser anchors scrolling to, after the ones it is found in: the first of `el`'s children, in the page's order, that
 * reaches below `top` (a y in the viewport), and where that one starts above `top`, the same among its own children, down to one that
 * starts at `top` or below, or has no child in view
 */
export function inView(el: Element, top: number, skip: (el: Element) => boolean = () => false): Element[] {
  const path: Element[] = [];
  for (;;) {
    let next: Element | undefined;
    for (const c of el.children) {
      const r = c.getBoundingClientRect();
      if (r.bottom > top && r.height > 0 && !skip(c)) {
        next = c;
        break;
      }
    }
    if (!next) return path;
    path.push(next);
    if (next.getBoundingClientRect().top >= top) return path;
    el = next;
  }
}
