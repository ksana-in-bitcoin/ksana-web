import { networkOfChainId } from '@ksana/sdk';
import { useChain, useNow } from '../app/store';
import { useWalletPrefs } from '../app/prefs';
import { FAIL_LABEL, opProgress, summarizeOp, STAGE_LABEL, transferOf, TX_STATUS_LABEL, txRoute } from '../chain/views';
import type { Funds, OpRecord, VmEvent } from '../chain/types';
import { KSA_ASSET_ID, PARAMS } from '../chain/params';
import { fmtAmount, fmtDuration, fmtInt, shortHash } from '../lib/format';
import { AccountRef, AssetIssuer, BlockRef, BtcRef, FullHash, Hash, LookalikeNote } from '../components/Refs';
import { GasBar } from '../components/OpBits';
import { StatusBadge } from '../components/Status';
import { Tracker } from '../components/Tracker';
import { Amount, Figures, PathBadge, TimeAgo } from '../components/Values';
import { Banner, ButtonLink, PageHead, Section, SpecList } from '../components/ui';
import { LookupView, useBtcTimes, useLookup } from '../components/Lookup';
import { AssetChanges, TokenEventItem, TransferArgs, tokenEventOf, useDeclarations } from '../components/AssetChanges';
import { NotFound } from './NotFound';
import { resendViaNative, useMe } from '../wallet/model';
import { useT } from '../i18n';

