import { describe, expect, it } from 'vitest';
import { Devnet, KSA_UNIT, satsForAll } from '../chain/sim/engine';
import { BTC_FINAL_DATA_CONFS, KSA_ASSET_ID, PARAMS } from '../chain/params';
import type { Chain } from '../chain/source';
import type { AccountState, AssetChange, AssetMeta, OpRecord, VmEvent } from '../chain/types';
import type { TokenEvent } from '../chain/rpc/tokens';
import { toResult } from '../chain/rpc/convert';
import { fromHex } from '@ksana/sdk';
import { href, parseRoute } from '../app/router';
import { parseAmount } from '../lib/format';
import { balancesKnown, finalityOf, linkAmount, resendViaNative, SEND_GAS_MIN, sendMaxGas, unfinalFlows } from './model';

const NOW = Date.UTC(2026, 9, 1, 8, 0, 0);

/** On a chain without background traffic empty blocks are slow (two-speed difficulty), and it may be in a settlement backlog: wait on a condition, not for a fixed time */
function until(sim: Devnet, cond: () => boolean, stepMs = 15_000, max = 60) {
  for (let i = 0; i < max && !cond(); i++) sim.advanceTo(sim.clock + stepMs);
  expect(cond()).toBe(true);
}

/** Produce blocks, broadcast settlements and mine BTC blocks until the blocks holding all of the account's operations are BTC-final */
function settleAll(sim: Devnet, me: string) {
  const heights = () => (sim.peekAccount(me)?.opIds ?? []).map((id) => sim.getOp(id)?.height);
  until(sim, () => sim.pendingOf(me).length === 0 && heights().every((h) => h !== undefined));
  const top = Math.max(...heights().map((h) => h ?? 0));
  for (let i = 0; i < 60 && sim.settledHeight < top; i++) {
    sim.advanceTo(sim.clock + 10_000);
    sim.mineBtc(1);
  }
  sim.mineBtc(BTC_FINAL_DATA_CONFS);
  expect(sim.finalHeight).toBeGreaterThanOrEqual(top);
}

