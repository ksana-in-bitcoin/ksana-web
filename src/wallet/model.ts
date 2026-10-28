/**
 * Derivations from the wallet's point of view: the finality split of the balance, in-flight operations, UTXOs.
 *
 * The balance split is the most important design point of this wallet: the balance on the fast lane takes effect at once, but
 * part of its changes come from blocks that are not BTC-final yet. SPEC §10.4 requires the two kinds of confirmation to be clearly
 * distinguished for applications, so the wallet gives two numbers at once: "current" (the fast-lane balance, the "instant" mark)
 * and "BTC-final" (the balance counted by BTC-final blocks, the "eternal" mark); the difference between them is the incoming and
 * outgoing transfers that are not final yet.
 */

import type { Route } from '../app/router';
import { useChain } from '../app/store';
import { useWalletPrefs } from '../app/prefs';
import type { Chain } from '../chain/source';
import type { Hex, OpRecord } from '../chain/types';
import { KSA_ASSET_ID, PARAMS } from '../chain/params';
import { claimedFor, opStage, recordedMoves, transferOf } from '../chain/views';
import { fmtAmount } from '../lib/format';
import { type ConnectedWallet, useConnectedWallet } from './connect';

/** The current wallet account: in the simulator the built-in demo account, under the node data source the connected wallet (Unisat, Xverse or the test-key wallet) */
export function useMe(): Hex | null {
  const sim = useChain();
  const prefs = useWalletPrefs();
  const wallet = useConnectedWallet();
  if (sim.kind === 'rpc') return wallet?.account.account ?? null;
  return prefs.connected ? sim.demoId : null;
}

/** Outside a React component (utility function): whether an account is "me" */
export function isMine(sim: Chain, id: Hex, connected: boolean, wallet: ConnectedWallet | null): boolean {
  if (sim.kind === 'rpc') return !!wallet && wallet.account.account === id;
  return connected && sim.demoId === id;
}

/**
 * Whether an account's balances are known. The simulator holds every account; on the node data source an account's balances read 0
 * until the node has answered for it, which the wallet does not show as an empty wallet nor check an amount against.
 */
export function balancesKnown(sim: Chain, id: Hex): boolean {
  return sim.kind !== 'rpc' || sim.peekAccount(id) !== undefined;
}

export interface Flows {
  /** Incoming transfers from blocks that are not BTC-final yet: this part disappears if the fast lane rolls back */
  inflow: bigint;
  /** Outgoing transfers not BTC-final yet (including sponsored fees) */
  outflow: bigint;
}

/** The account's changes in blocks that are not BTC-final yet */
export interface UnfinalFlows {
  /** Incoming and outgoing, totaled per asset */
  assets: Map<Hex, Flows>;
  /** A contract call not final yet may have paid the account more than the page can read (`contractMoves`): each BTC-final balance is then at most the one given */
  unread: boolean;
}

export interface Finality extends Flows {
  /** The current balance on the fast lane */
  total: bigint;
  /** The balance counted by BTC-final blocks: current balance − unfinalized incoming + unfinalized outgoing */
  finalBalance: bigint;
  /** As `UnfinalFlows.unread`: the BTC-final balance is at most `finalBalance` */
  unread: boolean;
}

function add(map: Map<Hex, Flows>, asset: Hex, v: bigint) {
  const f = map.get(asset) ?? { inflow: 0n, outflow: 0n };
  if (v >= 0n) f.inflow += v;
  else f.outflow -= v;
  map.set(asset, f);
}

const amountOf = (v: string | undefined): bigint => (v !== undefined && /^\d+$/.test(v) ? BigInt(v) : 0n);

/**
 * What an op's contract calls moved in or out of `me`'s balances, beyond the funds it attached. A contract pays any account from its
 * own balance or by issuing its asset, never from the caller's (ABI `asset_transfer`, `asset_issue`, `asset_create`), and the page
 * reads this from its events. The simulator's contracts are the page's own, and their events say all they moved. On a node the
 * example contracts' events (`eventFields`): the exchange's claim pays the lock's beneficiary in KSA (`claimedFor`) and its withdrawal
 * the seller, the payment trigger's claim and the fixed-supply token's issue the account they name in the asset they name, and the
 * exchange's other events and the token's pay no asset. The amm's events do not name the asset they pay out, and any other contract's
 * events, or a call with none, say nothing of what it paid: `complete` is then false
 */
