/**
 * The page's reads of the node's index of the token standards' events (chain/rpc/tokens.ts, D-120, D-123): names cleaned like a
 * built-in asset's, the reads an account's holdings, a contract's declaration and a token's facts make and when they are made again,
 * and a node without the index asked once
 */

import { describe, expect, it } from 'vitest';
import { RPC_ERROR_CODES, RpcError, RpcTransportError, encodeKs20Event, fromHex, toHex, type AccountAssets, type TokenInfo } from '@ksana/sdk';
import { HOLDINGS_MS, RETRY_MS, TokenBook, eventAccounts, tokenAsset } from './tokens';
import type { VmEvent } from '../types';

const TOKEN = '0841ac'.padEnd(60, '7') + 'ab34';
const OTHER = 'cd'.repeat(32);
const NFTS = 'ef'.repeat(32);
const ALICE = '11'.repeat(32);
const BOB = '22'.repeat(32);
const at = { height: 10n, hash: new Uint8Array(32) };

function info(contract: string, o: Partial<TokenInfo> = {}): TokenInfo {
  return {
    contract: fromHex(contract, 32),
    standard: 'KS-20',
    extensions: [],
    name: 'Tutorial Token',
    symbol: 'TUT',
    decimals: 8,
    supply: 1_000n,
    holders: 2n,
    declared: { height: 3n, slot: 0, entry: 1 },
    irregular: false,
    at,
    ...o,
  };
}

/**
 * A node with the index, answering `contracts` (their declared standards), `tokens` and `holdings` (an account's, two items a page),
 * counting the calls; `down` makes every call fail with no answer, `old` answers as a node without the index
 */
function fakeNode(o: { contracts?: Record<string, string[]>; tokens?: Record<string, TokenInfo>; holdings?: Record<string, AccountAssets['assets']> } = {}) {
  const calls: string[] = [];
  const state = { down: false, old: false };
  const fail = (method: string) => {
    if (state.old) throw new RpcError(RPC_ERROR_CODES.METHOD_NOT_FOUND, 'Method not found', undefined, method);
    if (state.down) throw new RpcTransportError('no answer');
  };
  const node = {
    async getContract(contract: Uint8Array | string) {
      const id = typeof contract === 'string' ? contract : toHex(contract);
      calls.push(`getContract ${id.slice(0, 4)}`);
      fail('ksana_getContract');
      const standards = o.contracts?.[id];
      if (!standards) throw new RpcError(RPC_ERROR_CODES.NOT_FOUND, 'not a contract');
      return { contract: fromHex(id, 32), code_hash: new Uint8Array(32), deployer: fromHex(ALICE, 32), standards, declared: standards.length ? { height: 3n, slot: 0, entry: 1 } : null, at };
    },
    async getToken(contract: Uint8Array | string) {
      const id = typeof contract === 'string' ? contract : toHex(contract);
      calls.push(`getToken ${id.slice(0, 4)}`);
      fail('ksana_getToken');
      const t = o.tokens?.[id];
      if (!t) throw new RpcError(RPC_ERROR_CODES.NOT_FOUND, 'not a token');
      return t;
    },
    async getAccountAssets(account: Uint8Array | string, options: { after?: string | null } = {}) {
      const id = typeof account === 'string' ? account : toHex(account);
      calls.push(`getAccountAssets ${id.slice(0, 4)} ${options.after ?? '-'}`);
      fail('ksana_getAccountAssets');
      const all = o.holdings?.[id] ?? [];
      const from = options.after === null || options.after === undefined ? 0 : Number(options.after);
      return { assets: all.slice(from, from + 2), next: from + 2 < all.length ? String(from + 2) : null, at };
    },
    async getTokenHolders(contract: Uint8Array | string) {
      calls.push(`getTokenHolders ${String(contract).slice(0, 4)}`);
      fail('ksana_getTokenHolders');
      return { holders: [{ account: fromHex(ALICE, 32), balance: 900n }], next: 'aa', at };
    },
    async getAssetStatus(asset: Uint8Array | string, account: Uint8Array | string) {
      calls.push(`getAssetStatus ${String(asset).slice(0, 4)} ${String(account).slice(0, 4)}`);
      if (state.old) throw new RpcError(RPC_ERROR_CODES.METHOD_NOT_FOUND, 'Method not found');
      return { asset: fromHex(String(asset), 32), account: fromHex(String(account), 32), status: ['frozen' as const], can_send: false, can_receive: true, at };
    },
  };
  return { node, calls, state };
}

