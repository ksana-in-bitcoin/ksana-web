import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react';
import { href, onLinkClick, returning, routeChanged, type Route } from '../app/router';
import { IconAlert, IconClose, IconInfo } from './icons';
import { t } from '../i18n';

type Variant = 'primary' | 'secondary' | 'ghost' | 'qing' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  return (
    <button type="button" className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  title,
  'aria-label': label,
  disabled = false,
}: {
  to: Route;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  title?: string;
  /** The link's name where it shows its icon alone, as every icon button has one (WEB_DESIGN §6) */
  'aria-label'?: string;
  /** A link that leads nowhere yet (the first page's "Newer", the tip's "Next"): it keeps its place, dimmed, with no address a key could follow, and a screen reader names it unavailable */
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <a
        role="link"
        aria-disabled="true"
        className={`btn btn--${variant} btn--${size} is-disabled ${className}`}
        title={title}
        aria-label={label}
      >
        {icon}
        {children && <span>{children}</span>}
      </a>
    );
  }
  return (
    <a
      href={href(to)}
      onClick={(e) => onLinkClick(e, to)}
      className={`btn btn--${variant} btn--${size} ${className}`}
      title={title}
      aria-label={label}
    >
      {icon}
      {children && <span>{children}</span>}
    </a>
  );
}

