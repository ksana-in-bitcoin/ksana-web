import { useEffect, useState } from 'react';
import { navigate } from '../app/router';
import { useChain } from '../app/store';
import { useMe } from '../wallet/model';
import { LookupView, useLookup } from '../components/Lookup';
import { accountMiss, addressPrefix, balancesOf, collectionsOf, lockedFeesOf, namedProducer } from '../chain/views';
import type { OpRecord } from '../chain/types';
import { KSA_ASSET_ID } from '../chain/params';
import { fmtInt, shortAddress } from '../lib/format';
import { AccountSeal, AssetIssuer, AssetLink, BlockRef, CopyButton, LookalikeNote } from '../components/Refs';
import { CollectionsTable } from '../components/Collections';
import { OpsTable } from '../components/Lists';
import { HistoryReach, OlderRows, useShownRows } from '../components/HistoryReach';
import { Table, type Column } from '../components/Table';
import { Amount } from '../components/Values';
import { ButtonLink, Empty, PageHead, Section, SpecList, Tabs } from '../components/ui';
import { IconSend } from '../components/icons';
import type { LockedFee } from '../chain/types';
import { MissNote, NotFound } from './NotFound';
import { useT } from '../i18n';

/** The operation history lists this many of the latest */
export const HISTORY_ROWS = 50;

/** The account a page's address names: it may hold a Taproot address or 64 hex digits (D-092); lowercased, and checked by the caller */
export function accountIdOf(sim: { accountOfAddress(address: string): string | undefined }, raw: string): string {
  return /^[0-9a-fA-F]{64}$/.test(raw) ? raw.toLowerCase() : (sim.accountOfAddress(raw) ?? raw.toLowerCase());
}

export function Account({ id: raw }: { id: string }) {
  const sim = useChain();
  const mine = useMe();
  const t = useT();
  const a = t.account;
  const id = accountIdOf(sim, raw);
  const [dir, setDir] = useState<'all' | 'out' | 'in'>('all');
  const shown = useShownRows(HISTORY_ROWS, `${id}:${dir}`);
  const valid = /^[0-9a-f]{64}$/.test(id);
  const acc = valid ? sim.peekAccount(id) : undefined;
  const lookup = useLookup('account', id, !valid || !!acc);
  // An account the page has come to know as a contract has a page of its own, which lists the calls to it (the simulator's once its
  // deployment has run)
  const contract = valid && (sim.kind === 'rpc' ? sim.isContract(id) : sim.contracts.has(id));
  useEffect(() => {
    if (contract) navigate({ name: 'contract', id }, { replace: true });
  }, [contract, id]);
  if (!valid) {
    // Not asked of the node, and said why, in place of the simulator's word on old links: a Bitcoin address that is no account here,
    // of another Bitcoin network, not a Taproot one or one that no key stands behind; anything else, neither an address nor an ID
    const miss = accountMiss(sim, raw);
    return (
      <NotFound path={`/account/${raw}`} what={t.ui.lookupWhat.account} message={miss ? '' : t.search.notFound.badAccount(addressPrefix(sim))}>
        {miss && <MissNote miss={miss} />}
      </NotFound>
    );
  }
  if (lookup) return <LookupView kind="account" id={id} lookup={lookup} path={`/account/${id}`} />;
  const producer = sim.producers.find((p) => p.id === id);
  // A producer named on the node data source ("Producer 2") is said to be one by its name: no "Producer" beside it as well
  const named = !!producer && namedProducer(sim, id, mine);
  const label = sim.labels.get(id);
  const me = mine === id;
  // The account is the Taproot address (D-092): the address is the primary form, hex is for contract arguments; contracts only have hex
  const address = sim.addressOf(id);
  const balances = balancesOf(sim, id);
  const collections = collectionsOf(sim, id);
  const fees = producer ? lockedFeesOf(sim, id) : undefined;
  const ksa = sim.assets.get(KSA_ASSET_ID);

  // One beyond the rows shown, which tells that an older one is there
  const ops: OpRecord[] = [];
  if (acc) {
    for (let i = acc.opIds.length - 1; i >= 0 && ops.length <= shown.shown; i--) {
      const r = sim.getOp(acc.opIds[i] as string);
      if (!r) continue;
      const out = r.op.account === id;
      if (dir === 'out' && !out) continue;
      if (dir === 'in' && out) continue;
      ops.push(r);
    }
  }
  const sent = acc ? acc.opIds.filter((x) => sim.getOp(x)?.op.account === id).length : 0;
  const reading = sim.kind === 'rpc' && sim.history(id).loading;
  const short = address ? `${address.slice(0, 12)}…${address.slice(-8)}` : `${id.slice(0, 8)}…${id.slice(-8)}`;

  return (
    <div className="page">
      <PageHead
        eyebrow={producer && !named ? `${t.common.account} · ${t.common.producer}` : t.common.account}
        title={
          <span className="acct-title">
            <AccountSeal id={id} size={36} />
            <span>{me ? a.mine : (label ?? <span className="mono">{short}</span>)}</span>
          </span>
        }
        doc={me ? a.mine : (label ?? t.ui.doc.account(short))}
        meta={
          <>
            {producer && sim.kind === 'sim' && <span className="tag">{a.producerFee(producer.minTokenFee.toString())}</span>}
            {producer && sim.kind === 'rpc' && !named && <span className="tag">{t.common.producer}</span>}
            {sim.censored.has(id) && <span className="tag tag--warn">{a.censored}</span>}
          </>
        }
        actions={
          !!mine &&
          !me && (
            <ButtonLink to={{ name: 'send', to: id }} variant="primary" icon={<IconSend />}>
              {a.sendTo}
            </ButtonLink>
          )
        }
      />

      <div className="addr-plate panel">
        {address && (
          <div className="addr-row">
            <span className="addr-label">{a.address}</span>
            <span className="mono addr-value">{address}</span>
            <CopyButton text={address} label={a.copyAddress} />
          </div>
        )}
        <div className="addr-row">
          <span className="addr-label">{a.hex}</span>
          <span className={`mono addr-value${address ? ' soft' : ''}`}>{id}</span>
          <CopyButton text={id} label={a.copyHex} />
        </div>
        <p className="addr-note small muted">{a.addrNote}</p>
      </div>

      <div className="grid-2">
        <Section title={t.common.balance}>
          {balances.length === 0 ? (
            <Empty title={a.noAssets} />
          ) : (
            <Table
              caption={a.balanceCaption}
              columns={[
                {
                  key: 'asset',
                  label: t.common.asset,
                  mobile: 'primary',
                  className: 'balance-asset',
                  render: (b) => (
                    <span className="cell-stack">
                      <AssetLink asset={b.asset} />
                      {b.asset.name && b.asset.name !== b.asset.symbol && <span className="cell-sub">{b.asset.name}</span>}
                      <AssetIssuer asset={b.asset} className="cell-sub" />
                      <LookalikeNote asset={b.asset} className="small" />
                    </span>
                  ),
                },
                { key: 'v', label: a.available, align: 'right', mobile: 'corner', render: (b) => <Amount value={b.available} asset={b.asset} privacy={me} maxFrac={b.asset.decimals} /> },
              ]}
              rows={balances}
              rowKey={(b) => b.asset.id}
            />
          )}
          {/* The KS-721 collections it holds NFTs of (D-123) */}
          {collections.length > 0 && <CollectionsTable rows={collections} />}
          {fees && ksa && (
            <SpecList
              rows={[
                { label: a.lockedFees, value: <Amount value={fees.locked} asset={ksa} maxFrac={4} />, hint: a.lockedFeesHint },
                // The node lists only the fees still locked, so a total of those unlocked is the simulator's alone, which keeps the whole
                // history: on a node it would count only what this page saw unlocked, 0 on opening
                sim.kind !== 'rpc' && { label: a.unlockedTotal, value: <Amount value={fees.unlocked} asset={ksa} maxFrac={4} /> },
              ]}
            />
          )}
        </Section>
        <Section title={t.common.status}>
          <SpecList
            rows={[
              // What the nonce is, said below it: on a node a row of the operations included beside it gave the same figure again, which is
              // no count of them, as a path C operation refused for its nonce or its signature is included without using one
              { label: 'nonce', value: <span className="num">{acc?.nonce ?? 0}</span>, hint: a.nonceHint },
              // The simulator keeps every operation, those sent and not yet included as well
              sim.kind !== 'rpc' && { label: a.sent, value: <span className="num">{fmtInt(sent)}</span> },
              producer && sim.kind === 'sim' && { label: a.policy, value: <span className="small">{a.policyValue(producer.minTokenFee.toString())}</span> },
            ]}
          />
        </Section>
      </div>

      {fees && fees.rows.length > 0 && ksa && <LockedFees rows={fees.rows.slice(0, 12)} />}

      <Section
        title={a.history}
        actions={
          <Tabs
            label={a.direction}
            value={dir}
            onChange={setDir}
            options={[
              { value: 'all', label: t.common.all },
              { value: 'out', label: a.out },
              { value: 'in', label: t.ui.received },
            ]}
          />
        }
      >
        <HistoryReach of={id} full={ops.length >= shown.shown} grown={shown.grown} />
        {ops.length === 0 ? (
          !reading && <Empty title={a.noRecords} />
        ) : (
          <OpsTable ops={ops.slice(0, shown.shown)} perspective={id} showAccount={false} />
        )}
        <OlderRows of={id} listed={ops.length} rows={shown} />
      </Section>
    </div>
  );
}

