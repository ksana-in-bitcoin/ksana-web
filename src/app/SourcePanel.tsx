import { useState } from 'react';
import { ChainMismatchError, KsanaRpcClient, NETWORKS, RpcError, RpcTransportError, networkOfChainId } from '@ksana/sdk';
import { currentSource, sameSource, shownAddress, sourceFromLink, switchSource, useChain, useNow, useSource } from './store';
import type { SourcePref } from '../chain/source';
import { fmtInt, timeAgo } from '../lib/format';
import { Button, Tabs } from '../components/ui';
import { WebAddress } from '../components/Values';
import { t, useT } from '../i18n';

/**
 * A node on another network than the page's (A2-11, D-106) -> what to do: choose the node's network, or connect to a node on the
 * chosen one; this page does not support mainnet yet, and a chain ID of no network is a wrong address.
 */
export function explainChainMismatch(e: ChainMismatchError): string {
  const m = t().source.error;
  const node = networkOfChainId(e.chainId);
  const chainId = String(e.chainId);
  if (node === null) return m.unknownChain(chainId);
  if (node === 'mainnet') return m.mainnet(chainId);
  const chosen = e.expected === null ? null : networkOfChainId(e.expected);
  return m.otherNetwork(node, chainId, chosen ?? `chain_id ${String(e.expected)}`);
}