/** A book over the fake node, its clock, and the changes it told; `settle` lets its reads come in */
function book(node: ReturnType<typeof fakeNode>['node']) {
  let clock = 1_800_000_000_000;
  const changes: { account?: string; contract?: string }[] = [];
  const b = new TokenBook({ node: () => node as never, now: () => clock, changed: (c) => changes.push(c) });
  return { b, changes, tick: (ms: number) => (clock += ms) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Tokens as assets (D-123)', () => {
  it('a token is named as the index names it, its symbol by its ID where it names none or reads as KSA or bitcoin', () => {
    const facts = { standard: 'KS-20' as const, extensions: [], name: 'Tutorial Token', symbol: 'TUT', decimals: 8, supply: 1_000n, holders: 2n, declared: '3:0:1', irregular: false };
    const tut = tokenAsset(TOKEN, facts);
    expect({ name: tut.name, symbol: tut.symbol, decimals: tut.decimals, issuer: tut.issuer, standard: tut.standard, totalSupply: tut.totalSupply, pending: tut.pending }).toEqual({
      name: 'Tutorial Token',
      symbol: 'TUT',
      decimals: 8,
      issuer: TOKEN,
      standard: 'KS-20',
      totalSupply: 1_000n,
      pending: undefined,
    });
    // a symbol is cut to 8 characters, as a built-in asset's is
    expect(tokenAsset(TOKEN, { ...facts, symbol: 'LONGSYMBOL' }).symbol).toBe('LONGSYMB');
    const fake = tokenAsset(TOKEN, { ...facts, name: 'Ksana', symbol: 'KSA' });
    expect([fake.name, fake.symbol, fake.lookalike]).toEqual(['Ksana', 'Token 0841ac', 'KSA']);
    expect(tokenAsset(TOKEN, { ...facts, name: 'Gold', symbol: '₿' }).symbol).toBe('Token 0841ac');
    const unnamed = tokenAsset(TOKEN, { ...facts, name: null, symbol: null, decimals: null });
    expect([unnamed.name, unnamed.symbol, unnamed.decimals]).toEqual([`Token ${TOKEN.slice(0, 8)}…ab34`, 'Token 0841ac', 0]);
    // before the index answered: its amounts show as being read
    expect(tokenAsset(TOKEN).pending).toBe(true);
  });

  it('an account’s holdings are read once, again once more operations name it or a minute on, each token and collection read after', async () => {
    const f = fakeNode({
      tokens: { [TOKEN]: info(TOKEN), [NFTS]: info(NFTS, { standard: 'KS-721', name: 'Pictures', symbol: 'PIC', decimals: null, supply: 3n }) },
      holdings: {
        [ALICE]: [
          { kind: 'asset', asset: new Uint8Array(32), balance: 5n },
          { kind: 'token', contract: fromHex(TOKEN, 32), balance: 250n },
          { kind: 'nft', contract: fromHex(NFTS, 32), count: 2n },
        ],
      },
    });
    const { b, changes, tick } = book(f.node);
    b.wantHoldings(ALICE, 0);
    b.wantHoldings(ALICE, 0);
    await settle();
    await settle();
    // every page of it, one at a time; the built-in asset is the node's account balances' to give
    expect(f.calls.filter((c) => c.startsWith('getAccountAssets'))).toEqual(['getAccountAssets 1111 -', 'getAccountAssets 1111 2']);
    expect(b.holdings.get(ALICE)?.tokens).toEqual(new Map([[TOKEN, 250n]]));
    expect(b.holdings.get(ALICE)?.collections).toEqual(new Map([[NFTS, 2n]]));
    expect(changes).toContainEqual({ account: ALICE });
    // ...and the token and the collection it names, which show by their IDs until then
    expect(f.calls.filter((c) => c.startsWith('getToken'))).toEqual(['getToken 0841', 'getToken efef']);
    await settle();
    expect(b.assets.get(TOKEN)?.symbol).toBe('TUT');
    expect(b.collections.get(NFTS)?.symbol).toBe('PIC');
    expect(b.standardOf(TOKEN)).toBe('KS-20');
    expect(b.standardOf(NFTS)).toBe('KS-721');
    const reads = () => f.calls.filter((c) => c === 'getAccountAssets 1111 -').length;
    b.wantHoldings(ALICE, 0);
    expect(reads()).toBe(1);
    b.wantHoldings(ALICE, 1);
    await settle();
    expect(reads()).toBe(2);
    await settle();
    await settle();
    tick(HOLDINGS_MS - 1);
    b.wantHoldings(ALICE, 1);
    expect(reads()).toBe(2);
    tick(1);
    b.wantHoldings(ALICE, 1);
    expect(reads()).toBe(3);
    // a token read once is not read again for another account's holdings
    expect(f.calls.filter((c) => c === 'getToken 0841')).toHaveLength(1);
  });

  it('a standard’s events are read by the declaration of the contract that emitted them', async () => {
    const f = fakeNode({ contracts: { [TOKEN]: ['KS-20', 'KS-20-burnable'], [OTHER]: [] }, tokens: { [TOKEN]: info(TOKEN) } });
    const { b } = book(f.node);
    const transfer = toHex(encodeKs20Event({ kind: 'Transfer', from: fromHex(ALICE, 32), to: fromHex(BOB, 32), amount: 7n }));
    const ev = (contract: string): VmEvent => ({ name: 'data', fields: { contract, data: transfer }, raw: transfer });
    expect(b.eventOf(ev(TOKEN))).toBeUndefined();
    b.wantDeclaration(TOKEN);
    b.wantDeclaration(OTHER);
    b.wantDeclaration('99'.repeat(32));
    await settle();
    await settle();
    const te = b.eventOf(ev(TOKEN));
    expect(te).toMatchObject({ contract: TOKEN, standard: 'KS-20', event: { kind: 'Transfer', amount: 7n } });
    expect(te && eventAccounts(te)).toEqual([ALICE, BOB]);
    // the same bytes from a contract that declared no standard are none of its events
    expect(b.eventOf(ev(OTHER))).toBeNull();
    expect(b.declarations.get('99'.repeat(32))).toBeNull();
    expect(b.declarations.get(TOKEN)).toMatchObject({ standards: ['KS-20', 'KS-20-burnable'], declared: '3:0:1', deployer: ALICE });
    // the token's facts are read with its declaration
    expect(b.assets.get(TOKEN)?.name).toBe('Tutorial Token');
    // a mint names its recipient alone
    const mint = toHex(encodeKs20Event({ kind: 'Transfer', from: new Uint8Array(32), to: fromHex(BOB, 32), amount: 7n }));
    const minted = b.eventOf({ name: 'data', fields: { contract: TOKEN }, raw: mint });
    expect(minted && eventAccounts(minted)).toEqual([BOB]);
  });

  it('a node without the index is asked once; a read with no answer is asked again a while on', async () => {
    const f = fakeNode({ contracts: { [TOKEN]: ['KS-20'] } });
    const { b, tick } = book(f.node);
    f.state.down = true;
    b.wantDeclaration(TOKEN);
    await settle();
    expect(b.declarations.has(TOKEN)).toBe(false);
    b.wantDeclaration(TOKEN);
    expect(f.calls).toHaveLength(1);
    tick(RETRY_MS);
    f.state.down = false;
    f.state.old = true;
    b.wantDeclaration(TOKEN);
    await settle();
    expect(f.calls).toHaveLength(2);
    expect(b.indexed).toBe(false);
    // nothing of the index is asked again, and no event reads as a standard's
    b.wantHoldings(ALICE, 0);
    b.wantFacts(TOKEN);
    tick(RETRY_MS);
    b.wantDeclaration(TOKEN);
    expect(f.calls).toHaveLength(2);
    expect(b.eventOf({ name: 'data', fields: { contract: TOKEN }, raw: '00' })).toBeNull();
    expect(await b.readFacts(TOKEN)).toBe(false);
  });

  it('a token’s page reads its largest holders, and a built-in asset’s an account’s standing, which a node older than D-121 does not tell', async () => {
    const f = fakeNode();
    const { b, tick } = book(f.node);
    b.wantHolders(TOKEN);
    b.wantStanding(OTHER, ALICE);
    await settle();
    expect(b.holders.get(TOKEN)).toMatchObject({ holders: [{ account: ALICE, balance: 900n }], more: true });
    expect(b.standings.get(`${OTHER}:${ALICE}`)).toMatchObject({ status: ['frozen'], canSend: false, canReceive: true });
    b.wantHolders(TOKEN);
    expect(f.calls.filter((c) => c.startsWith('getTokenHolders'))).toHaveLength(1);
    tick(HOLDINGS_MS);
    f.state.old = true;
    b.wantStanding(OTHER, ALICE);
    await settle();
    expect(b.standings.get(`${OTHER}:${ALICE}`)).toBeNull();
    // a standing's method missing tells nothing of the index
    expect(b.indexed).toBe(true);
  });

  it('a token’s page reads its facts again with its largest holders, so that their number counts the list', async () => {
    const tokens = { [TOKEN]: info(TOKEN, { holders: 1n }) };
    const f = fakeNode({ tokens });
    const { b, tick } = book(f.node);
    const reads = () => f.calls.filter((c) => c === 'getToken 0841').length;
    // the wallet reads the token's facts when a holding names it
    b.wantFacts(TOKEN);
    await settle();
    expect(b.facts.get(TOKEN)?.holders).toBe(1n);
    // a transfer gives it a second holder, and its page, opened a moment later, asks as the page does and reads them again with the list
    tokens[TOKEN] = info(TOKEN, { holders: 2n });
    tick(1_000);
    b.wantFacts(TOKEN, true);
    b.wantHolders(TOKEN);
    await settle();
    expect(b.facts.get(TOKEN)?.holders).toBe(2n);
    expect(reads()).toBe(2);
    // neither is read again until the list is HOLDINGS_MS old, however often the page asks
    b.wantFacts(TOKEN, true);
    b.wantHolders(TOKEN);
    expect(reads()).toBe(2);
    tick(HOLDINGS_MS);
    b.wantFacts(TOKEN, true);
    b.wantHolders(TOKEN);
    await settle();
    expect(reads()).toBe(3);
    expect(f.calls.filter((c) => c.startsWith('getTokenHolders'))).toHaveLength(2);
  });
});
