/**
 * The page's Bitcoin RPC must be on the BTC network of the page's network (A2-11, D-106). A `raw()` descriptor matches the same
 * script on every network and the wallet's signature does not depend on it, so with a bitcoind on another network the page would
 * list the wallet's coins there and broadcast where the node never looks: for a top-up, a real payment to the seller. Coins are
 * listed and transactions broadcast only once `getblockchaininfo` names the right chain, and path C and top-ups check it, after
 * the node's chain ID, before the wallet is asked to sign anything.
 *
 * So must the wallet be, when it says which BTC network it is set to: on signet the address does not tell, `tb1…` being testnet3's
 * and testnet4's too, and without a Bitcoin RPC Unisat lists the coins and broadcasts on the chain it is set to. A wallet set to
 * another network is refused when it connects and before path C or a top-up is signed, and Unisat's own listing and broadcast
 * serve only the connected Unisat wallet once it names the page's network.
 *
 * On the signet page the Esplora interface under the Bitcoin RPC's URL lists the coins when there is one (D-108), once its genesis
 * block is signet's; otherwise the page scans as before.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChainMismatchError,
  DEVNET,
  MockUnisatWallet,
  SIGNET,
  UnisatAdapter,
  type UnisatProvider,
  type UnsignedVmOp,
  type WalletAccount,
  type WalletAdapter,
  XverseAdapter,
  accountOf,
  accountToAddress,
  buildTopUp,
  claimArgs,
  encodeVmOp,
  p2trScriptFromOutputKey,
  sha256,
  toHex,
  xOnlyPublicKey,
} from '@ksana/sdk';
import { nativeTxFee } from '../chain/fees';
import { RpcChain } from '../chain/rpc/chain';
import { t } from '../i18n';
import { BtcChainMismatchError, BtcRpc, WalletNetworkMismatchError, type WalletUtxo } from './btc';
import { type ConnectedWallet, connectWallet, connectedStore, connectingStore, disconnectWallet } from './connect';
import { MAX_FEE_RATE, type UtxoChoice, coverage, coveredOnceConfirmed, loadUtxos, offeredFeeRate, spendable, submitNative, submitTopUp, unconfirmed } from './native';

const SECRET = sha256(new TextEncoder().encode('ksana/web-test/btc-network'));
const ACCOUNT = accountOf(SECRET);
const SCRIPT = p2trScriptFromOutputKey(ACCOUNT);
const SIGN_ASKED = 'the wallet was asked to sign';

/**
 * A node on chain `chainId` and a bitcoind on BTC `btcChain` (`getblockchaininfo`'s name: main, signet, regtest), told apart by
 * the method; records every method called.
 */
function fakeServers(chainId: number, btcChain: string, calls: string[]): typeof fetch {
  const at = { height: '7', hash: '11'.repeat(32) };
  const results: Record<string, unknown> = {
    ksana_getChainInfo: { chain_id: chainId, tip: at, daa_score: '7', protocol_version: 2, next_upgrade: null, max_known_version: 2, finalized: at },
    getblockchaininfo: { chain: btcChain, blocks: 120, headers: 120, bestblockhash: '22'.repeat(32) },
    scantxoutset: { success: true, unspents: [{ txid: 'AB'.repeat(32), vout: 1, amount: 0.0015, height: 100 }] },
    sendrawtransaction: 'CD'.repeat(32),
  };
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string };
    calls.push(body.method);
    if (!(body.method in results)) throw new Error(`unexpected ${body.method}`);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: results[body.method] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

/** The page on devnet (BTC regtest), with a Bitcoin RPC unless `btcUrl` is null */
function rpcChain(fetchFn: typeof fetch, btcUrl: string | null = 'http://btc.test'): RpcChain {
  return new RpcChain({ url: 'http://node.test', chain: 'devnet', ...(btcUrl ? { btcUrl } : {}) }, { fetch: fetchFn, manual: true });
}

/** A wallet that records being asked to sign, and stops there */
function testWallet(asked: string[]): ConnectedWallet {
  const internalKey = toHex(xOnlyPublicKey(SECRET));
  const account: WalletAccount = { address: accountToAddress(ACCOUNT, 'regtest'), publicKey: internalKey, addressType: 'p2tr', internalKey, account: toHex(ACCOUNT) };
  const adapter: WalletAdapter = {
    name: 'test',
    getAccount: async () => account,
    signBip322: async () => {
      asked.push('signBip322');
      throw new Error(SIGN_ASKED);
    },
    signPsbt: async () => {
      asked.push('signPsbt');
      throw new Error(SIGN_ASKED);
    },
  };
  return { kind: 'mock', name: 'test', adapter, account };
}

const unsignedOp = (): UnsignedVmOp => ({
  version: 2,
  chain_id: DEVNET.chain_id,
  account: ACCOUNT,
  nonce: 0n,
  fee: { kind: 'BtcNative' },
  max_gas: DEVNET.native_max_gas,
  action: { kind: 'AssetTransfer', asset: new Uint8Array(32), to: new Uint8Array(32).fill(7), amount: 5n },
});
const choice: UtxoChoice = { source: 'manual', utxos: [{ txid: 'ab'.repeat(32), vout: 0, valueSat: 150_000 }] };
const pathC = { choice, feeRate: 1 };
const topUp = { exchange: 'ec'.repeat(32), lockId: 0n, sats: 1_000n, choice, feeRate: 1 };

