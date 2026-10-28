import { useState } from 'react';
import { useChain, useNow } from '../../app/store';
import { consoleStore, toast, updateWallet, useWalletPrefs, watchOp } from '../../app/prefs';
import { KSA_ASSET_ID } from '../../chain/params';
import { addressPrefix, balancesOf, indexerState, nativeConfsOf, opProgress, utxoState } from '../../chain/views';
import type { AssetMeta, Hex, OpRecord, Utxo } from '../../chain/types';
import { fmtAmount, fmtBtc, fmtEta, fmtInt, shortHash, walletAddress } from '../../lib/format';
import { activity, balancesKnown, finalityOf, inflight, resendViaNative, unfinalFlows, useMe, type Finality, type UnfinalFlows } from '../../wallet/model';
import { useBtcBalance } from '../../wallet/holdings';
import { WALLET_NAME, connectWallet, disconnectWallet, lastWalletKind, testKeyRefused, useConnectedWallet, useConnecting, walletOptions } from '../../wallet/connect';
import type { Devnet } from '../../chain/sim/engine';
import type { RpcChain } from '../../chain/rpc/chain';
import { AccountSeal, AssetIssuer, AssetLink, CopyButton, Link, LookalikeNote } from '../../components/Refs';
import { HistoryReach, OlderRows, useShownRows } from '../../components/HistoryReach';
import { OpsTable, OpSummaryText } from '../../components/Lists';
import { IndexerLine, StatusMark } from '../../components/Status';
import { Table, rowOpener, type Column } from '../../components/Table';
import { Tracker } from '../../components/Tracker';
import { Amount, PathBadge, Sats } from '../../components/Values';
import { Banner, Button, ButtonLink, Empty, PageHead, Section, SpecList, Tabs } from '../../components/ui';
import { IconExternal, IconEye, IconEyeOff, IconReceive, IconRefresh, IconSend, IconSettings, IconTerminal, IconTopUp } from '../../components/icons';
import { playgroundLink } from '../../app/deployment';
import { useLocale, useT } from '../../i18n';
import { FaucetButton, useHostedFaucet } from './Faucet';
import { Collectibles, FoldButton, FoldedAssets } from './Assets';
import { useFolding } from '../../wallet/assets';

export function Wallet() {
  const me = useMe();
  return me ? <WalletHome me={me} /> : <Connect />;
}

// =====================================================================
// Connect
// =====================================================================

