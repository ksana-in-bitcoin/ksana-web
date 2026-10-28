import { useChain } from '../app/store';
import { blockStage, claimedFor, namedProducer, opStage, receivedBy, summarizeOp, STAGE_LABEL, transferOf } from '../chain/views';
import { IconMerge } from './icons';
import type { Block, OpRecord } from '../chain/types';
import { fmtInt } from '../lib/format';
import { AccountRef, BlockRef, Hash, Link } from './Refs';
import { StatusBadge, StatusMark } from './Status';
import { Table, rowOpener, useFreshKeys, useHold, type Column } from './Table';
import { Amount, PathBadge, TimeAgo } from './Values';
import { Empty } from './ui';
import { useT } from '../i18n';
import { useMe } from '../wallet/model';

export function EntryCounts({ block }: { block: Block }) {
  const t = useT();
  let b = 0;
  let c = 0;
  let other = 0;
  for (const e of block.entries) {
    if (e.entry.kind === 'Sponsored') b++;
    else if (e.entry.kind === 'Forced') c++;
    else other++;
  }
  if (block.entries.length === 0) return <span className="muted small nobr">{t.ui.emptyBlock}</span>;
  return (
    <span className="entry-counts num" title={t.ui.entryCounts(b, c) + (other ? t.ui.entryCountsOther(other) : '')}>
      <b>{block.entries.length}</b>
      <span className="entry-counts-split">
        {b > 0 && <span>B{b}</span>}
        {c > 0 && <span className="entry-counts-c">C{c}</span>}
        {/* An unlock entry, the only other kind: a block holds one at most */}
        {other > 0 && <span className="entry-counts-word">{other > 1 ? `${t.ui.entryUnlock} ×${other}` : t.ui.entryUnlock}</span>}
      </span>
    </span>
  );
}

export function BlocksTable({ blocks, compact = false }: { blocks: Block[]; compact?: boolean }) {
  const sim = useChain();
  const t = useT();
  const me = useMe();
  const cols: Column<Block>[] = [
    {
      key: 'h',
      label: t.common.height,
      mobile: 'primary',
      render: (b, gone) => (
        <span className="row gap-6 block-title">
          <BlockRef height={b.header.height} {...(b.side || gone ? { hash: b.hash } : {})} />
          {/* On a tablet a parallel block's tag and the hash step aside, as the columns marked for it do: its height's prime marks it, and its
              page gives both */}
          {b.side && <span className="tag tag--neutral tag--xs t-hide">{t.common.sideBlock}</span>}
          {b.merged.length > 0 && (
            <span className="merge-mark" title={t.ui.mergedCount(b.merged.length)}>
              <IconMerge size={13} />
              {b.merged.length > 1 ? b.merged.length : null}
              <span className="sr-only">{t.ui.mergedCount(b.merged.length)}</span>
            </span>
          )}
          {!compact && <Hash value={b.hash} head={10} tail={4} className="t-hide" />}
        </span>
      ),
    },
    { key: 'stage', label: t.common.status, mobile: 'bare', render: (b) => <StatusBadge stage={blockStage(sim, b)} /> },
    // On a narrow screen "empty block" and a producer's name speak for themselves, without "Entries" or "Producer" before them
    { key: 'entries', label: t.common.entries, mobileLabel: (b) => (b.entries.length ? t.common.entries : undefined), render: (b) => <EntryCounts block={b} /> },
    {
      key: 'producer',
      label: t.common.producer,
      mobile: compact ? 'hide' : 'inline',
      narrow: 'hide',
      mobileLabel: (b) => (namedProducer(sim, b.header.producer, me) ? undefined : t.common.producer),
      render: (b) => <AccountRef id={b.header.producer} short />,
    },
  ];
  if (!compact) {
    cols.push(
      { key: 'gas', label: 'gas', align: 'right', mobile: 'hide', tablet: 'hide', render: (b) => <span className="num small">{fmtInt(b.gasUsed)}</span> },
      { key: 'anchor', label: t.ui.btcAnchor, align: 'right', mobile: 'hide', tablet: 'hide', render: (b) => <span className="num small soft">{fmtInt(b.header.btcAnchor.height)}</span> },
    );
  }
  cols.push({ key: 't', label: t.common.time, align: 'right', mobile: 'corner', render: (b) => <span className="small soft"><TimeAgo at={b.time} /></span> });
  return (
    <Table
      caption={t.ui.blockList}
      columns={cols}
      rows={blocks}
      rowKey={(b) => b.hash}
      // A block the list no longer has, by its hash: another may hold its height by now
      rowTo={(b, gone) => ({ name: 'block', id: b.side || gone ? b.hash : String(b.header.height) })}
      flash
    />
  );
}

