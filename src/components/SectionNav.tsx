import type { ReactNode } from 'react';
import { href, onLinkClick, type Route } from '../app/router';
import { useT } from '../i18n';

/** Switching between pages of the same group; styled like tabs, but each item is a link (with its own URL) */
export function SectionNav({ items, current, label }: { items: { key: string; to: Route; label: ReactNode }[]; current: string; label: string }) {
  return (
    <nav className="tabs section-nav" aria-label={label}>
      {items.map((i) => (
        <a key={i.key} href={href(i.to)} onClick={(e) => onLinkClick(e, i.to)} className={`tab${i.key === current ? ' tab--on' : ''}`} aria-current={i.key === current ? 'page' : undefined}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}

/** Blocks ↔ settlements: settlements are no longer top-level navigation and are reached from the blocks page (UI/UX review §2.2) */
export function BlocksSectionNav({ current }: { current: 'blocks' | 'settlements' }) {
  const t = useT();
  return (
    <SectionNav
      label={t.shell.nav.blocks}
      current={current}
      items={[
        { key: 'blocks', to: { name: 'blocks', page: 1 }, label: t.shell.nav.blocks },
        { key: 'settlements', to: { name: 'settlements', tab: 'settlement' }, label: t.shell.nav.settlements },
      ]}
    />
  );
}
