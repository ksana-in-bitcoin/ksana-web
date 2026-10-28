import { Fragment, useEffect } from 'react';
import { useChain } from '../app/store';
import { RailView } from '../components/RailView';
import { BlocksTable, OpLines } from '../components/Lists';
import { Link } from '../components/Refs';
import { Meter, Ticks } from '../components/Status';
import { Amount, PathBadge, Sats } from '../components/Values';
import { ButtonLink, PageHead, Section } from '../components/ui';
import { IconArrowRight } from '../components/icons';
import { KSA_ASSET_ID, PARAMS } from '../chain/params';
import type { Action, Block, OpRecord } from '../chain/types';
import { backlogLate, blockTime, blockTitle, laneIdle } from '../chain/views';
import { fmtDuration, fmtInt } from '../lib/format';
import { useT } from '../i18n';

/** The suggested-fee readout is estimated for one transfer: path B's suggested sponsored fee, path C's miner fee for a native transaction carrying one KSA transfer */
const SAMPLE_GAS = 50_000;
const SAMPLE_TRANSFER: Action = { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: '0'.repeat(64), amount: 1n };

/** The overview's latest operations list this many */
export const RECENT_OPS = 9;

export function Overview() {
  const sim = useChain();
  const t = useT();
  const o = t.overview;
  const recentBlocks: Block[] = [];
  // The node data source only caches a recent range; stop at the first gap
  for (let i = sim.blocks.length - 1; i > 0 && recentBlocks.length < 10; i--) {
    const b = sim.blocks[i];
    if (!b) break;
    recentBlocks.push(b);
  }
  const recentOps: OpRecord[] = [];
  for (let i = sim.opOrder.length - 1; i >= 0 && recentOps.length < RECENT_OPS; i--) {
    const r = sim.getOp(sim.opOrder[i] as string);
    if (r && r.origin !== 'system') recentOps.push(r);
  }
  // On the node data source the blocks the page has loaded may hold fewer: on a quiet chain the latest operations leave that window
  // within the hour. The node's listing (D-111) gives them, as on the operations page, and on every render, so it does not lapse;
  // from a node without the listings the column keeps to the loaded blocks rather than have the chain read down (D-110)
  const rpc = sim.kind === 'rpc' ? sim : null;
  const short = recentOps.length < RECENT_OPS;
  useEffect(() => {
    rpc?.wantHistory('latest', short, { readBlocks: false });
  });
  const listing = !!rpc && short && rpc.history('latest').loading;

  return (
    <div className="page">
      <PageHead eyebrow={o.eyebrow} title={o.title} doc="" />
      <div className="panel panel-pad hero-panel">
        <RailView />
      </div>
      <Vitals />
      <div className="grid-2">
        <Section
          title={o.latestBlocks}
          actions={
            <ButtonLink to={{ name: 'blocks', page: 1 }} variant="ghost" size="sm" icon={<IconArrowRight />}>
              {o.allBlocks}
            </ButtonLink>
          }
        >
          <BlocksTable blocks={recentBlocks} compact />
        </Section>
        <Section
          title={o.latestOps}
          actions={
            <ButtonLink to={{ name: 'ops', tab: 'latest' }} variant="ghost" size="sm" icon={<IconArrowRight />}>
              {o.allOps}
            </ButtonLink>
          }
        >
          <OpLines ops={recentOps} listing={listing} />
        </Section>
      </div>
    </div>
  );
}

