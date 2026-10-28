import { useState } from 'react';
import { navigate } from '../app/router';
import { useChain, useNow } from '../app/store';
import { OpsTable, OpSummaryText } from '../components/Lists';
import { FeeCell } from '../components/OpBits';
import { HistoryReach, OlderRows, useShownRows } from '../components/HistoryReach';
import { AccountRef } from '../components/Refs';
import { Table, type Column } from '../components/Table';
import { Figures, PathBadge } from '../components/Values';
import { Empty, PageHead, Tabs } from '../components/ui';
import { KSA_DECIMALS } from '../chain/params';
import type { OpRecord, Path } from '../chain/types';
import { nativeConfsOf } from '../chain/views';
import { fmtAmount, fmtDuration } from '../lib/format';
import { useT } from '../i18n';

export function Ops({ tab }: { tab: 'latest' | 'mempool' }) {
  const sim = useChain();
  const t = useT();
  const [path, setPath] = useState<'all' | Path>('all');
  const [failedOnly, setFailedOnly] = useState(false);
  const pendingCount = sim.mempool.length + sim.nativePending.length;

  return (
    <div className="page">
      <PageHead eyebrow="VmOp" title={t.ops.title} />
      <div className="toolbar">
        <Tabs
          label={t.ops.tabs.label}
          value={tab}
          onChange={(v) => navigate({ name: 'ops', tab: v })}
          options={[
            { value: 'latest', label: t.ops.tabs.latest },
            { value: 'mempool', label: sim.kind === 'rpc' ? t.ops.tabs.pendingLocal : t.ops.tabs.mempool, count: pendingCount },
          ]}
        />
        {tab === 'latest' && (
          <>
            <Tabs
              label={t.ops.filter.label}
              value={path}
              onChange={setPath}
              options={[
                { value: 'all', label: t.ops.filter.all },
                { value: 'B', label: t.ops.filter.path('B', t.status.path.B) },
                { value: 'C', label: t.ops.filter.path('C', t.status.path.C) },
              ]}
            />
            <label className="check">
              <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
              {t.ops.filter.failedOnly}
            </label>
          </>
        )}
      </div>
      {tab === 'latest' ? <Latest path={path} failedOnly={failedOnly} /> : <Mempool />}
    </div>
  );
}

/** The latest operations list this many at first, and as many more each time a reader asks for older ones */
export const LATEST_ROWS = 60;

function Latest({ path, failedOnly }: { path: 'all' | Path; failedOnly: boolean }) {
  const sim = useChain();
  const t = useT();
  const shown = useShownRows(LATEST_ROWS, `${path}:${failedOnly}`);
  // One beyond the rows shown, which tells that an older one is there
  const rows: OpRecord[] = [];
  for (let i = sim.opOrder.length - 1; i >= 0 && rows.length <= shown.shown; i--) {
    const r = sim.getOp(sim.opOrder[i] as string);
    if (!r || r.origin === 'system') continue;
    if (path !== 'all' && r.path !== path) continue;
    if (failedOnly && (!r.result || r.result.ok)) continue;
    rows.push(r);
  }
  return (
    <>
      <HistoryReach of="latest" full={rows.length >= shown.shown} grown={shown.grown} />
      {rows.length ? <OpsTable ops={rows.slice(0, shown.shown)} /> : !(sim.kind === 'rpc' && sim.history('latest').loading) && <Empty title={t.ops.filter.none} />}
      <OlderRows of="latest" listed={rows.length} rows={shown} />
    </>
  );
}

function Mempool() {
  const sim = useChain();
  const now = useNow();
  const t = useT();
  const m = t.ops.mempool;
  const backlog = sim.backlogStatus();
  const rows = [...sim.mempool, ...sim.nativePending].sort((a, b) => a.submittedAt - b.submittedAt);
  const minFees = sim.producers.map((p) => p.minTokenFee);
  const strictest = minFees.reduce((a, b) => (a > b ? a : b), 0n);

  const note = (r: OpRecord): string => {
    if (r.path === 'C') {
      // Forced in once its transaction has NATIVE_CONFIRMATIONS + ANCHOR_DEPTH BTC confirmations (`nativeConfsOf`: 2 on signet, 1 on devnet)
      const tx = r.nativeTxid ? sim.getBtcTx(r.nativeTxid) : undefined;
      const confs = sim.btcConfs(tx?.confirmedHeight);
      const need = nativeConfsOf(sim);
      return confs >= need ? m.why.nativeConfirmed : confs > 0 ? m.why.nativeConfs(confs, need) : m.why.nativeWaiting;
    }
    if (backlog.triggered) return m.why.backlog;
    if (sim.censored.has(r.op.account)) return m.why.censored;
    if (r.op.fee.kind === 'Token' && r.op.fee.amount < strictest) {
      const refuse = sim.producers.filter((p) => r.op.fee.kind === 'Token' && r.op.fee.amount < p.minTokenFee).map((p) => p.name);
      return m.why.lowFee(refuse.join(t.format.listSep));
    }
    const acc = sim.peekAccount(r.op.account);
    if (acc && r.op.nonce > acc.nonce) return m.why.nonce(String(acc.nonce));
    return t.status.step.nextFastBlock;
  };

  const cols: Column<OpRecord>[] = [
    {
      key: 'what',
      label: t.common.content,
      mobile: 'primary',
      render: (r) => (
        <span className="row gap-8 op-cell">
          <PathBadge path={r.path} />
          <OpSummaryText r={r} link />
        </span>
      ),
    },
    { key: 'acct', label: t.common.account, render: (r) => <AccountRef id={r.op.account} short /> },
    { key: 'nonce', label: 'nonce', align: 'right', mobile: 'hide', render: (r) => <span className="num">{r.op.nonce}</span> },
    { key: 'fee', label: t.common.fee, align: 'right', render: (r) => <FeeCell r={r} /> },
    {
      key: 'wait',
      label: m.waited,
      align: 'right',
      render: (r, gone) => gone ? null : <span className="small"><Figures text={now - r.submittedAt < 1500 ? t.format.justNow : fmtDuration(now - r.submittedAt)} /></span>,
    },
    { key: 'note', label: m.note, render: (r, gone) => <span className="small soft">{gone ? m.why.gone : note(r)}</span> },
  ];

  return (
    <div className="stack">
      {sim.kind === 'rpc' ? (
        <p className="small soft prose">{m.localOnly}</p>
      ) : (
        sim.producers.length > 0 && <p className="small soft prose">{m.minFees(sim.producers.map((p) => `${p.name} ${fmtAmount(p.minTokenFee, KSA_DECIMALS)}\u00a0KSA`).join(t.format.listSep))}</p>
      )}
      {/* The table, empty or not: the keyboard on the last operation in it, which leaves the pool, stays there (`useHold`) */}
      <Table
        caption={t.ops.tabs.mempool}
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        rowTo={(r) => ({ name: 'op', id: r.id })}
        empty={<Empty title={sim.kind === 'rpc' ? m.emptyLocal : m.empty} />}
      />
      <PoolTotal n={rows.length} />
    </div>
  );
}

/** The pool's count under its table, while the table lists operations: under the empty state "0 total" said nothing the state and the tab's count do not */
export function PoolTotal({ n }: { n: number }) {
  const m = useT().ops.mempool;
  return n > 0 ? <p className="small muted"><Figures text={m.total(n)} /></p> : null;
}