describe('splitting the balance by finality', () => {
  it('incoming: before finality the "BTC-final balance" excludes it, after finality the two numbers are equal', () => {
    // Turn off background traffic and look only at this one faucet transfer
    const sim = new Devnet({ seed: 21, now: NOW, historyMs: 10 * 60_000, trafficPerSec: 0 });
    const me = sim.demoId;
    // The last operations of the demo script may still be in the entry pool, or not yet BTC-final: settle them first
    settleAll(sim, me);
    const before = finalityOf(sim, me, KSA_ASSET_ID);
    // The faucet transfers 5,000 KSA to the demo account (path B, takes effect in the next block)
    const { opId } = sim.faucet(me);
    expect(opId).toBeDefined();
    const op = sim.getOp(opId!)!;
    until(sim, () => !!op.blockHash);
    const mid = finalityOf(sim, me, KSA_ASSET_ID);
    expect(mid.total - before.total).toBe(5_000n * KSA_UNIT);
    expect(mid.inflow).toBeGreaterThanOrEqual(5_000n * KSA_UNIT);
    expect(mid.finalBalance).toBe(mid.total - mid.inflow + mid.outflow);
    expect(mid.finalBalance).toBeLessThan(mid.total);

    settleAll(sim, me);
    expect(op.height! <= sim.finalHeight).toBe(true);
    const after = finalityOf(sim, me, KSA_ASSET_ID, unfinalFlows(sim, me));
    expect(after.inflow).toBe(0n);
    expect(after.finalBalance).toBe(after.total);
  });

  it('outgoing: before finality the "BTC-final balance" still includes the amount sent and the sponsored fee', () => {
    const sim = new Devnet({ seed: 22, now: NOW, historyMs: 10 * 60_000, trafficPerSec: 0 });
    const me = sim.demoId;
    settleAll(sim, me);
    const before = finalityOf(sim, me, KSA_ASSET_ID, unfinalFlows(sim, me));
    expect(before.finalBalance).toBe(before.total);
    const amount = 1_000n * KSA_UNIT;
    const fee = 10_000n;
    const res = sim.submit({
      account: me,
      path: 'B',
      maxGas: 50_000,
      tokenFee: fee,
      action: { kind: 'AssetTransfer', asset: KSA_ASSET_ID, to: sim.faucetId, amount },
    });
    if (!res.ok) throw new Error(res.message);
    const op = sim.getOp(res.opId)!;
    until(sim, () => !!op.blockHash);
    expect(op.result?.ok).toBe(true);
    const mid = finalityOf(sim, me, KSA_ASSET_ID, unfinalFlows(sim, me));
    expect(mid.total).toBe(before.total - amount - fee);
    expect(mid.outflow).toBe(amount + fee);
    // The current balance is already debited, but counted by BTC-final blocks the money is still there
    expect(mid.finalBalance).toBe(before.total);
  });

  it('funds attached to a contract call count as outgoing until final (D-073)', () => {
    const sim = new Devnet({ seed: 23, now: NOW, historyMs: 10 * 60_000, trafficPerSec: 0 });
    const me = sim.demoId;
    settleAll(sim, me);
    const before = finalityOf(sim, me, KSA_ASSET_ID, unfinalFlows(sim, me));
    expect(before.finalBalance).toBe(before.total);
    const amount = 500n * KSA_UNIT;
    const fee = 10_000n;
    const res = sim.submit({
      account: me,
      path: 'B',
      maxGas: 300_000,
      tokenFee: fee,
      action: { kind: 'Call', contract: sim.exchangeContract, method: 'deposit', args: {}, funds: [{ asset: KSA_ASSET_ID, amount }] },
    });
    if (!res.ok) throw new Error(res.message);
    const op = sim.getOp(res.opId)!;
    until(sim, () => !!op.blockHash);
    expect(op.result?.ok).toBe(true);
    const mid = finalityOf(sim, me, KSA_ASSET_ID, unfinalFlows(sim, me));
    expect(mid.total).toBe(before.total - amount - fee);
    expect(mid.outflow).toBe(amount + fee);
    expect(mid.finalBalance).toBe(before.total);
  });

  it('KSA withdrawn from the exchange counts as incoming until final: the contract pays it from its own balance', () => {
    const sim = new Devnet({ seed: 26, now: NOW, historyMs: 10 * 60_000, trafficPerSec: 0 });
    const me = sim.demoId;
    const amount = 300n * KSA_UNIT;
    const fee = 10_000n;
    const send = (method: string, args: Record<string, bigint>, funds: { asset: string; amount: bigint }[] = []) => {
      const res = sim.submit({ account: me, path: 'B', maxGas: 300_000, tokenFee: fee, action: { kind: 'Call', contract: sim.exchangeContract, method, args, funds } });
      if (!res.ok) throw new Error(res.message);
      return sim.getOp(res.opId)!;
    };
    const deposit = send('deposit', {}, [{ asset: KSA_ASSET_ID, amount }]);
    until(sim, () => !!deposit.blockHash);
    settleAll(sim, me);
    const before = finalityOf(sim, me, KSA_ASSET_ID);
    expect(before.finalBalance).toBe(before.total);
    const withdrawal = send('withdraw', { amount });
    until(sim, () => !!withdrawal.blockHash);
    expect(withdrawal.result?.ok).toBe(true);
    const mid = finalityOf(sim, me, KSA_ASSET_ID);
    expect(mid.total).toBe(before.total + amount - fee);
    expect(mid).toMatchObject({ inflow: amount, outflow: fee, unread: false });
    expect(mid.finalBalance).toBe(before.total);
  });

  it('KSA a top-up claim credits counts as incoming until final, though a one-time key signs the claim (D-085)', () => {
    const sim = new Devnet({ seed: 24, now: NOW, historyMs: 10 * 60_000, trafficPerSec: 0 });
    const me = sim.demoId;
    settleAll(sim, me);
    // The seller locks 2,000 KSA for this account at 0.01 KSA per sat, paid to a script of its own
    const ksa = 2_000n * KSA_UNIT;
    const script = `5120${sim.sellerId}`;
    const lockRes = sim.submit({
      account: sim.sellerId,
      path: 'B',
      maxGas: 300_000,
      tokenFee: 10_000n,
      action: {
        kind: 'Call',
        contract: sim.exchangeContract,
        method: 'lock',
        args: { ksa, price: KSA_UNIT / 100n, script, beneficiary: me, expiry: sim.btcTip.height + 50 },
        funds: [{ asset: KSA_ASSET_ID, amount: ksa }],
      },
    });
    if (!lockRes.ok) throw new Error(lockRes.message);
    until(sim, () => sim.locksFor(me).some((l) => l.script === script));
    settleAll(sim, me);
    const before = finalityOf(sim, me, KSA_ASSET_ID, unfinalFlows(sim, me));
    expect(before.finalBalance).toBe(before.total);
    const lock = sim.locksFor(me).find((l) => l.script === script)!;
    const res = sim.topUp(lock.id, satsForAll(lock), me);
    if (!res.ok) throw new Error(res.message);
    const op = sim.getOp(res.opId)!;
    expect(op.op.account).not.toBe(me);
    // Path C: the claim is force-included once its BTC transaction confirms
    for (let i = 0; i < 20 && !op.result; i++) {
      sim.mineBtc(1);
      sim.advanceTo(sim.clock + 10_000);
    }
    expect(op.result?.ok).toBe(true);
    const mid = finalityOf(sim, me, KSA_ASSET_ID, unfinalFlows(sim, me));
    expect(mid.total).toBe(before.total + ksa);
    expect(mid.inflow).toBe(ksa);
    expect(mid.finalBalance).toBe(before.total);

    settleAll(sim, me);
    const after = finalityOf(sim, me, KSA_ASSET_ID, unfinalFlows(sim, me));
    expect(after.inflow).toBe(0n);
    expect(after.finalBalance).toBe(after.total);
  });
});

