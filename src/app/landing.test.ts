/**
 * What the connecting screen tells the first load a page opened from a link shows first (`ListAhead` in `App.tsx`): the listing its
 * view asks for, by the key the view asks by, and as many operations as the view shows
 */

import { describe, expect, it } from 'vitest';
import { RpcChain } from '../chain/rpc/chain';
import { landingList } from './App';

describe('The listing a page opened from a link shows first', () => {
  const rpc = new RpcChain({ url: 'http://node.test', chain: 'devnet' }, { fetch: (async () => new Response('', { status: 503 })) as typeof fetch, manual: true });
  // the x coordinate of secp256k1's generator: a key, so an account with a Taproot address
  const ALICE = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

  it("the overview's latest operations and the operations page's, but not its entry pool", () => {
    expect(landingList(rpc, { name: 'overview' })).toEqual({ key: 'latest', rows: 9 });
    expect(landingList(rpc, { name: 'ops', tab: 'latest' })).toEqual({ key: 'latest', rows: 60 });
    expect(landingList(rpc, { name: 'ops', tab: 'mempool' })).toBeUndefined();
  });

  it("an account's, by its ID in either case or by its address, as its view asks; none for what is neither", () => {
    expect(landingList(rpc, { name: 'account', id: ALICE })).toEqual({ key: ALICE, rows: 50 });
    expect(landingList(rpc, { name: 'account', id: ALICE.toUpperCase() })).toEqual({ key: ALICE, rows: 50 });
    expect(landingList(rpc, { name: 'account', id: rpc.addressOf(ALICE) })).toEqual({ key: ALICE, rows: 50 });
    expect(landingList(rpc, { name: 'account', id: 'tb1qnotanaddress' })).toBeUndefined();
    expect(landingList(rpc, { name: 'account', id: ALICE.slice(2) })).toBeUndefined();
  });

  it("a contract's, by its ID in either case; none for what is not one", () => {
    expect(landingList(rpc, { name: 'contract', id: ALICE.toUpperCase() })).toEqual({ key: ALICE, rows: 50 });
    expect(landingList(rpc, { name: 'contract', id: rpc.addressOf(ALICE) })).toBeUndefined();
  });

  it('none for a page that shows no listing first', () => {
    expect(landingList(rpc, { name: 'block', id: '291' })).toBeUndefined();
    expect(landingList(rpc, { name: 'op', id: ALICE })).toBeUndefined();
    expect(landingList(rpc, { name: 'wallet' } as never)).toBeUndefined();
  });
});
