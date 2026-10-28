import type { ReactNode } from 'react';
import { useChain } from '../app/store';
import { SearchBox } from '../components/SearchBox';
import { ButtonLink, PageHead } from '../components/ui';
import { useT } from '../i18n';
import { addressPrefix, btcExplorerUrl, btcNetworkOf, networksText, type SearchMiss } from '../chain/views';
import { fmtInt } from '../lib/format';

export function SearchTips() {
  const sim = useChain();
  const t = useT();
  const s = t.search;
  // The examples follow the network: its address prefix, and on the node data source the names it knows (the producers'), in
  // their order ("Producer 1, Producer 2") rather than the order the page came across them
  const prefix = addressPrefix(sim);
  const names =
    sim.kind === 'rpc' ? [...new Set(sim.labels.values())].sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).join(t.format.listSep) : s.tips.name.text;
  const tips = [s.tips.height, s.tips.hash, { label: s.tips.account.label, text: s.tips.account.text(prefix) }, ...(names ? [{ label: s.tips.name.label, text: names }] : [])];
  return (
    <ul className="tips">
      {tips.map((tip) => (
        <li key={tip.label}>
          <b>{tip.label}</b>
          {s.tipSep}
          {tip.text}
        </li>
      ))}
    </ul>
  );
}

/** Why a search, or an account's page for an address, found nothing (`searchMiss`), with a Bitcoin address on a public explorer where there is one */
export function MissNote({ miss }: { miss: SearchMiss }) {
  const sim = useChain();
  const t = useT();
  const m = t.search.miss;
  if (miss.kind === 'aboveTip') {
    return <p className="prose">{miss.btcTip === undefined ? m.aboveTip(fmtInt(miss.tip)) : m.aboveTips(fmtInt(miss.tip), fmtInt(miss.btcTip))}</p>;
  }
  if (miss.kind === 'otherNetwork') return <p className="prose">{m.otherNetwork(networksText(miss.networks), btcNetworkOf(sim), addressPrefix(sim))}</p>;
  const explorer = btcExplorerUrl(sim, 'address', miss.address);
  return (
    <>
      <p className="prose">{miss.kind === 'noKey' ? m.noKey : m.notTaproot(addressPrefix(sim))}</p>
      {explorer && (
        <p>
          <a className="link" href={explorer} target="_blank" rel="noreferrer noopener">
            {m.viewAddress('mempool.space/signet')}
          </a>
        </p>
      )}
    </>
  );
}

export function NotFound({ path, what, message, title, children }: { path: string; what?: string; message?: string; title?: string; children?: ReactNode }) {
  const sim = useChain();
  const t = useT();
  const nf = t.search.notFound;
  // Not found on the node data source: the title already states the result, so don't repeat it
  const text = message ?? (!what ? nf.badPath : sim.kind === 'sim' ? nf.sim : undefined);
  return (
    <div className="page narrow-page">
      <PageHead eyebrow={nf.eyebrow} title={title ?? nf.title(what ?? nf.page)} meta={<span className="mono">{path}</span>} />
      {text && <p className="prose">{text}</p>}
      {children}
      <SearchBox size="lg" />
      <SearchTips />
      <div>
        <ButtonLink to={{ name: 'overview' }} variant="primary">
          {nf.home}
        </ButtonLink>
      </div>
    </div>
  );
}
