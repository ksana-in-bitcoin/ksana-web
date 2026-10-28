import { describe, expect, it } from 'vitest';
import { KSA_ASSET_ID } from '../chain/params';
import type { TokenEvent } from '../chain/rpc/tokens';
import type { Chain } from '../chain/source';
import type { Action, AssetChange, OpRecord, VmEvent } from '../chain/types';
import { fromHex } from '@ksana/sdk';
import { askedFor } from './assets';

describe('the assets the wallet shows without being asked (D-123)', () => {
  const me = 'ab'.repeat(32);
  const other = 'cd'.repeat(32);
  const sent = 'a1'.repeat(32);
  const attached = 'a2'.repeat(32);
  const token = 'a3'.repeat(32);
  const deployed = 'a4'.repeat(32);
  const paid = 'a5'.repeat(32);
  const collection = 'a6'.repeat(32);
  const called = 'a7'.repeat(32);
  const airdrop = 'b1'.repeat(32);
  const issued = 'b2'.repeat(32);
  const pool = 'ef'.repeat(32);
  const market = 'f0'.repeat(32);
  let n = 0;
  const op = (account: string, action: Action, changes: AssetChange[] = [], events: VmEvent[] = [], ok = true): OpRecord =>
    ({
      id: (++n).toString(16).padStart(64, '0'),
      op: { version: 2, chainId: 1002, account, nonce: n, fee: { kind: 'Token', amount: 100n }, maxGas: 1_000_000, action },
      path: 'B',
      size: 200,
      submittedAt: 0,
      origin: 'chain',
      height: 20,
      result: { ok, gasUsed: 1, events, changes },
    }) as unknown as OpRecord;
  const nft: VmEvent = { name: 'transfer', fields: { contract: collection }, raw: '00' };
  const ops = [
    op(me, { kind: 'AssetTransfer', asset: sent, to: other, amount: 1n }),
    op(me, { kind: 'Call', contract: token, method: 'approve', args: {}, funds: [{ asset: attached, amount: 2n }] }),
    op(me, { kind: 'Deploy', codeHash: 'ee'.repeat(32), codeSize: 1, args: {}, contract: deployed } as unknown as Action),
    // A swap the wallet made, paid back in an asset it never held before; an NFT bought through a market
    op(me, { kind: 'Call', contract: pool, method: 'swap', args: {} }, [{ kind: 'payout', asset: paid, from: pool, to: me, amount: 3n, events: 0 }]),
    op(me, { kind: 'Call', contract: market, method: 'buy', args: {} }, [], [nft]),
    // A failed call still asked for its contract
    op(me, { kind: 'Call', contract: called, method: 'mint', args: {} }, [], [], false),
    // What others sent or issued it: nobody asked
    op(other, { kind: 'AssetTransfer', asset: airdrop, to: me, amount: 5n }),
    op(other, { kind: 'Call', contract: 'f1'.repeat(32), method: 'mint', args: {} }, [{ kind: 'issue', asset: issued, to: me, amount: 7n, events: 0 }]),
  ];
  const sim = {
    kind: 'rpc',
    peekAccount: (id: string) => (id === me ? { id, nonce: 0, balances: new Map(), opIds: ops.map((r) => r.id) } : undefined),
    getOp: (id: string) => ops.find((r) => r.id === id),
    tokenBook: {
      eventOf: (e: VmEvent): TokenEvent | null =>
        e.fields.contract === collection ? { contract: collection, standard: 'KS-721', event: { kind: 'Transfer', from: fromHex(market), to: fromHex(me), token_id: new Uint8Array(32) } } : null,
    },
  } as unknown as Chain;

  it('are KSA and what an op the account signed moved, its contracts and what they paid it included', () => {
    const asked = askedFor(sim, me);
    expect([...asked].sort()).toEqual([KSA_ASSET_ID, sent, attached, token, deployed, paid, collection, called, pool, market].sort());
    for (const id of [airdrop, issued]) expect(asked.has(id)).toBe(false);
  });
});
