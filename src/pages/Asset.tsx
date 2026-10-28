import { useEffect } from 'react';
import { useChain } from '../app/store';
import type { RpcChain } from '../chain/rpc/chain';
import type { TokenFacts } from '../chain/rpc/tokens';
import type { AssetMeta, Hex, OpRecord } from '../chain/types';
import { KSA_ASSET_ID } from '../chain/params';
import type { Chain } from '../chain/source';
import { fmtInt } from '../lib/format';
import { AccountRef, BlockRef, FullHash, LookalikeNote } from '../components/Refs';
import { Capabilities } from '../components/AssetChanges';
import { OpsTable } from '../components/Lists';
import { HistoryReach, OlderRows, useShownRows } from '../components/HistoryReach';
import { LookupView, useLookup } from '../components/Lookup';
import { Table } from '../components/Table';
import { Amount } from '../components/Values';
import { Banner, Empty, PageHead, Section, SpecList } from '../components/ui';
import { useMe } from '../wallet/model';
import { NotFound } from './NotFound';
import { useT } from '../i18n';

/** The operations an asset's page lists, newest first: this many at first, as many more each time a reader asks */
export const HISTORY_ROWS = 50;

/**
 * An asset's page (D-123), at `#/asset/<id>`: a built-in asset, KSA among them, with the rules its issuer holds (D-121); or a KS-20 token
 * or a KS-721 collection the node's index knows (D-120), by its contract's ID. Anyone can name an asset anything, so the page gives its
 * whole ID, and says so where a name reads as KSA's or bitcoin's (`core/docs/STANDARDS.md` §7)
 */
export function AssetPage({ id: raw }: { id: string }) {
  const sim = useChain();
  const t = useT();
  const id = raw.toLowerCase();
  const valid = /^[0-9a-f]{64}$/.test(id);
  const rpc = sim.kind === 'rpc' ? sim : null;
  const builtIn = valid ? builtInAsset(sim, id) : undefined;
  const facts = valid ? (rpc?.tokenBook.facts.get(id) ?? undefined) : undefined;
  // A node's answer for the asset is read once the page opens it: the cache may know its name, not its rules
  const lookup = useLookup('asset', id, !valid || !!builtIn || !!facts);
  if (!valid) return <NotFound path={`/asset/${raw}`} what={t.ui.lookupWhat.asset} />;
  if (lookup) return <LookupView kind="asset" id={id} lookup={lookup} path={`/asset/${id}`} />;
  if (builtIn) return <BuiltInAsset asset={builtIn} />;
  if (facts && rpc) return <TokenPage rpc={rpc} id={id} facts={facts} />;
  return <NotFound path={`/asset/${id}`} what={t.ui.lookupWhat.asset} />;
}

/**
 * A built-in asset as the page knows it: in the simulator, any; on a node, KSA once its supply is read, and any other once the node
 * answered for it with its rules (an ID the node does not know as an asset keeps a name in the cache, and is no asset)
 */
function builtInAsset(sim: Chain, id: Hex): AssetMeta | undefined {
  const a = sim.assets.get(id);
  if (!a || sim.kind === 'sim') return a;
  return id === KSA_ASSET_ID ? (a.totalSupply !== undefined ? a : undefined) : a.capabilities !== undefined ? a : undefined;
}

