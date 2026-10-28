import { useEffect } from 'react';
import { explainRpcError } from '../app/SourcePanel';
import { useChain } from '../app/store';
import { anchoredAt, btcBlockAt, btcBlockCarried, btcBlockSealed, btcExplorerUrl, btcNetworkOf, headerSpan, TX_KIND_LABEL, txRoute } from '../chain/views';
import type { BtcTx } from '../chain/types';
import { PARAMS } from '../chain/params';
import { fmtDateTime, fmtInt } from '../lib/format';
import { BlockRef, FullHash, Hash } from '../components/Refs';
import { BodyList, HeaderList } from '../components/Carried';
import { Ticks } from '../components/Status';
import { Table, type Column } from '../components/Table';
import { Sats, TimeAgo } from '../components/Values';
import { Banner, Button, ButtonLink, Empty, PageHead, Section, SpecList } from '../components/ui';
import { IconChevronLeft, IconChevronRight } from '../components/icons';
import { useCommitFees, useLookup } from '../components/Lookup';
import { useT } from '../i18n';
import { NotFound } from './NotFound';

export function BtcBlock({ height }: { height: number }) {
  const sim = useChain();
  const t = useT();
  const m = t.btc;
  // With a node, a BTC block no loaded fast-lane block anchors to or settles in shows with no Ksana transaction known
  const b = btcBlockAt(sim, height);
  const rpc = sim.kind === 'rpc' ? sim : null;
  // With a node, a settlement known only by its txid, that of a later block which carried a loaded block's body (D-077), gives the
  // headers and bodies its payload carries once that block is read
  const unloaded = new Set<string>();
  for (const id of b?.txids ?? []) {
    const tx = sim.getBtcTx(id);
    if (tx?.partial && tx.kind === 'settlement' && tx.forBlock && !sim.getBlock(tx.forBlock)) unloaded.add(tx.forBlock);
  }
  const unloadedKey = [...unloaded].join(',');
  useEffect(() => {
    if (sim.kind !== 'rpc') return;
    for (const hash of unloadedKey ? unloadedKey.split(',') : []) sim.request('block', hash);
  }, [sim, unloadedKey]);
  // With a node, a BTC block below the stretch loaded from the tip has the Ksana blocks around it read for its page: the settlements
  // that landed in it, the blocks anchored at it, its time and its hash
  const lookup = useLookup('btc', String(height), !rpc || !b || rpc.btcPageRead(height));
  // The fees of the commit transactions listed that spend what the page has not seen (`askCommitFees`)
  useCommitFees(b?.txids.filter((id) => sim.getBtcTx(id)?.kind === 'commit' && sim.getBtcTx(id)?.feeSat === undefined));
  const reading = lookup?.state === 'loading';
  // Why, in words, as a lookup's own page says it (`LookupView`), the error's own text below where it says more
  const failed =
    lookup?.state === 'error' ? explainRpcError(lookup.error ?? new Error(lookup.message), rpc?.config.url ?? '') : lookup?.state === 'missing' ? lookup.message : undefined;
  const detail = lookup?.state === 'error' && lookup.message !== failed ? lookup.message : undefined;
  if (!b) {
    // Below the genesis anchor or above the BTC tip: the explorer finds the former by height
    if (!rpc) return <NotFound path={`/btc/${height}`} what={m.what} />;
    const explorer = height <= rpc.btcTip.height ? btcExplorerUrl(sim, 'block', String(height)) : undefined;
    return (
      <NotFound path={`/btc/${height}`} what={m.what} title={m.notFoundRpcTitle} message={height > rpc.btcTip.height ? m.notFoundAhead : m.notFoundRpc}>
        {explorer && (
          <p>
            <a className="link" href={explorer} target="_blank" rel="noreferrer noopener">
              {m.viewOn('mempool.space/signet')}
            </a>
          </p>
        )}
      </NotFound>
    );
  }
  const confs = sim.btcConfs(height);
  const explorer = btcExplorerUrl(sim, 'block', b.hash || String(height));
  const txs = b.txids.map((id) => sim.getBtcTx(id)).filter((x): x is BtcTx => !!x);
  const anchored = anchoredAt(sim, height);
  const { headers, bodies } = btcBlockCarried(sim, b);
  const isTip = height === sim.btcTip.height;

  // No status: every transaction listed here has the block's own confirmations, which its head gives
  const cols: Column<BtcTx>[] = [
    { key: 'id', label: 'txid', mobile: 'primary', render: (tx) => <Hash value={tx.txid} to={txRoute(sim, tx.txid)} head={10} tail={4} /> },
    { key: 'k', label: m.col.kind, render: (tx) => <span className="small">{TX_KIND_LABEL[tx.kind]}</span> },
    {
      key: 'for',
      label: m.col.for,
      render: (tx) =>
        tx.forHeight !== undefined ? (
          <BlockRef height={tx.forHeight} hash={tx.forBlock} />
        ) : tx.kind === 'native' && tx.opId ? (
          <Hash value={tx.opId} to={{ name: 'op', id: tx.opId }} head={6} tail={4} />
        ) : tx.kind === 'headers' ? (
          <span className="num small">{headerSpan(sim, tx)}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: 'fee', label: t.common.fee, align: 'right', mobile: 'hide', render: (tx) => <Sats value={tx.feeSat} size="sm" /> },
  ];

  return (
    <div className="page">
      <PageHead
        eyebrow={m.eyebrow(btcNetworkOf(sim))}
        title={<span className="mono">#{fmtInt(height)}</span>}
        doc={t.ui.doc.btcBlock(fmtInt(height))}
        meta={
          <>
            <span className="row gap-8">
              <Ticks done={Math.min(confs, PARAMS.BTC_FINALITY_CONFS)} total={PARAMS.BTC_FINALITY_CONFS} ink={btcBlockSealed(sim, b) ? 'zhu' : 'mo'} label={m.confs(confs)} />
              {m.confs(confs)}
            </span>
            {b.time !== undefined && <TimeAgo at={b.time} />}
          </>
        }
        actions={
          <div className="row gap-6">
            <ButtonLink to={{ name: 'btc', height: height - 1 }} size="sm" icon={<IconChevronLeft />} disabled={height <= sim.btcBase}>
              {m.prev}
            </ButtonLink>
            <ButtonLink to={{ name: 'btc', height: height + 1 }} size="sm" icon={<IconChevronRight />} className="btn--icon-right" disabled={isTip}>
              {m.next}
            </ButtonLink>
          </div>
        }
      />
      <div className="grid-2">
        <Section title={reading || failed !== undefined ? m.txsHeading : m.txsTitle(txs.length)}>
          {failed !== undefined && (
            <Banner
              tone="warn"
              title={m.readFailed}
              actions={
                <Button size="sm" onClick={() => rpc?.retry('btc', String(height))}>
                  {t.common.retry}
                </Button>
              }
            >
              {failed}
              {detail !== undefined && (
                <>
                  <br />
                  <span className="small muted">{t.shell.connecting.detail(detail)}</span>
                </>
              )}
              {lookup?.state === 'error' && rpc?.conn.state === 'error' && (
                <>
                  <br />
                  {t.ui.lookupAgain}
                </>
              )}
            </Banner>
          )}
          {txs.length === 0 ? (
            failed === undefined && <Empty title={reading ? m.reading : rpc ? m.noKnownTxs : m.noTxs} />
          ) : (
            <Table caption={t.common.btcTx} columns={cols} rows={txs} rowKey={(tx) => tx.txid} rowTo={(tx) => txRoute(sim, tx.txid)} />
          )}
        </Section>
        <Section title={t.common.block}>
          <SpecList
            rows={[
              b.hash ? { label: m.hash, value: <FullHash value={b.hash} /> } : null,
              // The node does not provide BTC block times: a block the page read as the Bitcoin RPC's tip gives its own; any other is estimated
              // from the fast-lane blocks produced around it, "—" when they do not tell
              { label: rpc && !b.timeExact ? m.timeApprox : t.common.time, value: b.time !== undefined ? <span className="num">{fmtDateTime(b.time)}</span> : <span className="muted">—</span> },
              explorer && {
                label: m.explorer,
                value: (
                  <a className="link" href={explorer} target="_blank" rel="noreferrer noopener">
                    mempool.space/signet
                  </a>
                ),
              },
              { label: m.confirmations, value: <span className="num">{confs}</span> },
              headers.length > 0 && { label: m.headers, value: <HeaderList count={headers.length} blocks={headers} /> },
              bodies.length > 0 && { label: m.bodies, value: <BodyList count={bodies.length} blocks={bodies} /> },
              anchored && {
                label: m.anchored,
                value:
                  anchored[0] === anchored[1] ? (
                    <BlockRef height={anchored[0]} />
                  ) : (
                    <span className="nobr">
                      <BlockRef height={anchored[0]} /> – <BlockRef height={anchored[1]} />
                    </span>
                  ),
                hint: m.anchoredCount(anchored[1] - anchored[0] + 1),
              },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
