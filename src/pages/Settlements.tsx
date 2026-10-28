import { navigate } from '../app/router';
import { useChain } from '../app/store';
import { headerSpan, pairFee, TX_KIND_LABEL, TX_STATUS_LABEL, txRoute } from '../chain/views';
import type { BtcTx } from '../chain/types';
import { PARAMS } from '../chain/params';
import { fmtBytes, fmtInt } from '../lib/format';
import { AccountRef, BlockRef, BtcRef, Hash } from '../components/Refs';
import { useCommitFees } from '../components/Lookup';
import { BlocksSectionNav } from '../components/SectionNav';
import { Meter } from '../components/Status';
import { Table, type Column } from '../components/Table';
import { Figures, Sats, TimeAgo } from '../components/Values';
import { Empty, PageHead, Tabs } from '../components/ui';
import { useT } from '../i18n';

/** The third tab is still called headers in the route (republishing and bumping: header / body republishing, CPFP) */
type Tab = 'settlement' | 'native' | 'headers';

/**
 * A transaction itself only reports confirmations: "BTC final" is the state of a fast-lane block (its settled closure has 6
 * confirmations), not the state of any one transaction. A fee rate below the BTC inclusion floor is marked "stuck".
 */
export function TxStatus({ tx }: { tx: BtcTx }) {
  const sim = useChain();
  const s = useT().settlements.status;
  const confs = sim.btcConfs(tx.confirmedHeight);
  const stuck = tx.status === 'broadcast' && !sim.canConfirm(tx);
  const cls = tx.status === 'confirmed' ? 'on_btc' : stuck ? 'stuck' : tx.status === 'broadcast' ? 'broadcast' : tx.status === 'built' ? 'fast' : 'failed';
  return (
    <span className={`txs txs--${cls}`} title={stuck ? s.feeBelow(String(tx.feeRate ?? '?'), String(sim.btcMinFeeRate)) : undefined}>
      <span className="txs-dot" aria-hidden="true" />
      {tx.status === 'confirmed' ? (tx.heightAtMost ? `≥\u00a0${s.confs(confs)}` : s.confs(confs)) : stuck ? s.stuck : TX_STATUS_LABEL[tx.status]}
    </span>
  );
}

