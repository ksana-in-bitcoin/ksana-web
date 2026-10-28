import { Fragment, useEffect } from 'react';
import { navigate } from '../app/router';
import { useChain, useNow } from '../app/store';
import { acceptingBlock, blockAhead, blockProgress, blockStage, blockTitle, carrierHeight, currentSettlement, headerCarrier, headerSpan, indexerVouches, namedProducer, ownHeaderCarrier, pairFee, TX_KIND_LABEL, TX_STATUS_LABEL, txRoute } from '../chain/views';
import type { Block, EntryRecord, OpRecord } from '../chain/types';
import { KSA_ASSET_ID, PARAMS } from '../chain/params';
import { fmtBytes, fmtDateTime, fmtInt } from '../lib/format';
import { AccountRef, BlockRef, BtcRef, FullHash, Hash, Link } from '../components/Refs';
import { OpSummaryText } from '../components/Lists';
import { FeeCell, GasBar, ResultCell } from '../components/OpBits';
import { StatusBadge, StatusMark, Meter } from '../components/Status';
import { Table, type Column } from '../components/Table';
import { Tracker } from '../components/Tracker';
import { Amount, EntryTag, Figures, Sats, TimeAgo } from '../components/Values';
import { Banner, ButtonLink, Empty, Kbd, PageHead, Section, SpecList } from '../components/ui';
import { IconCheck, IconChevronLeft, IconChevronRight } from '../components/icons';
import { LookupView, useBtcTimes, useCommitFees, useHeaderCarrier, useLookup } from '../components/Lookup';
import { useT } from '../i18n';
import { useMe } from '../wallet/model';

