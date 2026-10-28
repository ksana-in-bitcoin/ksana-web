import { useState, type CSSProperties } from 'react';
import { useChain } from '../app/store';
import { btcExplorerUrl, carriedBlocks, TX_KIND_LABEL, TX_STATUS_LABEL, txRoute, txTime } from '../chain/views';
import type { BtcTx, TxIn, TxOut } from '../chain/types';
import { PARAMS } from '../chain/params';
import { chunkCount } from '../chain/fees';
import { fmtBytes, fmtClock, fmtInt, shortHash } from '../lib/format';
import { AccountRef, BlockRef, BtcRef, FullHash, Hash } from '../components/Refs';
import { BodyList, HeaderList } from '../components/Carried';
import { Meter } from '../components/Status';
import { Figures, Sats, TimeAgo } from '../components/Values';
import { Banner, Button, PageHead, Section, SpecList } from '../components/ui';
import { LookupView, useBtcTimes, useCommitFees, useLookup } from '../components/Lookup';
import { useT } from '../i18n';
import { TxStatus } from './Settlements';
import { NotFound } from './NotFound';

/**
 * A settlement rebuilt by the producer: it replaces the original settlement of the same block (D-063). A rescue settlement, by
 * contrast, is started by another node after the original settlement became invalid (D-045).
 * Decided by the flag on the transaction, not by the note text (the note changes with the UI language). The node data source only
 * knows the transaction ID and cannot tell the two apart, so it shows them as rescue settlements.
 */
function isRebuild(tx: BtcTx): boolean {
  return tx.kind === 'rescue' && tx.rebuilt === true;
}

/** Reveal transaction (D-081): spends the commit transaction's commitment output; the payload is in that input's witness envelope */
function isReveal(tx: BtcTx): boolean {
  return tx.commitTxid !== undefined || tx.inputs.some((i) => i.role === 'commit' || i.scriptType === 'envelope');
}

