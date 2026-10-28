import { useEffect, useLayoutEffect, useState, type MouseEvent } from 'react';
import { ChainMismatchError, networkOfChainId } from '@ksana/sdk';
import { type Route, useEntry, useRoute } from './router';
import { answerLink, answerSaved, shownAddress, sourceFromLink, switchSource, useAskedSource, useChain, useRecheckedSource } from './store';
import { consoleStore } from './prefs';
import { explainRpcError, rpcErrorMayPass } from './SourcePanel';
import { Button, PageHead, SpecList } from '../components/ui';
import { WebAddress } from '../components/Values';
import type { SourcePref } from '../chain/source';
import type { HistoryKey, RpcChain } from '../chain/rpc/chain';
import { type Messages, useT } from '../i18n';
import { BottomNav, DevConsole, Footer, OpWatcher, SearchOverlay, StatusStrip, Toaster, TopBar } from './Shell';
import { Overview, RECENT_OPS } from '../pages/Overview';
import { Blocks } from '../pages/Blocks';
import { BlockDetail } from '../pages/BlockDetail';
import { LATEST_ROWS, Ops } from '../pages/Ops';
import { OpDetail } from '../pages/OpDetail';
import { Account, HISTORY_ROWS as ACCOUNT_ROWS, accountIdOf } from '../pages/Account';
import { Contract, HISTORY_ROWS as CONTRACT_ROWS } from '../pages/Contract';
import { AssetPage, HISTORY_ROWS as ASSET_ROWS } from '../pages/Asset';
import { KSA_ASSET_ID } from '../chain/params';
import { Settlements } from '../pages/Settlements';
import { TxDetail } from '../pages/TxDetail';
import { BtcBlock } from '../pages/BtcBlock';
import { Verify } from '../pages/Verify';
import { SearchPage } from '../pages/SearchPage';
import { NotFound } from '../pages/NotFound';
import { Wallet } from '../pages/wallet/Wallet';
import { Send } from '../pages/wallet/Send';
import { Receive } from '../pages/wallet/Receive';
import { TopUp } from '../pages/wallet/TopUp';
import { Settings } from '../pages/wallet/Settings';

function Page() {
  const route = useRoute();
  // Two entries of one address may hold different states (a send and its result): the pages that keep one for their entry are drawn anew for each
  const entry = useEntry();
  switch (route.name) {
    case 'overview':
      return <Overview />;
    case 'blocks':
      return <Blocks page={route.page} />;
    case 'block':
      return <BlockDetail key={route.id} id={route.id} />;
    case 'ops':
      return <Ops tab={route.tab} />;
    case 'op':
      return <OpDetail key={route.id} id={route.id} />;
    case 'account':
      return <Account key={route.id} id={route.id} />;
    case 'contract':
      return <Contract key={route.id} id={route.id} />;
    case 'asset':
      return <AssetPage key={route.id} id={route.id} />;
    case 'settlements':
      return <Settlements tab={route.tab} />;
    case 'tx':
      return <TxDetail key={route.id} id={route.id} block={route.block} />;
    case 'btc':
      return <BtcBlock key={route.height} height={route.height} />;
    case 'verify':
      return <Verify />;
    case 'wallet':
      return <Wallet />;
    case 'send':
      return <Send key={`${entry}:${route.to ?? ''}:${route.nonce ?? ''}:${route.path ?? ''}`} route={route} />;
    case 'receive':
      return <Receive />;
    case 'topup':
      return <TopUp key={`${entry}:${route.exchange ?? ''}:${route.lock ?? ''}`} route={route} />;
    case 'settings':
      return <Settings />;
    case 'search':
      return <SearchPage q={route.q} />;
    case 'notfound':
      return <NotFound path={route.path} />;
  }
}

/** The listing a page shows first, and how many of its operations: the overview's and the operations page's latest, an account's, a contract's, an asset's */
export function landingList(rpc: RpcChain, route: Route): { key: HistoryKey; rows: number } | undefined {
  switch (route.name) {
    case 'overview':
      return { key: 'latest', rows: RECENT_OPS };
    case 'ops':
      return route.tab === 'latest' ? { key: 'latest', rows: LATEST_ROWS } : undefined;
    case 'account': {
      const id = accountIdOf(rpc, route.id);
      return /^[0-9a-f]{64}$/.test(id) ? { key: id, rows: ACCOUNT_ROWS } : undefined;
    }
    case 'contract':
      return /^[0-9a-f]{64}$/i.test(route.id) ? { key: route.id.toLowerCase(), rows: CONTRACT_ROWS } : undefined;
    // The node lists nothing under KSA's ID (D-122)
    case 'asset':
      return /^[0-9a-f]{64}$/i.test(route.id) && route.id.toLowerCase() !== KSA_ASSET_ID ? { key: route.id.toLowerCase(), rows: ASSET_ROWS } : undefined;
    default:
      return undefined;
  }
}

/**
 * While the node's first load runs: tells it the listing the page will show first (`RpcChain.listAhead`), whose account an account or
 * contract page shows too, which it then reads with its blocks. Laid out with the connecting screen, in the task that starts the load,
 * so that it is in before the network check that opens the load is answered
 */
function ListAhead({ rpc }: { rpc: RpcChain }) {
  const list = landingList(rpc, useRoute());
  const key = list?.key;
  const rows = list?.rows ?? 0;
  useLayoutEffect(() => {
    rpc.listAhead(key ? { key, rows } : undefined);
  }, [rpc, key, rows]);
  return null;
}

/** A first load takes a few seconds: until it takes longer than this, connecting offers no way out (retry, settings, simulator) */
const CONNECT_PATIENCE_MS = 6_000;