/** Whether a node URL is on this page's own server (a path, or an address on the page's origin), where no cross-origin setting applies */
function onThisServer(url: string): boolean {
  if (typeof location === 'undefined') return url.startsWith('/') && !url.startsWith('//');
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/** An HTTP status the node answers for the moment only: a 5xx, a timeout (408), or too many connections (429) */
function passingStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/**
 * Whether a failure to reach the node can pass by itself, as the sync goes on asking: no answer, a passing status, a node that is busy
 * or no longer has a block as its tip moved (-32009, -32004). Not a node on another network, one without the page's methods or that
 * does not take its requests (-32601, -32602), an address that answers something other than JSON-RPC (a 404, a page), or an answer
 * of another shape (another version of the node)
 */
export function rpcErrorMayPass(e: unknown): boolean {
  if (e instanceof ChainMismatchError) return false;
  if (e instanceof RpcError) return e.code !== -32601 && e.code !== -32602;
  if (e instanceof RpcTransportError) return e.status !== undefined ? passingStatus(e.status) : !/(^|: )malformed result/.test(e.message);
  return true;
}

/**
 * Connection test error -> human-readable reason (the browser reports a cross-origin refusal as a network error and the two cannot be
 * told apart, so both possibilities are stated, except for a node on this page's own server, where no cross-origin setting applies).
 * A 5xx, 408 or 429 is the node, or the proxy in front of it, not answering for the moment, as while the node restarts or is at its
 * connection limit.
 */
export function explainRpcError(e: unknown, url: string): string {
  const m = t().source.error;
  const origin = typeof location !== 'undefined' ? location.origin : m.thisPage;
  if (e instanceof ChainMismatchError) return explainChainMismatch(e);
  if (e instanceof RpcError) return m.rpc(String(e.code), e.message);
  // The address as the page shows it: the signet page's "/rpc" with its server
  const shown = shownAddress(url);
  if (e instanceof RpcTransportError && e.status !== undefined && passingStatus(e.status)) return m.unavailable(shown, String(e.status));
  const msg = e instanceof Error ? e.message : String(e);
  if (/abort/i.test(msg)) return m.timeout(shown);
  // The SDK words its transport errors as "<method>: request failed: ..."; the regex below matches that literal
  if (/fetch|network|request failed/i.test(msg)) return onThisServer(url) ? m.offline(shown) : m.unreachable(shown, origin);
  return msg;
}

/** Data source: the in-browser simulator, or a node connected over JSON-RPC (with an optional indexer) */
/** heading=false: when embedded in a section that already has a heading (wallet settings page), no heading of its own is drawn */
export function SourcePanel({ heading = true }: { heading?: boolean } = {}) {
  const sim = useChain();
  const source = useSource();
  const now = useNow();
  const t = useT();
  const s = t.source;
  const saved = currentSource();
  const linked = sourceFromLink();
  const [kind, setKind] = useState<'sim' | 'rpc'>(source.kind);
  const [url, setUrl] = useState(saved.kind === 'rpc' ? saved.url : 'http://127.0.0.1:18545');
  const [indexerUrl, setIndexerUrl] = useState(saved.kind === 'rpc' ? (saved.indexerUrl ?? '') : '');
  const [btcUrl, setBtcUrl] = useState(saved.kind === 'rpc' ? (saved.btcUrl ?? '') : '');
  const [chain, setChain] = useState<'devnet' | 'signet'>(saved.kind === 'rpc' ? saved.chain : 'devnet');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setError(null);
    if (kind === 'sim') {
      switchSource({ kind: 'sim' });
      return;
    }
    const target = url.trim();
    if (!target) {
      setError(s.error.noUrl);
      return;
    }
    setBusy(true);
    try {
      // Try once first: if unreachable, or on another network than the one chosen (its chain ID, A2-11, D-106), stay on the
      // current data source and give the reason
      await new KsanaRpcClient(target, { timeoutMs: 6000 }).getParams(NETWORKS[chain]);
      const pref: SourcePref = { kind: 'rpc', url: target, chain, ...(indexerUrl.trim() ? { indexerUrl: indexerUrl.trim() } : {}), ...(btcUrl.trim() ? { btcUrl: btcUrl.trim() } : {}) };
      // Connecting again to the node a link named, as when it stopped answering, keeps it for this visit only, as the link had it;
      // other addresses are the reader's choice, and kept
      switchSource(pref, { fromLink: sourceFromLink() && sameSource(pref, currentSource(), window.location.href) });
    } catch (e) {
      setError(explainRpcError(e, target));
    } finally {
      setBusy(false);
    }
  };

  // The indexer's and Bitcoin RPC's addresses, kept whole and broken as the node's is
  const address = (u: string) => <span className="source-address"><WebAddress url={shownAddress(u)} /></span>;

  return (
    <div className={`console-group source-panel${heading ? '' : ' source-panel--bare'}`}>
      {heading && <div className="console-title">{s.title}</div>}
      {sim.kind === 'rpc' && (
        <div className={`source-status source-status--${sim.conn.state}`}>
          <span className="net-dot" aria-hidden="true" />
          {/* What a screen reader says as it changes: the state and the node, and why the node cannot be reached. The tip and the last
              read change with every read, and as one status the whole block was said again every few seconds while the panel was open */}
          <span role="status">
            {s.state[sim.conn.state]}{' '}
            <span className="mono small source-address"><WebAddress url={shownAddress(sim.config.url)} /></span>
          </span>
          {/* Each part kept whole, so that a narrow panel breaks the line between them rather than inside "just now" */}
          <span className="small soft">
            {sim.ready && (
              <>
                <span className="nobr">{s.tip(fmtInt(sim.tip.header.height))}</span> ·{' '}
              </>
            )}
            <span className="nobr">{sim.conn.ws ? s.push.ws : s.push.poll}</span>
            {sim.conn.lastSync && (
              <>
                {' '}
                · <span className="nobr ticking">{s.lastSync(timeAgo(sim.conn.lastSync, now))}</span>
              </>
            )}
          </span>
          {sim.conn.state === 'error' && sim.conn.message && (
            <span className="small source-error" role="alert">
              {explainRpcError(sim.conn.error ?? new Error(sim.conn.message), sim.config.url)}
            </span>
          )}
          <span className="small soft">
            {sim.hasIndexer ? (
              <>
                {s.indexer(address(sim.config.indexerUrl ?? ''))}
                {sim.indexerHalted && <> · {s.indexerHalted(sim.indexerHalted)}</>}
              </>
            ) : (
              s.noIndexer
            )}
          </span>
          <span className="small soft">{sim.config.btcUrl ? s.btc(address(sim.config.btcUrl)) : s.noBtc}</span>
          {linked && <span className="small">{s.fromLink}</span>}
        </div>
      )}
      <Tabs
        label={s.title}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'sim', label: s.kind.sim },
          { value: 'rpc', label: s.kind.rpc },
        ]}
      />
      {kind === 'sim' ? (
        <p className="console-hint">{s.simHint}</p>
      ) : (
        <form
          className="source-form"
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
        >
          <label className="field">
            <span className="field-label">{s.nodeUrl}</span>
            <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:18545" spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
            <span className="field-hint">{s.nodeUrlHint}</span>
          </label>
          <label className="field">
            <span className="field-label">{s.indexerUrl}</span>
            <input className="input mono" value={indexerUrl} onChange={(e) => setIndexerUrl(e.target.value)} placeholder="/indexer" spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
            <span className="field-hint">{s.indexerUrlHint}</span>
          </label>
          <label className="field">
            <span className="field-label">{s.btcUrl}</span>
            <input className="input mono" value={btcUrl} onChange={(e) => setBtcUrl(e.target.value)} placeholder="/btc" spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
            <span className="field-hint">{s.btcUrlHint}</span>
          </label>
          <div className="field">
            <span className="field-label">{s.network}</span>
            <Tabs
              label={s.network}
              value={chain}
              onChange={setChain}
              options={[
                { value: 'devnet', label: s.devnet },
                { value: 'signet', label: 'signet' },
              ]}
            />
          </div>
          <button type="submit" hidden />
        </form>
      )}
      {error && (
        <p className="console-note console-note--error" role="alert">
          {error}
        </p>
      )}
      <div className="row wrap">
        <Button variant="primary" onClick={() => void apply()} disabled={busy}>
          {busy ? s.state.connecting : kind === 'sim' ? (source.kind === 'sim' ? s.action.regenerate : s.action.toSim) : source.kind === 'rpc' ? s.action.reconnect : s.action.connect}
        </Button>
      </div>
    </div>
  );
}
