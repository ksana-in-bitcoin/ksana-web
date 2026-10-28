import { useEffect } from 'react';
import { explainRpcError } from '../app/SourcePanel';
import { useChain } from '../app/store';
import type { Lookup, LookupKind } from '../chain/rpc/chain';
import type { Hex } from '../chain/types';
import { NotFound } from '../pages/NotFound';
import { Button, PageHead } from './ui';
import { useT } from '../i18n';

/**
 * On-demand lookup for the node data source: when the cache lacks it, ask the node (block, operation, account) and return the lookup
 * state (`lookupShown`); once present, return undefined.
 * The simulator's data is all local, so it always returns undefined.
 */
export function useLookup(kind: LookupKind, id: string, present: boolean): Lookup | undefined {
  const sim = useChain();
  useEffect(() => {
    if (!present && sim.kind === 'rpc' && id) sim.request(kind, id);
  }, [sim, kind, id, present]);
  if (sim.kind !== 'rpc') return undefined;
  return lookupShown(sim.lookup(kind, id), present);
}

/**
 * With a node, have the times of the BTC blocks a page names read where the page has none (`RpcChain.askBtcTimes`): an operation's or a
 * block's steps on Bitcoin, a transaction's block, below the stretch loaded from the tip
 */
export function useBtcTimes(heights: readonly number[] | undefined) {
  const sim = useChain();
  const key = heights?.join(',') ?? '';
  useEffect(() => {
    if (sim.kind === 'rpc' && key) void sim.askBtcTimes(key.split(',').map(Number));
  }, [sim, key]);
}

/**
 * With a node, have what the commit transactions a page shows spend read where the page has not seen it, which their fees need
 * (`RpcChain.askCommitFees`): a settlement's, which is otherwise its reveal transaction's alone, a commit's own on its page or its
 * BTC block's. Asked again each time the page draws the chain anew, which reads only where a read failed a minute or more before
 */
export function useCommitFees(txids: readonly Hex[] | undefined) {
  const sim = useChain();
  const key = txids?.join(',') ?? '';
  const drawn = sim.getVersion();
  useEffect(() => {
    if (sim.kind === 'rpc' && key) void sim.askCommitFees(key.split(','));
  }, [sim, key, drawn]);
}

/**
 * With a node, have what carried the header of a block that needs no body read where the page knows of none
 * (`RpcChain.askHeaderCarrier`): one below the stretch loaded from the tip, opened from a list or a BTC block's page. Asked again each
 * time the page draws the chain anew, which reads only where a search failed a minute or more before
 */
export function useHeaderCarrier(hash: Hex | undefined) {
  const sim = useChain();
  const drawn = sim.getVersion();
  useEffect(() => {
    if (sim.kind === 'rpc' && hash) void sim.askHeaderCarrier(hash);
  }, [sim, hash, drawn]);
}

/**
 * What a page shows of its lookup: the lookup while it reads, even once what it asked for is in the cache, since it ends only once the
 * rest is in too (a block's settlement status and merged blocks, the names and decimals of the assets it came upon), which anything
 * that drew the page meanwhile would show without; nothing (the page itself) once the object is present otherwise; else its state
 */
export function lookupShown(lookup: Lookup | undefined, present: boolean): Lookup | undefined {
  if (lookup?.state === 'loading') return lookup;
  if (present) return undefined;
  return lookup ?? { state: 'loading' };
}

/** Full-page display for the three states: loading, missing, error; `as` names what the page reads the object for (a BTC transaction read from its block) */
export function LookupView({ kind, id, lookup, path, as }: { kind: Exclude<LookupKind, 'btc'>; id: string; lookup: Lookup; path: string; as?: 'btcTx' }) {
  const sim = useChain();
  const t = useT();
  const what = t.ui.lookupWhat[as ?? kind];
  // In the simulator the message passed in is an empty string: let NotFound use the default message for the data source
  if (lookup.state === 'missing') return <NotFound path={path} what={what} message={lookup.message || undefined} />;
  if (lookup.state === 'error') {
    // Why, in words, as the connecting screen says it, the error's own text below where it says more; once the page has said the node
    // is disconnected, the page is read again when it answers (`RpcChain.sync`)
    const explained = sim.kind === 'rpc' ? explainRpcError(lookup.error ?? new Error(lookup.message), sim.config.url) : lookup.message;
    return (
      <div className="page narrow-page page--lookup">
        <PageHead eyebrow={t.ui.lookupErrorEyebrow} title={t.ui.lookupError(what)} meta={<span className="mono">{path}</span>} />
        <p className="prose">{explained}</p>
        {lookup.message !== explained && <p className="small muted">{t.shell.connecting.detail(lookup.message)}</p>}
        {sim.kind === 'rpc' && sim.conn.state === 'error' && <p className="small">{t.ui.lookupAgain}</p>}
        <div>
          <Button variant="primary" onClick={() => sim.retry(kind, id)}>
            {t.common.retry}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="page narrow-page page--lookup" aria-busy="true">
      <PageHead eyebrow={t.ui.lookupLoadingEyebrow} title={t.ui.lookupLoading(what)} meta={<span className="mono">{path}</span>} />
      <div className="skeleton-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