/** Before the node data source finishes its first sync: connecting, or the reason it cannot connect */
function Connecting({ sim }: { sim: RpcChain }) {
  const t = useT();
  const c = t.shell.connecting;
  const failed = sim.conn.state === 'error';
  const [patient, setPatient] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPatient(true), CONNECT_PATIENCE_MS);
    return () => clearTimeout(timer);
  }, []);
  const raw = sim.conn.message ?? '';
  const explained = explainRpcError(sim.conn.error ?? new Error(raw), sim.config.url);
  // A node on the other supported network (A2-11, D-106): offer to switch the page to it
  const mismatch = failed && sim.conn.error instanceof ChainMismatchError ? sim.conn.error : null;
  const nodeChain = mismatch ? networkOfChainId(mismatch.chainId) : null;
  const switchTo = nodeChain === 'devnet' || nodeChain === 'signet' ? nodeChain : null;
  return (
    <div className="page narrow-page" aria-busy={!failed}>
      <PageHead
        eyebrow={failed ? c.failedEyebrow : c.eyebrow}
        title={failed ? (mismatch ? c.wrongNetworkTitle : c.failedTitle) : c.title}
        meta={<span className="mono"><WebAddress url={shownAddress(sim.config.url)} /></span>}
      />
      {failed ? (
        <>
          <p className="prose">{explained}</p>
          {raw && raw !== explained && <p className="small muted">{c.detail(raw)}</p>}
          {/* The sync goes on every 2.5 s whatever failed: a node that comes back opens the page by itself; said only where waiting can
              help, not for a node on another network or an address that answers something else */}
          {rpcErrorMayPass(sim.conn.error ?? new Error(raw)) && <p className="small">{c.retrying}</p>}
        </>
      ) : (
        <div className="skeleton-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {(failed || patient) && (
        <div className="row wrap">
          {switchTo && (
            <Button variant="primary" onClick={() => switchSource({ kind: 'rpc', ...sim.config, chain: switchTo }, { fromLink: sourceFromLink() })}>
              {c.switchTo(switchTo)}
            </Button>
          )}
          <Button variant={switchTo ? 'secondary' : 'primary'} onClick={() => void sim.sync()}>
            {t.common.retry}
          </Button>
          <Button onClick={() => consoleStore.set(true)}>{c.settings}</Button>
          {/* Bordered as its neighbours: in most languages it takes a line of its own on a phone, where a ghost button reads as plain text */}
          <Button onClick={() => switchSource({ kind: 'sim' })}>{c.useSim}</Button>
        </div>
      )}
    </div>
  );
}

/**
 * A link naming another node than the one this copy of the page reads from, or such a node an earlier version saved: nothing is read
 * from it before the reader agrees, since everything the page shows would come from it and the wallet's signed operations would go to
 * it (store.ts, `startingSource`, `savedSource`). Each address is shown resolved against the page and without a user part
 */
function AskSource({ asked, texts: a, answer }: { asked: Extract<SourcePref, { kind: 'rpc' }>; texts: Messages['shell']['linkSource']; answer: (follow: boolean) => void }) {
  const address = (u: string) => <span className="mono"><WebAddress url={shownAddress(u)} /></span>;
  return (
    <div className="page narrow-page">
      <PageHead eyebrow={a.eyebrow} title={a.title} />
      <p className="prose">{a.body}</p>
      <SpecList
        rows={[
          { key: 'node', label: a.node, value: address(asked.url) },
          asked.indexerUrl && { key: 'indexer', label: a.indexer, value: address(asked.indexerUrl) },
          asked.btcUrl && { key: 'btc', label: a.btc, value: address(asked.btcUrl) },
          { key: 'network', label: a.network, value: asked.chain },
        ]}
      />
      <p className="small">{a.note}</p>
      <div className="row wrap">
        <Button variant="primary" onClick={() => answer(false)}>
          {a.keep}
        </Button>
        <Button onClick={() => answer(true)}>{a.follow}</Button>
      </div>
    </div>
  );
}

/** The skip link takes focus to the page's title without following its "#main", which the router would read as a page of that name */
function skipToMain(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  document.querySelector<HTMLElement>('#main .page-title')?.focus();
}

export function App() {
  const [searchOpen, setSearchOpen] = useState(false);
  const sim = useChain();
  const asked = useAskedSource();
  const rechecked = useRecheckedSource();
  const t = useT();
  const ask =
    asked?.kind === 'rpc' ? (
      <AskSource asked={asked} texts={t.shell.linkSource} answer={answerLink} />
    ) : rechecked?.kind === 'rpc' ? (
      <AskSource asked={rechecked} texts={t.shell.savedSource} answer={answerSaved} />
    ) : null;
  if (ask || (sim.kind === 'rpc' && !sim.ready)) {
    const waiting = !ask && sim.kind === 'rpc' && sim.conn.state !== 'error';
    return (
      <>
        <TopBar onOpenSearch={() => setSearchOpen(true)} />
        <main id="main" className={waiting ? 'app-main app-main--waiting' : 'app-main'}>
          {ask ?? (sim.kind === 'rpc' && <Connecting sim={sim} />)}
        </main>
        {sim.kind === 'rpc' && <ListAhead rpc={sim} />}
        <Footer connecting />
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
        <DevConsole />
      </>
    );
  }
  return (
    <>
      <a href="#main" className="skip-link" onClick={skipToMain}>
        {t.shell.skipToMain}
      </a>
      <TopBar onOpenSearch={() => setSearchOpen(true)} />
      <StatusStrip />
      <main id="main" className="app-main">
        <Page />
      </main>
      <Footer />
      <BottomNav />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <DevConsole />
      <Toaster />
      <OpWatcher />
    </>
  );
}