describe('what contract calls paid, on a node', () => {
  const me = 'ab'.repeat(32);
  const exchange = 'ee'.repeat(32);
  const amm = 'aa'.repeat(32);
  const le = (v: bigint, n: number) => Uint8Array.from({ length: n }, (_, i) => Number((v >> BigInt(8 * i)) & 0xffn));
  const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));
  const named = (name: string) => join(le(BigInt(name.length), 4), new TextEncoder().encode(name));
  const key = (hex: string) => fromHex(hex, 32);
  // The events as the node gives them, read as the page reads them (convert.ts)
  const events = (...list: [string, Uint8Array][]) =>
    toResult({ op_id: null, success: true, error: null, gas_used: 1n, output: new Uint8Array(), events: list.map(([contract, data]) => ({ contract: key(contract), data })), asset_changes: [] }).events;
  const claim = (ksa: bigint) => join(named('claim'), le(3n, 8), key(me), new Uint8Array(32), le(25_000n, 8), le(ksa, 16), le(0n, 16));
  const withdraw = (amount: bigint) => join(named('withdraw'), key(me), le(amount, 16), le(0n, 16));
  const swap = join(named('swap'), key(me), new Uint8Array(32), le(500_000_000n, 16), le(9_066_108_938_801n, 16));
  let n = 0;
  const call = (account: string, contract: string, method: string, evs: VmEvent[], funds: { asset: string; amount: bigint }[] = []): OpRecord => ({
    id: (++n).toString(16).padStart(64, '0'),
    op: { version: 2, chainId: 1002, account, nonce: n, fee: { kind: 'Token', amount: 100n }, maxGas: 1_000_000, action: { kind: 'Call', contract, method, args: {}, funds } },
    path: account === me ? 'B' : 'C',
    size: 200,
    submittedAt: 0,
    origin: 'chain',
    height: 20,
    result: { ok: true, gasUsed: 1, events: evs },
  } as unknown as OpRecord);
  // A node without the standards index reads no event as a token's, unless `eventOf` says which are (D-120)
  const node = (ops: OpRecord[], finalHeight = 10, eventOf: (e: VmEvent) => TokenEvent | null = () => null) =>
    ({
      kind: 'rpc',
      finalHeight,
      peekAccount: (id: string) => (id === me ? { id, nonce: 0, balances: new Map(), opIds: ops.map((r) => r.id) } : undefined),
      getOp: (id: string) => ops.find((r) => r.id === id),
      balance: () => 10_000n * KSA_UNIT,
      assets: new Map([[KSA_ASSET_ID, { id: KSA_ASSET_ID, symbol: 'KSA', name: 'KSA', decimals: 8, issuer: null }]]),
      tokenBook: { eventOf },
    }) as unknown as Chain;

  it("count a top-up claim's KSA and an exchange withdrawal as incoming until final, and the claim of a contract the op does not call not at all", () => {
    // The claim is signed with a one-time key (D-085): someone else's op, listed under the wallet by the page that broadcast it
    const topUp = call('cd'.repeat(32), exchange, 'claim', events([exchange, claim(2_500n * KSA_UNIT)]));
    const out = call(me, exchange, 'withdraw', events([exchange, withdraw(40n * KSA_UNIT)]));
    let f = finalityOf(node([topUp, out]), me, KSA_ASSET_ID);
    expect(f).toMatchObject({ inflow: 2_540n * KSA_UNIT, outflow: 100n, unread: false });
    expect(f.finalBalance).toBe(10_000n * KSA_UNIT - 2_540n * KSA_UNIT + 100n);
    // Emitted by another contract than the op calls: not counted, and the page cannot say what that contract paid
    const nested = call('cd'.repeat(32), 'ef'.repeat(32), 'claim', events([exchange, claim(2_500n * KSA_UNIT)]));
    f = finalityOf(node([nested]), me, KSA_ASSET_ID);
    expect(f).toMatchObject({ inflow: 0n, unread: true });
    // Once final, nothing is left to split
    expect(finalityOf(node([topUp, out, nested], 20), me, KSA_ASSET_ID)).toMatchObject({ inflow: 0n, outflow: 0n, unread: false, finalBalance: 10_000n * KSA_UNIT });
  });

  it("says when a contract call may have paid what the page can't read: an amm's payout, a call with no event, an event it does not read", () => {
    // 5 KSA attached to a swap leave with it; what the pair paid back is in an asset its event does not name
    const swapped = call(me, amm, 'swap', events([amm, swap]), [{ asset: KSA_ASSET_ID, amount: 500_000_000n }]);
    expect(finalityOf(node([swapped]), me, KSA_ASSET_ID)).toMatchObject({ inflow: 0n, outflow: 500_000_100n, unread: true });
    expect(finalityOf(node([call(me, amm, 'poke', [])]), me, KSA_ASSET_ID).unread).toBe(true);
    expect(finalityOf(node([call(me, amm, 'poke', events([amm, named('poked')]))]), me, KSA_ASSET_ID).unread).toBe(true);
    // The exchange's deposit pays nobody: its attached KSA left the account, and that is all
    const deposit = call(me, exchange, 'deposit', events([exchange, join(named('deposit'), key(me), le(7n, 16), le(7n, 16))]), [{ asset: KSA_ASSET_ID, amount: 7n }]);
    expect(finalityOf(node([deposit]), me, KSA_ASSET_ID)).toMatchObject({ inflow: 0n, outflow: 107n, unread: false });
  });

  it('counts exactly what a receipt records (D-122) and what a known token’s transfer events say (D-120), whoever signed the op', () => {
    const gold = 'd0'.repeat(32);
    const token = '70'.repeat(32);
    const pool = '90'.repeat(32);
    const other = 'cd'.repeat(32);
    const recorded = (r: OpRecord, changes: AssetChange[], evs: VmEvent[] = []) => ({ ...r, result: { ok: true, gasUsed: 1, events: evs, changes } }) as OpRecord;
    // A swap: 5 KSA attached to the pool, 9 GOLD paid back, read from the receipt rather than from the pool's event
    const swapped = recorded(call(me, pool, 'swap', [], [{ asset: KSA_ASSET_ID, amount: 5n }]), [
      { kind: 'funds', asset: KSA_ASSET_ID, from: me, to: pool, amount: 5n, events: 0 },
      { kind: 'payout', asset: gold, from: pool, to: me, amount: 9n, events: 0 },
    ]);
    // Someone else's call that issues the wallet 3 GOLD, and a spender's transfer of 4 of a token to it
    const issued = recorded(call(other, 'ef'.repeat(32), 'mint', []), [{ kind: 'issue', asset: gold, to: me, amount: 3n, events: 0 }]);
    const ev: VmEvent = { name: 'transfer', fields: { contract: token }, raw: '00' };
    const pulled = recorded(call(other, token, 'transfer_from', []), [], [ev]);
    const sim = node([swapped, issued, pulled], 10, (e) =>
      e.fields.contract === token ? { contract: token, standard: 'KS-20', event: { kind: 'Transfer', from: key(other), to: key(me), amount: 4n } } : null,
    );
    const flows = unfinalFlows(sim, me);
    expect(flows.unread).toBe(false);
    // The attached 5 KSA and the swap's fee of 100
    expect(flows.assets.get(KSA_ASSET_ID)).toEqual({ inflow: 0n, outflow: 105n });
    expect(flows.assets.get(gold)).toEqual({ inflow: 12n, outflow: 0n });
    expect(flows.assets.get(token)).toEqual({ inflow: 4n, outflow: 0n });
    // A token's balance is the one the index adds up: its BTC-final part is that less what is not final yet
    expect(finalityOf(sim, me, token, flows, 10n)).toMatchObject({ total: 10n, inflow: 4n, finalBalance: 6n });
  });
});

