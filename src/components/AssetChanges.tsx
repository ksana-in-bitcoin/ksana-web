import { useEffect, type ReactNode } from 'react';
import { toHex } from '@ksana/sdk';
import { useChain } from '../app/store';
import type { TokenEvent } from '../chain/rpc/tokens';
import type { AssetChange, AssetMeta, Hex, VmEvent } from '../chain/types';
import type { Chain } from '../chain/source';
import { assetOf, type TransferView } from '../chain/views';
import { fmtDateTime } from '../lib/format';
import { AccountRef, AssetLink, Hash } from './Refs';
import { Amount } from './Values';
import { type Messages, useT } from '../i18n';

const ZERO_ACCOUNT = '00'.repeat(32);

/**
 * The changes an op made to built-in assets, in the order it made them, as the node's receipt records them (D-122): their movements and
 * their issuers' actions (D-121). KSA's fees, unlocks and rewards are not among them; `null` is a receipt that did not record them
 */
export function AssetChanges({ changes }: { changes: AssetChange[] | null }) {
  const t = useT();
  if (changes === null) return <span className="small soft">{t.asset.op.unrecorded}</span>;
  return (
    <ul className="events">
      {changes.map((ch, i) => (
        <li key={i}>
          <span className="event-name" title={ch.kind}>
            {changeName(ch, t.asset.op.kind)}
          </span>
          <Field k="asset">
            <AssetName id={ch.asset} />
          </Field>
          <ChangeFields change={ch} />
        </li>
      ))}
    </ul>
  );
}

function changeName(ch: AssetChange, k: Messages['asset']['op']['kind']): string {
  switch (ch.kind) {
    case 'freeze':
      return ch.frozen ? k.freeze : k.unfreeze;
    case 'allow':
      return ch.allowed ? k.allow : k.disallow;
    case 'pause':
      return ch.paused ? k.pause : k.resume;
    default:
      return k[ch.kind];
  }
}

function ChangeFields({ change: ch }: { change: AssetChange }) {
  const sim = useChain();
  const t = useT();
  const asset = sim.assets.get(ch.asset);
  switch (ch.kind) {
    case 'transfer':
    case 'funds':
    case 'payout':
      return (
        <>
          <Field k="from">
            <AccountRef id={ch.from} short />
          </Field>
          <Field k="to">
            <AccountRef id={ch.to} short />
          </Field>
          <Field k="amount">
            <Units value={ch.amount} asset={asset} />
          </Field>
        </>
      );
    case 'issue':
      return (
        <>
          <Field k="to">
            <AccountRef id={ch.to} short />
          </Field>
          <Field k="amount">
            <Units value={ch.amount} asset={asset} />
          </Field>
        </>
      );
    case 'burn':
      return (
        <>
          <Field k="from">
            <AccountRef id={ch.from} short />
          </Field>
          <Field k="amount">
            <Units value={ch.amount} asset={asset} />
          </Field>
        </>
      );
    // What an asset is created with, and what a renouncement gave up of what it still had
    case 'create':
    case 'renounce':
      return (
        <Field k="capabilities">
          <Capabilities list={ch.capabilities} none={ch.kind === 'renounce' ? t.asset.op.none : undefined} />
        </Field>
      );
    case 'freeze':
    case 'allow':
      return (
        <Field k="account">
          <AccountRef id={ch.account} short />
        </Field>
      );
    case 'pause':
      return null;
  }
}

/** The capabilities an asset's issuing contract holds (D-121), in the node's order: none for a fixed supply no one can stop, unless `none` says otherwise */
export function Capabilities({ list, none }: { list: string[]; none?: string }) {
  const t = useT();
  const c = t.asset.page.caps;
  if (!list.length) return <span>{none ?? c.none}</span>;
  return (
    <span className="row wrap gap-6">
      {list.map((cap) => (
        <span key={cap} className="tag tag--neutral" title={cap}>
          {c[cap as keyof typeof c] ?? cap}
        </span>
      ))}
    </span>
  );
}

/** A standard's event of a contract that declared the standard (D-120), read from its bytes: null for any other event, undefined while the page does not know the contract's standard */
export function tokenEventOf(sim: Chain, e: VmEvent): TokenEvent | null | undefined {
  return sim.kind === 'rpc' ? sim.tokenBook.eventOf(e) : null;
}

/** Asks the node for the declarations of the contracts whose events the page cannot read yet */
export function useDeclarations(events: VmEvent[]): void {
  const sim = useChain();
  useEffect(() => {
    if (sim.kind !== 'rpc') return;
    for (const e of events) {
      const contract = e.fields.contract;
      if (contract && sim.tokenBook.eventOf(e) === undefined) sim.tokenBook.wantDeclaration(contract);
    }
  });
}

