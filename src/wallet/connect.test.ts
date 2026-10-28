/**
 * The test-key wallet (`?wallet=mock&key=<private key>`) is for local regtest only. On a page on another network the key that came in
 * the address bar is removed from it as on regtest, but never used, and the connect page says so: a link carrying a key could hand
 * someone an account whose key another holds.
 *
 * The key is read when the module loads, so each case loads it afresh under the address it gives.
 *
 * OneKey injects its Bitcoin provider as `window.unisat` too: the Unisat card then connects OneKey and is named so.
 *
 * A wallet can switch account or network while the page is open: the page follows it.
 */

import { MockUnisatWallet, type UnsignedVmOp, VMOP_VERSION, UnisatAdapter, type WalletAdapter, fromHex, signVmopWithWallet } from '@ksana/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RpcChain } from '../chain/rpc/chain';
import { t } from '../i18n';
import { walletAddress } from '../lib/format';

/** The data source the page reads from, which a case sets */
const view = vi.hoisted(() => ({ chain: undefined as unknown }));
vi.mock('../app/store', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/store')>()), chain: () => view.chain }));

/** A valid private key (the scalar 3) */
const KEY = '0000000000000000000000000000000000000000000000000000000000000003';
/** Another (the scalar 5) */
const OTHER = '0000000000000000000000000000000000000000000000000000000000000005';

function chainOn(chain: 'devnet' | 'signet') {
  return new RpcChain({ url: 'http://node.test', chain }, { fetch: () => Promise.reject(new Error('offline')), manual: true });
}

/** The connect module as a page loaded at `href` has it, and the addresses the page put in its address bar */
async function loadAt(href: string) {
  const replaced: string[] = [];
  vi.stubGlobal('window', {
    location: { href, search: new URL(href).search },
    history: { replaceState: (_state: unknown, _title: string, url: string) => replaced.push(url) },
  });
  vi.resetModules();
  return { connect: await import('./connect'), replaced };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the test-key wallet', () => {
  it('is offered and connects on local regtest, the key gone from the address bar', async () => {
    const { connect, replaced } = await loadAt(`https://page.test/?wallet=mock&key=${KEY}#/wallet`);
    expect(replaced).toEqual(['https://page.test/?wallet=mock#/wallet']);
    const devnet = chainOn('devnet');
    expect(connect.walletOptions(devnet).map((o) => o.kind)).toEqual(['unisat', 'xverse', 'mock']);
    expect(connect.testKeyRefused(devnet)).toBe(false);
    expect(await connect.connectWallet('mock', devnet)).toBe(true);
    expect(connect.connectedStore.get()?.account.address).toMatch(/^bcrt1p/);
    connect.disconnectWallet(devnet);
  });

  it('is never used on signet: the key leaves the address bar all the same, and the connect page says it was not used', async () => {
    const { connect, replaced } = await loadAt(`https://page.test/?wallet=mock&key=${KEY}#/wallet`);
    expect(replaced).toEqual(['https://page.test/?wallet=mock#/wallet']);
    const signet = chainOn('signet');
    expect(connect.walletOptions(signet).map((o) => o.kind)).toEqual(['unisat', 'xverse']);
    expect(connect.testKeyRefused(signet)).toBe(true);
    expect(await connect.connectWallet('mock', signet)).toBe(false);
    expect(connect.connectedStore.get()).toBeNull();
  });

  it('says so on signet for a key that is not a valid private key too, and nothing for an address without one', async () => {
    const bad = await loadAt('https://page.test/?wallet=mock&key=not-a-key#/wallet');
    expect(bad.replaced).toEqual(['https://page.test/?wallet=mock#/wallet']);
    expect(bad.connect.testKeyRefused(chainOn('signet'))).toBe(true);
    expect(bad.connect.walletOptions(chainOn('devnet')).map((o) => o.kind)).toEqual(['unisat', 'xverse']);

    const none = await loadAt('https://page.test/?wallet=mock#/wallet');
    expect(none.replaced).toEqual([]);
    expect(none.connect.testKeyRefused(chainOn('signet'))).toBe(false);
  });
});