export function OpDetail({ id }: { id: string }) {
  const sim = useChain();
  const now = useNow();
  const prefs = useWalletPrefs();
  const me = useMe();
  const t = useT();
  // An op ID is 64 hex digits: anything else is not asked of the node, and the page says so instead of a failed lookup
  const wellFormed = /^[0-9a-fA-F]{64}$/.test(id);
  const r = wellFormed ? sim.getOp(id) : undefined;
  const lookup = useLookup('op', id, !wellFormed || !!r);
  const p = r ? opProgress(sim, r, now) : undefined;
  useBtcTimes(p?.btcAsk);
  if (!wellFormed) return <NotFound path={`/op/${id}`} what={t.ui.lookupWhat.op} message={t.search.notFound.badOpId} />;
  // While its lookup reads, though the operation is in: its block's settlement status and the assets it moves are not (`lookupShown`)
  if (!r || !p || lookup) return <LookupView kind="op" id={id} lookup={lookup ?? { state: 'missing', message: '' }} path={`/op/${id}`} />;
  const s = summarizeOp(sim, r);
  const mine = !!me && r.op.account === me;
  // A transfer of a built-in asset, or a known KS-20 token's transfer call (D-123)
  const transfer = transferOf(sim, r.op.action);
  const toMe = !!me && transfer?.to === me;
  const big = toMe && !transfer.token && transfer.id === KSA_ASSET_ID && transfer.amount >= BigInt(prefs.largeThreshold);
  const statusText = p.status === 'failed' ? t.op.head.execFailed : STAGE_LABEL[p.stage];
  const lastSkip = r.skippedIn?.[r.skippedIn.length - 1];
  const skipBlock = lastSkip ? sim.getBlock(lastSkip.block) : undefined;
  // The BTC height at which the chain block accepting it entered the settled closure: BTC-final confirmations count from here
  const closure = p.block?.acceptedHeight !== undefined ? sim.blocks[p.block.acceptedHeight]?.closureBtc : undefined;
  const sigHash = sim.sigHash(r.op);

  return (
    <div className="page">
      <PageHead
        eyebrow={
          <span className="row gap-6">
            {t.common.op} · <PathBadge path={r.path} named /> {t.status.pathName(r.path, t.status.path[r.path])}
          </span>
        }
        title={
          <span className="op-title">
            {toMe ? t.ui.received : s.verb}
            {/* A swap's detail names what it gives for its amount, set as the amount's unit is ("90,000 TKN → KSA") */}
            {s.amount && (
              <span className="mono op-title-amount">
                {s.amount.asset.pending ? '…' : fmtAmount(s.amount.value, s.amount.asset.decimals, { maxFrac: 4 })}{' '}
                <small>
                  {s.amount.asset.symbol}
                  {s.detail && ` ${s.detail}`}
                </small>
              </span>
            )}
            {!s.amount && s.detail && <span className="op-title-detail">{s.detail}</span>}
            {!s.amount && !s.detail && s.contract && (
              <span className="op-title-detail">{sim.labels.get(s.contract) ?? <span className="mono">{shortHash(s.contract, 6, 4)}</span>}</span>
            )}
          </span>
        }
        // Named by its ID in the browser's title, as a BTC transaction is: an amount there would stay in the tabs and the history
        doc={t.ui.doc.op(shortHash(r.id, 8, 6))}
        meta={
          <>
            <StatusBadge stage={p.status === 'failed' ? 'failed' : p.stage} large />
            <Hash value={r.id} head={10} tail={6} copy />
            {mine && <span className="tag tag--ink">{t.op.head.mine}</span>}
            {toMe && <span className="tag tag--neutral">{t.op.head.toMe}</span>}
            <TimeAgo at={r.submittedAt} />
          </>
        }
      />
      <p className="sr-only" aria-live="polite">
        {t.op.head.liveStatus(statusText)}
      </p>

      {p.status === 'failed' && r.result && (
        <Banner tone="danger" title={t.op.banner.failed(FAIL_LABEL[r.result.reason ?? ''] ?? t.common.failed)}>
          {r.path !== 'C'
            ? t.op.banner.failedCharged
            : r.result.reason === 'nonce_mismatch' || r.result.reason === 'not_authenticated'
              ? t.op.banner.failedNative
              : t.op.banner.failedNativeUsed}
        </Banner>
      )}
      {p.status === 'skipped' && lastSkip && (
        <Banner tone="warn" title={t.op.banner.skipped}>
          {p.skipNote}
        </Banner>
      )}
      {p.status === 'dropped' && r.dropped && <Banner tone="warn" title={t.op.banner.dropped} />}
      {p.suggestNative && (
        <Banner
          tone="warn"
          title={t.status.step.waited(p.waitedBlocks)}
          actions={
            mine && (
              <ButtonLink to={resendViaNative(r, sim)} size="sm">
                {t.op.banner.resendNative}
              </ButtonLink>
            )
          }
        >
          {t.op.banner.waitedBody}
        </Banner>
      )}
      {big && p.stage !== 'final' && (
        <Banner tone="warn" title={t.op.banner.large}>
          {t.op.banner.largeBody}
        </Banner>
      )}

      <section className="panel panel-pad journey">
        <header className="journey-head">
          <h2 className="section-title">{t.op.journey.title}</h2>
        </header>
        <Tracker progress={p} />
        {p.fastLatency !== undefined && r.path !== 'C' && (
          <p className="journey-foot small soft">
            {t.op.journey.fastLatency} <b><Figures text={fmtDuration(p.fastLatency)} /></b>
          </p>
        )}
      </section>

      <div className="grid-halves">
        <Section title="VmOp" eyebrow="Borsh">
          <SpecList
            rows={[
              { label: 'op_id', value: <FullHash value={r.id} />, hint: 'sha256(borsh(VmOp))' },
              { label: 'account', value: <AccountRef id={r.op.account} showKey />, hint: <span className="mono">{shortHash(r.op.account, 16, 8)}</span> },
              { label: 'nonce', value: <span className="num">{r.op.nonce}</span> },
              { label: 'chain_id', value: <span className="num">{r.op.chainId} · {networkOfChainId(r.op.chainId) ?? '—'}</span> },
              { label: 'fee', value: <FeeDetail r={r} /> },
              {
                label: 'max_gas',
                value: <span className="num">{fmtInt(r.op.maxGas)}</span>,
                // A failed op's gas used is recorded as its whole max_gas
                hint: r.result && (
                  <span className="row gap-6">
                    {t.op.vmop.gasUsed}
                    <GasBar used={r.result.gasUsed} max={r.op.maxGas} />
                  </span>
                ),
              },
              { label: 'action', value: <ActionDetail r={r} /> },
              {
                label: 'sig',
                value: <Hash value={r.op.sig.sig} head={16} tail={8} copy />,
                hint: r.op.sig.kind === 'Bip340' ? 'BIP340 Schnorr' : 'BIP322 simple',
              },
              // Not computed for a deployment on the node data source (its code is not kept) or for path C (the message ends with the carrying transaction's first input, D-086)
              sigHash && { label: t.op.vmop.sigHash, value: <Hash value={sigHash} head={16} tail={8} copy />, hint: 'tagged hash "Ksana/VmOp/v1"' },
              { label: t.op.vmop.size, value: <span><Figures text={t.op.vmop.bytes(fmtInt(r.size))} /></span>, hint: t.op.vmop.cap(fmtInt(PARAMS.MAX_OP_BYTES)) },
            ]}
          />
        </Section>
        <div className="stack gap-24">
          <Section title={t.op.exec.title}>
            <SpecList
              rows={[
                {
                  label: t.op.exec.block,
                  value: p.block ? (
                    <span className="row wrap gap-8">
                      <BlockRef height={p.block.header.height} hash={p.block.hash} />
                      {r.entryIndex !== undefined && <span className="small soft">{t.op.exec.entry(r.entryIndex)}</span>}
                    </span>
                  ) : skipBlock ? (
                    <span className="row wrap gap-8">
                      <BlockRef height={skipBlock.header.height} hash={skipBlock.hash} />
                      <span className="small soft">{STAGE_LABEL.skipped}</span>
                    </span>
                  ) : (
                    <span className="muted">{STAGE_LABEL[p.stage]}</span>
                  ),
                },
                p.block?.side && r.height !== undefined && { label: t.op.exec.accepted, value: <BlockRef height={r.height} /> },
                p.block && { label: t.op.exec.fastDepth, value: <span><Figures text={t.op.exec.confs(p.fastConfs)} /></span> },
                {
                  label: t.common.result,
                  value: r.result ? (
                    r.result.ok ? (
                      <span className="result result--ok">✓ {t.common.success}</span>
                    ) : (
                      <span className="result result--fail">{r.result.message}</span>
                    )
                  ) : (
                    <span className="muted">—</span>
                  ),
                },
                // A receipt's changes to built-in assets (D-122): a failed op has none, and a node that did not record them says so
                r.result?.ok &&
                  r.result.changes !== undefined &&
                  (r.result.changes === null || r.result.changes.length > 0) && { label: t.asset.op.changes, value: <AssetChanges changes={r.result.changes} />, hint: t.asset.op.changesHint },
                r.result && r.result.events.length > 0 && { label: t.op.exec.events, value: <Events events={r.result.events} /> },
                p.settlement && {
                  label: r.path === 'C' ? t.status.step.headerOnBtc : t.status.txKind.settlement,
                  value: <Hash value={p.settlement.txid} to={txRoute(sim, p.settlement.txid)} head={10} tail={6} />,
                  hint: TX_STATUS_LABEL[p.settlement.status],
                },
                r.nativeTxid && { label: t.op.exec.nativeTx, value: <Hash value={r.nativeTxid} to={txRoute(sim, r.nativeTxid)} head={10} tail={6} /> },
                p.btcConfs > 0 &&
                  p.block && {
                    label: t.op.exec.closure,
                    // The count goes below the BTC block whole where the two do not fit side by side, as on a block's page
                    value: (
                      <span className="row wrap gap-8">
                        {closure !== undefined ? <BtcRef height={closure} /> : <span className="muted">—</span>}
                        <span className="small soft">{t.op.exec.confs(p.btcConfs)}</span>
                      </span>
                    ),
                  },
              ]}
            />
          </Section>
        </div>
      </div>

      <details className="raw">
        <summary>{t.op.raw}</summary>
        <pre className="raw-pre mono">{JSON.stringify(r.op, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2)}</pre>
      </details>
    </div>
  );
}

