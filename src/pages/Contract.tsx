import { useEffect, useState } from 'react';
import { useChain } from '../app/store';
import type { ExchangeLockView } from '../chain/model';
import type { AssetMeta, OpRecord } from '../chain/types';
import { KSA_ASSET_ID, KSA_DECIMALS } from '../chain/params';
import { fmtAmount, fmtInt, parseAmount } from '../lib/format';
import { AccountRef, AccountSeal, AssetIssuer, AssetLink, BlockRef, FullHash, Hash, Link, LookalikeNote } from '../components/Refs';
import { CollectionCounts } from '../components/Collections';
import { OpsTable } from '../components/Lists';
import { HistoryReach, OlderRows, useShownRows } from '../components/HistoryReach';
import { useLookup } from '../components/Lookup';
import { Amount, Figures } from '../components/Values';
import { balancesOf, collectionsOf, type BalanceRow } from '../chain/views';
import { Button, Empty, PageHead, Section, SpecList } from '../components/ui';
import { IconExternal } from '../components/icons';
import { playgroundHas, playgroundLink } from '../app/deployment';
import { NotFound } from './NotFound';
import { t, useLocale, useT } from '../i18n';

/** The calls and transfers to a contract the page lists, newest first: this many at first, as many more each time a reader asks */
export const HISTORY_ROWS = 50;

/**
 * Node data source: the node gives no contract metadata (name, methods, code, D-015). The page shows what it knows: the full ID,
 * the deployment (searched for when the page has not seen it, D-111), the assets it issued and the contract's balances, and lists
 * the calls and transfers to it from the node's operation listing (D-111), as an account page lists an account's
 */
function RpcContract({ id }: { id: string }) {
  const sim = useChain();
  const t = useT();
  const locale = useLocale();
  const ct = t.contract;
  const acc = sim.peekAccount(id);
  // A contract is an account too: its balances (a pair's reserves, an exchange contract's locked KSA) come with the account
  useLookup('account', id, !!acc);
  const shown = useShownRows(HISTORY_ROWS, id);
  const rpc = sim.kind === 'rpc' ? sim : null;
  // On every render, as a history view asks: the block holding the deployment stays while the page shows it. The standard it
  // declared, if any, is read once (D-120)
  useEffect(() => {
    rpc?.wantDeployment(id);
    rpc?.tokenBook.wantDeclaration(id);
  });
  const declared = rpc?.tokenBook.declarations.get(id)?.standards ?? [];
  const standard = rpc?.tokenBook.standardOf(id);
  const deploy = rpc?.deployOf(id);
  const code = deploy?.op.action.kind === 'Deploy' ? deploy.op.action : undefined;
  const issued = [...sim.assets.values()].filter((a) => a.issuer === id);
  const holdings = balancesOf(sim, id).filter((r) => r.available > 0n);
  const collections = collectionsOf(sim, id);
  // One beyond the rows shown, which tells that an older one is there
  const ops: OpRecord[] = [];
  const opIds = acc?.opIds ?? [];
  for (let i = opIds.length - 1; i >= 0 && ops.length <= shown.shown; i--) {
    const r = sim.getOp(opIds[i] as string);
    if (r) ops.push(r);
  }
  const reading = !!rpc && rpc.history(id).loading;
  return (
    <div className="page">
      <PageHead
        eyebrow={`${t.common.contract} · WASM`}
        title={
          <span className="acct-title">
            <AccountSeal id={id} size={36} />
            <span className="mono">
              {id.slice(0, 8)}…{id.slice(-8)}
            </span>
          </span>
        }
        doc={t.ui.doc.contract(`${id.slice(0, 8)}…${id.slice(-8)}`)}
        meta={deploy && deploy.height !== undefined ? <span>{ct.deployed(<AccountRef id={deploy.op.account} short />, <BlockRef height={deploy.height} />)}</span> : rpc?.seekingDeployment(id) ? <span>{ct.seeking}</span> : undefined}
        actions={
          rpc && playgroundHas(rpc.config.chain) ? (
            <a className="btn btn--secondary btn--sm btn--wrap" href={playgroundLink(locale, id)} target="_blank" rel="noreferrer" title={ct.playgroundHint}>
              <span>{ct.playground}</span>
              <IconExternal size={14} />
            </a>
          ) : undefined
        }
      />
      <Section title={t.common.contract}>
        <SpecList
          rows={[
            // How a deployment's ID is made; a contract another contract created (`create_contract`, D-073) has its ID another way
            { label: 'contract_id', value: <FullHash value={id} />, hint: deploy ? ct.idHint : undefined },
            code && { label: 'code_hash', value: <Hash value={code.codeHash} head={16} tail={8} copy /> },
            code && { label: ct.code, value: <span><Figures text={ct.codeBytes(fmtInt(code.codeSize))} /></span> },
            deploy && { label: ct.deployOp, value: <Hash value={deploy.id} to={{ name: 'op', id: deploy.id }} head={10} tail={6} /> },
            // A KS-20 token or a KS-721 collection: its page lists its holders (D-123)
            declared.length > 0 && {
              label: t.asset.page.standard,
              value: (
                <span className="row gap-8 wrap">
                  <span className="mono">{declared.join(' · ')}</span>
                  {standard && <Link to={{ name: 'asset', id }}>{standard === 'KS-20' ? t.asset.contract.tokenPage : t.asset.contract.collectionPage}</Link>}
                </span>
              ),
            },
            issued.length > 0 && { label: ct.issued, value: <IssuedAssets assets={issued} /> },
            holdings.length > 0 && { label: ct.holdings, value: <Holdings rows={holdings} /> },
            collections.length > 0 && { label: t.asset.collections.title, value: <CollectionCounts rows={collections} /> },
          ]}
        />
        <p className="small soft prose section-note">{t.contract.rpcNote}</p>
      </Section>
      <Section title={ct.history}>
        <HistoryReach of={id} full={ops.length >= shown.shown} grown={shown.grown} />
        {ops.length === 0 ? !reading && <Empty title={ct.noHistory} /> : <OpsTable ops={ops.slice(0, shown.shown)} perspective={id} showAccount={false} />}
        <OlderRows of={id} listed={ops.length} rows={shown} />
      </Section>
    </div>
  );
}

