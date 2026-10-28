import { describe, expect, it } from 'vitest';
import { type KsanaRpcClient, RpcError, fromHex } from '@ksana/sdk';
import type { Chain } from '../chain/source';
import { ks20TransferArgs } from '../chain/views';
import { t } from '../i18n';
import { TOKEN_GAS_FLOOR, explainRefusal, knownContract, tokenGasFor, tokenTransferAction, tryTokenTransfer } from './tokenSend';

describe('sending a KS-20 token from the send page (D-123)', () => {
  const me = 'ab'.repeat(32);
  const token = 'a3'.repeat(32);
  const to = 'cd'.repeat(32);

  it('offers half again what the trial run used, rounded up to 10,000, never under 50,000', () => {
    expect(tokenGasFor(0n)).toBe(TOKEN_GAS_FLOOR);
    expect(tokenGasFor(33_000n)).toBe(50_000);
    expect(tokenGasFor(33_334n)).toBe(60_000);
    expect(tokenGasFor(40_000n)).toBe(60_000);
    expect(tokenGasFor(120_000n)).toBe(180_000);
  });

  it('is the token’s transfer(to, amount), its arguments in Borsh, and nothing the SDK refuses to build', () => {
    const a = tokenTransferAction(token, to, 1_000_000_000_000n);
    expect(a).toMatchObject({ kind: 'Call', contract: token, method: 'transfer', funds: [] });
    // The recipient's 32 bytes, then the amount as a u128, little-endian
    expect(a?.kind === 'Call' && a.args.borsh).toBe(`${to}0010a5d4e8${'00'.repeat(11)}`);
    expect(a && ks20TransferArgs(a)).toEqual({ to, amount: 1_000_000_000_000n });
    expect(tokenTransferAction(token, token, 1n)).toBeNull();
    expect(tokenTransferAction(token, '00'.repeat(32), 1n)).toBeNull();
    expect(tokenTransferAction(token, to, 0n)).toBeNull();
    expect(tokenTransferAction(token, to, 1n << 128n)).toBeNull();
  });

  it('says the standards’ reasons in the page’s language, and any other in the contract’s own words, cut short', () => {
    const m = t().asset.send.refusal;
    expect(explainRefusal('revert: insufficient balance')).toBe(m.balance);
    expect(explainRefusal('revert: recipient is this contract')).toBe(m.self);
    expect(explainRefusal('revert: rejected: frozen')).toBe(m.rules('frozen'));
    expect(explainRefusal('revert: not today')).toBe(m.other('not today'));
    expect(explainRefusal(`revert: ${'x'.repeat(500)}`)).toBe(m.other(`${'x'.repeat(160)}…`));
    expect(explainRefusal('trap: unreachable')).toBe(m.other('trap: unreachable'));
  });

  it('tries the transfer as the sender: what it used sets max_gas, a refusal is kept, a busy node is asked again', async () => {
    const asked: unknown[] = [];
    const node = (answers: (() => unknown)[]) =>
      ({
        call: async (req: unknown) => {
          asked.push(req);
          return (answers.shift() as () => unknown)();
        },
      }) as unknown as Pick<KsanaRpcClient, 'call'>;
    const busy = () => {
      throw new RpcError(-32009, 'ksana_call: the node is busy');
    };
    const ok = () => ({ success: true, error: null, gas_used: 41_000n });
    const waits: number[] = [];
    const wait = async (ms: number) => {
      waits.push(ms);
    };
    expect(await tryTokenTransfer(node([busy, busy, ok]), me, token, to, 5n, () => false, wait)).toEqual({ state: 'ok', gas: 70_000, used: 41_000n });
    expect(waits).toHaveLength(2);
    expect(asked[0]).toEqual({ contract: fromHex(token), method: 'transfer', args: fromHex(`${to}05${'00'.repeat(15)}`), caller: fromHex(me) });
    const refused = () => ({ success: false, error: 'revert: insufficient balance', gas_used: 100_000_000n });
    expect(await tryTokenTransfer(node([refused]), me, token, to, 5n)).toEqual({ state: 'refused', reason: 'revert: insufficient balance' });
    // Still busy after the retries, another failure, or a form that moved on meanwhile: the transfer goes unchecked
    expect(await tryTokenTransfer(node([busy, busy, busy, busy]), me, token, to, 5n, () => false, wait)).toEqual({ state: 'unchecked' });
    expect(
      await tryTokenTransfer(
        node([
          () => {
            throw new Error('offline');
          },
        ]),
        me,
        token,
        to,
        5n,
      ),
    ).toEqual({ state: 'unchecked' });
    const before = asked.length;
    expect(await tryTokenTransfer(node([busy, ok]), me, token, to, 5n, () => true, wait)).toEqual({ state: 'unchecked' });
    expect(asked.length - before).toBe(1);
  });

  it('knows a contract from what the page saw, or from the declarations the index gave', () => {
    const declared = 'e1'.repeat(32);
    const seen = 'e2'.repeat(32);
    const sim = {
      kind: 'rpc',
      isContract: (id: string) => id === seen,
      tokenBook: { declarations: new Map([[declared, { standards: [] }], [to, null]]) },
    } as unknown as Chain;
    expect(knownContract(sim, declared)).toBe(true);
    expect(knownContract(sim, seen)).toBe(true);
    expect(knownContract(sim, to)).toBe(false);
    expect(knownContract(sim, me)).toBe(false);
  });
});