export function Settlements({ tab }: { tab: Tab }) {
  const sim = useChain();
  const t = useT();
  const m = t.settlements;
  const all = [...sim.allBtcTxs()];
  const pick = (kinds: BtcTx['kind'][]) => all.filter((x) => kinds.includes(x.kind)).sort((a, b) => b.createdAt - a.createdAt);
  const lists: Record<Tab, BtcTx[]> = {
    settlement: pick(['settlement', 'rescue']),
    native: pick(['native']),
    headers: pick(['headers', 'cpfp']),
  };
  const rows = lists[tab].slice(0, 60);
  // A pair whose commit spends what the page has not seen pays a fee it cannot give whole: what it spends is read (`askCommitFees`)
  useCommitFees(rows.flatMap((tx) => (tx.commitTxid && pairFee(sim, tx).revealOnly ? [tx.commitTxid] : [])));
  const inMempool = sim.pendingSettlements.length;
  // The node data source knows the BTC transactions of the blocks it has loaded, not of the whole chain
  const loaded = sim.kind === 'rpc' ? sim.blocks.filter((b) => b.header.height > 0).length : undefined;

  const unknown = <span className="soft">—</span>;
  const cols: Column<BtcTx>[] = [
    {
      key: 'tx',
      label: 'txid',
      mobile: 'primary',
      className: 'align-first',
      // A settlement is a commit / reveal pair (D-081): the reveal transaction is primary, the commit transaction goes on the second line
      render: (tx) => (
        <span className="cell-stack">
          <span className="row gap-8 wrap">
            <Hash value={tx.txid} to={txRoute(sim, tx.txid)} head={10} tail={4} />
            {tx.kind !== 'settlement' && tx.kind !== 'native' && <span className={`tag ${tx.kind === 'rescue' ? 'tag--warn' : ''}`}>{TX_KIND_LABEL[tx.kind]}</span>}
          </span>
          {tx.commitTxid && (
            <span className="cell-sub row tx-commit">
              <span className="nobr">{m.commit}</span> <Hash value={tx.commitTxid} to={txRoute(sim, tx.commitTxid)} head={8} tail={4} />
            </span>
          )}
        </span>
      ),
    },
  ];
  if (tab === 'settlement') {
    cols.push(
      { key: 'blk', label: m.col.block, render: (tx) => (tx.forHeight !== undefined ? <BlockRef height={tx.forHeight} hash={tx.forBlock} /> : '—') },
      // A transaction the node gives by its ID only (a rescue, a carrier the page has not loaded): its payload is not known
      { key: 'bodies', label: m.col.bodies, align: 'right', mobile: 'hide', tablet: 'hide', render: (tx) => (tx.partial ? unknown : <span className="num">{tx.bodies.length}</span>) },
      { key: 'hdr', label: m.col.headers, align: 'right', mobile: 'hide', tablet: 'hide', render: (tx) => (tx.partial ? unknown : <span className="num" title={headerSpan(sim, tx)}>{tx.headers.length}</span>) },
      {
        key: 'data',
        label: m.col.data,
        mobile: 'hide',
        tablet: 'hide',
        render: (tx) =>
          tx.partial ? (
            unknown
          ) : (
            <span className="meter-cell">
              <Meter value={tx.payloadBytes} max={PARAMS.MAX_BLOCK_DATA_BYTES} ink="mo" label={m.col.data} />
              <span className="small soft"><Figures text={fmtBytes(tx.payloadBytes)} /></span>
            </span>
          ),
      },
    );
  } else if (tab === 'native') {
    cols.push(
      { key: 'acct', label: m.col.user, render: (tx) => (tx.author ? <AccountRef id={tx.author} short /> : '—') },
      {
        key: 'op',
        label: m.col.forced,
        render: (tx) => {
          const r = tx.opId ? sim.getOp(tx.opId) : undefined;
          return r?.height !== undefined ? <BlockRef height={r.height} hash={r.blockHash} /> : <span className="small soft">{m.waitingConf}</span>;
        },
      },
    );
  } else {
    cols.push({
      key: 'what',
      label: t.common.content,
      render: (tx) =>
        tx.kind === 'headers' ? (
          tx.partial ? (
            unknown
          ) : (
            <span className="small">{m.headersContent(headerSpan(sim, tx), tx.headers.length)}</span>
          )
        ) : (
          <span className="small">
            {m.cpfpContent} {tx.parent && <Hash value={tx.parent} to={txRoute(sim, tx.parent)} head={6} tail={4} />}
          </span>
        ),
    });
  }
  cols.push(
    {
      key: 'fee',
      label: t.common.fee,
      align: 'right',
      mobile: 'hide',
      // A pair's fee is its commit and reveal transactions' together, or the reveal's alone where the page does not know the commit's (D-081)
      render: (tx) => {
        const f = pairFee(sim, tx);
        return (
          <span className="cell-stack al-right" title={f.parts ? t.block.settle.feeParts(fmtInt(f.parts.commit), fmtInt(f.parts.reveal)) : f.revealOnly ? t.block.settle.revealFeeHint : undefined}>
            <Sats value={f.feeSat} size="sm" />
            {f.feeRate !== undefined && (
              <span className="cell-sub">
                {f.revealOnly && `${m.revealOnly} · `}
                {f.feeRate.toFixed(f.feeRate % 1 ? 1 : 0)}&nbsp;sat/vB
              </span>
            )}
          </span>
        );
      },
    },
    { key: 'st', label: t.common.status, mobile: 'bare', render: (tx) => <TxStatus tx={tx} /> },
    // On a phone at the end of the first line, where it fits beside the transaction: after the status, two-digit confirmations put it on
    // a line of its own
    { key: 'btc', label: m.col.btcBlock, align: 'right', mobile: 'corner', className: 'align-first', render: (tx) => (tx.confirmedHeight !== undefined ? <BtcRef height={tx.confirmedHeight} atMost={tx.heightAtMost} /> : <span className="small soft"><TimeAgo at={tx.createdAt} /></span>) },
  );

  return (
    <div className="page">
      <PageHead
        eyebrow={m.eyebrow}
        title={m.title}
        meta={
          <>
            <span>
              {m.inMempool} <b className="num">{inMempool}</b>
            </span>
            {loaded !== undefined && <span>{m.ofLoaded(loaded)}</span>}
          </>
        }
      />
      <div className="toolbar">
        <BlocksSectionNav current="settlements" />
        <Tabs
          label={m.tabsLabel}
          value={tab}
          onChange={(v) => navigate({ name: 'settlements', tab: v })}
          options={[
            { value: 'settlement', label: m.tab.settlement, count: lists.settlement.length },
            { value: 'native', label: m.tab.native, count: lists.native.length },
            { value: 'headers', label: m.tab.other, count: lists.headers.length },
          ]}
        />
      </div>
      <Table
        caption={t.common.btcTx}
        columns={cols}
        rows={rows}
        rowKey={(tx) => tx.txid}
        rowTo={(tx) => txRoute(sim, tx.txid)}
        empty={<Empty title={loaded === undefined ? m.empty : m.emptyLoaded} />}
      />
    </div>
  );
}
