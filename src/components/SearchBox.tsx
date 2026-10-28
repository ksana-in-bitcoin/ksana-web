import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { navigate, type Route } from '../app/router';
import { useChain } from '../app/store';
import type { Chain } from '../chain/source';
import { search, SEARCH_KIND_LABEL, type SearchHit, txRoute } from '../chain/views';
import { IconSearch } from './icons';
import { Kbd } from './ui';
import { useT } from '../i18n';

export function hitRoute(sim: Chain, h: SearchHit): Route {
  switch (h.kind) {
    case 'block':
      return { name: 'block', id: h.id };
    case 'op':
      return { name: 'op', id: h.id };
    case 'account':
      return { name: 'account', id: h.id };
    case 'contract':
      return { name: 'contract', id: h.id };
    case 'asset':
      return { name: 'asset', id: h.id };
    case 'tx':
      return txRoute(sim, h.id);
    case 'btc_block':
      return { name: 'btc', height: Number(h.id) };
  }
}

/**
 * Unified search: fast-lane height, block hash (including parallel blocks), op_id, account (Taproot address or hex), contract, BTC txid.
 * An account is a Taproot address (D-092); any P2TR address of this network resolves to an account.
 * Typing 4 or more hex digits suggests matches by prefix. Press / to focus; where the top bar folds the box into its icon (a phone, a
 * narrow window), / calls onFolded, which opens the search sheet. The search page's box starts with the query it shows (`initial`) and
 * keeps what was searched, to be corrected or narrowed, as a search engine's does; the top bar's empties once it has searched.
 */
export function SearchBox({ onDone, onFolded, size = 'md', initial }: { onDone?: () => void; onFolded?: () => void; size?: 'md' | 'lg'; initial?: string }) {
  const sim = useChain();
  const t = useT();
  const [q, setQ] = useState(initial ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hits = useMemo(() => (q.trim().length >= 1 ? search(sim, q) : []), [q, sim, sim.version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (size !== 'md') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Not while a dialog is open (a review, the data source drawer, the search sheet): the box would take focus behind it, or the sheet open over it
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      const input = inputRef.current;
      if (input && input.getClientRects().length > 0) input.focus();
      else onFolded?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [size, onFolded]);

  const go = (h?: SearchHit) => {
    const query = q.trim();
    if (!query) return;
    if (h) navigate(hitRoute(sim, h));
    else if (hits.length === 1 && hits[0]) navigate(hitRoute(sim, hits[0]));
    else navigate({ name: 'search', q: query });
    if (initial === undefined) setQ('');
    setOpen(false);
    inputRef.current?.blur();
    onDone?.();
  };

  const showList = open && q.trim().length > 0;
  return (
    <div className={`search search--${size}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(hits[active]);
        }}
      >
        <label className="search-field">
          <IconSearch className="search-icon" />
          <span className="sr-only">{t.ui.search}</span>
          <input
            ref={inputRef}
            type="search"
            value={q}
            placeholder={t.ui.searchPlaceholder}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, Math.max(hits.length - 1, 0)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Escape') {
                setOpen(false);
                inputRef.current?.blur();
                onDone?.();
              }
            }}
          />
          {size === 'md' && !q && <Kbd>/</Kbd>}
        </label>
      </form>
      {showList && (
        <ul className="search-list" id={listId} role="listbox" aria-label={t.ui.searchResults}>
          {hits.length === 0 ? (
            <li className="search-empty" role="option" aria-selected="false">
              {t.ui.searchNone}
            </li>
          ) : (
            hits.map((h, i) => (
              <li
                key={`${h.kind}:${h.id}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`search-hit${i === active ? ' search-hit--on' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(h);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="search-kind">{SEARCH_KIND_LABEL[h.kind]}</span>
                <span className="search-title">{h.title}</span>
                {h.sub && <span className="search-sub mono">{h.sub}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