/** The assets a contract issued: the name only where it says more than the symbol, and a warning where it reads as KSA's or bitcoin's */
function IssuedAssets({ assets }: { assets: AssetMeta[] }) {
  const t = useT();
  return (
    <span className="stack gap-4">
      {assets.map((a) => (
        <span key={a.id}>
          <AssetLink asset={a} />
          {a.name && a.name !== a.symbol && ` · ${a.name}`}
          {a.totalSupply !== undefined && (
            <>
              {' '}
              · {t.contract.supply} <Amount value={a.totalSupply} asset={a} size="sm" maxFrac={0} />
            </>
          )}
          <LookalikeNote asset={a} className="small" />
        </span>
      ))}
    </span>
  );
}

/**
 * What a contract holds, per asset, in an account's order (KSA first, a token named like KSA or bitcoin last): a contract's asset with the
 * contract that issued it, and its warning where it is named so
 */
function Holdings({ rows }: { rows: BalanceRow[] }) {
  return (
    <span className="stack gap-8">
      {rows.map(({ asset: a, available }) => (
        <span key={a.id} className="cell-stack">
          <Amount value={available} asset={a} size="sm" maxFrac={2} />
          <AssetIssuer asset={a} className="cell-sub" />
          <LookalikeNote asset={a} className="small" />
        </span>
      ))}
    </span>
  );
}

/** What a read-only call gave: a value, or a structure's fields by name in the contract's order; or why it failed */
export type ReadAnswer = { ok: true; value: string } | { ok: true; fields: [name: string, value: string][] } | { ok: false; value: string };

/** A lock as the exchange's `get_lock` returns it, field by field in its order, its amounts with the KSA's decimals */
function lockFields(l: ExchangeLockView, decimals: number): [string, string][] {
  return [
    ['seller', l.seller],
    ['beneficiary', l.beneficiary],
    ['script', l.script],
    ['price', `${fmtAmount(l.price, decimals)} KSA/sat`],
    ['ksa', `${fmtAmount(l.ksa, decimals)} KSA`],
    ['expiry', fmtInt(l.expiry)],
    ['state', l.state],
    ...(l.paidSats !== undefined ? [['paid_sats', fmtInt(l.paidSats)] as [string, string]] : []),
    ...(l.ksaPaid !== undefined ? [['ksa_paid', `${fmtAmount(l.ksaPaid, decimals)} KSA`] as [string, string]] : []),
  ];
}