export function contractMoves(sim: Chain, r: OpRecord, me: Hex): { moves: { asset: Hex; value: bigint }[]; complete: boolean } {
  const moves: { asset: Hex; value: bigint }[] = [];
  const a = r.op.action;
  if (!r.result?.ok || (a.kind !== 'Call' && a.kind !== 'Deploy')) return { moves, complete: true };
  const mine = r.op.account === me;
  // A top-up claim is signed with a one-time key (D-085): the KSA it credits arrives through someone else's op
  const claimed = claimedFor(sim, r, me);
  if (claimed) moves.push({ asset: claimed.asset.id, value: claimed.value });
  if (sim.kind !== 'rpc') {
    for (const ev of r.result.events) {
      const f = ev.fields;
      if (mine && ev.name === 'Swap') {
        moves.push({ asset: f.asset_in === 'KSA' ? KSA_ASSET_ID : sim.tokenAsset, value: -amountOf(f.amount_in) });
        moves.push({ asset: f.asset_out === 'KSA' ? KSA_ASSET_ID : sim.tokenAsset, value: amountOf(f.amount_out) });
      }
      if (mine && ev.name === 'LiquidityAdded') moves.push({ asset: KSA_ASSET_ID, value: -amountOf(f.ksa) }, { asset: sim.tokenAsset, value: -amountOf(f.tkn) });
      if (mine && ev.name === 'Claimed') moves.push({ asset: sim.passAsset, value: 1n });
      if (ev.name === 'withdraw' && f.seller === me) moves.push({ asset: KSA_ASSET_ID, value: amountOf(f.amount) });
    }
    return { moves, complete: true };
  }
  let complete = r.result.events.length > 0;
  for (const ev of r.result.events) {
    const f = ev.fields;
    if (f.data !== undefined) complete = false;
    else if (ev.name === 'claim' && f.ksa_paid !== undefined) {
      // Not counted by `claimedFor`: emitted by a contract the op does not call itself
      if (f.beneficiary === me && !claimed) complete = false;
    } else if ((ev.name === 'claim' || ev.name === 'issue') && f.asset !== undefined) {
      if ((f.beneficiary ?? f.owner) === me) moves.push({ asset: f.asset, value: amountOf(f.amount ?? f.supply) });
    } else if (ev.name === 'withdraw') {
      if (f.seller === me) moves.push({ asset: KSA_ASSET_ID, value: amountOf(f.amount) });
    } else if (ev.name === 'swap' || ev.name === 'add_liquidity' || ev.name === 'remove_liquidity') complete = false;
  }
  return { moves, complete };
}

/** The account's incoming and outgoing changes in blocks that are not final yet, totaled per asset */
export function unfinalFlows(sim: Chain, me: Hex): UnfinalFlows {
  const out: UnfinalFlows = { assets: new Map(), unread: false };
  const acc = sim.peekAccount(me);
  if (!acc) return out;
  for (let i = acc.opIds.length - 1; i >= 0; i--) {
    const r = sim.getOp(acc.opIds[i] as Hex);
    if (!r || r.height === undefined) continue;
    if (r.height <= sim.finalHeight) {
      // opIds are ordered by submission time; old operations far below the final height need not be looked at any more
      if (sim.finalHeight - r.height > 400) break;
      continue;
    }
    const mine = r.op.account === me;
    if (mine && r.op.fee.kind === 'Token') add(out.assets, KSA_ASSET_ID, -r.op.fee.amount);
    if (!r.result?.ok) continue;
    // What the node recorded is exact (D-122, D-120): a receipt without its changes is read from the op and the contracts' events
    if (recordedMoves(sim, r, me, (asset, v) => add(out.assets, asset, v))) continue;
    const a = r.op.action;
    if (a.kind === 'AssetTransfer') {
      if (mine && a.to !== me) add(out.assets, a.asset, -a.amount);
      if (!mine && a.to === me) add(out.assets, a.asset, a.amount);
      continue;
    }
    // Funds attached to a call or a deployment (D-073) left the account with it
    if (mine) for (const f of a.funds ?? []) add(out.assets, f.asset, -f.amount);
    const c = contractMoves(sim, r, me);
    for (const m of c.moves) add(out.assets, m.asset, m.value);
    if (!c.complete) out.unread = true;
  }
  return out;
}