/** Vitals: block cadence, entry pool, fees, backlog, fee rate */
function Vitals() {
  const sim = useChain();
  const t = useT();
  const o = t.overview;
  const est = sim.estimateFee();
  const ksa = sim.assets.get(KSA_ASSET_ID);
  const backlog = sim.backlogStatus();
  const late = backlogLate(sim, backlog);

  const { gaps, mean: avg, merged } = blockTime(sim);
  const maxGap = Math.max(10_000, ...gaps);
  const target = (laneIdle(sim) ? o.idleTarget : o.target)(t.format.seconds(String(PARAMS.TARGET_BLOCK_TIME)));

  const pending = [...sim.mempool, ...sim.nativePending];
  const count = { B: 0, C: 0 };
  for (const r of pending) count[r.path]++;
  const total = pending.length;

  return (
    <section className="vitals panel" aria-label={o.vitals}>
      <div className="vital">
        <div className="vital-label">
          <Phrases text={o.blockGap(gaps.length)} />
        </div>
        <div className="vital-value num">
          {/* With no gap to give, before a network's second block after its genesis block, a dash: it read "0.0 s" under "last 0 blocks" */}
          <FigureWords text={gaps.length ? fmtDuration(avg) : '—'} />
        </div>
        <div className="spark" aria-hidden="true">
          {gaps.map((g, i) => (
            <i key={i} style={{ height: `${Math.max(8, (g / maxGap) * 100)}%` }} className={g > 10_000 ? 'spark-long' : ''} />
          ))}
        </div>
        <div className="vital-sub">
          <Phrases text={merged > 0 ? `${target} · ${t.ui.mergedCount(merged)}` : target} />
        </div>
      </div>
      <div className="vital">
        <div className="vital-label">
          <Link to={{ name: 'ops', tab: 'mempool' }} className="link">
            <Phrases text={sim.kind === 'rpc' ? o.pendingLocal : o.mempool} />
          </Link>
        </div>
        <div className="vital-value num">
          {total}
          <span className="vital-unit"> {o.opsUnit(total)}</span>
        </div>
        <div className="mix" aria-hidden="true">
          {(['B', 'C'] as const).map((p) => (count[p] > 0 ? <span key={p} className={`mix-${p}`} style={{ flexGrow: count[p] }} /> : null))}
          {total === 0 && <span className="mix-empty" style={{ flexGrow: 1 }} />}
        </div>
        <div className="vital-sub row gap-8" title={sim.kind === 'rpc' ? o.pendingLocalHint : undefined}>
          <span className="row gap-4">
            <PathBadge path="B" /> {count.B}
          </span>
          <span className="row gap-4">
            <PathBadge path="C" /> {count.C}
          </span>
        </div>
      </div>
      <div className="vital vital--fee">
        <div className="vital-label">{o.fee}</div>
        <div className="vital-pair">
          {ksa && (
            <span className="row gap-6" title={o.feePathB}>
              <PathBadge path="B" />
              <Amount value={est.pathB.amount} asset={ksa} />
            </span>
          )}
          <span className="row gap-6" title={o.feePathC}>
            <PathBadge path="C" />
            <Sats value={est.pathC(sim.opSize('C', SAMPLE_TRANSFER))} size="md" />
          </span>
        </div>
        <div className="vital-sub vital-note">
          <Phrases text={o.feeBasis(fmtInt(SAMPLE_GAS), String(est.market.feeRate))} />
        </div>
      </div>
      <div className="vital">
        <div className="vital-label">{o.backlog}</div>
        <div className={`vital-value num${backlog.triggered ? ' vital-alarm' : late ? ' vital-warn' : ''}`}>
          {backlog.waited}
          <span className="vital-unit"> {o.backlogOf(backlog.limit)}</span>
        </div>
        <Ticks done={Math.min(backlog.waited, backlog.limit)} total={backlog.limit} ink={backlog.triggered ? 'danger' : late ? 'warn' : 'mo'} label={o.backlogTicks(backlog.waited, backlog.limit)} />
        <div className="vital-sub vital-note">
          {/* A settled block above the anchor is on Bitcoin: it read "Oldest not on Bitcoin: #1,890" under the strip's "Settled #1,890". The
              note names the data, the body the backlog counts (D-077): the empty blocks before it have none, and may be off Bitcoin too */}
          {backlog.triggered ? (
            o.backlogFull
          ) : backlog.oldest && backlog.landed ? (
            <Phrases text={o.backlogLanded(blockTitle(backlog.oldest), backlog.landed.confs)} />
          ) : backlog.oldest ? (
            o.backlogOldest(blockTitle(backlog.oldest))
          ) : (
            o.backlogNone
          )}
        </div>
      </div>
      {sim.kind === 'rpc' ? (
        <div className="vital">
          <div className="vital-label">
            <Phrases text={`${o.settleRate} · ${sim.network}`} />
          </div>
          <div className="vital-value num">
            {est.feerateSatVb}
            <span className="vital-unit"> sat/vB</span>
          </div>
          <Meter value={Math.min(est.feerateSatVb, 50)} max={50} ink="mo" label={o.settleRateMeter(String(est.feerateSatVb))} />
          <div className="vital-sub vital-note">{o.consensusMin(String(PARAMS.MIN_SETTLEMENT_FEERATE))}</div>
        </div>
      ) : (
        <div className="vital">
          <div className="vital-label">
            <Phrases text={`${o.btcRate} · regtest`} />
          </div>
          <div className={`vital-value num${sim.feeSpike ? ' vital-warn' : ''}`}>
            {est.market.feeRate}
            <span className="vital-unit"> sat/vB</span>
          </div>
          <Meter value={Math.min(est.market.feeRate, 50)} max={50} ink={sim.feeSpike ? 'warn' : 'mo'} label={o.btcRateMeter(String(est.market.feeRate))} />
          <div className={`vital-sub vital-note${sim.feeSpike ? ' vital-sub--warn' : ''}`}>
            <Phrases text={sim.feeSpike ? o.feeSpike(String(est.market.minFeeRate), String(est.feerateSatVb)) : o.feeFloor(String(est.market.minFeeRate), String(PARAMS.MIN_SETTLEMENT_FEERATE))} />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * A figure written with words (a duration's "min" and "s"): each word in the face of a unit, close to its number as the other readings'
 * units are, and a space of the figure between "3 min" and "46 s"
 */
function FigureWords({ text }: { text: string }) {
  return text.split(/(\d[\d.,]*)/).map((part, i) => {
    if (i % 2 === 1 || !part.trim()) return part;
    const [, unit = '', gap = ''] = /^(.*?)(\s*)$/.exec(part) ?? [];
    return (
      <Fragment key={i}>
        <span className="vital-unit">{unit}</span>
        {gap}
      </Fragment>
    );
  });
}

/**
 * Phrases joined by " · " (a label, a note): a line breaks between them, after the dot, before it breaks inside one, and inside one only
 * where it does not fit a line of its own (`.phrase`); balancing the lines alone would split "Settlement fee" from "rate · signet"
 */
function Phrases({ text }: { text: string }) {
  const parts = text.split(' · ');
  return parts.map((p, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      <span className="phrase">{i < parts.length - 1 ? `${p} ·` : p}</span>
    </Fragment>
  ));
}