export function TxDetail({ id, block: named }: { id: string; block?: string }) {
  const sim = useChain();
  const t = useT();
  const [note, setNote] = useState<string | null>(null);
  const tx = sim.getBtcTx(id);
  // Opened anew below the blocks loaded from the tip (a reload, a link shared or opened in a new tab): the node looks a transaction
  // up only by its block, which the page's links name (`txRoute`), so the page reads that block, with its settlement status
  const read = useLookup('block', named ?? '', !named || tx !== undefined || sim.getBlock(named) !== undefined);
  const explorer = btcExplorerUrl(sim, 'tx', id);
  // A settlement the node gave only in part, as the carrier of an older block's body whose block the page has not loaded (D-077):
  // that block brings its settlement in full, so the page loads it
  const carrier = tx?.partial && tx.kind === 'settlement' ? tx.forBlock : undefined;
  useLookup('block', carrier ?? '', !carrier || sim.getBlock(carrier) !== undefined);
  // A confirmed one's time is its BTC block's (`txTime`), read for an older one
  useBtcTimes(tx?.confirmedHeight !== undefined && !tx.heightAtMost ? [tx.confirmedHeight] : undefined);
  // A commit's fee, where it spends what the page has not seen (`askCommitFees`)
  useCommitFees(tx?.kind === 'commit' && tx.feeSat === undefined ? [tx.txid] : undefined);
  if (!tx) {
    // The node has no interface to look up a BTC transaction by txid (settlement transactions can only be looked up by block): it may well exist
    if (sim.kind === 'sim') return <NotFound path={`/tx/${id}`} what={t.ui.lookupWhat.btcTx} />;
    // While its block is read, or where the read failed, as on a block's page; a block the node does not have, or that does not name
    // the transaction, leaves it not found
    if (named && read && read.state !== 'missing') return <LookupView kind="block" as="btcTx" id={named} lookup={read} path={`/tx/${id}`} />;
    return (
      <NotFound path={`/tx/${id}`} what={t.ui.lookupWhat.btcTx} title={t.tx.notFoundRpcTitle} message={t.tx.notFoundRpc}>
        {explorer && (
          <p>
            <a className="link" href={explorer} target="_blank" rel="noreferrer noopener">
              {t.tx.viewOn('mempool.space/signet')}
            </a>
          </p>
        )}
      </NotFound>
    );
  }
  // CPFP bumping is a demo feature of the simulator; the node data source cannot see the BTC mempool and never judges a transaction stuck
  const demo = sim.kind === 'sim' ? sim : null;
  const stuck = !!demo && tx.status === 'broadcast' && !demo.canConfirm(tx);
  const canAnchor = tx.outputs.some((o) => o.role === 'anchor');
  const block = tx.forBlock ? sim.getBlock(tx.forBlock) : undefined;
  const replacedBy = tx.replacedBy ? sim.getBtcTx(tx.replacedBy) : undefined;
  const rebuilt = isRebuild(tx);
  const author = t.tx.details.author;
  // A settlement is two transactions, commit / reveal (D-081): the page head says which one this is and links to the other
  const kindLabel = tx.kind === 'settlement' ? t.tx.pair.reveal : tx.kind === 'commit' ? t.tx.pair.commit : TX_KIND_LABEL[tx.kind];
  const paired = tx.commitTxid !== undefined || tx.revealTxid !== undefined;
  const at = txTime(sim, tx);
  const payloadType = tx.kind === 'native' ? 'NativeOp' : tx.kind === 'headers' ? 'Headers' : 'Settlement';

  return (
    <div className="page">
      <PageHead
        eyebrow={t.tx.eyebrow(kindLabel)}
        title={<span className="mono">{shortHash(tx.txid, 12, 8)}</span>}
        doc={t.ui.doc.btcTx(shortHash(tx.txid, 8, 6))}
        meta={
          <>
            <TxStatus tx={tx} />
            {block ? (
              <span>
                {t.tx.forBlock} <BlockRef height={block.header.height} hash={block.hash} />
              </span>
            ) : (
              // A block the page has not loaded is named by the height the node gave with the transaction
              tx.forBlock &&
              tx.forHeight !== undefined && (
                <span>
                  {t.tx.forBlock} <BlockRef height={tx.forHeight} hash={tx.forBlock} />
                </span>
              )
            )}
            {tx.commitTxid && (
              <span>
                {t.tx.pair.commitTx} <Hash value={tx.commitTxid} to={txRoute(sim, tx.commitTxid)} head={8} tail={4} />
              </span>
            )}
            {tx.revealTxid && (
              <span>
                {t.tx.pair.revealTx} <Hash value={tx.revealTxid} to={txRoute(sim, tx.revealTxid)} head={8} tail={4} />
              </span>
            )}
            {tx.confirmedHeight !== undefined && <BtcRef height={tx.confirmedHeight} atMost={tx.heightAtMost} />}
            {at !== undefined && <TimeAgo at={at} />}
          </>
        }
      />

      {stuck && demo && (
        <Banner
          tone="warn"
          title={t.tx.stuck.title}
          actions={
            <Button
              size="sm"
              onClick={() =>
                setNote(
                  canAnchor
                    ? t.tx.stuck.bumpedAnchor(demo.cpfpStuck(demo.faucetId))
                    : demo.cpfpTx(tx.txid, tx.author ?? demo.faucetId)
                      ? t.tx.stuck.bumpedChange
                      : t.tx.stuck.bumpFailed,
                )
              }
            >
              {canAnchor ? t.tx.stuck.bumpAnchor : t.tx.stuck.bumpChange}
            </Button>
          }
        >
          {t.settlements.status.feeBelow(String(tx.feeRate ?? '?'), String(sim.btcMinFeeRate))}
        </Banner>
      )}
      {note && <Banner tone="info" title={note} />}
      {tx.partial && (
        <Banner tone="info" title={t.tx.partial.title}>
          {t.tx.partial.more}
        </Banner>
      )}
      {tx.status === 'replaced' && (
        <Banner tone="warn" title={TX_STATUS_LABEL.replaced}>
          {tx.note && <div>{tx.note}</div>}
          {replacedBy && (
            <div>
              {t.tx.replacedBy} <Hash value={replacedBy.txid} to={txRoute(sim, replacedBy.txid)} head={8} tail={4} /> · {TX_KIND_LABEL[replacedBy.kind]}
            </div>
          )}
        </Banner>
      )}
      {tx.status === 'invalid' && (
        <Banner tone="warn" title={TX_STATUS_LABEL.invalid}>
          {tx.note && <div>{tx.note}</div>}
          <div>{t.tx.invalidRebuilt}</div>
        </Banner>
      )}
      {tx.kind === 'rescue' && tx.note && (
        <Banner tone="info" title={rebuilt ? t.tx.rescueBanner.rebuilt : t.tx.rescueBanner.rescue}>
          {tx.note}
        </Banner>
      )}

      {!tx.partial && (
        <Section title={t.tx.structure}>
          <TxDiagram tx={tx} />
          {paired && <p className="small soft">{t.tx.pair.hint}</p>}
        </Section>
      )}

      <div className="grid-halves">
        <Section title={t.tx.payload.title}>
          {tx.payloadBytes > 0 ? (
            <SpecList
              rows={[
                { label: 'magic', value: <span className="mono">{PARAMS.MAGIC}</span> },
                { label: t.tx.payload.type, value: <span className="mono">{payloadType}</span> },
                tx.headers.length > 0 && { label: t.tx.payload.headers, value: <HeaderList count={tx.headers.length} blocks={carriedBlocks(sim, tx)} /> },
                tx.bodies.length > 0 && { label: t.tx.payload.bodies, value: <BodyList count={tx.bodies.length} blocks={carriedBlocks(sim, tx, tx.bodies)} /> },
                (tx.kind === 'settlement' || tx.kind === 'rescue') && { label: t.common.entries, value: <span className="num">{tx.entryCount}</span> },
                {
                  label: t.tx.payload.dataSize,
                  value: (
                    <span className="meter-row">
                      <Meter value={tx.payloadBytes} max={PARAMS.MAX_BLOCK_DATA_BYTES} ink="mo" label={t.tx.payload.dataSize} />
                      <span className="small"><Figures text={`${fmtBytes(tx.payloadBytes)} / ${fmtBytes(PARAMS.MAX_BLOCK_DATA_BYTES)}`} /></span>
                    </span>
                  ),
                },
                { label: t.tx.payload.chunks, value: <span className="num">{tx.chunks ?? chunkCount(tx.payloadBytes)}</span> },
              ]}
            />
          ) : tx.partial ? (
            // Given by its ID only: what its kind tells of the payload, and the operation a path C transaction carries
            <SpecList
              rows={[
                { label: 'magic', value: <span className="mono">{PARAMS.MAGIC}</span> },
                { label: t.tx.payload.type, value: <span className="mono">{payloadType}</span> },
                tx.opId && { label: 'op_id', value: <Hash value={tx.opId} to={{ name: 'op', id: tx.opId }} head={12} tail={6} copy /> },
              ]}
            />
          ) : (
            <p className="small soft">{t.tx.payload.none}</p>
          )}
        </Section>
        <Section title={t.tx.details.title}>
          <SpecList
            rows={[
              { label: 'txid', value: <FullHash value={tx.txid} /> },
              explorer && {
                label: t.btc.explorer,
                value: (
                  <a className="link" href={explorer} target="_blank" rel="noreferrer noopener">
                    mempool.space/signet
                  </a>
                ),
              },
              { label: t.tx.details.vsize, value: tx.partial ? <span className="soft">—</span> : <span><Figures text={`${fmtInt(tx.vsize)}\u00a0vB`} /></span> },
              { label: t.common.fee, value: <Sats value={tx.feeSat} />, hint: tx.feeRate !== undefined ? `${tx.feeRate.toFixed(tx.feeRate % 1 ? 2 : 0)}\u00a0sat/vB` : undefined },
              tx.author && {
                label: tx.kind === 'rescue' ? (rebuilt ? author.rebuilder : author.rescuer) : tx.kind === 'native' ? author.user : author.funder,
                value: <AccountRef id={tx.author} showKey />,
              },
              {
                label: t.common.status,
                value: TX_STATUS_LABEL[tx.status],
                hint: tx.broadcastAt ? t.tx.details.broadcastAt(fmtClock(tx.broadcastAt)) : undefined,
              },
              block && block.settlements.length > 1 && {
                label: t.tx.details.otherVersions,
                value: (
                  <span className="stack gap-4">
                    {block.settlements
                      .filter((x) => x !== tx.txid)
                      .map((x) => {
                        const o = sim.getBtcTx(x);
                        return (
                          <span key={x} className="row gap-8 small">
                            <Hash value={x} to={txRoute(sim, x)} head={8} tail={4} />
                            {o && `${TX_KIND_LABEL[o.kind]} · ${TX_STATUS_LABEL[o.status]}`}
                          </span>
                        );
                      })}
                  </span>
                ),
              },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}

/** The row of the structure diagram's grid that a box takes on a wide screen (`TxDiagram`): the headings' is 1, index k's k + 2 */
function rowOf(row: number): CSSProperties {
  return { '--row': row } as CSSProperties;
}

/**
 * Transaction structure diagram. A commit transaction is the producer's funding → change + commitment output; a reveal transaction
 * spends the commitment output → P2A anchor + empty OP_RETURN, with the payload in that input's witness envelope (D-081); a native
 * transaction still uses the KSN1 OP_RETURN. On a wide screen the inputs face the outputs, an index to a row, under their headings;
 * on a phone, in one column, the inputs come under theirs, the reveal transaction's envelope after them, then the outputs under
 * theirs: its rows had put each input above the output of its index, two boxes marked #0 that only their roles told apart. The
 * page's order is the phone's, which a screen reader follows on any screen; a wide screen's grid places each box in its row
 */
export function TxDiagram({ tx }: { tx: BtcTx }) {
  const t = useT();
  const d = t.tx.diagram;
  return (
    <div className="txd">
      <div className="txd-head txd-in" style={rowOf(1)}>
        {d.inputs} · {tx.inputs.length}
      </div>
      {tx.inputs.map((v, k) => (
        <InBox key={k} idx={k} v={v} tx={tx} />
      ))}
      {/* On a wide screen in the row below the longer side's last box */}
      {isReveal(tx) && <EnvelopeBox tx={tx} row={Math.max(tx.inputs.length, tx.outputs.length) + 2} />}
      <div className="txd-head txd-out" style={rowOf(1)}>
        {d.outputs} · {tx.outputs.length}
      </div>
      {tx.outputs.map((v, k) => (
        <OutBox key={k} idx={k} v={v} tx={tx} />
      ))}
    </div>
  );
}

/** Witness envelope: the payload carried in the reveal transaction's input witness: how many headers and bodies, split into how many data chunks */
function EnvelopeBox({ tx, row }: { tx: BtcTx; row: number }) {
  const t = useT();
  const d = t.tx.diagram;
  return (
    <div className="txd-box txd-box--op_return txd-in" style={rowOf(row)}>
      <div className="txd-box-top">
        <span className="txd-role">{d.envelope.title}</span>
        <span className="txd-type mono">{PARAMS.MAGIC}</span>
      </div>
      <div className="small">
        {d.envelope.headers(tx.headers.length)} · {d.envelope.bodies(tx.bodies.length)}
      </div>
      <div className="txd-box-bottom">
        <span className="small"><Figures text={fmtBytes(tx.payloadBytes)} /></span>
        <span className="txd-sighash"><Figures text={d.chunks(tx.chunks ?? chunkCount(tx.payloadBytes))} /></span>
      </div>
    </div>
  );
}

function InBox({ idx, v, tx }: { idx: number; v: TxIn; tx: BtcTx }) {
  const sim = useChain();
  const t = useT();
  return (
    <div className={`txd-box txd-box--${v.role} txd-in`} style={rowOf(idx + 2)}>
      <div className="txd-box-top">
        <span className="txd-idx mono">#{idx}</span>
        <span className="txd-role">{t.tx.diagram.inRole[v.role]}</span>
        <span className="txd-type mono">{v.scriptType.toUpperCase()}</span>
      </div>
      {/* The node's own funding is not an account (SPEC §7.7): its address where the page has read it, else the outpoint; the commit transaction's is linked below */}
      {v.owner ? (
        <AccountRef id={v.owner} short />
      ) : v.address ? (
        <Hash value={v.address} head={10} tail={6} copy />
      ) : v.role === 'commit' && tx.commitTxid ? null : (
        <span className="small soft mono">
          {shortHash(v.prevout.txid, 8, 4)}:{v.prevout.vout}
        </span>
      )}
      <div className="txd-box-bottom">
        <Sats value={v.valueSat} size="sm" />
        <span className="txd-sighash mono">{v.sighash === 'DEFAULT' ? 'SIGHASH_DEFAULT' : `SIGHASH_${v.sighash}`}</span>
      </div>
      {/* From the commit transaction: link to it */}
      {v.role === 'commit' && tx.commitTxid && <Hash value={tx.commitTxid} to={txRoute(sim, tx.commitTxid)} head={6} tail={4} className="txd-op" />}
    </div>
  );
}

function OutBox({ idx, v, tx }: { idx: number; v: TxOut; tx: BtcTx }) {
  const sim = useChain();
  const t = useT();
  const d = t.tx.diagram;
  if (v.role === 'op_return') {
    // The reveal transaction's OP_RETURN is empty (the payload is in the witness); only a native transaction's OP_RETURN is the KSN1 data output
    const empty = !v.payloadBytes;
    return (
      <div className="txd-box txd-box--op_return txd-out" style={rowOf(idx + 2)}>
        <div className="txd-box-top">
          <span className="txd-idx mono">#{idx}</span>
          <span className="txd-role">OP_RETURN</span>
          {!empty && <span className="txd-type mono">{PARAMS.MAGIC}</span>}
        </div>
        <div className="small">
          {empty ? d.opReturn.empty : tx.kind === 'native' ? d.opReturn.native : tx.kind === 'headers' ? d.opReturn.headers(tx.headers.length) : d.opReturn.settlement(tx.headers.length, tx.entryCount)}
        </div>
        {!empty && (
          <div className="txd-box-bottom">
            <span className="small"><Figures text={fmtBytes(v.payloadBytes ?? 0)} /></span>
            <span className="txd-sighash"><Figures text={d.chunks(v.chunks ?? chunkCount(v.payloadBytes ?? 0))} /></span>
          </div>
        )}
      </div>
    );
  }
  const producerTx = tx.kind === 'settlement' || tx.kind === 'rescue' || tx.kind === 'commit';
  return (
    <div className={`txd-box txd-box--${v.role} txd-out`} style={rowOf(idx + 2)}>
      <div className="txd-box-top">
        <span className="txd-idx mono">#{idx}</span>
        <span className="txd-role">{v.role === 'change' && producerTx ? d.producerChange : d.outRole[v.role]}</span>
        <span className="txd-type mono">{v.scriptType.toUpperCase()}</span>
      </div>
      {v.owner ? (
        <AccountRef id={v.owner} short />
      ) : v.role === 'anchor' ? (
        <span className="small soft">{d.anyone}</span>
      ) : v.role === 'commitment' ? (
        <span className="small soft">{d.commitmentHint}</span>
      ) : v.address ? (
        <Hash value={v.address} head={10} tail={6} copy />
      ) : (
        <span className="small soft">—</span>
      )}
      <div className="txd-box-bottom">
        <Sats value={v.valueSat} size="sm" />
      </div>
      {/* The commitment output is spent by the reveal transaction: link to it */}
      {v.role === 'commitment' && tx.revealTxid && <Hash value={tx.revealTxid} to={txRoute(sim, tx.revealTxid)} head={6} tail={4} className="txd-op" />}
    </div>
  );
}
