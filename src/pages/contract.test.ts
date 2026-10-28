import { describe, expect, it } from 'vitest';
import { Devnet } from '../chain/sim/engine';
import { KSA_ASSET_ID } from '../chain/params';
import { fmtAmount, fmtInt } from '../lib/format';
import { t } from '../i18n';
import { readCall } from './Contract';

const NOW = Date.UTC(2026, 9, 1, 8, 0, 0);

describe('Read-only calls the simulator answers for its demo contracts (ksana_call)', () => {
  const sim = new Devnet({ seed: 7, now: NOW });
  const m = t().contract.result;

  it('the pool gives its reserves and quotes in KSA and TKN, each with its decimals', () => {
    const k = sim.balance(sim.ammContract, KSA_ASSET_ID);
    const tk = sim.balance(sim.ammContract, sim.tokenAsset);
    expect(k > 0n && tk > 0n).toBe(true);
    expect(readCall(sim, sim.ammContract, 'get_reserves', '')).toEqual({ ok: true, value: `KSA ${fmtAmount(k, 8)} · TKN ${fmtAmount(tk, 0)}` });
    // 2.5 KSA in, priced as the pool's swap prices it
    const amountIn = 250_000_000n;
    const out = (tk * amountIn * 997n) / (k * 1000n + amountIn * 997n);
    expect(out > 0n).toBe(true);
    expect(readCall(sim, sim.ammContract, 'quote', '2.5')).toEqual({ ok: true, value: m.quote('2.5', fmtAmount(out, 0)) });
    for (const bad of ['0', '-1', '0.000000001', 'ten']) expect(readCall(sim, sim.ammContract, 'quote', bad)).toEqual({ ok: false, value: m.needAmount(8) });
  });

  it('the payment trigger gives the asset it issues, not a price it never charges', () => {
    expect(sim.contracts.get(sim.triggerContract)?.readMethods).toEqual(['claimed', 'asset_id']);
    expect(readCall(sim, sim.triggerContract, 'asset_id', '')).toEqual({ ok: true, value: sim.passAsset });
  });

  it('the token gives its metadata field by field', () => {
    const tkn = sim.assets.get(sim.tokenAsset);
    expect(readCall(sim, sim.tokenContract, 'metadata', '')).toEqual({ ok: true, fields: [['name', tkn?.name], ['symbol', 'TKN'], ['decimals', '0']] });
  });

  it('the exchange gives its locks, a seller\'s locks and free balance, as the contract does', () => {
    const { locks, available } = sim.exchangeState();
    const lock = locks.find((l) => l.state === 'Claimed');
    expect(lock).toBeDefined();
    if (!lock || lock.paidSats === undefined || lock.ksaPaid === undefined) throw new Error('the simulator starts with a claimed lock');
    // Field by field in the order the contract returns them, a claim's after its state
    expect(readCall(sim, sim.exchangeContract, 'get_lock', lock.id.toString())).toEqual({
      ok: true,
      fields: [
        ['seller', lock.seller],
        ['beneficiary', lock.beneficiary],
        ['script', lock.script],
        ['price', `${fmtAmount(lock.price, 8)} KSA/sat`],
        ['ksa', `${fmtAmount(lock.ksa, 8)} KSA`],
        ['expiry', fmtInt(lock.expiry)],
        ['state', 'Claimed'],
        ['paid_sats', fmtInt(lock.paidSats)],
        ['ksa_paid', `${fmtAmount(lock.ksaPaid, 8)} KSA`],
      ],
    });
    expect(readCall(sim, sim.exchangeContract, 'get_lock', String(locks.length + 5))).toEqual({ ok: false, value: m.noLock });
    expect(readCall(sim, sim.exchangeContract, 'get_lock', 'first')).toEqual({ ok: false, value: m.needLock });
    expect(readCall(sim, sim.exchangeContract, 'lock_of_script', lock.script)).toEqual({ ok: true, value: lock.id.toString() });
    expect(readCall(sim, sim.exchangeContract, 'lock_of_script', '5120' + '00'.repeat(32))).toEqual({ ok: true, value: 'null' });
    const mine = locks.filter((l) => l.seller === lock.seller).map((l) => l.id.toString());
    expect(readCall(sim, sim.exchangeContract, 'lock_count', lock.seller)).toEqual({ ok: true, value: String(mine.length) });
    expect(readCall(sim, sim.exchangeContract, 'locks_of', lock.seller)).toEqual({ ok: true, value: `[${mine.join(', ')}]` });
    expect(readCall(sim, sim.exchangeContract, 'balance', lock.seller)).toEqual({ ok: true, value: `${fmtAmount(available(lock.seller), 8)} KSA` });
    expect(readCall(sim, sim.exchangeContract, 'balance', 'nobody')).toEqual({ ok: false, value: m.needSeller });
  });

  it('a method the simulator does not model says so rather than answering anything', () => {
    expect(readCall(sim, sim.tokenContract, 'allowance', '')).toEqual({ ok: false, value: m.notSimulated });
  });
});