function FeeDetail({ r }: { r: OpRecord }) {
  const sim = useChain();
  const t = useT();
  const ksa = sim.assets.get(KSA_ASSET_ID);
  const fee = r.op.fee;
  if (fee.kind === 'Token') {
    return (
      <span className="row gap-8">
        <span className="mono small">Token</span>
        {ksa && <Amount value={fee.amount} asset={ksa} size="sm" maxFrac={4} />}
      </span>
    );
  }
  const tx = r.nativeTxid ? sim.getBtcTx(r.nativeTxid) : undefined;
  return (
    <span className="row gap-8 wrap">
      <span className="mono small">BtcNative</span>
      <span className="small soft" title={t.ui.minerFeeHint}>
        {t.ui.minerFee} {tx?.feeSat !== undefined ? t.op.vmop.minerFee(fmtInt(tx.feeSat), String(tx.feeRate ?? '?')) : '—'}
      </span>
    </span>
  );
}

function ActionDetail({ r }: { r: OpRecord }) {
  const sim = useChain();
  const t = useT();
  const a = r.op.action;
  if (a.kind === 'AssetTransfer') {
    const asset = sim.assets.get(a.asset);
    return (
      <div className="kv">
        <span className="mono small kv-k">AssetTransfer</span>
        <span className="kv-row">
          <span className="kv-k">asset</span>
          {/* the name only where it says more than the symbol; a token by its ID and its issuer too, since another token can take the
              same symbol, and with a warning where its name reads as KSA's or bitcoin's */}
          {asset ? (asset.name && asset.name !== asset.symbol ? `${asset.symbol} · ${asset.name}` : asset.symbol) : shortHash(a.asset)}
          {asset && a.asset !== KSA_ASSET_ID && <Hash value={a.asset} head={6} tail={4} copy />}
          {asset && <AssetIssuer asset={asset} className="small soft" />}
          {asset && <LookalikeNote asset={asset} className="small" />}
        </span>
        <span className="kv-row">
          <span className="kv-k">to</span>
          <AccountRef id={a.to} />
        </span>
        <span className="kv-row">
          <span className="kv-k">amount</span>
          {asset ? <Amount value={a.amount} asset={asset} size="sm" maxFrac={asset.decimals} /> : <span className="num">{a.amount.toString()}</span>}
        </span>
      </div>
    );
  }
  if (a.kind === 'Call') {
    // A known KS-20 token's transfer reads its arguments in the token's units (D-123)
    const transfer = transferOf(sim, a);
    return (
      <div className="kv">
        <span className="mono small kv-k">Call</span>
        <span className="kv-row">
          <span className="kv-k">contract</span>
          <AccountRef id={a.contract} />
        </span>
        <span className="kv-row">
          <span className="kv-k">method</span>
          <span className="mono">{a.method}</span>
        </span>
        {transfer?.token ? (
          <TransferArgs transfer={transfer} />
        ) : (
          Object.entries(a.args).map(([k, v]) => (
            <span className="kv-row" key={k}>
              <span className="kv-k">{k}</span>
              <ArgValue r={r} k={k} v={v} />
            </span>
          ))
        )}
        <FundsRow funds={a.funds} />
      </div>
    );
  }
  return (
    <div className="kv">
      <span className="mono small kv-k">Deploy</span>
      {/* Only the simulator names its demo contracts; a deployment itself carries no name */}
      {a.name && (
        <span className="kv-row">
          <span className="kv-k">{t.op.vmop.name}</span>
          {a.name}
        </span>
      )}
      <span className="kv-row">
        <span className="kv-k">code_hash</span>
        <span className="mono small">{shortHash(a.codeHash, 10, 6)}</span>
      </span>
      <span className="kv-row">
        <span className="kv-k">{t.op.vmop.code}</span>
        <span><Figures text={t.op.vmop.wasm(fmtInt(a.codeSize))} /></span>
      </span>
      {/* The contract it creates: a failed deployment creates none */}
      {a.contract && r.result?.ok !== false && (
        <span className="kv-row">
          <span className="kv-k">contract_id</span>
          <AccountRef id={a.contract} />
        </span>
      )}
      <FundsRow funds={a.funds} />
    </div>
  );
}

