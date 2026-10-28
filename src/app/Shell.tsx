import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { href, onLinkClick, useRoute, type Route } from './router';
import { shownAddress, useChain, useNow, useStore } from './store';
import {
  consoleStore,
  dismissToast,
  setTheme,
  toast,
  toastStore,
  updateWallet,
  useTheme,
  useWalletPrefs,
  watchOp,
  watchStore,
  type ThemePref,
} from './prefs';
import { BlockClock, Wordmark } from '../components/Brand';
import { SearchBox } from '../components/SearchBox';
import { IndexerLine, StatusMark } from '../components/Status';
import { Amount } from '../components/Values';
import { AccountSeal, Link } from '../components/Refs';
import { Button, useModalDialog } from '../components/ui';
import {
  IconClose,
  IconExternal,
  IconGrid,
  IconLayers,
  IconMonitor,
  IconMoon,
  IconPickaxe,
  IconPulse,
  IconReceive,
  IconSearch,
  IconSend,
  IconShield,
  IconSun,
  IconTopUp,
  IconWallet,
} from '../components/icons';
import { KSA_ASSET_ID, PARAMS } from '../chain/params';
import { backlogLate, indexerState, nextBlockGap, opNews, opProgress, opWhat, type Stage } from '../chain/views';
import { fmtAmount, fmtClock, fmtDuration, fmtInt, shortAddress, timeAgo } from '../lib/format';
import { balancesKnown, useMe } from '../wallet/model';
import { disconnectWallet, useConnectedWallet } from '../wallet/connect';
import { SourcePanel } from './SourcePanel';
import type { Devnet } from '../chain/sim/engine';
import type { RpcChain } from '../chain/rpc/chain';
import { LanguageSelect } from '../components/LanguageSelect';
import { BUILD_COMMIT, commitUrl } from './build';
import { fitLabels, fitTopBar } from './fit';
import { playgroundLink } from './deployment';
import { localized, t, useLocale, useT } from '../i18n';

type NavKey = 'overview' | 'blocks' | 'ops' | 'verify' | 'wallet';

function navKey(r: Route): NavKey | null {
  switch (r.name) {
    case 'overview':
      return 'overview';
    case 'blocks':
    case 'block':
    // Settlements, BTC transactions and BTC blocks fall under "Blocks" (settlements are no longer top-level navigation)
    case 'settlements':
    case 'tx':
    case 'btc':
      return 'blocks';
    case 'ops':
    case 'op':
      return 'ops';
    case 'verify':
      return 'verify';
    case 'wallet':
    case 'send':
    case 'receive':
    case 'topup':
    case 'settings':
      return 'wallet';
    default:
      return null;
  }
}

/** Top bar navigation; the names are in the shell.nav messages */
const NAV: { key: Exclude<NavKey, 'wallet'>; to: Route }[] = [
  { key: 'overview', to: { name: 'overview' } },
  { key: 'blocks', to: { name: 'blocks', page: 1 } },
  { key: 'ops', to: { name: 'ops', tab: 'latest' } },
  { key: 'verify', to: { name: 'verify' } },
];

/** The contract playground (core/playground/, D-119): a page of its own, so its links open it in a new tab */
function PlaygroundLink({ className }: { className: string }) {
  const t = useT();
  const locale = useLocale();
  return (
    <a href={playgroundLink(locale)} target="_blank" rel="noreferrer" className={`${className} out-link`} title={t.shell.playground}>
      {t.shell.nav.playground}
      <IconExternal size={12} />
    </a>
  );
}

function NavLink({ to, current, children, className = 'nav-link' }: { to: Route; current: boolean; children: React.ReactNode; className?: string }) {
  return (
    <a href={href(to)} onClick={(e) => onLinkClick(e, to)} className={className} aria-current={current ? 'page' : undefined}>
      {children}
    </a>
  );
}

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemePref, string> = localized(() => t().shell.themes);