describe("the page's Bitcoin RPC is on the page's BTC network (A2-11, D-106)", () => {
  it('coins are listed and transactions broadcast only once getblockchaininfo names that network', async () => {
    for (const [network, btcChain] of [
      ['regtest', 'signet'],
      ['regtest', 'main'],
      ['signet', 'regtest'],
      ['signet', 'main'],
      ['signet', 'testnet4'],
    ] as const) {
      const calls: string[] = [];
      // on signet the Esplora reads, which these servers do not answer, are asked again without a pause (with one the test took 4.9 s of its 5)
      const btc = new BtcRpc('/btc', network, fakeServers(DEVNET.chain_id, btcChain, calls), 0);
      const refused = await btc.utxosOf(SCRIPT).then(
        () => null,
        (e: unknown) => e,
      );
      expect(refused).toBeInstanceOf(BtcChainMismatchError);
      expect(refused).toMatchObject({ url: '/btc', chain: btcChain, expected: network });
      expect((refused as Error).message).toContain(`BTC ${btcChain}`);
      await expect(btc.sendRawTransaction(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(BtcChainMismatchError);
      // nothing but the chain was read: no scan of the wallet's script, no broadcast
      expect(calls).toEqual(['getblockchaininfo', 'getblockchaininfo']);
    }
    // a reply that names no chain is refused too
    const nameless = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const { id } = JSON.parse(String(init?.body)) as { id: number };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { blocks: 120 } }), { status: 200 });
    }) as typeof fetch;
    const bare = new BtcRpc('/btc', 'signet', nameless, 0);
    await expect(bare.utxosOf(SCRIPT)).rejects.toMatchObject({ name: 'BtcChainMismatchError', chain: 'undefined', expected: 'signet' });
    // on the page's network it lists and broadcasts, reading the chain again before each
    const calls: string[] = [];
    const btc = new BtcRpc('/btc', 'regtest', fakeServers(DEVNET.chain_id, 'regtest', calls));
    expect(await btc.utxosOf(SCRIPT)).toEqual([{ txid: 'ab'.repeat(32), vout: 1, valueSat: 150_000, height: 100 }]);
    expect(await btc.sendRawTransaction(new Uint8Array([1, 2, 3]))).toBe('cd'.repeat(32));
    expect(calls).toEqual(['getblockchaininfo', 'scantxoutset', 'getblockchaininfo', 'sendrawtransaction']);
  });

  it('path C and top-ups are refused before the wallet is asked to sign', async () => {
    // the page on devnet (BTC regtest), its Bitcoin RPC on another BTC network: refused after the node's chain ID is read
    for (const btcChain of ['signet', 'main']) {
      const calls: string[] = [];
      const asked: string[] = [];
      const chain = rpcChain(fakeServers(DEVNET.chain_id, btcChain, calls));
      await expect(submitNative(chain, testWallet(asked), unsignedOp(), pathC)).rejects.toBeInstanceOf(BtcChainMismatchError);
      await expect(submitTopUp(chain, testWallet(asked), topUp)).rejects.toBeInstanceOf(BtcChainMismatchError);
      expect(asked).toEqual([]);
      expect(calls).toEqual(['ksana_getChainInfo', 'getblockchaininfo', 'ksana_getChainInfo', 'getblockchaininfo']);
    }
    // the node on another network: refused before the Bitcoin RPC is asked anything
    const calls: string[] = [];
    const asked: string[] = [];
    const chain = rpcChain(fakeServers(SIGNET.chain_id, 'regtest', calls));
    await expect(submitNative(chain, testWallet(asked), unsignedOp(), pathC)).rejects.toBeInstanceOf(ChainMismatchError);
    await expect(submitTopUp(chain, testWallet(asked), topUp)).rejects.toBeInstanceOf(ChainMismatchError);
    expect(asked).toEqual([]);
    expect(calls).toEqual(['ksana_getChainInfo', 'ksana_getChainInfo']);
  });

  it('with the node and the Bitcoin RPC on the right networks, or no Bitcoin RPC, path C goes on to the wallet', async () => {
    for (const btcUrl of ['http://btc.test', null]) {
      const calls: string[] = [];
      const asked: string[] = [];
      const chain = rpcChain(fakeServers(DEVNET.chain_id, 'regtest', calls), btcUrl);
      await expect(submitNative(chain, testWallet(asked), unsignedOp(), pathC)).rejects.toThrow(SIGN_ASKED);
      expect(asked).toEqual(['signBip322']);
      expect(calls).toEqual(btcUrl ? ['ksana_getChainInfo', 'getblockchaininfo'] : ['ksana_getChainInfo']);
    }
  });
});

