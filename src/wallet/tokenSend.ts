/**
 * Sending a KS-20 token from the send page (D-123). The transfer is a call of the token's `transfer(to, amount)` (`core/docs/STANDARDS.md`
 * §3.1), so what it costs and whether it goes through are the contract's to say. The page reads the sender's balance from the contract
 * (the index's may lag behind it, `core/docs/RPC.md`), and tries the transfer with the node's read-only call as the sender (`ksana_call`
 * with `caller`) before anything is signed: what that used, with a margin, is the op's max_gas, and a refusal is said on the page
 * rather than paid for on chain.
 */

import { useEffect, useState } from 'react';
import { type KsanaRpcClient, REJECTED_PREFIX, RpcError, fromHex, ks20BalanceOf, ks20Transfer, toHex } from '@ksana/sdk';
import type { RpcChain } from '../chain/rpc/chain';
import type { Chain } from '../chain/source';
import type { Action, Hex } from '../chain/types';
import { t } from '../i18n';
import { SEND_GAS_MIN } from './model';

/** A token transfer's max_gas when the read-only call could not run: the reference token's transfer takes well under it */
export const TOKEN_GAS_UNCHECKED = 200_000;
/** Below this a token transfer is not offered less gas, whatever the read-only call used */
export const TOKEN_GAS_FLOOR = 50_000;
/** The node runs at most 4 read-only calls at a time and answers further ones with this code (`core/docs/RPC.md`, D-098) */
const NODE_BUSY = -32009;
const BUSY_RETRIES = 3;
const BUSY_WAIT_MS = 1_500;
/** The read-only call waits for the form to stop changing this long */
const SETTLE_MS = 400;
/** The most of a contract's own reason the page repeats */
const REASON_CHARS = 160;

/** The max_gas of a token transfer that used `used` in the read-only call: half again, rounded up to 10,000, at least `TOKEN_GAS_FLOOR` */
export function tokenGasFor(used: bigint): number {
  const padded = Math.ceil((Number(used) * 3) / 2 / 10_000) * 10_000;
  return Math.max(TOKEN_GAS_FLOOR, SEND_GAS_MIN, padded);
}

/**
 * The UI action of a transfer of `token`, its arguments in Borsh as the node lists them; null for what the SDK refuses to build (an
 * amount past u128, the zero account or the token itself as the recipient)
 */
export function tokenTransferAction(token: Hex, to: Hex, amount: bigint): Action | null {
  let a;
  try {
    a = ks20Transfer(fromHex(token, 32), fromHex(to, 32), amount);
  } catch {
    return null;
  }
  return a.kind === 'Call' ? { kind: 'Call', contract: token, method: 'transfer', args: { borsh: toHex(a.args) }, funds: [] } : null;
}

/** Whether the page knows `id` to be a contract: from what it has seen, or from the node's index (`ksana_getContract`, `TokenBook.wantDeclaration`) */
export function knownContract(sim: Chain, id: Hex): boolean {
  return sim.isContract(id) || (sim.kind === 'rpc' && !!sim.tokenBook.declarations.get(id));
}

const REFUSALS = { 'insufficient balance': 'balance', 'zero amount': 'zero', 'zero account': 'zeroAccount', 'recipient is this contract': 'self' } as const;

/** A token's refusal of the transfer in the page's language: the standards' fixed reasons translated (`core/docs/STANDARDS.md` §5.1), any other in the contract's own words */
export function explainRefusal(error: string): string {
  const m = t().asset.send.refusal;
  const reason = error.replace(/^revert: /, '');
  const key = REFUSALS[reason as keyof typeof REFUSALS];
  if (key) return m[key];
  const words = (s: string) => (s.length > REASON_CHARS ? `${s.slice(0, REASON_CHARS)}…` : s);
  return reason.startsWith(REJECTED_PREFIX) ? m.rules(words(reason.slice(REJECTED_PREFIX.length))) : m.other(words(reason));
}

/** How many operations the page has seen name the account: a token's balance changes only with one of them */
const opsOf = (rpc: RpcChain | null, me: Hex) => rpc?.peekAccount(me)?.opIds.length ?? 0;

/** The sender's balance of `token` as the token answers it (`balance_of`), read again as the account's operations change; undefined until it has answered */
export function useTokenBalance(rpc: RpcChain | null, me: Hex, token: Hex | null): bigint | undefined {
  const [read, setRead] = useState<{ token: Hex; me: Hex; value: bigint } | null>(null);
  const ops = opsOf(rpc, me);
  useEffect(() => {
    if (!rpc || !token) return;
    let gone = false;
    ks20BalanceOf(rpc.node, fromHex(token, 32), fromHex(me, 32)).then(
      (value) => !gone && setRead({ token, me, value }),
      () => undefined,
    );
    return () => {
      gone = true;
    };
  }, [rpc, me, token, ops]);
  return read && read.token === token && read.me === me ? read.value : undefined;
}

/** What the read-only call said of a token transfer */
export interface TokenTrial {
  /** `ok`: the transfer went through, `gas` its max_gas; `refused`: the token refused it, `reason` its words; `unchecked`: the call could not run */
  state: 'idle' | 'checking' | 'ok' | 'refused' | 'unchecked';
  gas?: number;
  used?: bigint;
  reason?: string;
}

/**
 * The read-only call of the transfer of `amount` of `token` to `to` as `me`: asked again a few times while the node is busy, and never
 * once `gone` says the form has moved on
 */
export async function tryTokenTransfer(
  node: Pick<KsanaRpcClient, 'call'>,
  me: Hex,
  token: Hex,
  to: Hex,
  amount: bigint,
  gone: () => boolean = () => false,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<TokenTrial> {
  for (let tries = BUSY_RETRIES; ; tries--) {
    try {
      const a = ks20Transfer(fromHex(token, 32), fromHex(to, 32), amount);
      if (a.kind !== 'Call') return { state: 'unchecked' };
      const r = await node.call({ contract: a.contract, method: a.method, args: a.args, caller: fromHex(me, 32) });
      return r.success ? { state: 'ok', gas: tokenGasFor(r.gas_used), used: r.gas_used } : { state: 'refused', reason: r.error ?? '' };
    } catch (e) {
      if (!(e instanceof RpcError && e.code === NODE_BUSY) || tries === 0) return { state: 'unchecked' };
    }
    await wait(BUSY_WAIT_MS);
    if (gone()) return { state: 'unchecked' };
  }
}

/** Tries the transfer of `amount` of `token` to `to` as `me` once the form settles, and again as the account's operations change; nothing while `token` is null */
export function useTokenTrial(rpc: RpcChain | null, me: Hex, token: Hex | null, to: Hex | null, amount: bigint | null): TokenTrial {
  const [run, setRun] = useState<{ key: string; trial: TokenTrial } | null>(null);
  const key = rpc && token && to && amount !== null && tokenTransferAction(token, to, amount) ? `${me}:${token}:${to}:${amount}` : null;
  const ops = opsOf(rpc, me);
  useEffect(() => {
    if (!rpc || !key || !token || !to || amount === null) return;
    let gone = false;
    const timer = setTimeout(() => {
      void tryTokenTransfer(rpc.node, me, token, to, amount, () => gone).then((trial) => !gone && setRun({ key, trial }));
    }, SETTLE_MS);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [rpc, key, ops]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!key) return { state: 'idle' };
  return run?.key === key ? run.trial : { state: 'checking' };
}