describe('OneKey', () => {
  /** A wallet with Unisat's interface, as OneKey's provider */
  const provider = () => new MockUnisatWallet({ secretKey: fromHex(KEY, 32), network: 'regtest' });

  it('names the Unisat card, and the wallet it connects, OneKey when OneKey provides window.unisat', async () => {
    const btc = provider();
    // OneKey's extension puts its provider behind a proxy at window.unisat; the browser of its app puts it there as it is
    vi.stubGlobal('$onekey', { btc });
    vi.stubGlobal('unisat', new Proxy(btc, {}));
    const { connect } = await loadAt('https://page.test/#/wallet');
    const devnet = chainOn('devnet');
    expect(connect.walletOptions(devnet).map((o) => [o.kind, o.name, o.available])).toEqual([
      ['unisat', 'OneKey', true],
      ['xverse', 'Xverse', false],
    ]);
    expect(await connect.connectWallet('unisat', devnet)).toBe(true);
    expect(connect.connectedStore.get()?.name).toBe('OneKey');
    connect.disconnectWallet(devnet);

    vi.stubGlobal('unisat', btc);
    expect(connect.WALLET_NAME.unisat).toBe('OneKey');
  });

  it('keeps the name Unisat for another wallet at window.unisat, even one carrying OneKey\'s fields', async () => {
    /** Another wallet's provider: its own methods */
    const unisat = () => ({ requestAccounts: () => Promise.resolve([]), getPublicKey: () => Promise.resolve('') });
    const { connect } = await loadAt('https://page.test/#/wallet');
    vi.stubGlobal('unisat', unisat());
    expect(connect.WALLET_NAME.unisat).toBe('Unisat');
    // With both extensions installed, OneKey copies its fields onto the window.unisat it cannot replace, its isOneKey flag among them
    vi.stubGlobal('$onekey', { btc: provider() });
    vi.stubGlobal('unisat', Object.assign(unisat(), { isOneKey: true }));
    expect(connect.WALLET_NAME.unisat).toBe('Unisat');
    expect(connect.walletOptions(chainOn('signet'))[0]).toMatchObject({ kind: 'unisat', name: 'Unisat', available: true });
  });
});

/**
 * A wallet with Unisat's interface, on the account of `key` on `network`, which the test moves to another account or network, the
 * wallet saying so as Unisat and OneKey do (`accountsChanged`, `networkChanged`, `chainChanged`), or not
 */
function switching(key: string, network: 'regtest' | 'signet' = 'regtest') {
  let wallet = new MockUnisatWallet({ secretKey: fromHex(key, 32), network });
  let asked = 0;
  let locked = false;
  /** A prompt the wallet keeps open (an unlock, say) until the test lets it go */
  let held: Promise<void> | undefined;
  const heard = new Map<string, ((value: unknown) => void)[]>();
  const say = (event: string, value: unknown) => {
    for (const fn of heard.get(event) ?? []) fn(value);
  };
  const provider = {
    requestAccounts: async () => {
      asked++;
      await held;
      return wallet.requestAccounts();
    },
    getAccounts: () => (locked ? Promise.resolve([]) : wallet.getAccounts()),
    getPublicKey: () => wallet.getPublicKey(),
    getChain: () => wallet.getChain(),
    signMessage: (message: string, type?: 'ecdsa' | 'bip322-simple') => wallet.signMessage(message, type),
    signPsbt: (psbt: string) => wallet.signPsbt(psbt),
    on: (event: string, fn: (value: unknown) => void) => heard.set(event, [...(heard.get(event) ?? []), fn]),
    removeListener: (event: string, fn: (value: unknown) => void) => heard.set(event, (heard.get(event) ?? []).filter((f) => f !== fn)),
  };
  return {
    provider,
    /** How many of the page's listeners the wallet has */
    listeners: () => [...heard.values()].reduce((n, fns) => n + fns.length, 0),
    /** The wallet moves to `next` (unlocked), and says so unless `quietly` */
    moveTo(next: MockUnisatWallet, quietly = false) {
      const network = next.chain !== wallet.chain;
      wallet = next;
      locked = false;
      if (quietly) return;
      if (network) {
        say('networkChanged', next.chain.endsWith('MAINNET') ? 'livenet' : 'testnet');
        void next.getChain().then((chain) => say('chainChanged', chain));
      }
      say('accountsChanged', [next.address]);
    },
    /** The wallet locks: it has no account to give */
    lock: () => {
      locked = true;
      say('accountsChanged', []);
    },
    /** The wallet says something else while locked (its network, as OneKey does) */
    say,
    /** The next prompts stay open until the function given back is called */
    hold: () => {
      let open = () => undefined as void;
      held = new Promise<void>((r) => (open = r));
      return () => {
        held = undefined;
        open();
      };
    },
    /** How many times the page asked for the wallet's accounts, which opens a locked wallet's prompt */
    asked: () => asked,
    address: () => wallet.address,
  };
}