function BuiltInAsset({ asset: a }: { asset: AssetMeta }) {
  const sim = useChain();
  const me = useMe();
  const t = useT();
  const s = t.asset.page;
  const rpc = sim.kind === 'rpc' ? sim : null;
  const ksa = a.id === KSA_ASSET_ID;
  // What the connected account may do with it, where its issuer can stop that (D-121)
  const restricted = !!a.paused || !!a.capabilities?.some((c) => c === 'freeze' || c === 'allowlist' || c === 'pause');
  useEffect(() => {
    if (rpc && me && restricted) rpc.tokenBook.wantStanding(a.id, me);
  });
  const standing = rpc && me && restricted ? rpc.tokenBook.standings.get(`${a.id}:${me}`) : undefined;
  return (
    <div className="page">
      <PageHead
        eyebrow={ksa ? s.native : s.builtIn}
        title={<AssetTitle symbol={a.symbol} name={a.name} />}
        doc={t.ui.doc.asset(a.symbol)}
        meta={<LookalikeNote asset={a} />}
      />
      {a.paused && (
        <Banner tone="warn" title={s.pausedTitle}>
          {s.paused}
        </Banner>
      )}
      <Section title={s.details}>
        <SpecList
          rows={[
            { label: 'asset_id', value: <FullHash value={a.id} />, hint: ksa ? s.ksaId : s.assetIdHint },
            { label: s.name, value: a.name },
            { label: s.symbol, value: a.symbol },
            { label: s.decimals, value: <span className="num">{a.decimals}</span> },
            a.totalSupply !== undefined && { label: s.supply, value: <Amount value={a.totalSupply} asset={a} maxFrac={a.decimals} />, hint: ksa ? s.ksaSupply : undefined },
            !ksa && a.issuer && { label: s.issuer, value: <AccountRef id={a.issuer} /> },
            !ksa && a.capabilities && { label: s.capabilities, value: <Capabilities list={a.capabilities} />, hint: s.capabilitiesHint },
            standing && { label: s.yours, value: <Standing status={standing.status} canSend={standing.canSend} canReceive={standing.canReceive} /> },
          ]}
        />
        {ksa && <p className="small soft prose section-note">{s.ksa}</p>}
      </Section>
      {/* The node lists no operation under KSA's ID: its transfers are every account's, on their own pages */}
      {!ksa && <AssetHistory of={a.id} />}
    </div>
  );
}

function AssetTitle({ symbol, name }: { symbol: string; name: string }) {
  return (
    <span>
      {symbol}
      {name && name !== symbol && <span className="soft"> · {name}</span>}
    </span>
  );
}

function Standing({ status, canSend, canReceive }: { status: string[]; canSend: boolean; canReceive: boolean }) {
  const t = useT();
  const s = t.asset.page.standing;
  return (
    <span className="row wrap gap-6">
      {status.includes('frozen') && <span className="tag tag--warn">{s.frozen}</span>}
      {status.includes('allowed') && <span className="tag tag--neutral">{s.allowed}</span>}
      <span className={`tag ${canSend ? 'tag--neutral' : 'tag--warn'}`}>{canSend ? s.canSend : s.cannotSend}</span>
      <span className={`tag ${canReceive ? 'tag--neutral' : 'tag--warn'}`}>{canReceive ? s.canReceive : s.cannotReceive}</span>
    </span>
  );
}

/**
 * A KS-20 token or a KS-721 collection: what the index adds up from its events, and its largest holders. Its contract answers for itself
 * too; the index's balances may differ from its answers where the index passed over an event of it (`irregular`)
 */
