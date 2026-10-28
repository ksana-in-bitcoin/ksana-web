import type { ReactNode } from 'react';
import { useChain } from '../../app/store';
import type { AssetMeta, CollectionMeta, Hex } from '../../chain/types';
import { collectionsOf } from '../../chain/views';
import { fmtInt } from '../../lib/format';
import { AccountRef, AssetIssuer, AssetLink, Hash, LookalikeNote } from '../../components/Refs';
import { Amount } from '../../components/Values';
import { type Folding, useFolding } from '../../wallet/assets';
import { useT } from '../../i18n';

/** "Fold away" beside an asset the list shows only because it was kept on this device */
export function FoldButton({ folding, id }: { folding: Folding; id: Hex }) {
  const t = useT();
  if (!folding.keptOnly(id)) return null;
  return (
    <button type="button" className="link-btn small soft" onClick={() => folding.keep(id, false)} title={t.asset.wallet.foldHint}>
      {t.asset.wallet.fold}
    </button>
  );
}

function KeepButton({ folding, id }: { folding: Folding; id: Hex }) {
  const t = useT();
  return (
    <button type="button" className="link-btn small" onClick={() => folding.keep(id, true)} title={t.asset.wallet.keepHint}>
      {t.asset.wallet.keep}
    </button>
  );
}

/**
 * The assets the list folds away (`core/docs/STANDARDS.md` §7): sent by others, and neither moved by an op of this account nor kept. Each
 * with its ID and its issuer, since anyone can take any name, and a button that keeps it in the list
 */
export function FoldedAssets({ folding, rows }: { folding: Folding; rows: { asset: AssetMeta; available: bigint }[] }) {
  const t = useT();
  const w = t.asset.wallet;
  if (!rows.length) return null;
  return (
    <details className="balance-folded">
      <summary>{w.others(rows.length)}</summary>
      <p className="small soft prose">{w.othersHint}</p>
      <ul className="balance-others">
        {rows.map(({ asset: a, available }) => (
          <li key={a.id}>
            <span className="token-asset">
              <span className="token-asset-head">
                <AssetLink asset={a} className="balance-sym" />
                {a.name && a.name !== a.symbol && <span className="small soft balance-name">{a.name}</span>}
              </span>
              <Hash value={a.id} head={8} tail={8} copy className="small" />
              <AssetIssuer asset={a} className="small soft" />
            </span>
            <span className="balance-token-amount">
              <Amount value={available} asset={a} maxFrac={Math.min(a.decimals, 4)} privacy />
              <KeepButton folding={folding} id={a.id} />
            </span>
            <LookalikeNote asset={a} className="small balance-warn" />
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The KS-721 collections the account holds NFTs of, as the node's index counts them (D-123), folded away as assets are */
export function Collectibles({ me }: { me: Hex }) {
  const sim = useChain();
  const folding = useFolding(me);
  const t = useT();
  const w = t.asset.wallet;
  const rows = collectionsOf(sim, me);
  if (!rows.length) return null;
  const shown = rows.filter((r) => folding.shows(r.collection.id));
  const folded = rows.filter((r) => !folding.shows(r.collection.id));
  return (
    <div className="balance-card balance-tokens panel">
      <div className="balance-head">
        <span className="label">{t.asset.collections.title}</span>
      </div>
      {shown.length > 0 && (
        <ul className="balance-others">
          {shown.map(({ collection: k, count }) => (
            <CollectionRow key={k.id} collection={k} count={count}>
              <FoldButton folding={folding} id={k.id} />
            </CollectionRow>
          ))}
        </ul>
      )}
      {folded.length > 0 && (
        <details className="balance-folded">
          <summary>{w.otherCollections(folded.length)}</summary>
          <p className="small soft prose">{w.othersHint}</p>
          <ul className="balance-others">
            {folded.map(({ collection: k, count }) => (
              <CollectionRow key={k.id} collection={k} count={count} whole>
                <KeepButton folding={folding} id={k.id} />
              </CollectionRow>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function CollectionRow({ collection: k, count, whole = false, children }: { collection: CollectionMeta; count: bigint; whole?: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <li>
      <span className="token-asset">
        <span className="token-asset-head">
          <AssetLink asset={k} className="balance-sym" />
          {k.name && k.name !== k.symbol && <span className="small soft balance-name">{k.name}</span>}
        </span>
        {whole && <Hash value={k.id} head={8} tail={8} copy className="small" />}
        <span className="asset-issuer small soft">
          KS-721 · <AccountRef id={k.id} short />
        </span>
      </span>
      <span className="balance-token-amount">
        <span className="num">{t.asset.wallet.nfts(fmtInt(count))}</span>
        {children}
      </span>
      <LookalikeNote asset={k} className="small balance-warn" />
    </li>
  );
}