describe("the BTC fee rate keeps to the page's cap (the first audit's F-15)", () => {
  it("the node's suggestion is taken up to the cap, a node's own by default", () => {
    expect(MAX_FEE_RATE).toBe(100);
    for (const [suggested, offered] of [
      [1, 1],
      [2, 2],
      [100, 100],
      [101, 100],
      [5_000, 100],
    ] as const)
      expect(offeredFeeRate(suggested), String(suggested)).toBe(offered);
  });

  it('path C and top-ups above it are refused before anything is read or signed', async () => {
    const calls: string[] = [];
    const asked: string[] = [];
    const chain = rpcChain(fakeServers(DEVNET.chain_id, 'regtest', calls));
    for (const feeRate of [100.5, 101, 5_000, Number.NaN]) {
      await expect(submitNative(chain, testWallet(asked), unsignedOp(), { ...pathC, feeRate })).rejects.toThrow(/above this page’s limit of 100\u{a0}sat\/vB: nothing was signed/u);
      await expect(submitTopUp(chain, testWallet(asked), { ...topUp, feeRate })).rejects.toThrow(/above this page’s limit of 100\u{a0}sat\/vB: nothing was signed/u);
    }
    expect(asked).toEqual([]);
    expect(calls).toEqual([]);
    // at the cap path C goes on to the wallet
    await expect(submitNative(chain, testWallet(asked), unsignedOp(), { ...pathC, feeRate: 100 })).rejects.toThrow(SIGN_ASKED);
    expect(asked).toEqual(['signBip322']);
  });
});

/** The page on signet, with a Bitcoin RPC only when `btcUrl` is given */
function signetChain(fetchFn: typeof fetch, btcUrl: string | null = null): RpcChain {
  return new RpcChain({ url: 'http://node.test', chain: 'signet', ...(btcUrl ? { btcUrl } : {}) }, { fetch: fetchFn, manual: true });
}

const signetOp = (): UnsignedVmOp => ({ ...unsignedOp(), chain_id: SIGNET.chain_id, max_gas: SIGNET.native_max_gas });

/**
 * The Unisat extension with the test key on its signet address, set to the chain `chain` (`getChain`; none: a version without it),
 * recording its signatures and its own coin listing and broadcast.
 */
function installUnisat(chain: string | null, used: string[]): UnisatProvider {
  const mock = new MockUnisatWallet({ secretKey: SECRET, network: 'signet', ...(chain ? { chain } : {}) });
  const provider = {
    requestAccounts: () => mock.requestAccounts(),
    getPublicKey: () => mock.getPublicKey(),
    signMessage: (message: string, type?: 'ecdsa' | 'bip322-simple') => {
      used.push('signMessage');
      return mock.signMessage(message, type);
    },
    signPsbt: (psbt: string, options?: Parameters<UnisatProvider['signPsbt']>[1]) => {
      used.push('signPsbt');
      return mock.signPsbt(psbt, options);
    },
    ...(chain ? { getChain: () => mock.getChain() } : {}),
    getBitcoinUtxos: async () => {
      used.push('getBitcoinUtxos');
      return [{ txid: 'AB'.repeat(32), vout: 0, satoshis: 150_000 }];
    },
    pushTx: async () => {
      used.push('pushTx');
      return 'CD'.repeat(32);
    },
  };
  (globalThis as { unisat?: unknown }).unisat = provider;
  return provider;
}

async function connected(kind: ConnectedWallet['kind'], adapter: WalletAdapter, name = 'Unisat'): Promise<ConnectedWallet> {
  return { kind, name, adapter, account: await adapter.getAccount() };
}

