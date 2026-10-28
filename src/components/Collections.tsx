import type { CollectionMeta } from '../chain/types';
import { fmtInt } from '../lib/format';
import { AccountRef, AssetLink, LookalikeNote } from './Refs';
import { Table } from './Table';
import { useT } from '../i18n';

/**
 * The KS-721 collections an account holds NFTs of, and how many of each, as the node's index counts them (D-123): each by its symbol,
 * linked to its page, with its contract, since another collection can take the same name (`core/docs/STANDARDS.md` §7)
 */
export function CollectionsTable({ rows }: { rows: { collection: CollectionMeta; count: bigint }[] }) {
  const t = useT();
  const c = t.asset.collections;
  return (
    <Table
      caption={c.caption}
      columns={[
        {
          key: 'c',
          label: c.collection,
          mobile: 'primary',
          className: 'balance-asset',
          render: ({ collection: k }) => (
            <span className="cell-stack">
              <AssetLink asset={k} />
              {k.name && k.name !== k.symbol && <span className="cell-sub">{k.name}</span>}
              <span className="asset-issuer cell-sub">
                KS-721 · <AccountRef id={k.id} short />
              </span>
              <LookalikeNote asset={k} className="small" />
            </span>
          ),
        },
        { key: 'n', label: c.count, align: 'right', mobile: 'corner', render: (r) => <span className="num">{fmtInt(r.count)}</span> },
      ]}
      rows={rows}
      rowKey={(r) => r.collection.id}
      rowTo={(r) => ({ name: 'asset', id: r.collection.id })}
    />
  );
}

/** The same, as a compact list beside other details: how many NFTs of each collection, by its symbol, linked to its page */
export function CollectionCounts({ rows }: { rows: { collection: CollectionMeta; count: bigint }[] }) {
  return (
    <span className="stack gap-8">
      {rows.map(({ collection: k, count }) => (
        <span key={k.id} className="cell-stack">
          <span>
            <span className="num">{fmtInt(count)}</span> <AssetLink asset={k} />
          </span>
          <span className="asset-issuer cell-sub">
            KS-721 · <AccountRef id={k.id} short />
          </span>
          <LookalikeNote asset={k} className="small" />
        </span>
      ))}
    </span>
  );
}