/** One-line description of an operation: verb + amount + counterparty */
export function OpSummaryText({ r, perspective, link = false }: { r: OpRecord; perspective?: string; link?: boolean }) {
  const sim = useChain();
  const t = useT();
  const s = summarizeOp(sim, r);
  const incoming = perspective && r.op.account !== perspective;
  const a = r.op.action;
  // What reached this account from someone else's op: a transfer to it (a KS-20 token's too, D-123), a top-up claim naming it (D-085), or
  // what the op's receipt and its token events credit it with, unless the op calls this very contract. Any other op keeps its own verb
  const received = incoming
    ? transferOf(sim, a)?.to === perspective
      ? s.amount
      : (claimedFor(sim, r, perspective) ?? (a.kind === 'Call' && a.contract === perspective ? undefined : receivedBy(sim, r, perspective)))
    : undefined;
  const amount = received ?? s.amount;
  const head = (
    <>
      <span className="op-verb">{received ? t.ui.received : s.verb}</span>
      {amount && <Amount value={amount.value} asset={amount.asset} size="sm" privacy={!!perspective} />}
      {s.detail && <span className="soft small">{s.detail}</span>}
    </>
  );
  return (
    <span className="op-summary">
      {link ? (
        <Link to={{ name: 'op', id: r.id }} className="op-head-link">
          {head}
        </Link>
      ) : (
        head
      )}
      {/* The arrow, or the "@", and the account it points to are one party: a summary too long for its line breaks before the arrow */}
      {s.counterparty && !incoming && (
        <span className="op-party">
          <span className="op-arrow" aria-label={t.ui.arrowTo}>
            →
          </span>
          <AccountRef id={s.counterparty} short />
        </span>
      )}
      {incoming && (
        <span className="op-party">
          <span className="op-arrow" aria-label={t.ui.arrowFrom}>
            ←
          </span>
          <AccountRef id={r.op.account} short />
        </span>
      )}
      {/* On the contract's own page the contract goes without saying */}
      {s.contract && !s.counterparty && s.contract !== perspective && (
        <span className="op-party">
          <span className="op-arrow" aria-label={t.common.contract}>
            @
          </span>
          <AccountRef id={s.contract} short />
        </span>
      )}
    </span>
  );
}

export function OpsTable({ ops, perspective, showAccount = true }: { ops: OpRecord[]; perspective?: string; showAccount?: boolean }) {
  const sim = useChain();
  const t = useT();
  const cols: Column<OpRecord>[] = [
    {
      key: 'what',
      label: t.common.content,
      mobile: 'primary',
      render: (r) => (
        <span className="row gap-8 op-cell">
          <PathBadge path={r.path} />
          <OpSummaryText r={r} {...(perspective ? { perspective } : {})} />
        </span>
      ),
    },
  ];
  if (showAccount) cols.push({ key: 'acct', label: t.ui.sender, render: (r) => <AccountRef id={r.op.account} short /> });
  cols.push(
    { key: 'id', label: 'op_id', mobile: 'hide', tablet: 'hide', narrow: 'hide', render: (r) => <Hash value={r.id} to={{ name: 'op', id: r.id }} head={8} tail={4} /> },
    {
      key: 'stage',
      label: t.common.status,
      mobile: 'bare',
      render: (r) => {
        const st = opStage(sim, r);
        return <StatusBadge stage={st} label={STAGE_LABEL[st]} />;
      },
    },
    { key: 't', label: t.common.time, align: 'right', mobile: 'end', render: (r) => <span className="small soft"><TimeAgo at={r.submittedAt} /></span> },
  );
  return (
    <Table
      caption={t.ui.opList}
      columns={cols}
      rows={ops}
      rowKey={(r) => r.id}
      rowTo={(r) => ({ name: 'op', id: r.id })}
      flash
    />
  );
}

/** Compact operation rows, used in the overview's narrow column */
export function OpLines({ ops, listing = false }: { ops: OpRecord[]; listing?: boolean }) {
  const sim = useChain();
  const t = useT();
  // Held while the keyboard is in the list, as a table is
  const { rows, gone, focus } = useHold(ops, (o) => o.id);
  const fresh = useFreshKeys(rows.map((o) => o.id));
  // While the node lists the latest operations the list is not known to be empty
  if (rows.length === 0) return listing ? null : <Empty title={t.overview.noRecentOps} />;
  return (
    <ul className="op-lines" {...focus}>
      {rows.map((r) => {
        const st = opStage(sim, r);
        return (
          <li key={r.id} className={`row-link${fresh.has(r.id) ? ' row-new' : ''}${gone(r) ? ' row-gone' : ''}`} data-key={r.id} onClick={rowOpener({ name: 'op', id: r.id })}>
            <PathBadge path={r.path} />
            <div className="op-line-main">
              <OpSummaryText r={r} link />
              <div className="op-line-meta">
                <AccountRef id={r.op.account} short />
                {/* The dot goes with the time, below the signer where the two do not fit, rather than end the signer's line */}
                <span className="op-line-when">
                  <span className="dot-sep" aria-hidden="true" />
                  <TimeAgo at={r.submittedAt} />
                </span>
              </div>
              {gone(r) && <span className="sr-only">{t.ui.goneSr}</span>}
            </div>
            <span className="op-line-status" title={STAGE_LABEL[st]}>
              <StatusMark stage={st} size={13} />
              <span className="sr-only">{STAGE_LABEL[st]}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