describe("the wallet's own BTC network is the page's (A2-11, D-106)", () => {
  afterEach(() => {
    delete (globalThis as { unisat?: unknown }).unisat;
    disconnectWallet();
  });

  it('Unisat set to another chain is refused: no coins listed, nothing signed or broadcast', async () => {
    for (const [unisatChain, name] of [
      ['BITCOIN_TESTNET4', 'Bitcoin Testnet4 (Beta)'],
      ['BITCOIN_TESTNET', 'Bitcoin Testnet'],
      ['BITCOIN_MAINNET', 'Bitcoin'],
      ['FRACTAL_BITCOIN_TESTNET', 'Fractal Bitcoin Testnet'],
    ] as const) {
      const used: string[] = [];
      const wallet = await connected('unisat', new UnisatAdapter(installUnisat(unisatChain, used)));
      // the address is a signet one all the same
      expect(wallet.account.address).toBe(accountToAddress(ACCOUNT, 'signet'));
      for (const btcUrl of [null, 'http://btc.test']) {
        const calls: string[] = [];
        const chain = signetChain(fakeServers(SIGNET.chain_id, 'signet', calls), btcUrl);
        if (!btcUrl) {
          const refused = await loadUtxos(chain, wallet).then(
            () => null,
            (e: unknown) => e,
          );
          expect(refused).toBeInstanceOf(WalletNetworkMismatchError);
          expect(refused).toMatchObject({ wallet: 'Unisat', chain: name, expected: 'signet' });
          expect((refused as Error).message).toContain('BTC signet');
        }
        await expect(submitNative(chain, wallet, signetOp(), pathC)).rejects.toBeInstanceOf(WalletNetworkMismatchError);
        await expect(submitTopUp(chain, wallet, topUp)).rejects.toBeInstanceOf(WalletNetworkMismatchError);
        // refused after the node's chain ID (and the Bitcoin RPC's chain) were read
        const before = btcUrl ? ['ksana_getChainInfo', 'getblockchaininfo'] : ['ksana_getChainInfo'];
        expect(calls).toEqual([...before, ...before]);
      }
      expect(used).toEqual([]);
    }
  });

  it('connecting refuses a wallet set to another chain', async () => {
    const chain = signetChain(fakeServers(SIGNET.chain_id, 'signet', []));
    installUnisat('BITCOIN_TESTNET4', []);
    expect(await connectWallet('unisat', chain)).toBe(false);
    expect(connectedStore.get()).toBeNull();
    expect(connectingStore.get()?.error).toBe(new WalletNetworkMismatchError('Unisat', 'Bitcoin Testnet4 (Beta)', 'signet').message);
    installUnisat('BITCOIN_SIGNET', []);
    expect(await connectWallet('unisat', chain)).toBe(true);
    expect(connectedStore.get()?.account.account).toBe(toHex(ACCOUNT));
  });

  it('Unisat set to the page\'s chain lists its coins and broadcasts', async () => {
    const used: string[] = [];
    const calls: string[] = [];
    const wallet = await connected('unisat', new UnisatAdapter(installUnisat('BITCOIN_SIGNET', used)));
    const chain = signetChain(fakeServers(SIGNET.chain_id, 'signet', calls));
    const listed = await loadUtxos(chain, wallet);
    expect(listed).toEqual({ source: 'unisat', utxos: [{ txid: 'ab'.repeat(32), vout: 0, valueSat: 150_000 }] });
    const sent = await submitNative(chain, wallet, signetOp(), { choice: listed, feeRate: 1 });
    expect(sent.broadcast).toEqual({ via: 'unisat', txid: 'cd'.repeat(32) });
    expect(chain.getBtcTx(sent.txid)?.status).toBe('broadcast');
    expect(used).toEqual(['getBitcoinUtxos', 'signMessage', 'signPsbt', 'pushTx']);
    expect(calls).toEqual(['ksana_getChainInfo']);
  });

  it('a Unisat that cannot tell its chain: its own listing and broadcast are not used, signing goes on', async () => {
    const used: string[] = [];
    const wallet = await connected('unisat', new UnisatAdapter(installUnisat(null, used)));
    const chain = signetChain(fakeServers(SIGNET.chain_id, 'signet', []));
    expect(await loadUtxos(chain, wallet)).toEqual({ source: 'manual', utxos: [] });
    const sent = await submitNative(chain, wallet, signetOp(), pathC);
    expect(sent.broadcast.via).toBe('manual');
    // Handed back to be broadcast by hand: the page does not count it as broadcast
    expect(chain.getBtcTx(sent.txid)?.status).toBe('built');
    expect(used).toEqual(['signMessage', 'signPsbt']);
  });

  it("Unisat's own listing and broadcast serve only the connected Unisat wallet", async () => {
    for (const kind of ['mock', 'xverse'] as const) {
      const used: string[] = [];
      installUnisat('BITCOIN_SIGNET', used);
      const wallet = await connected(kind, new UnisatAdapter(new MockUnisatWallet({ secretKey: SECRET, network: 'signet' })), 'other');
      const chain = signetChain(fakeServers(SIGNET.chain_id, 'signet', []));
      expect(await loadUtxos(chain, wallet)).toEqual({ source: 'manual', utxos: [] });
      expect((await submitNative(chain, wallet, signetOp(), pathC)).broadcast.via).toBe('manual');
      expect(used).toEqual([]);
    }
  });

  it('Xverse: refused on another network, goes on to signing on the page\'s or when it cannot tell', async () => {
    const address = accountToAddress(ACCOUNT, 'signet');
    const xverse = (network: string | null, asked: string[]) =>
      new XverseAdapter({
        provider: {
          request: async (method: string) => {
            if (method === 'getAccounts') return { result: [{ address, publicKey: toHex(xOnlyPublicKey(SECRET)), purpose: 'ordinals', addressType: 'p2tr' }] };
            if (method === 'wallet_getNetwork') {
              return network ? { result: { bitcoin: { name: network }, stacks: { name: 'mainnet' }, spark: { name: 'mainnet' } } } : { error: { code: -32601, message: 'Method not found' } };
            }
            asked.push(method);
            throw new Error(SIGN_ASKED);
          },
        },
      });
    for (const network of ['Testnet4', 'Testnet', 'Mainnet']) {
      const asked: string[] = [];
      const chain = signetChain(fakeServers(SIGNET.chain_id, 'signet', []));
      const wallet = await connected('xverse', xverse(network, asked), 'Xverse');
      await expect(submitNative(chain, wallet, signetOp(), pathC)).rejects.toMatchObject({ name: 'WalletNetworkMismatchError', chain: network });
      expect(asked).toEqual([]);
    }
    for (const network of ['Signet', null]) {
      const asked: string[] = [];
      const chain = signetChain(fakeServers(SIGNET.chain_id, 'signet', []));
      const wallet = await connected('xverse', xverse(network, asked), 'Xverse');
      await expect(submitNative(chain, wallet, signetOp(), pathC)).rejects.toThrow(SIGN_ASKED);
      expect(asked).toEqual(['signMessage']);
    }
  });
});