function ThemeToggle() {
  const theme = useTheme();
  const t = useT();
  const Icon = theme === 'light' ? IconSun : theme === 'dark' ? IconMoon : IconMonitor;
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={() => setTheme(THEME_NEXT[theme])}
      aria-label={t.shell.themeSwitch(THEME_LABEL[theme], THEME_LABEL[THEME_NEXT[theme]])}
      title={t.shell.themeNow(THEME_LABEL[theme])}
    >
      <Icon />
    </button>
  );
}

function WalletButton() {
  const sim = useChain();
  const me = useMe();
  const route = useRoute();
  const t = useT();
  const top = t.shell.top;
  if (!me) {
    // Its words on hover too, where it keeps to its icon (a phone up to 480 px)
    return (
      <a
        href={href({ name: 'wallet' })}
        onClick={(e) => onLinkClick(e, { name: 'wallet' })}
        className="btn btn--primary btn--sm connect-btn"
        aria-label={top.connectWallet}
        title={top.connectWallet}
      >
        <IconWallet />
        <span className="connect-label">{top.connectWallet}</span>
      </a>
    );
  }
  const ksa = sim.assets.get(KSA_ASSET_ID);
  const pending = sim.pendingOf(me).length;
  return (
    <a
      href={href({ name: 'wallet' })}
      onClick={(e) => onLinkClick(e, { name: 'wallet' })}
      className="wallet-chip"
      aria-current={navKey(route) === 'wallet' ? 'page' : undefined}
      title={top.walletTitle(me)}
    >
      <AccountSeal id={me} size={20} />
      {ksa && balancesKnown(sim, me) && <Amount value={sim.balance(me, KSA_ASSET_ID)} asset={ksa} maxFrac={2} privacy />}
      <span className="sr-only">{top.myWallet}</span>
      {pending > 0 && (
        <span className="wallet-chip-pending" title={top.pending(pending)}>
          {pending}
        </span>
      )}
    </a>
  );
}

export function TopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const route = useRoute();
  const current = navKey(route);
  const sim = useChain();
  const t = useT();
  const top = t.shell.top;
  const backlog = sim.backlogStatus();
  // Its parts fitted to its window, folding where they do not fit (`fitTopBar`), before the bar is first drawn
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => (bar.current ? fitTopBar(bar.current) : undefined), []);
  return (
    <header className="topbar">
      <div ref={bar} className="topbar-inner">
        <Link to={{ name: 'overview' }} className="topbar-brand" title={t.shell.nav.overview}>
          <Wordmark />
        </Link>
        <nav className="nav" aria-label={t.shell.mainNav}>
          {NAV.map((n) => (
            <NavLink key={n.key} to={n.to} current={current === n.key}>
              {t.shell.nav[n.key]}
            </NavLink>
          ))}
          <PlaygroundLink className="nav-link" />
        </nav>
        <div className="topbar-tools">
          <SearchBox onFolded={onOpenSearch} />
          <button type="button" className="icon-btn search-btn" onClick={onOpenSearch} aria-label={t.ui.search}>
            <IconSearch />
          </button>
          {sim.kind === 'sim' ? (
            <button
              type="button"
              className={`net-chip${backlog.triggered ? ' net-chip--alarm' : ''}`}
              onClick={() => consoleStore.set(true)}
              title={top.simTitle}
              aria-label={top.simLabel(String(PARAMS.CHAIN_ID))}
            >
              <span className="net-dot" />
              devnet
              <span className="net-chip-label">· {top.sim}</span>
            </button>
          ) : (
            <button
              type="button"
              className={`net-chip net-chip--rpc net-chip--${sim.conn.state}${backlog.triggered ? ' net-chip--alarm' : ''}`}
              onClick={() => consoleStore.set(true)}
              title={`${top.nodeTitle(shownAddress(sim.config.url), t.source.state[sim.conn.state])} · ${sim.conn.ws ? t.source.push.ws : t.source.push.poll}`}
              aria-label={top.nodeLabel(sim.config.chain, t.source.state[sim.conn.state])}
            >
              <span className="net-dot" />
              {sim.config.chain}
              <span className="net-chip-label">· {top.node}</span>
            </button>
          )}
          <span className="theme-top">
            <LanguageSelect compact />
            <ThemeToggle />
          </span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url, location.href).host;
  } catch {
    return url;
  }
}

