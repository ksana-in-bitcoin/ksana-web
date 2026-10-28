import { useEffect, useState } from 'react';
import { navigate } from '../app/router';
import { useChain } from '../app/store';
import { BlocksTable } from '../components/Lists';
import { BlocksSectionNav } from '../components/SectionNav';
import { Button, ButtonLink, Empty, PageHead, Tabs } from '../components/ui';
import { IconArrowRight, IconChevronLeft, IconChevronRight } from '../components/icons';
import { Figures } from '../components/Values';
import type { Block } from '../chain/types';
import { blockCounts, blockTime } from '../chain/views';
import { fmtDuration, fmtInt, halfWidth, parseCount } from '../lib/format';
import { useT } from '../i18n';

const PER_PAGE = 25;

export function Blocks({ page }: { page: number }) {
  const sim = useChain();
  const t = useT();
  const m = t.blocks;
  const [view, setView] = useState<'main' | 'side'>('main');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [jump, setJump] = useState('');

  // The main chain is paged by height; the node data source only caches a recent range, so earlier pages are requested from the node by height (hiding empty blocks only filters the blocks already fetched)
  const top = sim.tip.header.height;
  const byHeight = view === 'main' && !(hideEmpty && sim.kind === 'sim');
  const all: Block[] = [];
  if (view === 'main' && !byHeight) {
    for (let i = sim.blocks.length - 1; i > 0; i--) {
      const b = sim.blocks[i];
      if (b && (!hideEmpty || b.entries.length > 0)) all.push(b);
    }
  } else if (view === 'side') {
    all.push(...[...sim.sideBlocks].reverse());
  }
  const pages = byHeight ? Math.max(1, Math.ceil(top / PER_PAGE)) : Math.max(1, Math.ceil(all.length / PER_PAGE));
  const p = Math.min(page, pages);
  const heights: number[] = [];
  if (byHeight) for (let h = top - (p - 1) * PER_PAGE; h > Math.max(0, top - p * PER_PAGE); h--) heights.push(h);
  const missing = heights.filter((h) => !sim.blocks[h]);
  const rows = byHeight
    ? heights.map((h) => sim.blocks[h]).filter((b): b is Block => !!b && (!hideEmpty || b.entries.length > 0))
    : all.slice((p - 1) * PER_PAGE, p * PER_PAGE);
  const missingKey = missing.join(',');
  useEffect(() => {
    if (sim.kind !== 'rpc') return;
    for (const h of missingKey ? missingKey.split(',') : []) sim.request('block', h);
  }, [sim, missingKey]);
  // The overview's block time, over the same latest blocks, which it names
  const time = blockTime(sim);
  const counts = blockCounts(sim);

  return (
    <div className="page">
      <PageHead
        eyebrow={m.eyebrow}
        title={m.title}
        meta={
          <>
            <span>{m.tip(fmtInt(sim.tip.header.height))}</span>
            {time.gaps.length > 0 && <span>{m.avgInterval(fmtDuration(time.mean), time.gaps.length)}</span>}
            {/* The node data source only counts the loaded blocks, and the parallel blocks they merged */}
            <span>{sim.kind === 'rpc' ? m.emptyOfLoaded(counts.empty, counts.loaded) : m.empty(counts.empty)}</span>
            <span title={m.sideHint}>{sim.kind === 'rpc' ? m.sideOfLoaded(counts.parallel, counts.loaded) : m.side(counts.parallel, (counts.share * 100).toFixed(1))}</span>
          </>
        }
        actions={
          <form
            className="jump"
            onSubmit={(e) => {
              e.preventDefault();
              // An empty field opens nothing, where it opened the genesis block
              const n = parseCount(halfWidth(jump).replace(/^\s*#/, ''));
              if (n !== null) navigate({ name: 'block', id: n.toString() });
            }}
          >
            <label htmlFor="jump-height" className="sr-only">
              {m.jump}
            </label>
            <input id="jump-height" className="input input--sm mono" inputMode="numeric" placeholder={m.jump} value={jump} onChange={(e) => setJump(e.target.value)} />
            {/* An iPhone's keypad of digits has no return key: a height typed there went nowhere without it */}
            <Button type="submit" size="sm" icon={<IconArrowRight />} aria-label={m.jump} title={m.jump} />
          </form>
        }
      />
      <div className="toolbar">
        <BlocksSectionNav current="blocks" />
        <Tabs
          label={m.view}
          value={view}
          onChange={(v) => {
            setView(v);
            if (page !== 1) navigate({ name: 'blocks', page: 1 });
          }}
          options={[
            { value: 'main', label: m.main },
            { value: 'side', label: t.blocks.sideTab, count: sim.sideBlocks.length },
          ]}
        />
        {view === 'main' && (
          <label className="check">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
            {m.hideEmpty}
          </label>
        )}
      </div>
      {missing.length > 0 && (
        <p className="small muted section-note" aria-live="polite">
          {m.fetching(missing.length)}
        </p>
      )}
      {rows.length === 0 && missing.length === 0 ? (
        <Empty title={view === 'side' ? m.noSide : m.noBlocks}>{view === 'side' ? m.sideHint : null}</Empty>
      ) : rows.length > 0 ? (
        <BlocksTable blocks={rows} />
      ) : null}
      {pages > 1 && (
        <nav className="pagination" aria-label={m.pagination}>
          <ButtonLink to={{ name: 'blocks', page: Math.max(1, p - 1) }} size="sm" icon={<IconChevronLeft />} disabled={p === 1}>
            {m.newer}
          </ButtonLink>
          <span className="small soft pagination-page"><Figures text={m.page(p, pages)} /></span>
          <ButtonLink to={{ name: 'blocks', page: Math.min(pages, p + 1) }} size="sm" icon={<IconChevronRight />} className="btn--icon-right" disabled={p === pages}>
            {m.older}
          </ButtonLink>
        </nav>
      )}
    </div>
  );
}
