/**
 * The wallet's single list of assets (D-123): built-in assets and KS-20 tokens in one list, KS-721 collections beside it.
 *
 * Anyone can send any account an asset named anything, so the wallet folds away those nobody asked for (`core/docs/STANDARDS.md` §7). An
 * account asked for an asset when an op it signed moved it: sent it, attached it, called its contract, deployed it, or was paid it by a
 * call it made; or when its user kept it on this device, per network and account. KSA is always shown.
 */

import { createStore, loadPref, savePref, useChain, useStore } from '../app/store';
import { KSA_ASSET_ID, PARAMS } from '../chain/params';
import type { Chain } from '../chain/source';
import type { Hex } from '../chain/types';
import { contractMoves } from './model';

/** The assets an op signed by `me` moved, by the built-in asset's or the token contract's ID, KSA among them */
export function askedFor(sim: Chain, me: Hex): Set<Hex> {
  const out = new Set<Hex>([KSA_ASSET_ID]);
  const acc = sim.peekAccount(me);
  for (const id of acc?.opIds ?? []) {
    const r = sim.getOp(id);
    if (!r || r.op.account !== me) continue;
    const a = r.op.action;
    if (a.kind === 'AssetTransfer') out.add(a.asset);
    else {
      for (const f of a.funds ?? []) out.add(f.asset);
      // A call to a token's or a collection's contract, or the deployment that creates it
      if (a.contract) out.add(a.contract);
    }
    if (!r.result?.ok) continue;
    for (const c of r.result.changes ?? []) out.add(c.asset);
    if (sim.kind === 'rpc') {
      for (const e of r.result.events) {
        const te = sim.tokenBook.eventOf(e);
        if (te) out.add(te.contract);
      }
    }
    // Where the receipt does not record them: what the example contracts' events say they paid (the simulator's swaps and claims)
    if (!r.result.changes) for (const m of contractMoves(sim, r, me).moves) out.add(m.asset);
  }
  return out;
}

const keptKey = (chainId: number, me: Hex) => `kept:${chainId}:${me}`;
const kept = new Map<string, ReadonlySet<Hex>>();
const keptVersion = createStore(0);

function keptSet(key: string): ReadonlySet<Hex> {
  let set = kept.get(key);
  if (!set) {
    const raw = loadPref<unknown>(key, []);
    set = new Set(Array.isArray(raw) ? raw.filter((x): x is Hex => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)) : []);
    kept.set(key, set);
  }
  return set;
}

/** The assets the user kept in the list on this device for this account, on this network */
export function useKept(chainId: number, me: Hex): ReadonlySet<Hex> {
  useStore(keptVersion);
  return keptSet(keptKey(chainId, me));
}

/** Keeps an asset in the list, or folds it away again */
export function setKept(chainId: number, me: Hex, asset: Hex, keep: boolean): void {
  const key = keptKey(chainId, me);
  const next = new Set(keptSet(key));
  if (keep) next.add(asset);
  else next.delete(asset);
  kept.set(key, next);
  savePref(key, [...next]);
  keptVersion.set((v) => v + 1);
}

/** How the wallet's list treats an account's assets */
export interface Folding {
  /** Whether the list shows it without being asked: KSA, an asset an op of the account moved, one kept on this device */
  shows(id: Hex): boolean;
  /** Whether it shows only because it was kept, so that it can be folded away again */
  keptOnly(id: Hex): boolean;
  keep(id: Hex, keep: boolean): void;
}

export function useFolding(me: Hex): Folding {
  const sim = useChain();
  const chainId = sim.kind === 'rpc' ? sim.sdkParams.chain_id : PARAMS.CHAIN_ID;
  const kept = useKept(chainId, me);
  const asked = askedFor(sim, me);
  return {
    shows: (id) => asked.has(id) || kept.has(id),
    keptOnly: (id) => !asked.has(id) && kept.has(id),
    keep: (id, keep) => setKept(chainId, me, id, keep),
  };
}