/**
 * Dual-rail gauge: two clocks and three boundaries, always present below the top bar.
 * Trimmed down on wallet routes: only the fast lane, BTC finality and the data source stay (alarms show as usual); the other
 * readings are on the overview and verify pages (UI/UX review §2.2).
 */
export function StatusStrip() {
  const sim = useChain();
  const now = useNow();
  const route = useRoute();
  const walletMode = navKey(route) === 'wallet';
  const tip = sim.tip;
  const btc = sim.btcTip;
  const backlog = sim.backlogStatus();
  // Nothing is said to match before a check has
  const indexer = indexerState(sim);
  const rpc = sim.kind === 'rpc' ? sim : null;
  const t = useT();
  const s = t.shell.strip;
  // From 1100 px the network chip names the data source, and the strip leaves it out (`.strip-source` in pages.css)
  const source = rpc ? (
    <button
      type="button"
      className="strip-item strip-source strip-btn"
      onClick={() => consoleStore.set(true)}
      title={`${shownAddress(rpc.config.url)} · ${rpc.conn.ws ? t.source.push.ws : t.source.push.poll}`}
    >
      {s.sourceNode(hostOf(rpc.config.url))}
    </button>
  ) : (
    <span className="strip-item strip-source" title={s.sourceSim}>
      {s.sourceSim}
    </span>
  );
  return (
    <div className={`strip${walletMode ? ' strip--wallet' : ''}`} role="region" aria-label={s.label}>
      <div className="strip-inner">
        {rpc?.conn.state === 'error' && (
          <button type="button" className="strip-item strip-alarm strip-btn ticking" onClick={() => consoleStore.set(true)} title={rpc.conn.message}>
            <StatusMark stage="failed" />
            {rpc.conn.lastSync ? s.disconnectedSince(timeAgo(rpc.conn.lastSync, now)) : s.disconnected}
          </button>
        )}
        {backlog.triggered && (
          <span className="strip-item strip-alarm">
            <StatusMark stage="failed" />
            {s.backlogFull}
          </span>
        )}
        <span className="strip-item">
          <BlockClock lastBlockAt={tip.time} target={nextBlockGap(sim)} height={tip.header.height} />
          {s.fast}
          <Link to={{ name: 'block', id: String(tip.header.height) }}>
            <b>#{fmtInt(tip.header.height)}</b>
          </Link>
          {/* As the BTC tip's: whole seconds, then whole minutes, while the clock beside it shows the gap filling */}
          <span className="ticking">{timeAgo(tip.time, now)}</span>
        </span>
        {!walletMode && (
          <span className="strip-item" title={t.status.stageHint.on_btc}>
            <StatusMark stage="on_btc" size={11} />
            {s.settled}
            <Link to={{ name: 'block', id: String(sim.settledHeight) }}>
              <b>#{fmtInt(sim.settledHeight)}</b>
            </Link>
          </span>
        )}
        <span className="strip-item" title={t.status.stageHint.final}>
          <StatusMark stage="final" size={11} />
          {t.status.stage.final}
          <Link to={{ name: 'block', id: String(sim.finalHeight) }}>
            <b>#{fmtInt(sim.finalHeight)}</b>
          </Link>
        </span>
        {!walletMode && (
          <>
            <span className="strip-item" title={rpc ? (rpc.btcHeight !== undefined ? s.btcTipRead : s.btcTipHint) : undefined}>
              BTC
              <Link to={{ name: 'btc', height: btc.height }}>
                <b>#{fmtInt(btc.height)}</b>
              </Link>
              {/* With a node, only the time the tip's block gives, read with the tip from the Bitcoin RPC: an estimate would read as a fact here */}
              {(!rpc || btc.timeExact) && btc.time !== undefined && <span className="ticking">{timeAgo(btc.time, now)}</span>}
            </span>
            {!backlog.triggered && backlogLate(sim, backlog) && (
              <span className="strip-item strip-warn" title={s.backlogHint}>
                {s.backlog(backlog.waited, backlog.limit)}
              </span>
            )}
            {/* A rate keeps its unit a space away, not the gap between the item's parts */}
            {rpc ? (
              <span className="strip-item" title={s.settleFeeHint}>
                {s.settleFee}
                <span>
                  <b>{sim.feeRate}</b>&nbsp;sat/vB
                </span>
              </span>
            ) : (
              <span className={`strip-item${sim.feeSpike ? ' strip-warn' : ''}`} title={s.feeHint}>
                {s.fee}
                <span>
                  <b>{sim.feeRate}</b>&nbsp;sat/vB
                </span>
                {sim.btcMinFeeRate > 1 && <span>· {s.minFee(String(sim.btcMinFeeRate))}</span>}
              </span>
            )}
            <span className="strip-item">
              <Link to={{ name: 'verify' }}>
                <IndexerLine state={indexer} height={sim.indexerHeight} />
              </Link>
            </span>
            <span className="strip-item" title={rpc ? s.pendingHint : undefined}>
              <Link to={{ name: 'ops', tab: 'mempool' }}>
                {rpc ? t.status.stage.pending : s.mempool} <b>{sim.mempool.length + sim.nativePending.length}</b>
              </Link>
            </span>
          </>
        )}
        {source}
      </div>
    </div>
  );
}