function TokenPage({ rpc, id, facts }: { rpc: RpcChain; id: Hex; facts: TokenFacts }) {
  const t = useT();
  const s = t.asset.page;
  const book = rpc.tokenBook;
  useEffect(() => {
    book.wantFacts(id, true);
    book.wantHolders(id);
    book.wantDeclaration(id);
  });
  const ks20 = facts.standard === 'KS-20';
  const token = ks20 ? book.assets.get(id) : undefined;
  const meta = token ?? book.collections.get(id);
  const symbol = meta?.symbol ?? id.slice(0, 6);
  const declaration = book.declarations.get(id);
  const holders = book.holders.get(id);
  const declaredAt = Number(facts.declared.split(':')[0]);
  const count = (v: bigint) => (token ? <Amount value={v} asset={token} size="sm" maxFrac={token.decimals} /> : <span className="num">{fmtInt(v)}</span>);
  return (
    <div className="page">
      <PageHead
        eyebrow={ks20 ? s.ks20 : s.ks721}
        title={<AssetTitle symbol={symbol} name={meta?.name ?? ''} />}
        doc={t.ui.doc.asset(symbol)}
        meta={meta && <LookalikeNote asset={meta} />}
      />
      <Banner tone="info" title={s.anyNameTitle}>
        {s.anyName}
      </Banner>
      {facts.irregular && (
        <Banner tone="warn" title={s.irregularTitle}>
          {s.irregular}
        </Banner>
      )}
      <Section title={s.details}>
        <SpecList
          rows={[
            { label: 'contract_id', value: <FullHash value={id} />, hint: <AccountRef id={id} short /> },
            { label: s.standard, value: <span className="mono">{[facts.standard, ...facts.extensions].join(' · ')}</span> },
            { label: s.name, value: facts.name ?? <span className="muted">{s.unnamed}</span> },
            { label: s.symbol, value: facts.symbol ?? <span className="muted">{s.unnamed}</span> },
            ks20 && { label: s.decimals, value: facts.decimals === null ? <span className="muted">{s.unnamed}</span> : <span className="num">{facts.decimals}</span> },
            { label: ks20 ? s.supply : s.nfts, value: count(facts.supply) },
            { label: s.holders, value: <span className="num">{fmtInt(facts.holders)}</span> },
            Number.isSafeInteger(declaredAt) && { label: s.declared, value: <BlockRef height={declaredAt} />, hint: s.declaredHint },
            declaration && { label: s.deployer, value: <AccountRef id={declaration.deployer} /> },
          ]}
        />
      </Section>
      <Section title={s.topHolders}>
        {!holders ? null : holders.holders.length === 0 ? (
          <Empty title={s.noHolders} />
        ) : (
          <>
            <Table
              caption={s.topHolders}
              columns={[
                { key: 'a', label: t.common.account, mobile: 'primary', render: (h) => <AccountRef id={h.account} /> },
                { key: 'b', label: ks20 ? t.common.balance : s.nfts, align: 'right', mobile: 'corner', render: (h) => count(h.balance) },
              ]}
              rows={holders.holders}
              rowKey={(h) => h.account}
            />
            {holders.more && <p className="small soft section-note">{s.moreHolders(fmtInt(facts.holders), holders.holders.length)}</p>}
          </>
        )}
      </Section>
      <AssetHistory of={id} />
    </div>
  );
}

/** The operations the node lists under an asset's ID (the movements its receipts record, D-122) or a token's contract (its events, D-120) */
function AssetHistory({ of }: { of: Hex }) {
  const sim = useChain();
  const t = useT();
  const shown = useShownRows(HISTORY_ROWS, of);
  const ids = sim.kind === 'rpc' ? sim.opsUnder(of) : simulatedOps(sim, of);
  // One beyond the rows shown, which tells that an older one is there
  const ops: OpRecord[] = [];
  for (let i = ids.length - 1; i >= 0 && ops.length <= shown.shown; i--) {
    const r = sim.getOp(ids[i] as Hex);
    if (r) ops.push(r);
  }
  const reading = sim.kind === 'rpc' && sim.history(of).loading;
  return (
    <Section title={t.asset.page.history}>
      <HistoryReach of={of} full={ops.length >= shown.shown} grown={shown.grown} />
      {ops.length === 0 ? !reading && <Empty title={t.asset.page.noHistory} /> : <OpsTable ops={ops.slice(0, shown.shown)} />}
      <OlderRows of={of} listed={ops.length} rows={shown} />
    </Section>
  );
}

/** The simulator's operations that move an asset: its transfers and the funds attached to calls, oldest first */
function simulatedOps(sim: Chain, asset: Hex): Hex[] {
  return sim.opOrder.filter((id) => {
    const a = sim.getOp(id)?.op.action;
    return !!a && (a.kind === 'AssetTransfer' ? a.asset === asset : !!a.funds?.some((f) => f.asset === asset));
  });
}
