import { useChain } from '../app/store';
import { search, SEARCH_KIND_LABEL, searchMiss } from '../chain/views';
import { hitRoute, SearchBox } from '../components/SearchBox';
import { Link } from '../components/Refs';
import { rowOpener } from '../components/Table';
import { PageHead } from '../components/ui';
import { useT } from '../i18n';
import { MissNote, SearchTips } from './NotFound';

/**
 * The query as the page's title gives it: one with no space in it and too long for a phone's line (an address, a hash) shortened in
 * its middle, as a page's title gives a hash, the box below holding it whole. In full, a phone's title broke it over three lines, and
 * a tablet's left its last two characters on a line of their own. Counted in characters, so that none is cut in two; joined to the
 * ellipsis on both sides (word joiners), so that a line breaks before the query rather than after the ellipsis, as Chinese and Korean
 * titles did
 */
export function titleQuery(q: string): string {
  const chars = Array.from(q);
  if (chars.length <= 20 || /\s/.test(q)) return q;
  return `${chars.slice(0, 8).join('')}\u2060…\u2060${chars.slice(-6).join('')}`;
}

export function SearchPage({ q }: { q: string }) {
  const sim = useChain();
  const t = useT();
  const hits = search(sim, q, 40);
  // Why nothing was found, where the query says it: an address that is no account here, a height no block is at yet
  const miss = hits.length ? undefined : searchMiss(sim, q);
  const title = hits.length ? t.search.results(titleQuery(q)) : t.search.none(titleQuery(q));
  return (
    <div className="page narrow-page">
      {/* The browser's tab names it without the word joiners, which only a line break needs */}
      <PageHead eyebrow={t.ui.search} title={title} doc={title.replace(/\u2060/g, '')} meta={hits.length ? <span>{t.search.count(hits.length)}</span> : undefined} />
      {/* With the query in it, to be corrected or narrowed: it read empty under "No results for …"; a new query starts it afresh */}
      <SearchBox key={q} size="lg" initial={q} />
      {hits.length > 0 ? (
        <ul className="search-results">
          {hits.map((h) => {
            const to = hitRoute(sim, h);
            return (
              <li key={`${h.kind}:${h.id}`} className="row-link" onClick={rowOpener(to)}>
                <span className="search-kind">{SEARCH_KIND_LABEL[h.kind]}</span>
                <Link to={to} className="link">
                  {h.title}
                </Link>
                {h.sub && <span className="mono small muted">{h.sub}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          {miss && <MissNote miss={miss} />}
          <p className="prose">{t.search.howTo}</p>
          <SearchTips />
        </>
      )}
    </div>
  );
}