/** Mobile bottom bar: the five explorer items; on wallet routes it switches to the five items a wallet user uses every day, with the explorer entry last (UI/UX review §2.2) */
export function BottomNav() {
  const route = useRoute();
  const current = navKey(route);
  const t = useT();
  const walletMode = current === 'wallet';
  const items: { key: string; to: Route; icon: React.ReactNode; label: string; on: boolean }[] = walletMode
    ? [
        { key: 'wallet', to: { name: 'wallet' }, icon: <IconWallet size={18} />, label: t.shell.nav.wallet, on: route.name === 'wallet' || route.name === 'settings' },
        { key: 'send', to: { name: 'send' }, icon: <IconSend size={18} />, label: t.wallet.home.send, on: route.name === 'send' },
        { key: 'receive', to: { name: 'receive' }, icon: <IconReceive size={18} />, label: t.receive.title, on: route.name === 'receive' },
        { key: 'topup', to: { name: 'topup' }, icon: <IconTopUp size={18} />, label: t.topup.nav, on: route.name === 'topup' },
        { key: 'explorer', to: { name: 'overview' }, icon: <IconPulse size={18} />, label: t.shell.nav.explorer, on: false },
      ]
    : [
        { key: 'overview', to: { name: 'overview' }, icon: <IconPulse size={18} />, label: t.shell.nav.overview, on: current === 'overview' },
        { key: 'blocks', to: { name: 'blocks', page: 1 }, icon: <IconGrid size={18} />, label: t.shell.nav.blocks, on: current === 'blocks' },
        { key: 'ops', to: { name: 'ops', tab: 'latest' }, icon: <IconLayers size={18} />, label: t.shell.nav.ops, on: current === 'ops' },
        { key: 'verify', to: { name: 'verify' }, icon: <IconShield size={18} />, label: t.shell.nav.verify, on: current === 'verify' },
        { key: 'wallet', to: { name: 'wallet' }, icon: <IconWallet size={18} />, label: t.shell.nav.wallet, on: false },
      ];
  const ref = useRef<HTMLElement>(null);
  useFitLabels(ref, items.map((i) => i.label).join('|'));
  return (
    <nav ref={ref} className="bottomnav" aria-label={t.shell.mainNav}>
      {items.map((i) => (
        <NavLink key={i.key} to={i.to} current={i.on} className="">
          {i.icon}
          <span className="bottomnav-label">{i.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** A tab's label keeps to one line, set smaller where it is longer than its tab (`fitLabels`), before the bar is first drawn */
function useFitLabels(ref: React.RefObject<HTMLElement | null>, labels: string) {
  useLayoutEffect(() => (ref.current ? fitLabels(ref.current) : undefined), [ref, labels]);
}

/** The search sheet, a modal dialog as the others: its box takes focus, Tab goes round the box and the close button, and closing it takes focus back where it was */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useModalDialog(ref, open, onClose);
  if (!open) return null;
  return (
    <div className="modal-layer search-overlay">
      <div className="modal-scrim" onClick={onClose} />
      <div className="search-sheet" role="dialog" aria-modal="true" aria-label={t.ui.search} ref={ref}>
        <SearchBox size="lg" onDone={onClose} />
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t.shell.top.closeSearch}>
          <IconClose />
        </button>
      </div>
    </div>
  );
}

export function Toaster() {
  const toasts = useStore(toastStore);
  const t = useT();
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.tone}`}>
          {(item.mark || item.tone === 'qing' || item.tone === 'mo' || item.tone === 'zhu') && (
            <StatusMark stage={item.mark ?? (item.tone === 'qing' ? 'fast' : item.tone === 'mo' ? 'on_btc' : 'final')} size={16} />
          )}
          <div className="toast-body">
            <div className="toast-title">{item.title}</div>
            {item.body && <div className="toast-text">{item.body}</div>}
            {item.href && (
              <a className="link small" href={item.href}>
                {t.common.details}
              </a>
            )}
            {item.action && (
              <button type="button" className="btn btn--secondary btn--sm toast-action" onClick={item.action.run}>
                {item.action.label}
              </button>
            )}
          </div>
          <button type="button" className="icon-btn" aria-label={t.shell.toast.close} onClick={() => dismissToast(item.id)}>
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Watches operations sent by the wallet and incoming transfers: one toast per milestone reached (`opNews`), a failed operation's
 * failure alone, and a warning that does not time out when the node no longer reports a sent operation BTC-final (D-114).
 * A large incoming payment gets a "wait for BTC finality" reminder at fast-lane confirmation (SPEC §10.4).
 */
export function OpWatcher() {
  const sim = useChain();
  const watched = useStore(watchStore);
  const prefs = useWalletPrefs();
  const me = useMe();
  const seen = useRef(new Map<string, Stage>());
  const seenIncoming = useRef<Set<string> | null>(null);
  // Data source or wallet account changed: re-record what has "already been seen" and only notify about what happens afterwards
  const seededFor = useRef<{ sim: unknown; me: string | null; at: number } | null>(null);
  if (seededFor.current?.sim !== sim || seededFor.current.me !== me) {
    seededFor.current = { sim, me, at: Date.now() };
    seenIncoming.current = null;
  }

  useEffect(() => {
    const now = Date.now();
    for (const id of watched) {
      const r = sim.getOp(id);
      // Transfers from others to me (e.g. the faucet) are announced by the "incoming transfers" effect below, once per transfer
      if (!r || r.op.account !== me) continue;
      // What there is to announce against the marks announced so far: its mark as the lists show it, a failed op's its failure (`opNews`)
      const found = opNews(sim, r, seen.current);
      if (!found?.news.length) continue;
      const { news, sum } = found;
      const p = opProgress(sim, r, now);
      const m = t().shell.toast;
      const st = t().status;
      const what = opWhat(sum, (v, decimals) => (prefs.hideBalances ? '••••' : fmtAmount(v, decimals, { maxFrac: 4 })));
      const link = `#/op/${id}`;
      for (const n of news) {
        if (n === 'taken_back') toast({ tone: 'warn', title: m.finalTakenBack, body: `${what} · ${m.finalTakenBackBody}`, href: link }, 0);
        else if (n === 'failed') toast({ tone: 'danger', title: m.failed, body: `${what} · ${r.result?.message ?? ''}`, href: link });
        else if (n === 'dropped') toast({ tone: 'warn', title: m.dropped, body: r.dropped?.reason ?? '', href: link });
        else if (n === 'skipped') toast({ tone: 'warn', title: m.skipped, body: p.skipNote ?? '', href: link });
        else if (n === 'fast') toast({ tone: 'qing', title: `${st.stage.fast} · ${fmtDuration(p.fastLatency ?? 0)}`, body: `${what} · #${fmtInt(p.block?.header.height ?? 0)}`, href: link });
        else if (n === 'on_btc') toast({ tone: 'mo', title: st.stage.on_btc, body: `${what} · ${st.step.deepTodo(PARAMS.BTC_FINALITY_CONFS)}`, href: link });
        else if (n === 'deep') toast({ tone: 'mo', mark: 'deep', title: st.stage.deep, body: `${what} · ${m.deepNext}`, href: link }, 8000);
        else toast({ tone: 'zhu', title: st.stage.final, body: `${what} · ${st.step.finalDone(PARAMS.BTC_FINALITY_CONFS)}`, href: link }, 8000);
      }
    }
  }, [sim.version, watched, sim, me, prefs.hideBalances]);

  // Incoming transfers
  useEffect(() => {
    if (!me) return;
    const acc = sim.peekAccount(me);
    if (!acc) return;
    const incoming = acc.opIds.filter((id) => {
      const r = sim.getOp(id);
      return r && r.op.account !== me && r.blockHash && r.result?.ok;
    });
    if (seenIncoming.current === null) {
      seenIncoming.current = new Set(incoming);
      return;
    }
    const since = seededFor.current?.at ?? 0;
    for (const id of incoming) {
      if (seenIncoming.current.has(id)) continue;
      const r = sim.getOp(id);
      // A transfer in an asset the node has yet to name is announced once it is named, as above
      if (r?.op.action.kind === 'AssetTransfer' && sim.assets.get(r.op.action.asset)?.pending) continue;
      seenIncoming.current.add(id);
      if (!r || r.op.action.kind !== 'AssetTransfer') continue;
      // The node data source backfills earlier blocks in the background: those transfers are history, not new incoming payments
      const at = r.blockHash ? sim.getBlock(r.blockHash)?.time : undefined;
      if (at !== undefined && at < since - 15_000) continue;
      const asset = sim.assets.get(r.op.action.asset);
      if (!asset) continue;
      const big = r.op.action.asset === KSA_ASSET_ID && r.op.action.amount >= BigInt(prefs.largeThreshold);
      const m = t().shell.toast;
      const amount = prefs.hideBalances ? '••••' : fmtAmount(r.op.action.amount, asset.decimals, { maxFrac: 4 });
      toast(
        {
          tone: big ? 'warn' : 'qing',
          title: m.received(amount, asset.symbol),
          body: big ? m.large : `${m.from(sim.labels.get(r.op.account) ?? shortAddress(sim.addressOf(r.op.account) || r.op.account, 8, 4))} · ${t().status.stage.fast}`,
          href: `#/op/${id}`,
        },
        big ? 10000 : 6000,
      );
    }
  }, [sim.version, me, prefs.largeThreshold, prefs.hideBalances, sim]);

  return null;
}