describe('whether the balances are known', () => {
  it('in the simulator, always; on the node data source, once the node has answered for the account', () => {
    const sim = new Devnet({ seed: 25, now: NOW, historyMs: 60_000, trafficPerSec: 0 });
    expect(balancesKnown(sim, 'ab'.repeat(32))).toBe(true);
    const accounts = new Map<string, AccountState>();
    const rpc = { kind: 'rpc', peekAccount: (id: string) => accounts.get(id) } as unknown as Chain;
    const me = 'cd'.repeat(32);
    expect(balancesKnown(rpc, me)).toBe(false);
    // A new account: the node answers with no balances, which is an empty wallet
    accounts.set(me, { id: me, nonce: 0, balances: new Map(), opIds: [] });
    expect(balancesKnown(rpc, me)).toBe(true);
  });
});

describe('resubmitting a waiting path B transfer via path C', () => {
  const to = 'ab'.repeat(32);
  const token = 'cd'.repeat(32);
  const record = (asset: string, amount: bigint) => ({ op: { nonce: 7, maxGas: 60_000, action: { kind: 'AssetTransfer', asset, to, amount } } }) as unknown as OpRecord;
  const meta = (id: string, decimals: number, pending = false): AssetMeta => ({ id, symbol: 'T', name: 'T', decimals, issuer: null, ...(pending ? { pending } : {}) });
  const chainOf = (assets: Map<string, AssetMeta>) => ({ kind: 'sim', assets }) as unknown as Chain;

  it('carries the amount in whole units, which the send page reads back as the same base units', () => {
    const route = resendViaNative(record(KSA_ASSET_ID, 500_000_000n), chainOf(new Map([[KSA_ASSET_ID, meta(KSA_ASSET_ID, 8)]])));
    // 5 KSA, not the 500,000,000 KSA its base units would read as
    expect(route).toEqual({ name: 'send', path: 'C', nonce: '7', gas: '60000', to, asset: KSA_ASSET_ID, amount: '5' });
    const cases: [bigint, number][] = [[1n, 8], [500_000_000n, 8], [123_456_789_012n, 8], [1_000n, 2], [7n, 0], [10n ** 30n + 1n, 18]];
    for (const [units, decimals] of cases) {
      const sent = resendViaNative(record(token, units), chainOf(new Map([[token, meta(token, decimals)]])));
      // through the link's address, then the send form's reading of it
      const opened = parseRoute(href(sent));
      expect(opened).toEqual(sent);
      expect(parseAmount(linkAmount(opened.name === 'send' ? opened.amount : undefined), decimals)).toBe(units);
    }
  });

  it('carries no amount while the node has yet to name the asset, and a link gives the form whole units only', () => {
    expect(resendViaNative(record(token, 500n), chainOf(new Map([[token, meta(token, 0, true)]])))).toEqual({ name: 'send', path: 'C', nonce: '7', gas: '60000', to, asset: token });
    expect(resendViaNative(record(token, 500n), chainOf(new Map()))).not.toHaveProperty('amount');
    expect(['5', '0.25', '12.5'].map(linkAmount)).toEqual(['5', '0.25', '12.5']);
    expect(['', '.5', '5.', '1e3', '-1', '1,000', ' 5', undefined].map(linkAmount)).toEqual(['', '', '', '', '', '', '', '']);
  });

  it('carries a known KS-20 token as the asset of its transfer, and nothing but the nonce and the gas for any other call (D-123)', () => {
    // transfer(to, 12_500_000): the recipient's 32 bytes, then the amount as a u128, little-endian
    const call = (contract: string) =>
      ({ op: { nonce: 7, maxGas: 130_000, action: { kind: 'Call', contract, method: 'transfer', args: { borsh: `${to}20bcbe${'00'.repeat(13)}` }, funds: [] } } }) as unknown as OpRecord;
    const rpc = {
      kind: 'rpc',
      assets: new Map(),
      tokenBook: { standardOf: (id: string) => (id === token ? 'KS-20' : null), assets: new Map([[token, meta(token, 6)]]) },
    } as unknown as Chain;
    const route = resendViaNative(call(token), rpc);
    expect(route).toEqual({ name: 'send', path: 'C', nonce: '7', gas: '130000', to, asset: token, amount: '12.5' });
    expect(parseRoute(href(route))).toEqual(route);
    expect(resendViaNative(call('ef'.repeat(32)), rpc)).toEqual({ name: 'send', path: 'C', nonce: '7', gas: '130000' });
  });
});

describe("the send page's max_gas", () => {
  it('is taken from the gas a transfer uses, below which the transfer fails and pays its fee all the same, to the block gas limit', () => {
    expect(SEND_GAS_MIN).toBe(PARAMS.ASSET_TRANSFER_GAS);
    expect(sendMaxGas('10,000')).toBe(10_000);
    expect(sendMaxGas('9999')).toBeUndefined();
    expect(sendMaxGas('1000')).toBeUndefined();
    expect(sendMaxGas('50_000')).toBe(50_000);
    expect(sendMaxGas('100 000 000')).toBe(PARAMS.BLOCK_GAS_LIMIT);
    expect(sendMaxGas('100000001')).toBeUndefined();
    for (const text of ['', '1e5', '20000.5', '-20000', 'max']) expect(sendMaxGas(text)).toBeUndefined();
  });
});
