import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { languageMissed } from '../app/update';
import { LOCALES, setLocale, useLocale, useT, type Locale } from '../i18n';
import { IconCheck, IconChevronDown, IconGlobe } from './icons';

/** A language that does not load is said: in a page left open while a newer version was published, with the reload that brings it (app/update.ts) */
async function choose(next: Locale) {
  if (!(await setLocale(next))) await languageMissed(LOCALES.find((l) => l.code === next)?.name ?? next);
}

const COARSE = '(pointer: coarse)';

function watchPointer(fn: () => void) {
  const query = window.matchMedia?.(COARSE);
  query?.addEventListener('change', fn);
  return () => query?.removeEventListener('change', fn);
}

/** Whether the first pointer is a finger: a phone or a tablet, where the system's own picker serves better than a menu drawn here */
const coarsePointer = () => typeof window !== 'undefined' && window.matchMedia?.(COARSE).matches === true;

/** The option a typed character leads to: the next language after the current one whose name or code starts with it */
export function typedOption(key: string, from: number, options: readonly { code: string; name: string }[] = LOCALES): number {
  const ch = key.toLowerCase();
  for (let step = 1; step <= options.length; step++) {
    const i = (from + step) % options.length;
    const o = options[i];
    if (o && (o.name.toLowerCase().startsWith(ch) || o.code.toLowerCase().startsWith(ch))) return i;
  }
  return -1;
}

/**
 * UI language. With a mouse it is a menu drawn in the page's own style: a button that opens a list of the languages, each written in
 * its own language and tagged with `lang`, worked with the arrow keys, Home and End, a typed letter, Enter and Escape, and read by a
 * screen reader as a list box. On a touch screen it is a native select, which opens the system picker.
 * Hidden when only one language is available.
 */
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const touch = useSyncExternalStore(watchPointer, coarsePointer, () => false);
  if (LOCALES.length < 2) return null;
  return touch ? <NativeSelect compact={compact} /> : <Menu compact={compact} />;
}

function NativeSelect({ compact }: { compact: boolean }) {
  const t = useT();
  const locale = useLocale();
  const select = (
    <select className="lang-select-input" value={locale} onChange={(e) => void choose(e.target.value as Locale)} aria-label={t.common.language}>
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code} lang={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
  if (compact) {
    return (
      <label className="lang-select lang-select--compact icon-btn" title={t.common.language}>
        <IconGlobe />
        <span className="lang-select-code" aria-hidden="true">
          {LOCALES.find((l) => l.code === locale)?.short ?? locale}
        </span>
        {select}
      </label>
    );
  }
  return (
    <label className="lang-select">
      <IconGlobe size={14} />
      {select}
    </label>
  );
}

function Menu({ compact }: { compact: boolean }) {
  const t = useT();
  const locale = useLocale();
  const current = Math.max(
    0,
    LOCALES.findIndex((l) => l.code === locale),
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(current);
  // Where the list opens: below its button and from its left edge, unless the window has no room there (the footer's, at the page's foot)
  const [place, setPlace] = useState<{ up: boolean; end: boolean }>({ up: false, end: compact });
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const show = () => {
    setActive(current);
    setOpen(true);
  };
  const hide = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const pick = (i: number) => {
    const next = LOCALES[i];
    hide(true);
    if (next && next.code !== locale) void choose(next.code);
  };

  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) return;
    const at = button.current.getBoundingClientRect();
    const box = list.current.getBoundingClientRect();
    const up = at.bottom + box.height + 12 > window.innerHeight && at.top > box.height + 12;
    const end = compact ? at.right - box.width >= 8 : at.left + box.width > window.innerWidth - 8;
    setPlace((was) => (was.up === up && was.end === end ? was : { up, end }));
    list.current.focus({ preventScroll: true });
  }, [open, compact]);

  // A press outside the menu closes it, and so does the focus leaving it (Tab, another window's click)
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      show();
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    const last = LOCALES.length - 1;
    if (e.key === 'ArrowDown') setActive((i) => Math.min(last, i + 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') pick(active);
    else if (e.key === 'Escape') hide(true);
    else if (e.key === 'Tab') {
      // The focus goes on from the button, where the menu stands in the page's order
      hide(true);
      return;
    } else {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const hit = typedOption(e.key, active);
        if (hit >= 0) setActive(hit);
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const mine = LOCALES[current];
  return (
    <div ref={root} className={`lang-menu${compact ? ' lang-menu--compact' : ''}${open ? ' is-open' : ''}`}>
      <button
        ref={button}
        type="button"
        className={compact ? 'lang-menu-btn icon-btn' : 'lang-menu-btn lang-menu-btn--field'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${t.common.language}: ${mine?.name ?? locale}`}
        title={compact ? t.common.language : undefined}
        onClick={() => (open ? hide(false) : show())}
        onKeyDown={onButtonKey}
      >
        <IconGlobe size={compact ? 16 : 14} />
        {compact ? <span className="lang-select-code">{mine?.short ?? locale}</span> : <span lang={mine?.code}>{mine?.name ?? locale}</span>}
        {!compact && <IconChevronDown size={12} className="lang-menu-caret" />}
      </button>
      {open && (
        <ul
          ref={list}
          id={id}
          className={`lang-menu-list${place.up ? ' lang-menu-list--up' : ''}${place.end ? ' lang-menu-list--end' : ''}`}
          role="listbox"
          tabIndex={-1}
          aria-label={t.common.language}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
        >
          {LOCALES.map((l, i) => (
            <li
              key={l.code}
              id={`${id}-${i}`}
              role="option"
              lang={l.code}
              aria-selected={l.code === locale}
              className={`lang-menu-opt${i === active ? ' lang-menu-opt--on' : ''}`}
              onPointerMove={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <span className="lang-menu-name">{l.name}</span>
              <IconCheck size={14} className="lang-menu-check" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