/** `total`: the current balance, a built-in asset's by default; a KS-20 token's as the node's index adds it up (D-123) */
export function finalityOf(sim: Chain, me: Hex, asset: Hex, flows = unfinalFlows(sim, me), total = sim.balance(me, asset)): Finality {
  const f = flows.assets.get(asset) ?? { inflow: 0n, outflow: 0n };
  const finalBalance = total - f.inflow + f.outflow;
  return { total, inflow: f.inflow, outflow: f.outflow, finalBalance: finalBalance < 0n ? 0n : finalBalance, unread: flows.unread };
}

/** In flight: operations that are not BTC-final yet (including those in the entry pool) */
export function inflight(sim: Chain, me: Hex): OpRecord[] {
  const acc = sim.peekAccount(me);
  if (!acc) return [];
  const out: OpRecord[] = [];
  for (let i = acc.opIds.length - 1; i >= 0 && out.length < 8; i--) {
    const r = sim.getOp(acc.opIds[i] as Hex);
    if (!r) continue;
    const st = opStage(sim, r);
    if (st === 'final' || st === 'dropped') continue;
    if (st === 'skipped' && r.dropped) continue;
    if (st === 'failed' && r.height !== undefined && r.height <= sim.finalHeight) continue;
    out.push(r);
  }
  return out;
}

export function activity(sim: Chain, me: Hex, filter: 'all' | 'out' | 'in' | 'failed', limit = 40): OpRecord[] {
  const acc = sim.peekAccount(me);
  if (!acc) return [];
  const out: OpRecord[] = [];
  for (let i = acc.opIds.length - 1; i >= 0 && out.length < limit; i--) {
    const r = sim.getOp(acc.opIds[i] as Hex);
    if (!r) continue;
    const mine = r.op.account === me;
    if (filter === 'out' && !mine) continue;
    if (filter === 'in' && mine) continue;
    const notExecuted = !r.blockHash && (!!r.dropped || !!r.skippedIn?.length);
    if (filter === 'failed' && !(r.result && !r.result.ok) && !notExecuted) continue;
    out.push(r);
  }
  return out;
}

/**
 * Resubmit with the same nonce via path C instead (§4.3, §15): carries the original operation's recipient, asset, amount and
 * max_gas; the send page prefills from them and locks the path to C. The amount goes in whole units, as the send page reads a
 * link's (`linkAmount`), so only once the node has named the asset: 5 KSA goes as "5", never as its 500,000,000 base units. A known
 * KS-20 token's transfer carries the token as its asset (D-123)
 */
export function resendViaNative(r: OpRecord, sim: Chain): Route {
  const sent = transferOf(sim, r.op.action);
  if (!sent) return { name: 'send', path: 'C', nonce: String(r.op.nonce), gas: String(Math.min(r.op.maxGas, 1_000_000)) };
  const asset = sent.asset;
  return {
    name: 'send',
    path: 'C',
    nonce: String(r.op.nonce),
    gas: String(Math.min(r.op.maxGas, 1_000_000)),
    to: sent.to,
    asset: sent.id,
    ...(asset && !asset.pending ? { amount: fmtAmount(sent.amount, asset.decimals).replace(/,/g, '') } : {}),
  };
}

/** The amount a send link carries, in whole units as a person types them ("5", "0.25"); anything else leaves the field empty */
export function linkAmount(text: string | undefined): string {
  return text && /^\d+(\.\d+)?$/.test(text) ? text : '';
}

/** The lowest max_gas the send page takes: it sends transfers only, and a transfer with less gas than it uses fails and pays its fee all the same */
export const SEND_GAS_MIN = PARAMS.ASSET_TRANSFER_GAS;

/** The max_gas typed on the send page (spaces, commas and underscores aside), from `SEND_GAS_MIN` to the block gas limit; anything else is undefined */
export function sendMaxGas(text: string): number | undefined {
  const raw = text.replace(/[\s,_]/g, '');
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n >= SEND_GAS_MIN && n <= PARAMS.BLOCK_GAS_LIMIT ? n : undefined;
}