/** Until `done`, a few milliseconds at a time; the test fails where it never is */
async function until(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await new Promise((r) => setTimeout(r, 2));
  expect(done()).toBe(true);
}

describe('A wallet that switches under the page', () => {
  /** The connect module and the toasts of a page connected to `wallet` through the Unisat card, on a devnet */
  async function connected(wallet: ReturnType<typeof switching>) {
    vi.stubGlobal('unisat', wallet.provider);
    const { connect } = await loadAt('https://page.test/#/wallet');
    const prefs = await import('../app/prefs');
    const devnet = chainOn('devnet');
    view.chain = devnet;
    expect(await connect.connectWallet('unisat', devnet)).toBe(true);
    return { connect, prefs, devnet };
  }

  it('is followed to another account it says it is on, with a toast naming it, which the next switch replaces; a locked wallet changes nothing', async () => {
    const wallet = switching(KEY);
    const { connect, prefs, devnet } = await connected(wallet);
    const first = connect.connectedStore.get();
    const asked = wallet.asked();
    wallet.lock();
    await new Promise((r) => setTimeout(r, 10));
    expect(connect.connectedStore.get()).toBe(first);
    expect(wallet.asked()).toBe(asked);
    const next = new MockUnisatWallet({ secretKey: fromHex(OTHER, 32), network: 'regtest' });
    wallet.moveTo(next);
    await until(() => connect.connectedStore.get()?.account.address === next.address);
    const now = connect.connectedStore.get();
    expect(now?.account.address).toBe(next.address);
    expect(now?.name).toBe('Unisat');
    expect(devnet.walletKey?.account).toBe(now?.account.account);
    expect(prefs.toastStore.get()).toMatchObject([{ title: t().wallet.connect.switched('Unisat'), body: t().wallet.connect.switchedTo(walletAddress(next.address)) }]);
    // Once the wallet switches again, the toast that named the last account goes
    const third = new MockUnisatWallet({ secretKey: fromHex('00'.repeat(31) + '07', 32), network: 'regtest' });
    wallet.moveTo(third);
    await until(() => connect.connectedStore.get()?.account.address === third.address);
    expect(prefs.toastStore.get()).toMatchObject([{ body: t().wallet.connect.switchedTo(walletAddress(third.address)) }]);
    connect.disconnectWallet(devnet);
    expect(wallet.listeners()).toBe(0);
  });

  it('opens no prompt while locked, whatever it says, and its last switch\'s toast goes once it is disconnected', async () => {
    const wallet = switching(KEY);
    const { connect, prefs, devnet } = await connected(wallet);
    const next = new MockUnisatWallet({ secretKey: fromHex(OTHER, 32), network: 'regtest' });
    wallet.moveTo(next);
    await until(() => connect.connectedStore.get()?.account.address === next.address);
    expect(prefs.toastStore.get()).toHaveLength(1);
    const asked = wallet.asked();
    wallet.lock();
    wallet.say('networkChanged', 'testnet');
    wallet.say('chainChanged', { enum: 'BITCOIN_REGTEST' });
    await new Promise((r) => setTimeout(r, 20));
    expect(wallet.asked()).toBe(asked);
    expect(connect.connectedStore.get()?.account.address).toBe(next.address);
    connect.disconnectWallet(devnet);
    expect(prefs.toastStore.get()).toEqual([]);
  });

  it('is followed for the node the page moved to while its account was being read, and the node it left is not touched', async () => {
    const wallet = switching(KEY);
    const { connect, devnet } = await connected(wallet);
    const first = connect.connectedStore.get()?.account.account;
    const open = wallet.hold();
    const next = new MockUnisatWallet({ secretKey: fromHex(OTHER, 32), network: 'regtest' });
    wallet.moveTo(next);
    await until(() => wallet.asked() > 1);
    // Another node of the same network: the page attaches the wallet to it as it is (subscribeChain)
    const other = chainOn('devnet');
    view.chain = other;
    other.setWallet({ account: first ?? '' });
    open();
    await until(() => connect.connectedStore.get()?.account.address === next.address);
    expect(other.walletKey?.account).toBe(connect.connectedStore.get()?.account.account);
    expect(devnet.walletKey?.account).toBe(first);
    connect.disconnectWallet(other);
  });

  it('is left, the connect page saying why, once it moves to another network or to an account that cannot be one', async () => {
    const wallet = switching(KEY);
    const { connect, prefs, devnet } = await connected(wallet);
    expect(wallet.listeners()).toBe(3);
    const next = new MockUnisatWallet({ secretKey: fromHex(OTHER, 32), network: 'regtest' });
    wallet.moveTo(next);
    await until(() => connect.connectedStore.get()?.account.address === next.address);
    expect(prefs.toastStore.get()).toHaveLength(1);
    // The toast saying the page shows that account goes with it
    wallet.moveTo(new MockUnisatWallet({ secretKey: fromHex(KEY, 32), network: 'signet' }));
    await until(() => connect.connectedStore.get() === null);
    expect(connect.connectingStore.get()).toEqual({ kind: 'unisat', error: t().wallet.connect.wrongNetwork(wallet.address().slice(0, 8), 'regtest'), left: true });
    expect(prefs.toastStore.get()).toEqual([]);
    expect(devnet.walletKey).toBeNull();
    expect(wallet.listeners()).toBe(0);

    const segwit = switching(KEY);
    const again = await connected(segwit);
    segwit.moveTo(new MockUnisatWallet({ secretKey: fromHex(OTHER, 32), network: 'regtest', addressType: 'p2wpkh' }));
    await until(() => again.connect.connectedStore.get() === null);
    expect(again.connect.connectingStore.get()).toEqual({ kind: 'unisat', error: t().wallet.connect.notTaproot, left: true });
  });

  it('is asked which account it is on before it signs, and followed there; the SDK refusing to sign for another account is taken the same way', async () => {
    const wallet = switching(KEY);
    const { connect, devnet } = await connected(wallet);
    const before = connect.connectedStore.get();
    if (!before) throw new Error('not connected');
    await expect(connect.checkWalletAccount(before)).resolves.toBeUndefined();
    const next = new MockUnisatWallet({ secretKey: fromHex(OTHER, 32), network: 'regtest' });
    wallet.moveTo(next, true);
    const refused = await connect.checkWalletAccount(before).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(connect.WalletSwitchedError);
    expect((refused as Error).message).toBe(t().wallet.connect.signSwitched('Unisat'));
    // The SDK's own check, as a wallet that cannot say which account it is on without a prompt meets it
    const op: UnsignedVmOp = {
      version: VMOP_VERSION,
      chain_id: devnet.sdkParams.chain_id,
      account: fromHex(before.account.account, 32),
      nonce: 0n,
      fee: { kind: 'Token', amount: 0n },
      max_gas: 50_000n,
      action: { kind: 'AssetTransfer', asset: new Uint8Array(32), to: new Uint8Array(32), amount: 1n },
    };
    const sdk = await signVmopWithWallet(op, new UnisatAdapter(next)).catch((e: unknown) => e);
    expect(await connect.afterSigning(sdk, before)).toBeInstanceOf(connect.WalletSwitchedError);
    // Said once the page has followed the wallet, over the account it then shows
    expect(connect.connectedStore.get()?.account.address).toBe(next.address);
    expect(await connect.afterSigning(new Error('Load failed'), before)).toEqual(new Error('Load failed'));
    connect.disconnectWallet(devnet);
  });

  it('has its refusal to sign said a moment later at most, whatever it does meanwhile', async () => {
    const wallet = switching(KEY);
    const { connect, devnet } = await connected(wallet);
    const before = connect.connectedStore.get();
    if (!before) throw new Error('not connected');
    const open = wallet.hold();
    wallet.moveTo(new MockUnisatWallet({ secretKey: fromHex(OTHER, 32), network: 'regtest' }), true);
    vi.useFakeTimers();
    try {
      let said = false;
      void connect.afterSigning(new connect.WalletSwitchedError('Unisat'), before).then(() => (said = true));
      await vi.advanceTimersByTimeAsync(1_900);
      expect(said).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      expect(said).toBe(true);
    } finally {
      vi.useRealTimers();
      open();
    }
    connect.disconnectWallet(devnet);
  });
});