export function BlockDetail({ id }: { id: string }) {
  const sim = useChain();
  const now = useNow();
  const t = useT();
  const me = useMe();
  const b = sim.getBlock(id);
  const lookup = useLookup('block', id, !!b);

  // [ and ] go to the previous / next block (main chain)
  useEffect(() => {
    if (!b || b.side) return;
    const h = b.header.height;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if (e.key === '[' && h > 0) navigate({ name: 'block', id: String(h - 1) });
      if (e.key === ']' && h < sim.tip.header.height) navigate({ name: 'block', id: String(h + 1) });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [b, sim]);

  const progress = b ? blockProgress(sim, b, now) : undefined;
  useBtcTimes(progress?.btcAsk);
  // While its lookup reads, though the block is in: what else it reads (its merged blocks, its settlement status) is not (`lookupShown`)
  if (!b || !progress || lookup) {
    const shown = lookup ?? { state: 'missing' as const, message: '' };
    // A height above the tip, which is why there is no block at it: said, where the node's answer said only that it has none
    const tip = shown.state === 'missing' ? blockAhead(sim, id) : undefined;
    return <LookupView kind="block" id={id} lookup={tip !== undefined ? { state: 'missing', message: t.search.notFound.ahead(fmtInt(tip)) } : shown} path={`/block/${id}`} />;
  }
  const h = b.header.height;
  const stage = blockStage(sim, b);
  const by = acceptingBlock(sim, b);
  const sibling = b.side ? sim.blocks[h] : undefined;
  const isTip = !b.side && h === sim.tip.header.height;

  return (
    <div className="page">
      <PageHead
        eyebrow={b.side ? t.block.head.eyebrowSide : t.block.head.eyebrow}
        title={<span className="mono">#{fmtInt(h)}</span>}
        doc={t.ui.doc.block(fmtInt(h))}
        meta={
          <>
            <StatusBadge stage={stage} large />
            <span>
              {!namedProducer(sim, b.header.producer, me) && <>{t.common.producer} </>}
              <AccountRef id={b.header.producer} short />
            </span>
            <TimeAgo at={b.time} />
            <span>
              {t.block.head.anchor} <BtcRef height={b.header.btcAnchor.height} />
            </span>
          </>
        }
        actions={
          !b.side && (
            <div className="row gap-6 pager">
              <ButtonLink to={{ name: 'block', id: String(Math.max(0, h - 1)) }} size="sm" icon={<IconChevronLeft />} disabled={h === 0}>
                {t.block.head.prev}
              </ButtonLink>
              <ButtonLink to={{ name: 'block', id: String(h + 1) }} size="sm" className="btn--icon-right" icon={<IconChevronRight />} disabled={isTip}>
                {t.block.head.next}
              </ButtonLink>
              <span className="pager-hint small muted">
                <Kbd>[</Kbd> <Kbd>]</Kbd>
              </span>
            </div>
          )
        }
      />

      {b.side && (
        <Banner tone="info" title={by ? t.block.side.mergedBy(fmtInt(by.header.height)) : t.block.side.waiting}>
          {sibling && (
            <>
              {t.block.side.sibling} <BlockRef height={sibling.header.height} hash={sibling.hash} />
            </>
          )}
        </Banner>
      )}

      {h > 0 && (
        <div className="panel panel-pad">
          <Tracker progress={progress} />
        </div>
      )}

      <div className="grid-2">
        <Section title={t.block.header.title} eyebrow="v2 · sha256d(borsh(header))">
          <SpecList
            rows={[
              { label: t.block.header.hash, value: <FullHash value={b.hash} /> },
              { label: 'parents', value: h > 0 ? <ParentList b={b} /> : <span className="muted">{t.block.header.genesis}</span> },
              { label: 'height', value: <span className="num">{fmtInt(h)}</span> },
              {
                label: 'btc_anchor',
                value: (
                  <span className="row wrap gap-8">
                    <BtcRef height={b.header.btcAnchor.height} />
                    <Hash value={b.header.btcAnchor.hash} head={10} tail={6} />
                  </span>
                ),
              },
              { label: 'entries_root', value: <Hash value={b.header.entriesRoot} head={16} tail={8} copy /> },
              {
                label: 'state_root',
                value: (
                  <span className="row wrap gap-8">
                    <Hash value={b.header.stateRoot} head={16} tail={8} copy />
                    {indexerVouches(sim, b) && (
                      <span className="tag tag--mo">
                        <IconCheck size={12} />
                        {t.block.header.indexerMatch}
                      </span>
                    )}
                  </span>
                ),
              },
              { label: 'producer', value: <AccountRef id={b.header.producer} showKey /> },
              { label: 'timestamp', value: <span className="num">{fmtDateTime(b.header.timestamp * 1000)}</span>, hint: String(b.header.timestamp) },
              { label: 'bits', value: <span className="mono">0x{b.header.bits.toString(16)}</span> },
              // Empty-block weight (D-084, D-090): doubles over consecutive empty blocks; effective difficulty and reward slots grow with it
              b.weight !== undefined && b.weight > 1 && { label: t.block.header.weight, value: <span className="num">×{b.weight}</span>, hint: t.block.header.weightHint },
              { label: 'nonce', value: <span className="mono">{b.header.nonce}</span> },
            ]}
          />
        </Section>
        <div className="stack">
          {h > 0 && (
            <Section title="DAG" eyebrow="GHOSTDAG">
              <DagFacts b={b} />
            </Section>
          )}
          <Section
            title={t.block.settle.title}
            eyebrow={
              !b.needsSettlement && !ownHeaderCarrier(b, headerCarrier(sim, b))
                ? t.block.settle.none
                : b.carrier && b.carrier !== b.hash
                  ? t.block.settle.bodyCarrier
                  : b.settlements.length || !b.needsSettlement
                    ? `${t.block.settle.own} · ${t.block.settle.ownPair}`
                    : b.settlementOnBtc
                      ? t.block.settle.otherCarrier
                      : t.block.settle.waiting
            }
          >
            <SettlementSummary b={b} />
          </Section>
        </div>
      </div>

      <Entries b={b} />

      <details className="raw">
        <summary>{t.block.raw}</summary>
        <pre className="raw-pre mono">
          {JSON.stringify(
            { hash: b.hash, header: b.header, entries: b.entries.map((e) => e.entry), accepted_height: b.acceptedHeight ?? null, merged: b.merged },
            (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

function ParentList({ b }: { b: Block }) {
  const sim = useChain();
  const t = useT();
  return (
    <span className="parent-list">
      {b.header.parents.map((p, i) => {
        const pb = sim.getBlock(p);
        return (
          <span key={p} className="parent-item">
            <span className={`tag ${i === 0 ? 'tag--mo' : ''}`}>{i === 0 ? t.block.dag.selectedParent : t.block.dag.mergedParent}</span>
            <Hash value={p} to={{ name: 'block', id: p }} head={10} tail={6} copy />
            {pb && <span className="small soft">{blockTitle(pb)}</span>}
          </span>
        );
      })}
    </span>
  );
}

function DagFacts({ b }: { b: Block }) {
  const sim = useChain();
  const t = useT();
  const by = acceptingBlock(sim, b);
  const merged = sim.mergedOf(b);
  return (
    <SpecList
      rows={[
        {
          label: 'accepted_height',
          value: by ? (
            <span className="row wrap gap-8">
              <BlockRef height={by.header.height} hash={by.hash} />
              {b.side && <span className="small soft">{t.block.dag.acceptedBy}</span>}
            </span>
          ) : (
            <span className="muted">{t.status.stage.unmerged}</span>
          ),
        },
        {
          label: 'merged',
          value: merged.length ? (
            <span className="parent-list">
              {merged.map((m) => (
                <span key={m.hash} className="parent-item mark-words">
                  <StatusMark stage={blockStage(sim, m)} />
                  <Hash value={m.hash} to={{ name: 'block', id: m.hash }} head={10} tail={6} />
                  <span className="small soft">{t.block.dag.mergedStats(m.entries.length, m.entries.filter((e) => e.result.reason === 'skipped').length)}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="muted">—</span>
          ),
        },
        b.closureBtc !== undefined && { label: t.block.dag.closure, value: <BtcRef height={b.closureBtc} /> },
      ]}
    />
  );
}

function SettlementSummary({ b }: { b: Block }) {
  const sim = useChain();
  const t = useT();
  const st = t.block.settle;
  const carrier = b.needsSettlement ? undefined : headerCarrier(sim, b);
  // The fee of the block's own pair whole, below: where its commit spends what the page has not seen, that is read (`askCommitFees`)
  const own = currentSettlement(sim, b) ?? (ownHeaderCarrier(b, carrier) ? carrier : undefined);
  useCommitFees(own?.commitTxid && pairFee(sim, own).revealOnly ? [own.commitTxid] : undefined);
  // A header carried by a settlement the page has not read: the one of the first block above to send one (`askHeaderCarrier`)
  useHeaderCarrier(!b.needsSettlement && !carrier && b.header.height > 0 ? b.hash : undefined);
  if (b.header.height === 0) return <p className="small soft">{st.genesis}</p>;
  if (!b.needsSettlement && !ownHeaderCarrier(b, carrier)) {
    const carriedFor = carrier?.forBlock ? sim.getBlock(carrier.forBlock) : undefined;
    const stage = blockStage(sim, b);
    // Said once the page has read what it can: until then the block's own line above is all, rather than a line taken back a moment later
    const read = sim.kind !== 'rpc' || sim.headerCarrierRead(b.hash);
    return (
      <div className="stack">
        <p className="small soft">{st.carried}</p>
        {carrier ? (
          <SpecList
            rows={[
              { label: st.carrier, value: <Hash value={carrier.txid} to={txRoute(sim, carrier.txid)} head={12} tail={6} /> },
              {
                label: t.block.type,
                value: carrier.kind === 'headers' ? TX_KIND_LABEL.headers : st.carrierOf(carriedFor ? blockTitle(carriedFor) : st.otherBlock, TX_KIND_LABEL[carrier.kind]),
              },
              { label: t.common.status, value: TX_STATUS_LABEL[carrier.status] },
              carrier.confirmedHeight !== undefined && { label: t.status.searchKind.btc_block, value: <BtcConfs height={carrier.confirmedHeight} /> },
            ]}
          />
        ) : (
          // A header already on Bitcoin, as the block's life above says, that the first main-chain settlement above it did not carry: a
          // republish (D-047) or a parallel block's settlement landed it first
          read && <p className="small muted">{stage === 'on_btc' || stage === 'deep' || stage === 'final' ? st.carrierUnloaded : st.noCarrier}</p>
        )}
      </div>
    );
  }
  // The block body is carried on-chain by a later block's settlement (settlement batching, D-077)
  if (b.carrier && b.carrier !== b.hash) {
    const cb = sim.getBlock(b.carrier);
    const carriedAt = carrierHeight(sim, b);
    const ctx = b.settlementOnBtc ? sim.getBtcTx(b.settlementOnBtc.txid) : cb ? currentSettlement(sim, cb) : undefined;
    return (
      <div className="stack">
        {/* Said in the past once the body is on Bitcoin, or as another transaction's where a republish took it there */}
        <p className="small soft">{!b.settlementOnBtc ? st.bodyCarried : ctx?.kind === 'headers' ? st.bodyOther : st.bodyCarriedLanded}</p>
        <SpecList
          rows={[
            {
              label: st.bodyCarrierBlock,
              value:
                carriedAt !== undefined ? (
                  <BlockRef height={carriedAt} hash={b.carrier} />
                ) : (
                  <Hash value={b.carrier} to={{ name: 'block', id: b.carrier }} head={12} tail={6} copy />
                ),
            },
            ctx && { label: st.reveal, value: <Hash value={ctx.txid} to={txRoute(sim, ctx.txid)} head={12} tail={6} copy /> },
            ctx?.commitTxid && { label: st.commit, value: <Hash value={ctx.commitTxid} to={txRoute(sim, ctx.commitTxid)} head={12} tail={6} copy /> },
            // Built with the carrier block, whose page has it where this page has not loaded that block
            ctx && { label: t.common.status, value: TX_STATUS_LABEL[ctx.status] },
            ctx?.confirmedHeight !== undefined && { label: t.status.searchKind.btc_block, value: <BtcConfs height={ctx.confirmedHeight} /> },
          ]}
        />
      </div>
    );
  }
  // A body to land with no settlement of its own and none carrying it yet: it waits for a later block's settlement (D-077), or it went
  // with another transaction, a republish or a rescue (D-045, D-047)
  if (b.needsSettlement && !b.settlements.length) {
    const landed = b.settlementOnBtc;
    if (!landed) return <p className="small soft">{st.bodyCarried}</p>;
    const tx = sim.getBtcTx(landed.txid);
    return (
      <div className="stack">
        <p className="small soft">{st.bodyOther}</p>
        <SpecList
          rows={[
            { label: st.carrier, value: <Hash value={landed.txid} to={txRoute(sim, landed.txid)} head={12} tail={6} copy /> },
            tx && { label: t.block.type, value: TX_KIND_LABEL[tx.kind] },
            { label: t.status.searchKind.btc_block, value: <BtcConfs height={landed.btcHeight} /> },
          ]}
        />
      </div>
    );
  }
  // This block's own settlement: a commit / reveal pair (D-081); the block records the reveal transaction's ID. A block without a body
  // sends one only to carry bodies from the backlog, its header going with them (D-077)
  const tx = currentSettlement(sim, b) ?? carrier;
  const all = b.settlements.map((id) => sim.getBtcTx(id)).filter((x) => !!x);
  if (!tx) return <p className="small muted">{st.notBuilt}</p>;
  // What the pair paid, or the reveal transaction's fee alone where the page does not know the commit's (D-081)
  const fee = pairFee(sim, tx);
  return (
    <div className="stack">
      {!b.needsSettlement && <p className="small soft">{st.carriedOwn}</p>}
      <SpecList
        rows={[
          { label: st.reveal, value: <Hash value={tx.txid} to={txRoute(sim, tx.txid)} head={12} tail={6} copy /> },
          tx.commitTxid && { label: st.commit, value: <Hash value={tx.commitTxid} to={txRoute(sim, tx.commitTxid)} head={12} tail={6} copy /> },
          {
            label: t.common.status,
            value: (
              <span className="row wrap gap-8">
                {TX_STATUS_LABEL[tx.status]}
                {tx.kind === 'rescue' && <span className="tag tag--warn">{st.rescue}</span>}
              </span>
            ),
            hint: tx.status === 'built' ? undefined : tx.note,
          },
          tx.confirmedHeight !== undefined && { label: t.status.searchKind.btc_block, value: <BtcConfs height={tx.confirmedHeight} /> },
          tx.partial && {
            label: st.content,
            value: (
              <span className="muted" title={st.contentHint}>
                —
              </span>
            ),
          },
          !tx.partial && { label: st.headers, value: <span><Figures text={st.headerCount(tx.headers.length)} /></span>, hint: headerSpan(sim, tx) },
          !tx.partial && { label: st.bodies, value: <span><Figures text={st.bodyCount(tx.bodies.length)} /></span> },
          !tx.partial && {
            label: st.dataSize,
            value: (
              <span className="meter-row">
                <Meter value={tx.payloadBytes} max={PARAMS.MAX_BLOCK_DATA_BYTES} ink="mo" label={st.dataMeter} />
                <span className="small"><Figures text={`${fmtBytes(tx.payloadBytes)} / ${fmtBytes(PARAMS.MAX_BLOCK_DATA_BYTES)}`} /></span>
              </span>
            ),
          },
          !tx.partial && {
            label: fee.revealOnly ? st.revealFee : t.common.fee,
            value: (
              <span className="row wrap gap-8">
                <Sats value={fee.feeSat} size="sm" />
                <span className="small soft">
                  {fee.feeRate !== undefined ? `${fee.feeRate}\u00a0sat/vB · ` : ''}
                  {fmtInt(fee.vsize)}&nbsp;vB
                </span>
              </span>
            ),
            hint: fee.parts ? st.feeParts(fmtInt(fee.parts.commit), fmtInt(fee.parts.reveal)) : fee.revealOnly ? st.revealFeeHint : undefined,
          },
        ]}
      />
      {all.length > 1 && (
        <div className="small soft">
          {st.versions(all.length)}
          {all.map((v) => (
            <span key={v.txid} className="settle-version">
              <Hash value={v.txid} to={txRoute(sim, v.txid)} head={6} tail={4} /> {TX_KIND_LABEL[v.kind]} · {TX_STATUS_LABEL[v.status]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface Row {
  e: EntryRecord;
  idx: number;
  r?: OpRecord;
}

/**
 * The BTC block a settlement section's transaction confirmed in, and its confirmations. Where the two do not fit side by side the count
 * goes below the block whole: a figure and its word are one (`typeset`), and squeezed beside the block they broke inside the word ("72
 * confirmation" over "s" in a tablet's column)
 */
function BtcConfs({ height }: { height: number }) {
  const sim = useChain();
  const st = useT().block.settle;
  return (
    <span className="row wrap gap-8">
      <BtcRef height={height} />
      <span className="small soft">{st.confs(sim.btcConfs(height))}</span>
    </span>
  );
}

const unlockRow = (x: Row) => x.e.entry.kind === 'Unlock';

function Entries({ b }: { b: Block }) {
  const sim = useChain();
  const t = useT();
  const en = t.block.entries;
  const rows: Row[] = b.entries.map((e, idx) => {
    const id = e.entry.kind === 'Forced' || e.entry.kind === 'Sponsored' ? e.entry.opId : undefined;
    const r = id ? sim.getOp(id) : undefined;
    return r ? { e, idx, r } : { e, idx };
  });
  const groups: { key: string; title: string; rows: Row[] }[] = [
    { key: 'forced', title: en.forced, rows: rows.filter((x) => x.e.entry.kind === 'Forced') },
    { key: 'system', title: en.system, rows: rows.filter((x) => x.e.entry.kind === 'Unlock') },
    { key: 'fast', title: en.fast, rows: rows.filter((x) => x.e.entry.kind === 'Sponsored') },
  ].filter((g) => g.rows.length > 0);
  const skipped = b.entries.filter((e) => e.result.reason === 'skipped').length;

  const cols: Column<Row>[] = [
    { key: 'i', label: '#', width: '40px', mobile: 'hide', render: (x) => <span className="num muted">{x.idx}</span> },
    { key: 'kind', label: t.block.type, mobile: 'bare', render: (x) => <EntryTag kind={x.e.entry.kind} /> },
    {
      key: 'what',
      label: t.common.content,
      mobile: 'primary',
      render: (x) => {
        const entry = x.e.entry;
        const note = x.e.result.reason === 'skipped' ? <span className="entry-skip-note small">{x.e.result.message}</span> : null;
        if (x.r)
          return (
            <span className={x.e.result.reason === 'skipped' ? 'entry-skipped' : undefined}>
              <OpSummaryText r={x.r} link />
              {note}
            </span>
          );
        if (entry.kind === 'Unlock') {
          // Unlock up to the acceptance position (height, index) (D-074, D-079); the unlocked blocks and amount are derived from local data and are empty when the node data source lacks those blocks
          const ksa = sim.assets.get(KSA_ASSET_ID);
          return (
            <span className={`op-summary${x.e.result.reason === 'skipped' ? ' entry-skipped' : ''}`}>
              <Link to={{ name: 'block', id: String(entry.height) }} className="small">
                {en.unlockTo(fmtInt(entry.height), entry.index)}
              </Link>
              {entry.blocks && entry.blocks.length > 0 && <span className="small soft">· {en.unlockBlocks(entry.blocks.length)}</span>}
              {entry.amount !== undefined && ksa && (
                <>
                  <span className="small soft">· {en.unlockTotal}</span>
                  <Amount value={entry.amount} asset={ksa} size="sm" />
                </>
              )}
              {note}
            </span>
          );
        }
        return null;
      },
    },
    // An unlock entry has no account, fee or gas: its cells stay empty (and leave a narrow screen's card row) rather than read "—", which says a value is not known
    { key: 'acct', label: t.common.account, mobile: 'hide', render: (x) => (x.r ? <AccountRef id={x.r.op.account} short /> : unlockRow(x) ? null : <span className="muted">—</span>) },
    {
      key: 'fee',
      label: t.common.fee,
      align: 'right',
      render: (x) => (x.r && x.e.result.reason !== 'skipped' ? <FeeCell r={x.r} /> : unlockRow(x) ? null : <span className="muted">—</span>),
    },
    {
      key: 'gas',
      label: 'gas',
      align: 'right',
      mobile: 'hide',
      tablet: 'hide',
      render: (x) =>
        x.r && x.e.result.reason !== 'skipped' && x.e.result.reason !== 'unaccepted' ? (
          <GasBar used={x.e.result.gasUsed} max={x.r.op.maxGas} />
        ) : unlockRow(x) ? null : (
          <span className="muted">—</span>
        ),
    },
    { key: 'res', label: t.common.result, align: 'right', mobile: 'end', render: (x) => <ResultCell e={x.e} /> },
  ];

  return (
    <Section
      title={en.title(b.entries.length)}
      actions={
        b.entries.length > 0 && (
          <span className="small soft entry-sums">
            {/* Each figure stays whole on a line where it fits; a narrow screen breaks between them */}
            {[skipped ? en.skipped(skipped) : '', en.gas(fmtInt(b.gasUsed), fmtInt(b.maxGasSum)), en.data(fmtBytes(b.dataBytes))]
              .filter(Boolean)
              .map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && ' · '}
                  <span><Figures text={part} /></span>
                </Fragment>
              ))}
          </span>
        )
      }
    >
      {groups.length === 0 ? (
        <Empty title={t.ui.emptyBlock} />
      ) : (
        groups.map((g) => (
          <div key={g.key} className="entry-group">
            <div className="entry-group-head">
              <span className="entry-group-title">{g.title}</span>
            </div>
            <Table caption={g.title} columns={cols} rows={g.rows} rowKey={(x) => String(x.idx)} rowTo={(x) => (x.r ? { name: 'op', id: x.r.id } : undefined)} />
          </div>
        ))
      )}
    </Section>
  );
}

export function blockLink(b: Block) {
  return <Link to={{ name: 'block', id: b.side ? b.hash : String(b.header.height) }}>{blockTitle(b)}</Link>;
}