/** Console: data source settings; under the simulator there are also regtest scenarios (mine BTC blocks by hand, create faults) to check how the UI behaves in each state */
export function DevConsole() {
  const open = useStore(consoleStore);
  const sim = useChain();
  const t = useT();
  const drawerRef = useRef<HTMLDivElement>(null);
  useModalDialog(drawerRef, open, () => consoleStore.set(false));
  if (!open) return null;
  const title = sim.kind === 'sim' ? t.shell.console.sim : t.shell.console.rpc;
  return (
    <div className="drawer-layer">
      <div className="modal-scrim" onClick={() => consoleStore.set(false)} />
      {/* A dialog, so neither an aside nor a header: under it the page's own top bar is the one banner */}
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={drawerRef}>
        <div className="drawer-head">
          <div>
            <div className="eyebrow">{sim.kind === 'sim' ? `devnet · chain_id ${PARAMS.CHAIN_ID}` : `${sim.config.chain} · chain_id ${sim.sdkParams.chain_id}`}</div>
            <h2 className="section-title">{title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={t.common.close} onClick={() => consoleStore.set(false)}>
            <IconClose />
          </button>
        </div>
        <div className="drawer-body">
          <SourcePanel />
          {sim.kind === 'sim' ? <Scenarios sim={sim} /> : <RpcConsole sim={sim} />}
        </div>
      </div>
    </div>
  );
}

function RpcConsole({ sim }: { sim: RpcChain }) {
  const wallet = useConnectedWallet();
  const t = useT();
  const c = t.shell.console;
  const events = sim.events.slice(-8).reverse();
  return (
    <>
      <div className="console-group">
        <p className="console-hint">{c.loaded(sim.ready ? Math.max(0, sim.tip.header.height - sim.loadedFrom + 1) : 0)}</p>
      </div>
      {wallet && (
        <div className="console-group">
          <div className="console-title">{t.shell.nav.wallet}</div>
          <p className="console-hint">
            {wallet.name} · <span className="mono">{wallet.account.address}</span>
          </p>
          <Button onClick={() => disconnectWallet(sim)}>{c.disconnect}</Button>
        </div>
      )}
      {events.length > 0 && (
        <div className="console-group">
          <div className="console-title">{c.events}</div>
          <ul className="console-log">
            {events.map((e) => (
              <li key={e.id}>
                <span className="mono muted">{fmtClock(e.at)}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** The simulator's regtest scenarios */
function Scenarios({ sim }: { sim: Devnet }) {
  const prefs = useWalletPrefs();
  const t = useT();
  const sc = t.shell.scenario;
  const [note, setNote] = useState<string | null>(null);
  const me = sim.demoId;
  const censored = sim.censored.has(me);
  const backlog = sim.backlogStatus();
  const offline = sim.producerOffline;
  const p1 = sim.producers[0];
  const stuck = sim.pendingSettlements.filter((tx) => !sim.canConfirm(tx)).length;
  const events = sim.events.filter((e) => e.kind === 'scenario' || e.kind === 'alert').slice(-8).reverse();
  const requireWallet = !prefs.connected;
  return (
    <>
      <div className="console-group">
        <div className="console-title">{sc.mine.title(Math.round(sim.btcIntervalMs / 1000))}</div>
        <div className="row wrap">
          <Button icon={<IconPickaxe />} onClick={() => sim.mineBtc(1)}>
            {sc.mine.button(1)}
          </Button>
          <Button icon={<IconPickaxe />} onClick={() => sim.mineBtc(PARAMS.BTC_FINALITY_CONFS)}>
            {sc.mine.button(PARAMS.BTC_FINALITY_CONFS)}
          </Button>
        </div>
        <p className="console-hint">{sc.mine.hint}</p>
      </div>

      <div className="console-group">
        <div className="console-title">{sc.fee.title}</div>
        <p className="console-hint">{sc.fee.hint}</p>
        <div className="row wrap">
          <Button variant={sim.feeSpike ? 'primary' : 'secondary'} onClick={() => sim.setFeeSpike(!sim.feeSpike)} aria-pressed={sim.feeSpike}>
            {sc.fee.toggle}
          </Button>
          <Button disabled={stuck === 0} onClick={() => setNote(sc.fee.cpfpDone(sim.cpfpStuck(sim.faucetId)))}>
            {stuck ? sc.fee.cpfpCount(stuck) : sc.fee.cpfp}
          </Button>
        </div>
        {(sim.feeSpike || backlog.waited > 0) && (
          <div className="console-status">
            {sc.fee.backlog(backlog.waited, backlog.limit)}
            {backlog.triggered && ` · ${sc.fee.paused}`}
          </div>
        )}
      </div>

      <div className="console-group">
        <div className="console-title">{sc.censor.title}</div>
        <p className="console-hint">{sc.censor.hint}</p>
        <Button disabled={requireWallet} variant={censored ? 'primary' : 'secondary'} onClick={() => sim.setCensored(me, !censored)} aria-pressed={censored}>
          {sc.censor.toggle}
        </Button>
      </div>

      {p1 && (
        <div className="console-group">
          <div className="console-title">{sc.offline.title}</div>
          <p className="console-hint">{sc.offline.hint(p1.name)}</p>
          <Button variant={offline ? 'primary' : 'secondary'} onClick={() => sim.setProducerOffline(offline ? null : p1.id)} aria-pressed={!!offline}>
            {sc.offline.toggle(p1.name)}
          </Button>
        </div>
      )}

      <div className="console-group">
        <div className="console-title">{t.wallet.faucet.title}</div>
        <p className="console-hint">{t.wallet.faucet.hint(PARAMS.TARGET_BLOCK_TIME)}</p>
        <Button
          disabled={requireWallet}
          onClick={() => {
            const res = sim.faucet(me);
            if (res.opId) watchOp(res.opId);
            toast({ tone: 'neutral', title: t.wallet.faucet.requested });
          }}
        >
          {t.wallet.faucet.claim}
        </Button>
      </div>

      {requireWallet && <p className="console-hint">{t.shell.console.needWallet}</p>}
      {note && (
        <p className="console-note" role="status">
          {note}
        </p>
      )}

      {events.length > 0 && (
        <div className="console-group">
          <div className="console-title">{t.shell.console.events}</div>
          <ul className="console-log">
            {events.map((e) => (
              <li key={e.id}>
                <span className="mono muted">{fmtClock(e.at)}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button
        onClick={() => {
          updateWallet({ connected: false });
          consoleStore.set(false);
        }}
        disabled={requireWallet}
      >
        {t.shell.console.disconnectDemo}
      </Button>
    </>
  );
}

/** The footer, with the language menu and the theme switch the top bar leaves out on a phone and in a narrow window; while the page connects, with no bottom bar under it */
export function Footer({ connecting = false }: { connecting?: boolean }) {
  const theme = useTheme();
  const sim = useChain();
  const t = useT();
  const f = t.shell.footer;
  return (
    <footer className={`footer${connecting ? ' footer--connecting' : ''}`}>
      <div className="footer-inner">
        <span className="footer-quote">{f.tagline}</span>
        {sim.kind === 'sim' ? (
          <>
            <span>Ksana devnet · chain_id {PARAMS.CHAIN_ID} · BTC regtest</span>
            <span>{f.fromSim}</span>
          </>
        ) : (
          <>
            <span>
              Ksana {sim.config.chain} · chain_id {sim.sdkParams.chain_id} · BTC {sim.network}
            </span>
            {/* By its server, as the status strip names it: the signet page's node is "/rpc" */}
            <span>{f.fromNode(hostOf(sim.config.url))}</span>
          </>
        )}
        {/* The commit in the monospace face of data, the word before it in the text's: set wholly in the monospace face, the word read as
            code, and in Chinese, Japanese and Korean the space after it as two */}
        {BUILD_COMMIT && (
          <a className="link small" href={commitUrl(BUILD_COMMIT)} target="_blank" rel="noreferrer" title={f.buildHint}>
            {f.build} <span className="mono">{BUILD_COMMIT}</span>
          </a>
        )}
        <PlaygroundLink className="link small" />
        <LanguageSelect />
        <span className="footer-theme">
          {t.shell.theme}
          {(['system', 'light', 'dark'] as ThemePref[]).map((pref) => (
            <button key={pref} type="button" className={`footer-theme-opt${theme === pref ? ' is-on' : ''}`} aria-pressed={theme === pref} onClick={() => setTheme(pref)}>
              {THEME_LABEL[pref]}
            </button>
          ))}
        </span>
      </div>
    </footer>
  );
}