describe('Xverse refusing to sign for the account the page shows', () => {
  it('is left, the connect page saying why, its account not read: reading it can open its popup', async () => {
    const { connect } = await loadAt('https://page.test/#/wallet');
    const devnet = chainOn('devnet');
    view.chain = devnet;
    const own = new MockUnisatWallet({ secretKey: fromHex(KEY, 32), network: 'regtest' });
    const read = vi.fn(() => new UnisatAdapter(own).getAccount());
    const adapter = { ...new UnisatAdapter(own), getAccount: read } as unknown as WalletAdapter;
    const w = { kind: 'xverse' as const, name: 'Xverse', adapter, account: await new UnisatAdapter(own).getAccount() };
    connect.connectedStore.set(w);
    devnet.setWallet({ account: w.account.account });
    const refused = new Error(`VmOp account ${'ab'.repeat(32)} does not match wallet account ${'cd'.repeat(32)}`);
    expect(await connect.afterSigning(refused, w)).toBeInstanceOf(connect.WalletSwitchedError);
    await new Promise((r) => setTimeout(r, 10));
    expect(read).not.toHaveBeenCalled();
    expect(connect.connectedStore.get()).toBeNull();
    expect(connect.connectingStore.get()).toEqual({ kind: 'xverse', error: t().wallet.connect.signSwitchedLeft('Xverse'), left: true });
    expect(devnet.walletKey).toBeNull();
  });
});