function LockedFees({ rows }: { rows: LockedFee[] }) {
  const sim = useChain();
  const t = useT();
  const l = t.account.locked;
  const ksa = sim.assets.get(KSA_ASSET_ID);
  if (!ksa) return null;
  const cols: Column<LockedFee>[] = [
    {
      key: 'b',
      label: t.common.block,
      mobile: 'primary',
      render: (f) => {
        // Another producer's block, which this account landed on Bitcoin (D-095): named by its producer
        const producer = f.asCarrier ? sim.getBlock(f.blockHash)?.header.producer : undefined;
        return producer ? (
          <span className="cell-stack">
            <BlockRef height={f.height} hash={f.blockHash} />
            <span className="cell-sub">{l.carriedFor(sim.labels.get(producer) ?? shortAddress(sim.addressOf(producer), 6, 4))}</span>
          </span>
        ) : (
          <BlockRef height={f.height} hash={f.blockHash} />
        );
      },
    },
    { key: 'a', label: l.fee, align: 'right', render: (f) => <Amount value={f.amount} asset={ksa} size="sm" maxFrac={3} /> },
    {
      key: 's',
      label: t.common.status,
      align: 'right',
      mobile: 'end',
      render: (f) =>
        f.unlocked ? (
          <span className="small">
            {l.unlocked}
            {f.unlockHeight !== undefined && (
              <>
                {' '}
                · <BlockRef height={f.unlockHeight} />
              </>
            )}
          </span>
        ) : (
          <span className="small soft">{f.height <= sim.settledHeight ? l.settled : l.waiting}</span>
        ),
    },
  ];
  return (
    <Section title={l.title}>
      <Table caption={l.caption} columns={cols} rows={rows} rowKey={(f) => f.blockHash} rowTo={(f) => ({ name: 'block', id: f.blockHash })} />
    </Section>
  );
}