const SIGNET_GENESIS = '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6';
const SIGNET_ADDRESS = accountToAddress(ACCOUNT, 'signet');

/**
 * The public signet's proxy: bitcoind's JSON-RPC (POST, `fakeServers` on BTC `btcChain`) and an Esplora interface under
 * `/esplora` (GET), whose genesis block and UTXO list are `genesis` and `utxos` (a number: that HTTP status; a string: that body as
 * is; a function: the response it makes).
 */
function fakeProxy(genesis: unknown, utxos: unknown, calls: string[], btcChain = 'signet'): typeof fetch {
  const rpc = fakeServers(SIGNET.chain_id, btcChain, calls);
  const answer = (body: unknown): Response => {
    if (typeof body === 'function') return (body as () => Response)();
    if (typeof body === 'number') return new Response('no', { status: body });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  };
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') return rpc(url, init);
    const path = String(url);
    calls.push(`GET ${path}`);
    if (path === '/btc/esplora/block-height/0') return answer(genesis);
    if (path === `/btc/esplora/address/${SIGNET_ADDRESS}/utxo`) return answer(utxos);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

/** A confirmed output, as Esplora lists it */
const CONFIRMED = { txid: 'AB'.repeat(32), vout: 1, status: { confirmed: true, block_height: 100, block_hash: '33'.repeat(32), block_time: 1_700_000_000 }, value: 150_000 };
const ESPLORA_UTXOS = [CONFIRMED, { txid: 'ef'.repeat(32), vout: 0, status: { confirmed: false }, value: 2_000 }];

describe('the signet page lists coins from Esplora (D-108)', () => {
  it('once its genesis block is signet\'s, without a scan', async () => {
    for (const url of ['/btc', '/btc/']) {
      const calls: string[] = [];
      const btc = new BtcRpc(url, 'signet', fakeProxy(`${SIGNET_GENESIS}\n`, ESPLORA_UTXOS, calls));
      expect(await btc.utxosOf(SCRIPT)).toEqual([
        { txid: 'ab'.repeat(32), vout: 1, valueSat: 150_000, height: 100 },
        { txid: 'ef'.repeat(32), vout: 0, valueSat: 2_000 },
      ]);
      expect(calls).toEqual(['GET /btc/esplora/block-height/0', `GET /btc/esplora/address/${SIGNET_ADDRESS}/utxo`]);
    }
    // broadcasting still goes to bitcoind, its chain checked
    const calls: string[] = [];
    const btc = new BtcRpc('/btc', 'signet', fakeProxy(SIGNET_GENESIS, ESPLORA_UTXOS, calls));
    expect(await btc.sendRawTransaction(new Uint8Array([1, 2, 3]))).toBe('cd'.repeat(32));
    expect(calls).toEqual(['getblockchaininfo', 'sendrawtransaction']);
  });

  it('asks for the genesis block until it once matches, and for the coins at every listing', async () => {
    const calls: string[] = [];
    const btc = new BtcRpc('/btc', 'signet', fakeProxy(SIGNET_GENESIS, ESPLORA_UTXOS, calls));
    await btc.utxosOf(SCRIPT);
    await btc.utxosOf(SCRIPT);
    const coins = `GET /btc/esplora/address/${SIGNET_ADDRESS}/utxo`;
    expect(calls).toEqual(['GET /btc/esplora/block-height/0', coins, coins]);
    // a genesis read that failed is not remembered: the first listing scans, the next one asks again
    const later: string[] = [];
    let busy = 3;
    const flaky = () => (busy-- > 0 ? new Response('busy', { status: 503 }) : new Response(SIGNET_GENESIS, { status: 200 }));
    const again = new BtcRpc('/btc', 'signet', fakeProxy(flaky, ESPLORA_UTXOS, later), 0);
    await again.utxosOf(SCRIPT);
    await again.utxosOf(SCRIPT);
    const genesis = 'GET /btc/esplora/block-height/0';
    expect(later).toEqual([genesis, coins, genesis, genesis, 'getblockchaininfo', 'scantxoutset', genesis, coins]);
  });

  it('asks for the genesis block and the coins together, and lists the coins once the genesis block matches', async () => {
    const calls: string[] = [];
    let answer: (r: Response) => void = () => undefined;
    const held = new Promise<Response>((resolve) => (answer = resolve));
    const proxy = fakeProxy(SIGNET_GENESIS, ESPLORA_UTXOS, calls);
    const slow = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!String(url).endsWith('/block-height/0')) return proxy(url, init);
      calls.push(`GET ${String(url)}`);
      return held;
    }) as typeof fetch;
    const btc = new BtcRpc('/btc', 'signet', slow);
    const listing = btc.utxosOf(SCRIPT);
    let listed = false;
    void listing.then(() => (listed = true));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    // both are under way, a round trip for the two, and the coins already in wait for the genesis block
    expect(calls).toEqual(['GET /btc/esplora/block-height/0', `GET /btc/esplora/address/${SIGNET_ADDRESS}/utxo`]);
    expect(listed).toBe(false);
    answer(new Response(SIGNET_GENESIS, { status: 200 }));
    expect(await listing).toHaveLength(2);
  });

  it('a read that gets no answer or a 5xx is asked again, twice at most; a 4xx is not', async () => {
    const coins = `GET /btc/esplora/address/${SIGNET_ADDRESS}/utxo`;
    const genesis = 'GET /btc/esplora/block-height/0';
    // the coins answer at the third ask: from Esplora, with no scan
    let failing = 2;
    const calls: string[] = [];
    const btc = new BtcRpc('/btc', 'signet', fakeProxy(SIGNET_GENESIS, () => (failing-- > 0 ? new Response('Bad Gateway', { status: 502 }) : new Response(JSON.stringify(ESPLORA_UTXOS))), calls), 0);
    expect(await btc.utxosOf(SCRIPT)).toHaveLength(2);
    expect(calls).toEqual([genesis, coins, coins, coins]);
    // no answer at all, once
    let silent = 1;
    const quiet: string[] = [];
    const proxy = fakeProxy(SIGNET_GENESIS, ESPLORA_UTXOS, quiet);
    const dropping = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/utxo') && silent-- > 0) {
        quiet.push('dropped');
        throw new TypeError('Failed to fetch');
      }
      return proxy(url, init);
    }) as typeof fetch;
    expect(await new BtcRpc('/btc', 'signet', dropping, 0).utxosOf(SCRIPT)).toHaveLength(2);
    expect(quiet).toEqual([genesis, 'dropped', coins]);
    // three failures in a row: the page scans; a 429 is not asked again
    for (const [answer, asks] of [
      [502, 3],
      [429, 1],
    ] as const) {
      const seen: string[] = [];
      await new BtcRpc('/btc', 'signet', fakeProxy(SIGNET_GENESIS, answer, seen), 0).utxosOf(SCRIPT);
      expect(seen).toEqual([genesis, ...Array<string>(asks).fill(coins), 'getblockchaininfo', 'scantxoutset']);
    }
  });

  it('a failure that took five seconds or more is not asked again', async () => {
    const coins = `GET /btc/esplora/address/${SIGNET_ADDRESS}/utxo`;
    const genesis = 'GET /btc/esplora/block-height/0';
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // the proxy's 502 once it gave up waiting on mempool.space, 15 seconds on
      const late = () => {
        vi.setSystemTime(Date.now() + 15_000);
        return new Response('the Esplora API is unavailable: The operation was aborted due to timeout', { status: 502 });
      };
      const seen: string[] = [];
      await new BtcRpc('/btc', 'signet', fakeProxy(SIGNET_GENESIS, late, seen), 0).utxosOf(SCRIPT);
      expect(seen).toEqual([genesis, coins, 'getblockchaininfo', 'scantxoutset']);
      // no answer after as long
      const silent: string[] = [];
      const proxy = fakeProxy(SIGNET_GENESIS, ESPLORA_UTXOS, silent);
      const hanging = (async (url: RequestInfo | URL, init?: RequestInit) => {
        if (!String(url).endsWith('/utxo')) return proxy(url, init);
        silent.push('dropped');
        vi.setSystemTime(Date.now() + 30_000);
        throw new TypeError('Failed to fetch');
      }) as typeof fetch;
      await new BtcRpc('/btc', 'signet', hanging, 0).utxosOf(SCRIPT);
      expect(silent).toEqual([genesis, 'dropped', 'getblockchaininfo', 'scantxoutset']);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an Esplora on another chain is refused, with nothing listed", async () => {
    for (const [genesis, chain] of [
      ['00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043', 'testnet4'],
      ['000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943', 'test'],
      ['000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', 'main'],
      ['0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206', 'regtest'],
      ['12'.repeat(32), `genesis ${'12'.repeat(8)}…`],
    ] as const) {
      const calls: string[] = [];
      const btc = new BtcRpc('/btc', 'signet', fakeProxy(genesis, ESPLORA_UTXOS, calls));
      const refused = await btc.utxosOf(SCRIPT).then(
        () => null,
        (e: unknown) => e,
      );
      expect(refused).toBeInstanceOf(BtcChainMismatchError);
      expect(refused).toMatchObject({ url: '/btc/esplora', chain, expected: 'signet' });
      // the coins, asked with the genesis block, are never used
      expect(calls).toEqual(['GET /btc/esplora/block-height/0', `GET /btc/esplora/address/${SIGNET_ADDRESS}/utxo`]);
    }
  });

  it('without an Esplora, or one giving no well-formed answer, the page scans as before', async () => {
    for (const [genesis, utxos] of [
      [405, ESPLORA_UTXOS],
      [404, ESPLORA_UTXOS],
      ['<!doctype html><title>Ksana</title>', ESPLORA_UTXOS],
      [() => new Response(SIGNET_GENESIS, { status: 502 }), ESPLORA_UTXOS],
      [SIGNET_GENESIS, 429],
      [SIGNET_GENESIS, () => new Response('[]', { status: 503 })],
      [SIGNET_GENESIS, 'Too many UTXOs'],
      [SIGNET_GENESIS, { utxos: ESPLORA_UTXOS }],
      [SIGNET_GENESIS, [{ ...CONFIRMED, txid: 'ab' }]],
      [SIGNET_GENESIS, [{ ...CONFIRMED, vout: -1 }]],
      [SIGNET_GENESIS, [{ ...CONFIRMED, value: 0 }]],
      [SIGNET_GENESIS, [{ ...CONFIRMED, value: '150000' }]],
      [SIGNET_GENESIS, [{ txid: CONFIRMED.txid, vout: 1, value: 150_000 }]],
      [SIGNET_GENESIS, [{ ...CONFIRMED, status: { confirmed: true } }]],
      [SIGNET_GENESIS, [{ ...CONFIRMED, status: { confirmed: 'yes', block_height: 100 } }]],
    ] as const) {
      const calls: string[] = [];
      const btc = new BtcRpc('/btc', 'signet', fakeProxy(genesis, utxos, calls), 0);
      expect(await btc.utxosOf(SCRIPT)).toEqual([{ txid: 'ab'.repeat(32), vout: 1, valueSat: 150_000, height: 100 }]);
      expect(calls.slice(-2)).toEqual(['getblockchaininfo', 'scantxoutset']);
    }
  });

  it('the devnet page never asks Esplora', async () => {
    for (const genesis of [SIGNET_GENESIS, '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206']) {
      const calls: string[] = [];
      const btc = new BtcRpc('/btc', 'regtest', fakeProxy(genesis, ESPLORA_UTXOS, calls, 'regtest'));
      await btc.utxosOf(SCRIPT);
      expect(calls).toEqual(['getblockchaininfo', 'scantxoutset']);
    }
  });

  it('path C on the signet page lists from Esplora and broadcasts through bitcoind', async () => {
    const used: string[] = [];
    const calls: string[] = [];
    const wallet = await connected('unisat', new UnisatAdapter(installUnisat('BITCOIN_SIGNET', used)));
    const chain = signetChain(fakeProxy(SIGNET_GENESIS, ESPLORA_UTXOS, calls), '/btc');
    const listed = await loadUtxos(chain, wallet);
    expect(listed.source).toBe('btc_rpc');
    const sent = await submitNative(chain, wallet, signetOp(), { choice: listed, feeRate: 1 });
    expect(sent.broadcast).toEqual({ via: 'btc_rpc', txid: 'cd'.repeat(32) });
    // only the confirmed output is spent; Unisat signs but neither lists nor broadcasts
    expect(sent.inputs).toEqual([{ txid: 'ab'.repeat(32), vout: 1, valueSat: 150_000, height: 100 }]);
    expect(used).toEqual(['signMessage', 'signPsbt']);
    expect(calls).toEqual([
      'GET /btc/esplora/block-height/0',
      `GET /btc/esplora/address/${SIGNET_ADDRESS}/utxo`,
      'ksana_getChainInfo',
      'getblockchaininfo',
      'getblockchaininfo',
      'sendrawtransaction',
    ]);
  });
});