/** A KS-20 or a KS-721 event, read by the standard's layout (`core/docs/STANDARDS.md`) */
export function TokenEventItem({ te }: { te: TokenEvent }) {
  const sim = useChain();
  const t = useT();
  const c = t.asset.op;
  const book = sim.kind === 'rpc' ? sim.tokenBook : undefined;
  const token = te.standard === 'KS-20' ? book?.assets.get(te.contract) : undefined;
  const meta = token ?? (te.standard === 'KS-721' ? book?.collections.get(te.contract) : undefined);
  const account = (bytes: Uint8Array | null, none: string) => {
    if (bytes === null) return <span className="soft">{none}</span>;
    return <AccountRef id={toHex(bytes)} short />;
  };
  // A mint is a transfer from the zero account, a burn one to it
  const party = (bytes: Uint8Array, zero: string) => (toHex(bytes) === ZERO_ACCOUNT ? <span className="tag tag--neutral">{zero}</span> : account(bytes, ''));
  const e = te.event;
  let fields: ReactNode = null;
  switch (e.kind) {
    case 'Standards':
      fields = (
        <Field k="ids">
          <span className="mono small">{e.ids.join(', ')}</span>
        </Field>
      );
      break;
    case 'Metadata':
      fields = (
        <>
          <Field k="name">{e.name}</Field>
          <Field k="symbol">{e.symbol}</Field>
          {'decimals' in e && (
            <Field k="decimals">
              <span className="num">{e.decimals}</span>
            </Field>
          )}
        </>
      );
      break;
    case 'Transfer':
      fields = (
        <>
          <Field k="from">{party(e.from, c.minted)}</Field>
          <Field k="to">{party(e.to, c.burned)}</Field>
          {'amount' in e ? (
            <Field k="amount">
              <Units value={e.amount} asset={token} />
            </Field>
          ) : (
            <Field k="token_id">
              <Hash value={toHex(e.token_id)} head={8} tail={6} copy />
            </Field>
          )}
        </>
      );
      break;
    case 'Approve':
      fields = (
        <>
          <Field k="owner">{account(e.owner, '')}</Field>
          <Field k="spender">{account(e.spender, c.cleared)}</Field>
          {'amount' in e ? (
            <>
              <Field k="amount">
                <Units value={e.amount} asset={token} />
              </Field>
              <Field k="expires_at">
                <Expiry at={e.expires_at} />
              </Field>
            </>
          ) : (
            <Field k="token_id">
              <Hash value={toHex(e.token_id)} head={8} tail={6} copy />
            </Field>
          )}
        </>
      );
      break;
    case 'Minter':
      fields = (
        <>
          <Field k="previous">{account(e.previous, c.none)}</Field>
          <Field k="minter">{account(e.minter, c.ended)}</Field>
        </>
      );
      break;
    case 'Operator':
      fields = (
        <>
          <Field k="owner">{account(e.owner, '')}</Field>
          <Field k="operator">{account(e.operator, '')}</Field>
          <Field k="approved">{e.approved ? c.yes : c.no}</Field>
          <Field k="expires_at">
            <Expiry at={e.expires_at} />
          </Field>
        </>
      );
      break;
    case 'Uri':
      fields = <Field k="token_id">{e.token_id === null ? <span className="soft">{c.allTokens}</span> : <Hash value={toHex(e.token_id)} head={8} tail={6} copy />}</Field>;
      break;
  }
  return (
    <li>
      <span className="mono event-name">{e.kind}</span>
      <Field k={te.standard}>{meta && !meta.pending ? <AssetLink asset={meta} /> : <Hash value={te.contract} head={6} tail={4} to={{ name: 'asset', id: te.contract }} />}</Field>
      {fields}
    </li>
  );
}

/** The arguments of a known KS-20 token's `transfer(to, amount)` call, read from their Borsh (`transferOf`) */
export function TransferArgs({ transfer: tr }: { transfer: TransferView }) {
  return (
    <>
      <span className="kv-row">
        <span className="kv-k">to</span>
        <AccountRef id={tr.to} />
      </span>
      <span className="kv-row">
        <span className="kv-k">amount</span>
        <Units value={tr.amount} asset={tr.asset} />
      </span>
    </>
  );
}

/** An approval's or an operator's expiry: a block timestamp in seconds (`core/docs/STANDARDS.md` §3.5), or never */
function Expiry({ at }: { at: bigint | null }) {
  const t = useT();
  if (at === null) return <span className="soft">{t.asset.op.never}</span>;
  const ms = Number(at) * 1000;
  return <span className="num">{Number.isSafeInteger(ms) ? fmtDateTime(ms) : at.toString()}</span>;
}

function Field({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span className="event-field">
      <span className="kv-k">{k}</span>
      {children}
    </span>
  );
}

/** An asset by its symbol, linked to its page; by its ID while the page has yet to name it */
function AssetName({ id }: { id: Hex }) {
  const sim = useChain();
  const a = assetOf(sim, id);
  return a && !a.pending ? <AssetLink asset={a} /> : <Hash value={id} head={6} tail={4} to={{ name: 'asset', id }} />;
}

/** An amount in an asset's units; in base units while the page does not know the asset */
function Units({ value, asset }: { value: bigint; asset: AssetMeta | undefined }) {
  return asset ? <Amount value={value} asset={asset} size="sm" maxFrac={asset.decimals} /> : <span className="num">{value.toString()}</span>;
}