/**
 * ksana_call: a read-only call, not on-chain and free of charge. Answered here from the simulator's state, amounts with their asset's
 * decimals, and a method it does not model says so rather than answering anything
 */
export function readCall(sim: ReturnType<typeof useChain>, contract: string, method: string, arg: string): ReadAnswer {
  const m = t().contract.result;
  // Account arguments accept a Taproot address or 64 hex digits (D-092)
  const raw = arg.trim().replace(/^0x/, '');
  const who = /^[0-9a-fA-F]{64}$/.test(raw) ? raw.toLowerCase() : (sim.accountOfAddress(raw) ?? '');
  const ksaDecimals = sim.assets.get(KSA_ASSET_ID)?.decimals ?? KSA_DECIMALS;
  if (contract === sim.tokenContract) {
    const tkn = sim.assets.get(sim.tokenAsset);
    if (!tkn) return { ok: false, value: m.notIssued };
    if (method === 'total_supply') return { ok: true, value: `${fmtAmount(tkn.totalSupply ?? 0n, tkn.decimals)}\u00a0TKN` };
    if (method === 'metadata') return { ok: true, fields: [['name', tkn.name], ['symbol', tkn.symbol], ['decimals', String(tkn.decimals)]] };
    if (method === 'balance_of') {
      if (!who) return { ok: false, value: m.needAccount };
      return { ok: true, value: `${fmtAmount(sim.balance(who, sim.tokenAsset), tkn.decimals)}\u00a0TKN` };
    }
  }
  if (contract === sim.ammContract) {
    const tknDecimals = sim.assets.get(sim.tokenAsset)?.decimals ?? 0;
    const k = sim.balance(contract, KSA_ASSET_ID);
    const tk = sim.balance(contract, sim.tokenAsset);
    if (method === 'get_reserves') return { ok: true, value: `KSA ${fmtAmount(k, ksaDecimals)} · TKN ${fmtAmount(tk, tknDecimals)}` };
    if (method === 'quote') {
      // A KSA amount, 1,000 KSA when left empty, priced as the pool's swap prices it, in base units
      const inU = parseAmount(raw || '1000', ksaDecimals);
      if (inU === null || inU <= 0n) return { ok: false, value: m.needAmount(ksaDecimals) };
      const out = (tk * inU * 997n) / (k * 1000n + inU * 997n);
      return { ok: true, value: m.quote(fmtAmount(inU, ksaDecimals), fmtAmount(out, tknDecimals)) };
    }
  }
  if (contract === sim.triggerContract) {
    if (method === 'asset_id') return { ok: true, value: sim.passAsset };
    if (method === 'claimed') {
      if (!who) return { ok: false, value: m.needAccount };
      return { ok: true, value: `${fmtInt(Number(sim.balance(who, sim.passAsset)))}\u00a0PASS` };
    }
  }
  if (sim.kind === 'sim' && contract === sim.exchangeContract) {
    const { locks, available } = sim.exchangeState();
    if (method === 'get_lock') {
      if (!/^\d+$/.test(raw)) return { ok: false, value: m.needLock };
      const l = sim.getLock(contract, BigInt(raw));
      // The contract fails the call for a lock that is not there
      return l ? { ok: true, fields: lockFields(l, ksaDecimals) } : { ok: false, value: m.noLock };
    }
    if (method === 'lock_of_script') {
      if (!/^(?:[0-9a-fA-F]{2})+$/.test(raw)) return { ok: false, value: m.needScript };
      const l = locks.find((x) => x.script === raw.toLowerCase());
      return { ok: true, value: l ? l.id.toString() : 'null' };
    }
    if (method === 'balance' || method === 'lock_count' || method === 'locks_of') {
      if (!who) return { ok: false, value: m.needSeller };
      const ids = locks.filter((x) => x.seller === who).map((x) => x.id.toString());
      if (method === 'balance') return { ok: true, value: `${fmtAmount(available(who), ksaDecimals)}\u00a0KSA` };
      return { ok: true, value: method === 'lock_count' ? fmtInt(ids.length) : `[${ids.join(', ')}]` };
    }
  }
  return { ok: false, value: m.notSimulated };
}