function Connect() {
  const sim = useChain();
  const t = useT();
  const c = t.wallet.connect;
  return (
    <div className="page narrow-page">
      <PageHead eyebrow={t.wallet.title} title={c.title} meta={c.noCustody} />
      {sim.kind === 'sim' ? <ConnectDemo sim={sim} /> : <ConnectReal sim={sim} />}
      {/* Each point with a line saying what it means: alone the headings headed nothing, and a newcomer has not met "Path C" or a producer yet */}
      <section className="explain-grid">
        {[
          { title: c.points.key, note: c.pointNotes.key },
          { title: c.points.topup, note: c.pointNotes.topup },
          { title: c.points.pathC, note: c.pointNotes.pathC(nativeConfsOf(sim)) },
        ].map(({ title, note }) => (
          <div key={title}>
            <h2 className="explain-title">{title}</h2>
            <p className="explain-text">{note}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function ConnectDemo({ sim }: { sim: Devnet }) {
  const t = useT();
  const c = t.wallet.connect;
  const ksa = sim.assets.get(KSA_ASSET_ID);
  return (
    <div className="connect-list">
      <button
        type="button"
        className="connect-card connect-card--primary"
        onClick={() => {
          updateWallet({ connected: true });
          toast({ tone: 'neutral', title: c.demoConnected });
        }}
      >
        <span className="connect-icon">
          <AccountSeal id={sim.demoId} size={34} />
        </span>
        <span className="connect-body">
          <span className="connect-title">
            {c.demoName} <span className="tag tag--neutral">devnet</span>
          </span>
          <span className="connect-text">
            {c.demoNote}
            {ksa && (
              <>
                {' · '}
                <Amount value={sim.balance(sim.demoId, KSA_ASSET_ID)} asset={ksa} size="sm" maxFrac={2} />
              </>
            )}
          </span>
        </span>
        <span className="connect-go">{c.go}</span>
      </button>
      {/* The browser's own wallets, named as on the node data source (OneKey's provider at window.unisat is OneKey) */}
      {(['unisat', 'xverse'] as const).map((kind) => (
        <button key={kind} type="button" className="connect-card connect-card--hint" onClick={() => consoleStore.set(true)}>
          <span className="connect-icon connect-icon--text" aria-hidden="true">
            {WALLET_NAME[kind].slice(0, 1)}
          </span>
          <span className="connect-body">
            <span className="connect-title">
              {WALLET_NAME[kind]} <span className="tag">{c.needsNode}</span>
            </span>
            <span className="connect-text">{kind === 'unisat' ? c.unisatNote : c.xverseNote}</span>
          </span>
          <span className="connect-go connect-go--ghost">{c.switchSource}</span>
        </button>
      ))}
    </div>
  );
}

function ConnectReal({ sim }: { sim: RpcChain }) {
  const t = useT();
  const c = t.wallet.connect;
  const connecting = useConnecting();
  const options = walletOptions(sim);
  const last = lastWalletKind();
  const busy = connecting !== null && !connecting.error;
  return (
    <>
      {testKeyRefused(sim) && (
        <Banner tone="warn" title={c.keyRefusedTitle}>
          {c.keyRefused}
        </Banner>
      )}
      <div className="connect-list">
        {options.map((o) => {
          const waiting = busy && connecting?.kind === o.kind;
          return (
            <button
              key={o.kind}
              type="button"
              className={`connect-card${o.available ? (o.kind === last || o.kind === 'mock' ? ' connect-card--primary' : '') : ' connect-card--off'}`}
              disabled={!o.available || busy}
              aria-busy={waiting}
              onClick={() => void connectWallet(o.kind, sim)}
            >
              <span className="connect-icon connect-icon--text" aria-hidden="true">
                {o.kind === 'mock' ? c.mockIcon : o.name.slice(0, 1)}
              </span>
              <span className="connect-body">
                <span className="connect-title">
                  {o.name}
                  {o.kind === last && <span className="tag tag--neutral">{c.lastUsed}</span>}
                  {o.kind === 'mock' && <span className="tag tag--warn">{c.localOnly}</span>}
                  {/* A wallet that was not detected: a computer installs its extension, and a touch screen, which has none, opens the page in the
                      browser inside the wallet's app; its tag and the line below say which (the style sheet shows the one that applies) */}
                  {!o.available && (
                    <>
                      <span className="tag connect-install">{c.notDetected}</span>
                      <span className="tag connect-in-app">{c.notDetectedTouch}</span>
                    </>
                  )}
                </span>
                <span className="connect-text">
                  {o.available
                    ? o.note
                    : o.kind !== 'mock' && (
                        <>
                          <span className="connect-install">{c.install}</span>
                          <span className="connect-in-app">{c.openInApp[o.kind]}</span>
                        </>
                      )}
                </span>
              </span>
              <span className="connect-go">{waiting ? c.waiting : c.go}</span>
            </button>
          );
        })}
      </div>
      {connecting?.error && (
        <Banner tone="warn" title={connecting.left ? c.left(WALLET_NAME[connecting.kind]) : c.failed(WALLET_NAME[connecting.kind])}>
          {connecting.error}
        </Banner>
      )}
      <p className="small muted">
        {c.network(sim.network, addressPrefix(sim))}
        {/* The test-key wallet is for local regtest only: a hosted page does not invite anyone to put a private key in its address bar */}
        {sim.network === 'regtest' && (
          <>
            <br />
            {c.mockHint} <code className="inline">{c.mockParam}</code>
          </>
        )}
      </p>
    </>
  );
}

// =====================================================================
// Wallet home
// =====================================================================

function WalletHome({ me }: { me: Hex }) {
  const sim = useChain();
  const prefs = useWalletPrefs();
  const wallet = useConnectedWallet();
  const backlog = sim.backlogStatus();
  const flying = inflight(sim, me);
  // The account is the Taproot address (D-092): the page head shows the address; the hex is on the account page and in the wallet info
  const address = sim.addressOf(me) || wallet?.account.address || '';
  const t = useT();
  const h = t.wallet.home;
  const a = t.wallet.alert;

  return (
    <div className="page">
      <PageHead
        className="wallet-head"
        eyebrow={sim.kind === 'sim' ? h.eyebrowDemo : h.eyebrow(wallet?.name ?? '')}
        title={
          <span className="acct-title">
            <AccountSeal id={me} size={36} />
            {h.title}
          </span>
        }
        doc={h.title}
        meta={
          <span className="row gap-6 wallet-addr">
            <span className="small soft">{t.wallet.address}</span>
            <span className="mono" title={address ? `${t.ui.accountTitle(address)}\n${t.ui.accountHex(me)}` : t.ui.accountHex(me)}>
              {address ? walletAddress(address) : shortHash(me, 10, 8)}
            </span>
            <CopyButton text={address || me} label={address ? t.wallet.copyAddress : t.wallet.copyAccountHex} />
            <Link to={{ name: 'account', id: me }} className="link small">
              {h.viewInExplorer}
            </Link>
          </span>
        }
        actions={
          <>
            {/* On phones the bottom bar carries these three: the head keeps only the two icons */}
            <ButtonLink to={{ name: 'send' }} variant="primary" icon={<IconSend />} className="wallet-head-btn">
              {h.send}
            </ButtonLink>
            <ButtonLink to={{ name: 'receive' }} icon={<IconReceive />} className="wallet-head-btn">
              {t.receive.title}
            </ButtonLink>
            <ButtonLink to={{ name: 'topup' }} icon={<IconTopUp />} className="wallet-head-btn">
              {t.topup.nav}
            </ButtonLink>
            <Button
              variant="ghost"
              icon={prefs.hideBalances ? <IconEye /> : <IconEyeOff />}
              onClick={() => updateWallet({ hideBalances: !prefs.hideBalances })}
              aria-pressed={prefs.hideBalances}
              aria-label={prefs.hideBalances ? h.showBalances : h.hideBalances}
              title={prefs.hideBalances ? h.showBalances : h.hideBalances}
            />
            <ButtonLink
              to={{ name: 'settings' }}
              variant="ghost"
              icon={<IconSettings />}
              aria-label={t.settings.title}
              title={t.settings.title}
            />
          </>
        }
      />

      {backlog.triggered && (
        <Banner tone="danger" title={a.backlogTitle}>
          {a.backlog(String(sim.estimateFee().market.feeRate))}
        </Banner>
      )}
      {sim.censored.has(me) && (
        <Banner tone="warn" title={a.censoredTitle}>
          {a.censored}
        </Banner>
      )}

      <Balances me={me} quiet={flying.length === 0} />

      {flying.length > 0 && (
        <Section title={t.wallet.inflight.title} eyebrow={t.wallet.inflight.eyebrow(flying.length)}>
          <ul className="inflight">
            {flying.map((r) => (
              <InflightRow key={r.id} r={r} me={me} />
            ))}
          </ul>
        </Section>
      )}

      {/* Drawn anew for another account: a list the keyboard holds (`useHold`) would keep the last account's rows */}
      <div className="grid-2" key={me}>
        <ActivitySection me={me} />
        {/* The home page keeps only balances, in-flight operations, activity and BTC outputs / wallet info; the threshold is changed on the receive and settings pages, test assets in the regtest console (UI/UX review §2.2) */}
        {sim.kind === 'sim' ? <Utxos me={me} /> : <WalletInfo sim={sim} />}
      </div>

      <PlaygroundCard />
    </div>
  );
}

/** The contract playground (core/playground/, D-119), a page of its own: what it does and a link, opened in a new tab; on a phone the way there besides the footer */
function PlaygroundCard() {
  const t = useT();
  const locale = useLocale();
  const p = t.wallet.playground;
  return (
    <Section title={p.title}>
      <div className="row wrap wallet-playground">
        <p className="small soft prose">{p.body}</p>
        <a className="btn btn--secondary btn--sm btn--wrap" href={playgroundLink(locale)} target="_blank" rel="noreferrer">
          <span>{p.open}</span>
          <IconExternal size={14} />
        </a>
      </div>
    </Section>
  );
}

/**
 * Balances, in the order a Bitcoin user reads them: BTC on Bitcoin first, then KSA on the fast lane, split by finality into an
 * "eternal" part and an "instant" part, then the other fast-lane assets (built-in assets and KS-20 tokens in one list, D-123) and the
 * NFTs. quiet means there are no in-flight operations: a KSA balance of 0 is then an empty wallet, which gets one sentence and the ways
 * to get KSA instead of an empty split chart.
 */
function Balances({ me, quiet }: { me: Hex; quiet: boolean }) {
  const sim = useChain();
  const rows = balancesOf(sim, me);
  const flows = unfinalFlows(sim, me);
  const ksaAsset = sim.assets.get(KSA_ASSET_ID);
  // balancesOf is empty until the node has answered for the account: the KSA card is drawn all the same, reading "…" until then
  const ksa = rows.find((r) => r.asset.id === KSA_ASSET_ID)?.asset ?? ksaAsset;
  const tokens = rows.filter((r) => r.asset.id !== KSA_ASSET_ID);
  const t = useT();
  return (
    <section className="balances" aria-label={t.common.balance}>
      <BtcBalance me={me} />
      {ksa && <KsaBalance me={me} asset={ksa} flows={flows} quiet={quiet} />}
      {tokens.length > 0 && <TokenBalances me={me} rows={tokens} flows={flows} />}
      <Collectibles me={me} />
    </section>
  );
}

/**
 * BTC on the wallet address. The simulator knows its own outputs; under the node data source they are read the way path C and
 * top-ups read them (`useBtcBalance`), and without a source the card points to the user's BTC wallet.
 */
function BtcBalance({ me }: { me: Hex }) {
  const sim = useChain();
  const wallet = useConnectedWallet();
  const rpc = sim.kind === 'rpc' ? sim : null;
  const [btc, refresh, reading] = useBtcBalance(rpc, wallet);
  const prefs = useWalletPrefs();
  const t = useT();
  const b = t.wallet.balances;
  let amount: React.ReactNode;
  let lines: React.ReactNode = null;
  if (!rpc) {
    const utxos = sim.getUtxos(me).filter((u) => !u.spentBy);
    const usable = utxos.filter((u) => utxoState(u) === 'available').length;
    const total = utxos.reduce((s, u) => s + u.valueSat, 0);
    amount = <Sats value={total} size="xl" privacy />;
    lines = (
      <p className="small soft">
        {prefs.hideBalances ? '••••' : fmtBtc(total)}&nbsp;BTC · {b.utxoCount(utxos.length)} · {t.wallet.utxos.state.available} <b className="num">{usable}</b>
      </p>
    );
  } else if (btc.state === 'ready') {
    const h = btc.holdings;
    amount = <Sats value={h.total} size="xl" privacy />;
    lines = (
      <>
        <p className="small soft">
          {prefs.hideBalances ? '••••' : fmtBtc(h.total)}&nbsp;BTC · {b.utxoCount(h.outputs)}
        </p>
        {!!h.unconfirmed && (
          <p className="small balance-note">
            <StatusMark stage="pending" size={11} />
            {b.btcUnconfirmed(prefs.hideBalances ? '••••' : fmtInt(h.unconfirmed))}
          </p>
        )}
        {btc.stale && <BtcRetry message={btc.stale} stale onRetry={refresh} />}
      </>
    );
  } else if (btc.state === 'failed') {
    amount = <Sats value={undefined} size="xl" />;
    lines = <BtcRetry message={btc.message} onRetry={refresh} />;
  } else if (btc.state === 'loading') {
    amount = (
      <span className="amount amount--xl amount--unknown" aria-busy="true">
        <span className="amount-int">…</span>
        <span className="amount-unit">{t.format.sats}</span>
      </span>
    );
    lines = <p className="small soft">{b.btcReading}</p>;
  } else {
    // Neither a Bitcoin RPC nor a wallet that lists its coins: "—", explained on hover, and where to look instead
    amount = <Sats value={undefined} size="xl" />;
    lines = wallet && <p className="small soft">{b.btcInWallet(wallet.name)}</p>;
  }
  return (
    <div className="balance-card balance-btc panel">
      <div className="balance-head">
        <span className="label">{b.btc(rpc ? rpc.network : 'regtest')}</span>
        {/* The page does not poll the BTC balance (useBtcBalance): read it now, say after a payment to this address */}
        {rpc && btc.state === 'ready' && (
          <Button
            variant="ghost"
            size="sm"
            icon={<IconRefresh />}
            className={`balance-refresh${reading ? ' is-busy' : ''}`}
            onClick={refresh}
            disabled={reading}
            aria-busy={reading}
            aria-label={b.btcRefresh}
            title={b.btcRefresh}
          />
        )}
      </div>
      {amount}
      {lines}
    </div>
  );
}

/** The last read of the BTC balance failed: says so in one line, with the reason on hover, and offers to read again */
function BtcRetry({ message, stale = false, onRetry }: { message: string; stale?: boolean; onRetry: () => void }) {
  const t = useT();
  const b = t.wallet.balances;
  return (
    <p className="small balance-note balance-note--warn">
      <span title={message}>{stale ? b.btcStale : b.btcFailed}</span>
      <button type="button" className="link-btn" onClick={onRetry}>
        {t.common.retry}
      </button>
    </p>
  );
}

function KsaBalance({ me, asset, flows, quiet }: { me: Hex; asset: AssetMeta; flows: UnfinalFlows; quiet: boolean }) {
  const sim = useChain();
  const f = finalityOf(sim, me, KSA_ASSET_ID, flows);
  const rpc = sim.kind === 'rpc' ? sim : null;
  // Until the node has answered for the account: "…", as on the BTC card, not an empty wallet
  const reading = !balancesKnown(sim, me);
  const fresh = !reading && quiet && f.total === 0n && f.inflow === 0n && f.outflow === 0n;
  const faucet = useHostedFaucet();
  const t = useT();
  const b = t.wallet.balances;
  return (
    <div className="balance-card balance-main panel">
      <div className="balance-head">
        <span className="label">{b.ksa}</span>
      </div>
      {reading ? (
        <span className="amount amount--xl amount--unknown" aria-busy="true">
          <span className="amount-int">…</span>
          <span className="amount-unit">{asset.symbol}</span>
        </span>
      ) : (
        <Amount value={f.total} asset={asset} size="xl" maxFrac={4} privacy />
      )}
      {reading ? (
        <p className="small soft">{b.ksaReading}</p>
      ) : fresh ? (
        <div className="balance-empty">
          <p className="small soft">{faucet ? b.emptyFaucet : b.empty}</p>
          <div className="row wrap gap-8">
            {faucet && <FaucetButton url={faucet} me={me} label={t.wallet.faucet.claimHosted} variant="primary" size="sm" />}
            <ButtonLink to={{ name: 'topup' }} variant={faucet ? 'secondary' : 'primary'} size="sm" icon={<IconTopUp />}>
              {t.topup.nav}
            </ButtonLink>
            {sim.kind === 'sim' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const res = sim.faucet(me);
                  if (res.opId) watchOp(res.opId);
                  toast({ tone: 'neutral', title: t.wallet.faucet.requested });
                }}
              >
                {t.wallet.faucet.claim}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <FinalitySplit f={f} decimals={asset.decimals} symbol={asset.symbol} />
      )}
      {rpc && !rpc.finalityLoaded && <p className="small muted">{b.loading(fmtInt(rpc.loadedFrom), fmtInt(rpc.finalHeight))}</p>}
      {/* Node data source: who verifies these numbers (UI/UX review §2.7). Without an indexer, "BTC final" is only the node's word */}
      {rpc && (
        <Link to={{ name: 'verify' }} className="small soft balance-indexer">
          <IndexerLine state={indexerState(sim)} height={sim.indexerHeight} offNote={b.noIndexerNote} />
        </Link>
      )}
    </div>
  );
}

/**
 * The other fast-lane assets: one row each, with the BTC-final amount beside it while part of it is not final yet (at most that much
 * while a contract call not final yet may have paid in more than the page reads), the contract that issued it, and the warning under
 * one named like KSA or bitcoin. Those nobody asked for are folded away under the list (`FoldedAssets`)
 */
function TokenBalances({ me, rows, flows }: { me: Hex; rows: { asset: AssetMeta; available: bigint }[]; flows: UnfinalFlows }) {
  const sim = useChain();
  const prefs = useWalletPrefs();
  const folding = useFolding(me);
  const t = useT();
  const b = t.wallet.balances;
  const shown = rows.filter((r) => folding.shows(r.asset.id));
  return (
    <div className="balance-card balance-tokens panel">
      <div className="balance-head">
        <span className="label">{b.tokens}</span>
      </div>
      <ul className="balance-others">
        {shown.map((r) => {
          // A KS-20 token's balance is the one the node's index adds up (D-123)
          const f = finalityOf(sim, me, r.asset.id, flows, r.asset.standard ? r.available : undefined);
          return (
            <li key={r.asset.id}>
              <span className="token-asset">
                <span className="token-asset-head">
                  <AssetLink asset={r.asset} className="balance-sym" />
                  {r.asset.name && r.asset.name !== r.asset.symbol && <span className="small soft balance-name">{r.asset.name}</span>}
                </span>
                <AssetIssuer asset={r.asset} className="small soft" />
              </span>
              <span className="balance-token-amount">
                <Amount value={r.available} asset={r.asset} maxFrac={Math.min(r.asset.decimals, 4)} privacy />
                {(f.finalBalance !== f.total || f.unread) && (
                  <span className="unfinal-chip" title={t.wallet.split.finalBalance}>
                    <StatusMark stage="final" size={8} /> {b.finalShort} {f.unread && '≤ '}
                    {prefs.hideBalances ? '••••' : r.asset.pending ? '…' : fmtAmount(f.finalBalance, r.asset.decimals, { maxFrac: 4 })}
                  </span>
                )}
                <FoldButton folding={folding} id={r.asset.id} />
              </span>
              <LookalikeNote asset={r.asset} className="small balance-warn" />
            </li>
          );
        })}
      </ul>
      <FoldedAssets folding={folding} rows={rows.filter((r) => !folding.shows(r.asset.id))} />
    </div>
  );
}

/**
 * The balance under the two kinds of confirmation (SPEC §10.4): the current balance is available immediately, the BTC-final balance
 * is counted by BTC-final blocks.
 * Written as one equation: BTC-final balance + instant incoming − instant outgoing = current balance. The bar chart uses the same
 * numbers: zhu (vermilion) is the part of the current balance that does not depend on unfinalized incoming transfers, qing (teal)
 * is the unfinalized incoming, and the dashed box is what has already been sent out but is not final yet. While a contract call not
 * final yet may have paid in more than the page reads (`unread`), the BTC-final balance is at most the one given, and with no other
 * change there is nothing to draw: one line says so instead of "Entire balance is BTC final".
 */
function FinalitySplit({ f, decimals, symbol }: { f: Finality; decimals: number; symbol: string }) {
  const prefs = useWalletPrefs();
  const hidden = prefs.hideBalances;
  const show = (v: bigint) => (hidden ? '••••' : fmtAmount(v, decimals, { maxFrac: 4 }));
  const settledPart = f.total - f.inflow > 0n ? f.total - f.inflow : 0n;
  const span = settledPart + f.inflow + f.outflow;
  const pct = (v: bigint) => (span > 0n ? Number((v * 10000n) / span) / 100 : 0);
  const same = f.inflow === 0n && f.outflow === 0n;
  const t = useT();
  const s = t.wallet.split;
  return (
    <div className="split">
      {!(same && f.unread) && (
        <div className="split-bar" aria-hidden="true">
          <span className="split-final" style={{ width: `${same ? 100 : pct(settledPart)}%` }} />
          {f.inflow > 0n && <span className="split-fast" style={{ width: `${pct(f.inflow)}%` }} />}
          {f.outflow > 0n && <span className="split-out-bar" style={{ width: `${pct(f.outflow)}%` }} />}
        </div>
      )}
      {same ? (
        <div className="split-legend">
          <span className={`split-item${f.unread ? ' split-item--note' : ''}`}>
            <StatusMark stage={f.unread ? 'fast' : 'final'} size={11} />
            <span className="muted small">{f.unread ? s.unreadAll : s.allFinal}</span>
          </span>
        </div>
      ) : (
        <dl className="split-eq">
          <div className="split-eq-row">
            <dt>
              <StatusMark stage="final" size={11} />
              {s.finalBalance}
            </dt>
            <dd>
              <span className="num">
                {f.unread && '≤ '}
                {show(f.finalBalance)}
              </span>{' '}
              {symbol}
            </dd>
          </div>
          {f.inflow > 0n && (
            <div className="split-eq-row">
              <dt>
                <StatusMark stage="fast" size={11} />
                {s.inflow}
              </dt>
              <dd className="num split-plus">+{show(f.inflow)}</dd>
            </div>
          )}
          {f.outflow > 0n && (
            <div className="split-eq-row">
              <dt>
                <span className="split-out-mark" aria-hidden="true" />
                {s.outflow}
              </dt>
              <dd className="num split-minus">−{show(f.outflow)}</dd>
            </div>
          )}
          <div className="split-eq-row split-eq-total">
            <dt>{s.total}</dt>
            <dd>
              <span className="num">{show(f.total)}</span> {symbol}
            </dd>
          </div>
        </dl>
      )}
      {!same && f.unread && <p className="small muted split-note">{s.unreadMore}</p>}
    </div>
  );
}

function InflightRow({ r, me }: { r: OpRecord; me: Hex }) {
  const sim = useChain();
  const now = useNow();
  const p = opProgress(sim, r, now);
  const last = p.steps[p.steps.length - 1];
  const eta = last?.eta;
  const t = useT();
  const i = t.wallet.inflight;
  return (
    <li className="inflight-row row-link" onClick={rowOpener({ name: 'op', id: r.id })}>
      <div className="inflight-what">
        <PathBadge path={r.path} />
        <OpSummaryText r={r} perspective={me} link />
      </div>
      <div className="inflight-track">
        <Tracker progress={p} compact />
      </div>
      <div className="inflight-eta small">
        {p.status === 'failed' ? (
          <span className="result result--fail">{i.failed}</span>
        ) : p.suggestNative && r.op.account === me ? (
          <ButtonLink to={resendViaNative(r, sim)} size="sm">
            {i.resend}
          </ButtonLink>
        ) : p.status === 'skipped' ? (
          <span className="result result--skip">{r.requeued ? i.skipped : t.status.stage.skipped}</span>
        ) : last?.stuck ? (
          <span className="result result--skip">{i.stuck}</span>
        ) : eta !== undefined ? (
          <span className="soft ticking">{eta < 1500 ? t.format.soon : i.eta(fmtEta(eta))}</span>
        ) : (
          <span className="soft">{p.stage === 'pending' ? i.waitInclusion : i.waitSettlement}</span>
        )}
      </div>
    </li>
  );
}

/** The wallet's activity lists this many of the latest at first, and as many more each time a reader asks for older ones */
const ACTIVITY_ROWS = 40;

function ActivitySection({ me }: { me: Hex }) {
  const sim = useChain();
  const t = useT();
  const a = t.wallet.activity;
  const [filter, setFilter] = useState<'all' | 'out' | 'in' | 'failed'>('all');
  const shown = useShownRows(ACTIVITY_ROWS, `${me}:${filter}`);
  // One beyond the rows shown, which tells that an older one is there
  const rows = activity(sim, me, filter, shown.shown + 1);
  return (
    <Section
      title={a.title}
      actions={
        <Tabs
          label={a.filter}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t.common.all },
            { value: 'out', label: a.out },
            { value: 'in', label: a.in },
            { value: 'failed', label: t.common.failed },
          ]}
        />
      }
    >
      <HistoryReach of={me} full={rows.length >= shown.shown} grown={shown.grown} />
      {rows.length === 0 ? !(sim.kind === 'rpc' && sim.history(me).loading) && <Empty title={a.empty} /> : <OpsTable ops={rows.slice(0, shown.shown)} perspective={me} showAccount={false} />}
      <OlderRows of={me} listed={rows.length} rows={shown} />
    </Section>
  );
}

function Utxos({ me }: { me: Hex }) {
  const sim = useChain();
  const t = useT();
  const m = t.wallet.utxos;
  const [showSpent, setShowSpent] = useState(false);
  const all = sim.getUtxos(me);
  const rows = all.filter((u) => showSpent || !u.spentBy).slice().reverse();
  const cols: Column<Utxo>[] = [
    {
      key: 'o',
      label: m.output,
      mobile: 'primary',
      render: (u) => (
        <span className="cell-stack">
          <span className="mono small" title={`${u.outpoint.txid}:${u.outpoint.vout}`}>
            {shortHash(u.outpoint.txid, 8, 4)}:{u.outpoint.vout}
          </span>
          <span className="cell-sub">
            {u.scriptType === 'p2tr' ? 'P2TR' : 'P2WPKH'}
            {sim.getBtcTx(u.outpoint.txid)?.kind === 'settlement' || sim.getBtcTx(u.outpoint.txid)?.kind === 'rescue' ? ` · ${m.change}` : ''}
          </span>
        </span>
      ),
    },
    { key: 'v', label: t.common.amount, align: 'right', render: (u) => <Sats value={u.valueSat} size="sm" privacy /> },
    {
      key: 's',
      label: t.common.status,
      align: 'right',
      render: (u) => {
        const st = utxoState(u);
        return <span className={`utxo-state utxo-state--${st}`}>{m.state[st]}</span>;
      },
    },
  ];
  return (
    <Section
      title={m.title}
      actions={
        <label className="check">
          <input type="checkbox" checked={showSpent} onChange={(e) => setShowSpent(e.target.checked)} />
          {m.showSpent}
        </label>
      }
    >
      {rows.length === 0 ? (
        <Empty
          title={m.empty}
          action={
            <Button size="sm" variant="ghost" icon={<IconTerminal />} onClick={() => consoleStore.set(true)}>
              {t.wallet.faucet.console}
            </Button>
          }
        >
          {m.emptyHint(t.wallet.faucet.title)}
        </Empty>
      ) : (
        <Table caption={m.title} columns={cols} rows={rows.slice(0, 10)} rowKey={(u) => `${u.outpoint.txid}:${u.outpoint.vout}`} />
      )}
    </Section>
  );
}

/** Node data source: the connected wallet and its address (the account is this Taproot address, D-092; the hex is for contract parameters) */
function WalletInfo({ sim }: { sim: RpcChain }) {
  const wallet = useConnectedWallet();
  const t = useT();
  if (!wallet) return null;
  const a = wallet.account;
  const i = t.wallet.info;
  return (
    <Section title={t.wallet.title} eyebrow={wallet.name}>
      <SpecList
        rows={[
          { label: i.address, value: <span className="mono small break">{a.address}</span> },
          { label: t.wallet.accountHex, value: <span className="mono small break soft">{a.account}</span> },
          { label: i.signing, value: <span className="small">{i.signingValue}</span> },
        ]}
      />
      <div className="row wrap">
        {/* A bordered button: a ghost one reads as plain text on a phone, which has no hover */}
        <Button onClick={() => disconnectWallet(sim)}>{i.disconnect}</Button>
      </div>
    </Section>
  );
}