describe('path C and top-ups spend confirmed coins, priced with each input they take (the eleventh audit)', () => {
  const coin = (n: number, valueSat: number, height?: number): WalletUtxo => ({ txid: n.toString(16).padStart(2, '0').repeat(32), vout: 0, valueSat, ...(height !== undefined ? { height } : {}) });

  it("the page's top-up fee is the SDK's, or a little more, with one input or two", () => {
    const seller = p2trScriptFromOutputKey(new Uint8Array(32).fill(0x44));
    const lock = { seller: new Uint8Array(32).fill(5), beneficiary: ACCOUNT, script: seller, price: 1_000_000n, ksa: 2_500_000_000_000n, expiry: 400_000, state: { kind: 'Open' as const } };
    // the claim operation as the page sizes it, signed with the one-time key (BIP340)
    const chain = rpcChain(fakeServers(DEVNET.chain_id, 'regtest', []));
    const claimBytes = chain.opSize('C', { kind: 'Call', contract: 'ec'.repeat(32), method: 'claim', args: { borsh: toHex(claimArgs(7n)) } });
    const utxo = (n: number, value: bigint) => ({ txid: new Uint8Array(32).fill(n), vout: 0, value, script: SCRIPT });
    for (const [utxos, inputs] of [
      [[utxo(1, 200_000n)], 1],
      [[utxo(1, 30_000n), utxo(2, 200_000n)], 2],
    ] as const) {
      const draft = buildTopUp({
        exchange: new Uint8Array(32).fill(0xec),
        lockId: 7n,
        lock,
        beneficiary: ACCOUNT,
        sats: 25_000n,
        currentBtcHeight: 300_000,
        utxos,
        changeScript: SCRIPT,
        feeRate: 100,
        params: DEVNET,
        allowPartial: true,
      });
      expect(draft.inputs).toHaveLength(inputs);
      expect(encodeVmOp(draft.op).length).toBe(claimBytes);
      const page = nativeTxFee(claimBytes, 100, inputs, [seller.length]);
      expect(page).toBeGreaterThanOrEqual(Number(draft.fee));
      expect(page).toBeLessThanOrEqual(Number(draft.fee) * 1.02);
    }
  });

  it('from the Bitcoin RPC only confirmed coins are spent, largest first; coins entered by hand or listed by the wallet as given', () => {
    const listed: UtxoChoice = { source: 'btc_rpc', utxos: [coin(1, 5_000, 90), coin(2, 80_000), coin(3, 20_000, 95)] };
    expect(spendable(listed).map((u) => u.valueSat)).toEqual([20_000, 5_000]);
    expect(unconfirmed(listed).map((u) => u.valueSat)).toEqual([80_000]);
    for (const source of ['manual', 'unisat'] as const) {
      const given: UtxoChoice = { source, utxos: [coin(1, 1_000), coin(2, 9_000)] };
      expect(spendable(given).map((u) => u.valueSat)).toEqual([9_000, 1_000]);
      expect(unconfirmed(given)).toEqual([]);
    }
  });

  it('coins cover the payment, the fee with each input taken and a margin for the change, or say what they need', () => {
    const fee = (inputs: number) => 100 * inputs + 200;
    const coins = [coin(1, 1_500), coin(2, 1_000)];
    expect(coverage(coins, fee)).toEqual({ enough: true, inputs: 1, need: 1_300 });
    // a second input pays for itself
    expect(coverage(coins, fee, 500)).toEqual({ enough: true, inputs: 2, need: 1_900 });
    expect(coverage(coins, fee, 2_000)).toEqual({ enough: false, inputs: 2, need: 3_400 });
    expect(coverage([], fee)).toEqual({ enough: false, inputs: 1, need: 1_300 });
    // short only until a coin waiting for a confirmation is confirmed, or short anyway
    const listed: UtxoChoice = { source: 'btc_rpc', utxos: [coin(1, 1_500, 90), coin(2, 5_000)] };
    expect(coverage(spendable(listed), fee, 2_000).enough).toBe(false);
    expect(coveredOnceConfirmed(listed, fee, 2_000)).toBe(true);
    expect(coveredOnceConfirmed(listed, fee, 6_000)).toBe(false);
  });

  it("the tip is read with its block's hash and the time it gives, a Bitcoin explorer's, from a bitcoind on the page's network only", async () => {
    const answering = (result: unknown) =>
      (async (_url: RequestInfo | URL, init?: RequestInit) => {
        const { id } = JSON.parse(String(init?.body)) as { id: number };
        return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200 });
      }) as typeof fetch;
    // The tip is read with the chain check that comes before path C or a top-up is signed
    const tip = (result: unknown) => new BtcRpc('/btc', 'signet', answering(result), 0).checkChain();
    // BTC 327,026 on signet
    const hash = '00000009c6f458c5df0991b8992ab4261e984c774cf55f0270d852f449bb2cdc';
    expect(await tip({ chain: 'signet', blocks: 327_026, bestblockhash: hash, time: 1_792_405_085 })).toEqual({ height: 327_026, hash, time: 1_792_405_085_000 });
    // bitcoind before Core 23 gives no time, and a malformed hash or time is passed over
    expect(await tip({ chain: 'signet', blocks: 327_026, bestblockhash: hash })).toEqual({ height: 327_026, hash });
    expect(await tip({ chain: 'signet', blocks: 327_026, bestblockhash: hash.toUpperCase(), time: '1792405085' })).toEqual({ height: 327_026 });
    // with no height there is no tip
    expect(await tip({ chain: 'signet', bestblockhash: hash, time: 1_792_405_085 })).toBeUndefined();
    // and a bitcoind on another BTC network gives none: its heights and times are another chain's
    await expect(tip({ chain: 'main', blocks: 917_000, bestblockhash: hash, time: 1_792_405_085 })).rejects.toBeInstanceOf(BtcChainMismatchError);
    await expect(tip(null)).rejects.toBeInstanceOf(BtcChainMismatchError);
  });

  it('with every coin from the Bitcoin RPC waiting for a confirmation, path C and top-ups say so before the wallet is asked to sign', async () => {
    const calls: string[] = [];
    const asked: string[] = [];
    const chain = rpcChain(fakeServers(DEVNET.chain_id, 'regtest', calls));
    const waiting: UtxoChoice = { source: 'btc_rpc', utxos: [coin(1, 150_000)] };
    await expect(submitNative(chain, testWallet(asked), unsignedOp(), { choice: waiting, feeRate: 1 })).rejects.toThrow(t().wallet.native.unconfirmed);
    expect(asked).toEqual([]);
    const none: UtxoChoice = { source: 'btc_rpc', utxos: [] };
    await expect(submitNative(chain, testWallet(asked), unsignedOp(), { choice: none, feeRate: 1 })).rejects.toThrow(t().wallet.native.noUtxo);
    expect(asked).toEqual([]);
  });
});