export function Contract({ id }: { id: string }) {
  const sim = useChain();
  const t = useT();
  const ct = t.contract;
  const argHint: Record<string, string | undefined> = ct.argHint;
  const c = sim.contracts.get(id.toLowerCase());
  const [method, setMethod] = useState<string>(c?.readMethods[0] ?? '');
  const [arg, setArg] = useState('');
  const [result, setResult] = useState<ReadAnswer | null>(null);
  if (!c) {
    if (sim.kind === 'rpc' && /^[0-9a-f]{64}$/i.test(id)) return <RpcContract id={id.toLowerCase()} />;
    return <NotFound path={`/contract/${id}`} what={t.ui.lookupWhat.contract} />;
  }
  const issued = [...sim.assets.values()].filter((a) => a.issuer === c.id);
  const calls: OpRecord[] = [];
  for (let i = sim.opOrder.length - 1; i >= 0 && calls.length < 20; i--) {
    const r = sim.getOp(sim.opOrder[i] as string);
    if (r && r.op.action.kind === 'Call' && r.op.action.contract === c.id) calls.push(r);
  }
  const holdings = balancesOf(sim, c.id).filter((r) => r.available > 0n);

  return (
    <div className="page">
      <PageHead
        eyebrow={`${t.common.contract} · WASM`}
        title={
          <span className="acct-title">
            <AccountSeal id={c.id} size={36} />
            <span>{c.name}</span>
          </span>
        }
        doc={t.ui.doc.contract(c.name)}
        meta={<><Hash value={c.id} head={10} tail={6} copy /><span>{ct.deployed(<AccountRef id={c.deployer} short />, <BlockRef height={c.deployedAt} />)}</span></>} />
      <div className="grid-2">
        <Section title={t.common.contract}>
          <SpecList
            rows={[
              { label: 'contract_id', value: <FullHash value={c.id} />, hint: ct.idHint },
              { label: 'code_hash', value: <Hash value={c.codeHash} head={16} tail={8} copy /> },
              { label: ct.code, value: <span><Figures text={ct.codeBytes(fmtInt(c.codeSize))} /></span> },
              { label: ct.deployOp, value: <Hash value={c.deployOp} to={{ name: 'op', id: c.deployOp }} head={10} tail={6} /> },
              {
                label: ct.methods,
                value: (
                  <span className="row wrap gap-6">
                    {c.methods.map((m) => (
                      <code key={m} className="inline">
                        {m}
                      </code>
                    ))}
                  </span>
                ),
              },
              issued.length > 0 && { label: ct.issued, value: <IssuedAssets assets={issued} /> },
              holdings.length > 0 && { label: ct.holdings, value: <Holdings rows={holdings} /> },
            ]}
          />
        </Section>
        <Section title={ct.read.title} eyebrow={ct.read.eyebrow}>
          <form
            className="call-form panel panel-pad"
            onSubmit={(e) => {
              e.preventDefault();
              setResult(readCall(sim, c.id, method, arg));
            }}
          >
            <div className="field">
              <label htmlFor="call-method" className="field-label">
                {ct.read.method}
              </label>
              <select id="call-method" className="input" value={method} onChange={(e) => { setMethod(e.target.value); setResult(null); }}>
                {c.readMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {argHint[method] && (
              <div className="field">
                <label htmlFor="call-arg" className="field-label">
                  {ct.read.arg}
                </label>
                <input id="call-arg" className="input mono" placeholder={argHint[method]} value={arg} onChange={(e) => setArg(e.target.value)} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
              </div>
            )}
            <Button type="submit" variant="primary">
              {ct.read.call}
            </Button>
            {result && (
              <output className={`call-result${result.ok ? '' : ' call-result--err'}`} htmlFor="call-method call-arg">
                <span className="label">{result.ok ? ct.read.ok : ct.read.error}</span>
                {'fields' in result ? (
                  // A structure field by field, a long value (an account, a script) on a line of its own below its name
                  <span className="kv">
                    {result.fields.map(([name, value]) => (
                      <span key={name} className="kv-row">
                        <span className="kv-k">{name}</span>
                        <span className="mono small">{value}</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  // A value is data; why a call failed is a sentence, in the text's font
                  <span className={result.ok ? 'mono' : undefined}>{result.value}</span>
                )}
              </output>
            )}
          </form>
        </Section>
      </div>
      <Section title={ct.recent}>{calls.length === 0 ? <Empty title={ct.noCalls} /> : <OpsTable ops={calls} />}</Section>
    </div>
  );
}
