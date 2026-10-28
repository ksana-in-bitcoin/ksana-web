import { useState } from 'react';
import { useChain } from '../app/store';
import { consoleStore } from '../app/prefs';
import { checkOk } from '../chain/model';
import { BTC_FINAL_DATA_CONFS, paramDocs, PARAMS } from '../chain/params';
import type { IndexerCheck } from '../chain/types';
import { fmtEta, fmtInt, shortHash } from '../lib/format';
import { BlockRef, BtcRef } from '../components/Refs';
import { StatusMark } from '../components/Status';
import { Table, type Column } from '../components/Table';
import { TimeAgo } from '../components/Values';
import { Button, Empty, PageHead, Section } from '../components/ui';
import { btcNetworkOf, indexerLag, indexerStall, indexerState } from '../chain/views';
import { IconTerminal } from '../components/icons';
import { useT } from '../i18n';

export function Verify() {
  const sim = useChain();
  const t = useT();
  const v = t.verify;
  const checks = sim.indexerChecks.slice(-14).reverse();
  const state = indexerState(sim);
  const noIndexer = state === 'off';
  const alarm = state === 'halted' || state === 'mismatch' || state === 'forked';
  // Every check this page made: a mismatch the recent ones no longer hold is still told
  const tally = sim.indexerTally;
  const earlier = tally.lastFailed && !sim.indexerChecks.includes(tally.lastFailed) ? tally.lastFailed : null;
  const checked = state === 'ok' || state === 'stalled' || state === 'mismatch' || state === 'forked';
  const lag = indexerLag(sim);
  // A block the indexer could have run and has not: said in place of why it trails
  const stall = state === 'stalled' ? indexerStall(sim) : undefined;
  // How far the BTC-final block trails the tip: no figure while the tip is that block, or the page has not read it yet
  const finalBlock = sim.blocks[sim.finalHeight];
  const finalLagMs = finalBlock && sim.finalHeight < sim.tip.header.height ? sim.tip.time - finalBlock.time : undefined;
  const chain = sim.kind === 'rpc' ? sim.config.chain : 'devnet';
  const params = paramDocs(t, chain);
  // The protocol parameters are a reference that would run to several screens on a phone: there they open on request
  const [paramsOpen, setParamsOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia?.('(max-width: 860px)').matches);

  const cols: Column<IndexerCheck>[] = [
    { key: 'h', label: t.common.height, mobile: 'primary', render: (c) => <BlockRef height={c.height} hash={c.hash} /> },
    { key: 'n', label: v.checks.nodeRoot, render: (c) => <span className="mono small nobr">{shortHash(c.nodeRoot, 12, 8)}</span> },
    { key: 'i', label: v.checks.indexerRoot, render: (c) => <span className="mono small nobr">{shortHash(c.indexerRoot, 12, 8)}</span> },
    {
      key: 'r',
      label: t.common.result,
      align: 'right',
      mobile: 'end',
      render: (c) =>
        checkOk(c) ? (
          <span className="result result--ok">✓ {v.checks.match}</span>
        ) : (
          <span className="result result--fail" title={c.nodeHash ? v.checks.nodeBlock(c.nodeHash) : undefined}>
            <StatusMark stage="failed" size={12} /> {c.nodeHash ? v.checks.forked : v.checks.mismatch}
          </span>
        ),
    },
    { key: 't', label: v.checks.at, align: 'right', mobile: 'hide', render: (c) => <span className="small soft"><TimeAgo at={c.at} /></span> },
  ];

  return (
    <div className="page">
      <PageHead eyebrow={v.eyebrow} title={v.title} meta={<span>{v.lead}</span>} />

      <section className="verify-flow panel" aria-label={v.flow.label}>
        <div className="vf-node">
          <div className="vf-label">{v.flow.node}</div>
          <div className="vf-value mono">#{fmtInt(sim.tip.header.height)}</div>
        </div>
        <div className="vf-arrow" aria-hidden="true">
          <span>{t.status.txKind.settlement}</span>
        </div>
        <div className="vf-node">
          <div className="vf-label">
            {v.bitcoin} · {btcNetworkOf(sim)}
          </div>
          <div className="vf-value mono">#{fmtInt(sim.btcTip.height)}</div>
          <div className="vf-sub">{v.flow.settled(<BlockRef height={sim.settledHeight} />)}</div>
        </div>
        <div className="vf-arrow" aria-hidden="true">
          <span>{v.flow.readOnly}</span>
        </div>
        <div className={`vf-node vf-node--indexer${alarm ? ' vf-node--alarm' : ''}`}>
          <div className="vf-label">{v.flow.indexer}</div>
          <div className="vf-value mono">{noIndexer || (!sim.indexerChecks.length && !sim.indexerHeight) ? '—' : `#${fmtInt(sim.indexerHeight)}`}</div>
          <div className="vf-sub">
            {state === 'off' ? (
              v.flow.noIndexer
            ) : state === 'halted' ? (
              <span className="strip-alarm">{v.flow.halted(sim.indexerHalted ?? '')}</span>
            ) : state === 'unreachable' ? (
              <span className="strip-warn">{v.flow.unreachable}</span>
            ) : state === 'none' ? (
              v.flow.none
            ) : stall ? (
              <span className="strip-warn">{v.flow.stalled(<BlockRef height={stall.height} />)}</span>
            ) : state === 'ok' || state === 'stalled' ? (
              <>
                <span className="strip-ok">✓</span> {earlier ? v.flow.okRecent : sim.kind === 'rpc' ? v.flow.okCompared(tally.count) : v.flow.ok}
              </>
            ) : (
              <span className="strip-alarm">{state === 'forked' ? v.flow.forked : v.flow.mismatch}</span>
            )}
          </div>
          {earlier && <div className="vf-sub">{v.flow.earlier(tally.failed, tally.count, <BlockRef height={earlier.height} hash={earlier.hash} />)}</div>}
        </div>
      </section>
      {stall ? (
        <p className="small">{v.stall(<BlockRef height={stall.height} />, <BtcRef height={stall.since} />, PARAMS.SETTLEMENT_DEPTH)}</p>
      ) : (
        checked && lag.blocks > 0 && <p className="small soft">{v.lag(lag.blocks, lag.unwritten, PARAMS.SETTLEMENT_DEPTH)}</p>
      )}

      <Section title={v.checks.title}>
        {/* A height the indexer checks again, after it went back, is a check of its own; a row opens the block checked, as its link does */}
        <Table
          caption={v.checks.caption}
          columns={cols}
          rows={checks}
          rowKey={(c) => `${c.height}:${c.at}`}
          rowTo={(c) => ({ name: 'block', id: c.hash })}
          empty={<Empty title={noIndexer ? v.checks.noIndexer : v.checks.none} />}
        />
      </Section>

      <Section title={v.confirm.title}>
        <div className="confirm-pair">
          <article className="confirm-card confirm-card--qing">
            <header>
              <StatusMark stage="fast" size={18} />
              <h3>{t.status.stage.fast}</h3>
            </header>
            <dl>
              <dt>{v.confirm.when}</dt>
              <dd>{v.confirm.fastWhen}</dd>
              <dt>{v.confirm.time}</dt>
              <dd>{t.format.aboutSeconds(PARAMS.TARGET_BLOCK_TIME)}</dd>
              <dt>{v.confirm.security}</dt>
              <dd>{v.confirm.fastSecurity}</dd>
              <dt>{v.confirm.fit}</dt>
              <dd>{v.confirm.fastFit}</dd>
            </dl>
          </article>
          <article className="confirm-card confirm-card--zhu">
            <header>
              <StatusMark stage="final" size={18} />
              <h3>{t.status.stage.final}</h3>
            </header>
            <dl>
              <dt>{v.confirm.when}</dt>
              <dd>{v.confirm.finalWhen(PARAMS.BTC_FINALITY_CONFS)}</dd>
              <dt>{v.confirm.time}</dt>
              {/* Both as the wallet writes its estimates, in minutes up to three hours: mainnet's "~110 min" was beside the network's "~2 h 24 min" */}
              <dd>{v.confirm.finalTime(fmtEta(BTC_FINAL_DATA_CONFS * 600_000), chain, finalLagMs === undefined ? undefined : fmtEta(finalLagMs))}</dd>
              <dt>{v.confirm.security}</dt>
              <dd>{v.bitcoin}</dd>
              <dt>{v.confirm.fit}</dt>
              <dd>{v.confirm.finalFit}</dd>
            </dl>
          </article>
        </div>
        <p className="small soft">{v.confirm.risk}</p>
      </Section>

      <Section title={v.self.title}>
        <div className="prose">
          <p>{v.self.how(<code>ksana-indexer</code>, <code>txindex</code>)}</p>
          {/* Each reading a phrase, the line breaking at the dot: "Indexer is" stood at a phone's line end with "at" below it, and a
              Japanese word was split */}
          {!noIndexer && (
            <p>
              <span className="phrase">
                {v.self.btcTip} <BtcRef height={sim.btcTip.height} /> ·
              </span>{' '}
              <span className="phrase">
                {v.self.indexerAt} <BtcRef height={sim.indexerBtcHeight} />
              </span>
            </p>
          )}
        </div>
        <div>
          {/* Its label is a sentence, which a phone's line does not always hold: the simulator's English and Spanish ones at 320 px, and
              more under a reader's own wider letter and word spacing. It wraps */}
          <Button className="btn--wrap" icon={<IconTerminal />} onClick={() => consoleStore.set(true)}>
            {sim.kind === 'sim' ? v.self.console : v.self.settings}
          </Button>
        </div>
      </Section>

      <Section title={v.params.title} eyebrow={v.params.eyebrow(chain)}>
        <details className="params-all" open={paramsOpen} onToggle={(e) => setParamsOpen(e.currentTarget.open)}>
          <summary>{v.params.count(params.length)}</summary>
          <Table
            caption={v.params.title}
            columns={[
              { key: 'n', label: v.params.name, mobile: 'primary', render: (p) => <code className="inline">{p.name}</code> },
              { key: 'v', label: v.params.value, render: (p) => <span className="num">{p.value}</span> },
              { key: 'note', label: v.params.note, mobile: 'bare', className: 'param-note', render: (p) => <span className="small">{p.note}</span> },
            ]}
            rows={params}
            rowKey={(p) => p.name}
          />
        </details>
      </Section>
    </div>
  );
}