/** Funds attached to a call or a deployment (D-073): they leave the account with the op */
function FundsRow({ funds }: { funds: Funds[] | undefined }) {
  const sim = useChain();
  if (!funds?.length) return null;
  return (
    <span className="kv-row">
      <span className="kv-k">funds</span>
      <span className="stack gap-4">
        {funds.map((f) => {
          const asset = sim.assets.get(f.asset);
          return asset ? (
            <Amount key={f.asset} value={f.amount} asset={asset} size="sm" maxFrac={asset.decimals} />
          ) : (
            <span key={f.asset} className="mono small">
              {f.amount.toString()} · {shortHash(f.asset, 6, 4)}
            </span>
          );
        })}
      </span>
    </span>
  );
}

/**
 * Bytes the page cannot read, given as hex with their length: a call's arguments on a node, Borsh in the contract's own interface, and an
 * event's data. Never an account, though 32 of them are 64 hex digits: two amounts, or a hash, would link to an empty account. The
 * length stands on a line of its own: after the hex, the wrapping that keeps a last line from holding one word alone took a hex digit
 * down to it on a phone, "0 · 64 bytes", which read as a value of its own
 */
export function RawBytes({ hex }: { hex: string }) {
  const t = useT();
  return (
    <span className="raw-bytes">
      <span className="mono small break">{hex}</span>
      <span className="soft small">{t.op.vmop.bytes(fmtInt(hex.length / 2))}</span>
    </span>
  );
}