export function Section({
  title,
  eyebrow,
  actions,
  children,
  className = '',
  id,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`section ${className}`} id={id}>
      {(title || actions || eyebrow) && (
        <header className="section-head">
          <div className="section-titles">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 className="section-title">{title}</h2>}
          </div>
          {actions && <div className="section-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * A page's head. Its title, the page's heading, also names the page in the browser's title ("Blocks · Ksana"), so that tabs, the history
 * and a shared link tell pages apart. A title that is not plain text gives that name as `doc`, with the kind of page where the title is
 * only a number or a hash (a block's "#5"); an empty `doc` leaves the brand alone (the overview). `turned` marks a head that replaces
 * another in place (a form that turns into its result, and back): the page starts at its top, with focus on the title, as a new page does.
 * It acts when the head mounts, so the view it replaces is another component or keyed apart
 */
export function PageHead({
  eyebrow,
  title,
  doc,
  turned = false,
  meta,
  actions,
  children,
  className = '',
}: {
  eyebrow?: ReactNode;
  turned?: boolean;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
} & ({ title: string; doc?: string } | { title: Exclude<ReactNode, string>; doc: string })) {
  const ref = useRef<HTMLHeadingElement>(null);
  // After a route change, move focus to the title so screen reader users know they are on a new page; when the page has just loaded,
  // focus stays at its top, where the first Tab reaches the skip link and the header. A page going back to where it was left (Back,
  // Forward) leaves focus to the router, which gives it back to the link the page was left from: on the title, above the screen, the
  // first Tab would take the reader back to the top. A page that turned in place starts at its top as
  // well, rather than at the scroll of the form it replaced, which left its title (the result) above the screen; this runs before the
  // first paint, so nothing jumps
  useLayoutEffect(() => {
    if (turned) window.scrollTo(0, 0);
    if (turned || (routeChanged() && !returning())) ref.current?.focus({ preventScroll: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const name = doc ?? (typeof title === 'string' ? title : '');
  // The name changes with what the page has loaded, an operation's stage and the language
  useEffect(() => {
    const next = name ? `${name} · Ksana` : 'Ksana';
    if (document.title !== next) document.title = next;
  }, [name]);
  return (
    <header className={`page-head ${className}`}>
      <div className="page-head-main">
        {eyebrow && <div className="eyebrow page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title" tabIndex={-1} ref={ref}>
          {title}
        </h1>
        {meta && <div className="page-meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
      {children}
    </header>
  );
}

export function Banner({
  tone,
  title,
  children,
  actions,
  icon,
}: {
  tone: 'warn' | 'danger' | 'info' | 'qing';
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="banner-icon">{icon ?? (tone === 'info' || tone === 'qing' ? <IconInfo /> : <IconAlert />)}</span>
      <div className="banner-body">
        <div className="banner-title">{title}</div>
        {children && <div className="banner-text">{children}</div>}
      </div>
      {actions && <div className="banner-actions">{actions}</div>}
    </div>
  );
}

/**
 * The callback ref of an amount field's end (`.input-end`: its Max or All button, then its unit): the field's text keeps clear of it,
 * however wide it is, an asset's symbol up to 8 characters or its ID's when its name reads as a native coin's ("Asset f1f1f1")
 */
export function keepClear(end: HTMLElement | null) {
  const input = end?.parentElement?.querySelector('input');
  if (!end || !input) return;
  const watch = new ResizeObserver(() => input.style.setProperty('padding-right', `${end.offsetWidth + 20}px`));
  watch.observe(end);
  return () => watch.disconnect();
}

/**
 * The callback ref of a bar pinned to the foot of the screen while the page scrolls (the send bar of a phone or a tablet): while it is
 * pinned there, the toasts stand above it, with a gap, however tall it grows, rather than cover the button it holds (`--foot-bar` on
 * the page's root, components.css). Where it stands in the page's flow instead (the end of the form reached, a form shorter than the
 * screen, a phone held sideways), they stand where they do on any page
 */
export function clearFootBar(bar: HTMLElement | null) {
  if (!bar) return;
  const root = document.documentElement;
  let room = '';
  let frame = 0;
  const measure = () => {
    frame = 0;
    const r = bar.getBoundingClientRect();
    const style = getComputedStyle(bar);
    const pinned = r.height > 0 && style.position === 'sticky' && Math.abs(window.innerHeight - parseFloat(style.bottom) - r.bottom) < 1;
    const next = pinned ? `${Math.round(r.height) + 8}px` : '0px';
    if (next !== room) root.style.setProperty('--foot-bar', (room = next));
  };
  const later = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  const watch = new ResizeObserver(later);
  watch.observe(bar);
  // Where it stands moves too with the form around it and the page, as their parts open or close without a scroll
  if (bar.parentElement) watch.observe(bar.parentElement);
  watch.observe(document.body);
  window.addEventListener('scroll', later, { passive: true });
  window.addEventListener('resize', later);
  return () => {
    watch.disconnect();
    window.removeEventListener('scroll', later);
    window.removeEventListener('resize', later);
    cancelAnimationFrame(frame);
    root.style.removeProperty('--foot-bar');
  };
}

export interface SpecRow {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  key?: string;
}

/** Spec list (data plate): name on the left, value on the right. Stacked vertically on narrow screens */
export function SpecList({ rows, className = '' }: { rows: (SpecRow | false | null | undefined | 0 | '')[]; className?: string }) {
  return (
    <dl className={`spec ${className}`}>
      {rows.filter(Boolean).map((r, i) => {
        const row = r as SpecRow;
        return (
          <div className="spec-row" key={row.key ?? i}>
            <dt className="spec-label">{row.label}</dt>
            <dd className="spec-value">
              {row.value}
              {row.hint && <div className="spec-hint">{row.hint}</div>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; count?: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          id={`${id}-${i}`}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={`tab${o.value === value ? ' tab--on' : ''}`}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
            if (next) {
              onChange(next.value);
              document.getElementById(`${id}-${options.indexOf(next)}`)?.focus();
            }
          }}
        >
          {o.label}
          {o.count !== undefined && <span className="tab-count num">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="empty-mark">
        <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/**
 * What a modal dialog does with the keyboard and the page behind it: focus moves into it when it opens and back where it was when it
 * closes, Tab and Shift+Tab go round its controls, Escape closes it, and the page behind does not scroll. Only opening and closing
 * re-run it: a page passes a new onClose on each render (a new block, a second of a clock), and the dialog would take focus back to
 * its first control each time
 */
export function useModalDialog(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // The controls Tab reaches, in order: none disabled, hidden or left out of the order (a tab not chosen)
    const focusables = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]') ?? []).filter((x) => x.tabIndex >= 0 && !x.hasAttribute('disabled') && x.getClientRects().length > 0);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      if (e.key === 'Tab') {
        const list = focusables();
        if (!list.length) return;
        const first = list[0] as HTMLElement;
        const last = list[list.length - 1] as HTMLElement;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
  }, [open, ref]);
}

/** Modal dialog: centered on desktop, rises from the bottom on phones. Esc and clicking the scrim close it; focus is trapped inside */
export function Modal({ open, onClose, title, children, footer, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalDialog(ref, open, onClose);
  if (!open) return null;
  return (
    <div className="modal-layer">
      <div className="modal-scrim" onClick={onClose} />
      <div className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        {/* Not a header and a footer: outside the page's main region those would be a second banner and footer of the page */}
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label={t().common.close} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