describe("The SDK's refusals of a wallet's account", () => {
  it('are said in the page’s language: an address that is not Taproot, and a Taproot one that is not the standard one of its key', async () => {
    vi.stubGlobal('unisat', new MockUnisatWallet({ secretKey: fromHex(KEY, 32), network: 'regtest', addressType: 'p2wpkh' }));
    const { connect } = await loadAt('https://page.test/#/wallet');
    const devnet = chainOn('devnet');
    view.chain = devnet;
    expect(await connect.connectWallet('unisat', devnet)).toBe(false);
    expect(connect.connectingStore.get()).toEqual({ kind: 'unisat', error: t().wallet.connect.notTaproot });
    // The Taproot address of one key, with the public key of another
    const own = new MockUnisatWallet({ secretKey: fromHex(KEY, 32), network: 'regtest' });
    const other = new MockUnisatWallet({ secretKey: fromHex(OTHER, 32), network: 'regtest' });
    vi.stubGlobal('unisat', { requestAccounts: () => own.requestAccounts(), getPublicKey: () => other.getPublicKey(), getChain: () => own.getChain() });
    expect(await connect.connectWallet('unisat', devnet)).toBe(false);
    expect(connect.connectingStore.get()).toEqual({ kind: 'unisat', error: t().wallet.connect.notBip86 });
  });
});