/** Contract arguments: 64 hex digits are treated as an account or contract; amounts of known contracts are shown with the asset's decimals */
function ArgValue({ r, k, v }: { r: OpRecord; k: string; v: string | number | bigint }) {
  const sim = useChain();
  const s = String(v);
  if (k === 'borsh') return <RawBytes hex={s} />;
  if (/^[0-9a-f]{64}$/.test(s)) return <AccountRef id={s} short />;
  const a = r.op.action;
  if (a.kind === 'Call' && /^\d+$/.test(s)) {
    let assetId: string | undefined;
    if (a.contract === sim.tokenContract && k === 'amount') assetId = sim.tokenAsset;
    if (a.contract === sim.ammContract) {
      const inKsa = a.args.asset_in === 'KSA';
      if (k === 'amount_in') assetId = inKsa ? KSA_ASSET_ID : sim.tokenAsset;
      if (k === 'min_out') assetId = inKsa ? sim.tokenAsset : KSA_ASSET_ID;
      if (k === 'ksa') assetId = KSA_ASSET_ID;
      if (k === 'tkn') assetId = sim.tokenAsset;
    }
    const asset = assetId ? sim.assets.get(assetId) : undefined;
    if (asset) return <Amount value={BigInt(s)} asset={asset} size="sm" maxFrac={asset.decimals} />;
    if (k === 'btc_height') return <BtcRef height={Number(s)} />;
  }
  return <span className="mono small">{s}</span>;
}

/**
 * Event fields: accounts are shown as account seals; amounts of known assets are shown with their decimals. On a node the example
 * contracts' events are read by field (`eventFields`): a txid there is a BTC transaction and an asset an asset ID, not accounts,
 * and amounts stay plain numbers, as a contract writes what it likes
 */
function EventValue({ e, k, v }: { e: VmEvent; k: string; v: string }) {
  const sim = useChain();
  if (k === 'data') return <RawBytes hex={v} />;
  const key = /^[0-9a-f]{64}$/.test(v);
  if (key && k === 'txid') return <Hash value={v} to={sim.getBtcTx(v) ? txRoute(sim, v) : undefined} copy />;
  if (key && (k === 'asset' || k === 'asset_in')) return <Hash value={v} copy />;
  if (key) return <AccountRef id={v} short />;
  const bySymbol = (sym: string | undefined) => [...sim.assets.values()].find((a) => a.symbol === sym);
  let asset;
  if (e.name === 'Swap' && k === 'amount_in') asset = bySymbol(e.fields.asset_in);
  if (e.name === 'Swap' && k === 'amount_out') asset = bySymbol(e.fields.asset_out);
  if (e.name === 'Transfer' && k === 'amount') asset = bySymbol(e.fields.asset);
  if (e.name === 'Approval' && k === 'amount') asset = sim.assets.get(sim.tokenAsset);
  if (e.name === 'FeesUnlocked' && k === 'amount') asset = sim.assets.get(KSA_ASSET_ID);
  if (e.name === 'LiquidityAdded' && k === 'ksa') asset = sim.assets.get(KSA_ASSET_ID);
  if (e.name === 'LiquidityAdded' && k === 'tkn') asset = sim.assets.get(sim.tokenAsset);
  if (asset && /^\d+$/.test(v)) return <Amount value={BigInt(v)} asset={asset} size="sm" maxFrac={asset.decimals} />;
  return <span className="mono small">{v}</span>;
}

function Events({ events }: { events: VmEvent[] }) {
  const sim = useChain();
  useDeclarations(events);
  return (
    <ul className="events">
      {events.map((e, i) => {
        // A token's or a collection's events are read by its standard's layout (D-123)
        const te = tokenEventOf(sim, e);
        if (te) return <TokenEventItem key={i} te={te} />;
        return (
          <li key={i}>
            <span className="mono event-name">{e.name}</span>
            {Object.entries(e.fields).map(([k, v]) => (
              <span key={k} className="event-field">
                <span className="kv-k">{k}</span>
                <EventValue e={e} k={k} v={v} />
              </span>
            ))}
          </li>
        );
      })}
      {events.length === 0 && <li className="muted">—</li>}
    </ul>
  );
}
