/**
 * Real wallets (node data source): Unisat and Xverse connected through the `@ksana/sdk` adapters (D-052, D-053), or the test-key
 * wallet of a local devnet (the SDK's MockUnisatWallet, used the same way as in core/sdk/ts/examples/wallet-demo).
 *
 * - The page never touches the user's private key: all signing happens in the wallet (path B is a BIP322 simple message signature).
 * - The account is the Taproot address (D-092): only the wallet's Taproot (P2TR) account is accepted.
 * - The wallet must be on the page's BTC network: its address's network, and the network the wallet says it is set to when it tells
 *   it (Unisat getChain, Xverse wallet_getNetwork; A2-11, D-106), since `tb1…` is testnet3's, testnet4's and signet's alike.
 * - The test-key wallet only appears when the address bar carries `wallet=mock&key=<64 hex digits>`, and only on local regtest: the
 *   private key stays in this page's memory only and is removed from the address bar as soon as it is read. On another network the
 *   key is never used, and the connect page says so (a link carrying a key could hand someone an account whose key another holds).
 * - OneKey (its extension, and the browser of its app) injects its Bitcoin provider as `window.unisat` too, with Unisat's interface:
 *   the Unisat card then connects OneKey, and is named so.
 * - A wallet can switch account or network while the page is open: the page follows it (`followWallet`).
 */

import {
  MockUnisatWallet,
  UnisatAdapter,
  type WalletAccount,
  type WalletAdapter,
  XverseAdapter,
  decodeAddress,
  fromHex,
  injectedUnisat,
  injectedXverse,
  isValidSecretKey,
} from '@ksana/sdk';
import { dismissToast, toast } from '../app/prefs';
import { chain as currentChain, createStore, loadPref, savePref, subscribeChain, useStore } from '../app/store';
import type { RpcChain } from '../chain/rpc/chain';
import { localized, t, withText } from '../i18n';
import { walletAddress } from '../lib/format';
import { WalletNetworkMismatchError, checkWalletNetwork } from './btc';

export type WalletKind = 'unisat' | 'xverse' | 'mock';

export interface ConnectedWallet {
  kind: WalletKind;
  name: string;
  adapter: WalletAdapter;
  account: WalletAccount;
}

export interface WalletOption {
  kind: WalletKind;
  name: string;
  available: boolean;
  note: string;
}

export const connectedStore = createStore<ConnectedWallet | null>(null);
/**
 * Connecting (waiting for the wallet popup), or the reason the last connection failed, or the reason the page disconnected from a
 * wallet that switched to an account or a network it cannot use (`left`)
 */
export const connectingStore = createStore<{ kind: WalletKind; error?: string; left?: boolean } | null>(null);

/**
 * Whether the `window.unisat` in the page is OneKey's: OneKey's own `window.$onekey.btc` is the same provider. Their
 * `requestAccounts` is compared, a method OneKey does not copy, rather than OneKey's `isOneKey` flag, which it copies with its other
 * fields onto another wallet's `window.unisat` it cannot replace when both extensions are installed.
 */
function unisatIsOneKey(): boolean {
  const unisat = injectedUnisat() as { requestAccounts?: unknown } | undefined;
  const onekey = (globalThis as { $onekey?: { btc?: { requestAccounts?: unknown } } }).$onekey?.btc;
  return typeof unisat?.requestAccounts === 'function' && unisat.requestAccounts === onekey?.requestAccounts;
}

/** Unisat, OneKey and Xverse are brand names and are not translated */
export const WALLET_NAME: Record<WalletKind, string> = localized(() => ({
  unisat: unisatIsOneKey() ? 'OneKey' : 'Unisat',
  xverse: 'Xverse',
  mock: t().wallet.connect.mockName,
}));

/** The test key the address bar carried: `secret` is null when it was not a valid private key */
let mockKey: { secret: Uint8Array | null } | null = null;

/** Read the test private key from the address bar (read once, then removed from the address bar) */
function readMockKey() {
  if (mockKey || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('wallet') !== 'mock' || !url.searchParams.has('key')) return;
    const key = url.searchParams.get('key') ?? '';
    const secret = /^[0-9a-fA-F]{64}$/.test(key) ? fromHex(key, 32) : null;
    mockKey = { secret: secret && isValidSecretKey(secret) ? secret : null };
    url.searchParams.delete('key');
    // The history entry keeps its state (the router's key for where the page was left)
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* Ignored when the address bar is not writable (preview environments) */
  }
}

// Read the private key and remove it from the address bar as soon as the page loads, without waiting for the wallet page to open
readMockKey();

/** The test private key, on local regtest only: on any other network a key that came in the address bar is never used */
function testKey(chain: RpcChain): Uint8Array | null {
  readMockKey();
  return chain.network === 'regtest' ? (mockKey?.secret ?? null) : null;
}

/** The address bar carried a test private key on a page that is not on local regtest: it was removed from there and is not used */
export function testKeyRefused(chain: RpcChain): boolean {
  readMockKey();
  return mockKey !== null && chain.network !== 'regtest';
}

export function walletOptions(chain: RpcChain): WalletOption[] {
  const c = t().wallet.connect;
  const options: WalletOption[] = [
    { kind: 'unisat', name: WALLET_NAME.unisat, available: !!injectedUnisat(), note: c.unisatNote },
    { kind: 'xverse', name: WALLET_NAME.xverse, available: !!injectedXverse(), note: c.xverseNote },
  ];
  if (testKey(chain)) options.push({ kind: 'mock', name: WALLET_NAME.mock, available: true, note: c.mockNote });
  return options;
}

function makeAdapter(kind: WalletKind, chain: RpcChain): WalletAdapter {
  if (kind === 'unisat') return new UnisatAdapter();
  if (kind === 'xverse') return new XverseAdapter({ message: t().wallet.connect.xverseMessage });
  const secret = testKey(chain);
  if (!secret) throw new Error(t().wallet.connect.noMockKey);
  return new UnisatAdapter(new MockUnisatWallet({ secretKey: secret, network: chain.network }));
}

/** An account the page cannot use (on another network, or not a Taproot one): the message says why, and what to do, in the page's language */
class UnusableAccountError extends Error {}

/**
 * The account the wallet is on. The SDK refuses in its own words one that cannot be an account (`deriveWalletAccount`: an address
 * that is not Taproot, or not the Taproot one of its key with no script tree, BIP86, D-092), which the page says in its language
 */
async function accountOf(adapter: WalletAdapter): Promise<WalletAccount> {
  try {
    return await adapter.getAccount();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('can only be a Taproot (P2TR) address')) throw new UnusableAccountError(t().wallet.connect.notTaproot);
    if (message.includes('is not the BIP86-tweaked address')) throw new UnusableAccountError(t().wallet.connect.notBip86);
    throw e;
  }
}

function onNetwork(account: WalletAccount, chain: RpcChain): boolean {
  try {
    return decodeAddress(account.address).networks.includes(chain.network);
  } catch {
    return false;
  }
}

/** The wallet address's network must match the node's (devnet uses regtest addresses, signet uses tb1 addresses), and it must be a Taproot address (D-092) */
function checkNetwork(account: WalletAccount, chain: RpcChain) {
  if (account.addressType !== 'p2tr') throw new UnusableAccountError(t().wallet.connect.notTaproot);
  if (!onNetwork(account, chain)) throw new UnusableAccountError(t().wallet.connect.wrongNetwork(account.address.slice(0, 8), chain.network));
}

/** The node data source has to know the wallet account (it refreshes its balance and nonce periodically) */
function walletKey(account: WalletAccount) {
  return { account: account.account };
}

export async function connectWallet(kind: WalletKind, chain: RpcChain): Promise<boolean> {
  connectingStore.set({ kind });
  try {
    const adapter = makeAdapter(kind, chain);
    const account = await accountOf(adapter);
    checkNetwork(account, chain);
    await checkWalletNetwork({ name: WALLET_NAME[kind], adapter }, chain.network);
    // The name is read in the current language: after a language switch, the connected test-key wallet changes its name too
    connectedStore.set(withText({ kind, adapter, account }, 'name', () => WALLET_NAME[kind]));
    chain.setWallet(walletKey(account));
    if (kind !== 'mock') savePref('walletKind', kind);
    connectingStore.set(null);
    return true;
  } catch (e) {
    connectingStore.set({ kind, error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/**
 * Whether a wallet's error means the user declined (closed the prompt or pressed reject). Extensions word this themselves: besides
 * the English words, the two Chinese words for "reject" and "cancel" are matched, written as code points.
 */
export function isWalletRejection(message: string): boolean {
  return /reject|cancel|denied|\u62d2\u7edd|\u53d6\u6d88/i.test(message);
}

/** Each reading of the wallet's account to follow it: only the last one started is followed */
let reads = 0;
// The toast that told of the last switch: what it says no longer holds once the wallet switches again or leaves
let told: number | undefined;

/** The page leaves a wallet it cannot go on with, the connect page saying why */
function leave(w: ConnectedWallet, chain: RpcChain, reason: string) {
  connectedStore.set(null);
  chain.setWallet(null);
  connectingStore.set({ kind: w.kind, error: reason, left: true });
}

/**
 * Whether Unisat, or OneKey, has an account to give without a prompt (`getAccounts`): none while it is locked, or this page's access
 * taken back in it, when asking for its accounts would open its prompt
 */
async function listsAccount(): Promise<boolean> {
  const provider = injectedUnisat() as { getAccounts?(): Promise<unknown> } | undefined;
  if (typeof provider?.getAccounts !== 'function') return true;
  try {
    const accounts = await provider.getAccounts();
    return !Array.isArray(accounts) || accounts.length > 0;
  } catch {
    return false;
  }
}

/**
 * The wallet switched account or network under the page (Unisat and OneKey say so), or may have (a signature it was asked for was
 * for another account). The page reads its account again and follows it, as a new connection would: to another account it can
 * use, with a toast naming it, the wallet's balances and forms then being that account's; from one it cannot (another network, or
 * not a Taproot account), by disconnecting, with the reason on the connect page. A wallet it cannot read now, or without a prompt
 * (a locked one), is left as it is; so is Xverse, reading whose account can open its popup (see `afterSigning`).
 */
export async function followWallet(): Promise<void> {
  const w = connectedStore.get();
  const chain = currentChain();
  if (!w || w.kind !== 'unisat' || chain.kind !== 'rpc') return;
  const read = ++reads;
  // Only the last reading started is followed, while the page is still on that wallet; where the page moved to another node meanwhile
  // (the wallet attached to it as it was), the wallet is read again for that one
  const current = () => {
    if (read !== reads || connectedStore.get() !== w) return false;
    if (currentChain() === chain) return true;
    void followWallet();
    return false;
  };
  try {
    if (!(await listsAccount())) return;
    const account = await accountOf(w.adapter);
    checkNetwork(account, chain);
    await checkWalletNetwork(w, chain.network);
    if (!current() || account.account === w.account.account) return;
    connectedStore.set(withText({ kind: w.kind, adapter: w.adapter, account }, 'name', () => WALLET_NAME[w.kind]));
    chain.setWallet(walletKey(account));
    const c = t().wallet.connect;
    if (told !== undefined) dismissToast(told);
    told = toast({ tone: 'neutral', title: c.switched(w.name), body: c.switchedTo(walletAddress(account.address)) });
  } catch (e) {
    if (!current() || !(e instanceof UnusableAccountError || e instanceof WalletNetworkMismatchError)) return;
    leave(w, chain, e.message);
  }
}

/** What Unisat's provider, and OneKey's, say when the wallet switches account (the addresses it is on now), network or chain */
const SWITCHES = ['accountsChanged', 'networkChanged', 'chainChanged'];

/** A provider's events, where it has them: Unisat's interface */
interface Heard {
  on?(event: string, listener: (value: unknown) => void): unknown;
  removeListener?(event: string, listener: (value: unknown) => void): unknown;
}

/**
 * The connected wallet's switches are listened to while it is connected: Unisat's and OneKey's. Xverse's are not, as reading its
 * account can open its popup; the SDK checks its account each time it signs.
 */
let unlisten: (() => void) | undefined;
let listened: WalletAdapter | undefined;
connectedStore.subscribe(() => {
  const w = connectedStore.get();
  // The toast that told of the last switch goes with the wallet, however the page leaves it
  if (!w && told !== undefined) {
    dismissToast(told);
    told = undefined;
  }
  if (w?.adapter === listened) return;
  unlisten?.();
  unlisten = undefined;
  listened = w?.adapter;
  const provider = w?.kind === 'unisat' ? (injectedUnisat() as Heard | undefined) : undefined;
  if (!provider || typeof provider.on !== 'function') return;
  const heard = (value: unknown) => {
    // An empty list: the wallet locked, or this page's access taken back in it; nothing changes until it is on an account again
    if (Array.isArray(value) && (value.length === 0 || value[0] === connectedStore.get()?.account.address)) return;
    void followWallet();
  };
  for (const event of SWITCHES) provider.on(event, heard);
  unlisten = () => {
    for (const event of SWITCHES) provider.removeListener?.(event, heard);
  };
});

/** A wallet asked to sign was on another account than the page's: nothing was signed */
export class WalletSwitchedError extends Error {
  constructor(wallet: string) {
    super(t().wallet.connect.signSwitched(wallet));
    this.name = 'WalletSwitchedError';
  }
}

/**
 * Before the wallet is asked to sign: it must still be on the page's account. Unisat and OneKey say which one without a prompt
 * (`getAccounts`); a wallet that cannot say is checked by the SDK as it signs (`signVmopWithWallet`, see `afterSigning`).
 */
export async function checkWalletAccount(w: ConnectedWallet): Promise<void> {
  const provider = w.kind === 'unisat' ? (injectedUnisat() as { getAccounts?(): Promise<unknown> } | undefined) : undefined;
  if (typeof provider?.getAccounts !== 'function') return;
  let address: unknown;
  try {
    const accounts = await provider.getAccounts();
    address = Array.isArray(accounts) ? accounts[0] : undefined;
  } catch {
    // The wallet will say what is wrong when it is asked to sign
    return;
  }
  if (typeof address === 'string' && address !== w.account.address) throw new WalletSwitchedError(w.name);
}

/** The SDK's refusal to sign for an account the wallet is no longer on (`signVmopWithWallet`, core/sdk/ts/src/wallet/flow.ts) */
const SDK_SWITCHED = /^VmOp account [0-9a-f]{64} does not match wallet account [0-9a-f]{64}$/;

/** How long a form waits for the page to follow a wallet found on another account as it signed, before it says so all the same */
const FOLLOW_WAIT_MS = 2_000;

/**
 * What a signature asked of the wallet failed with, as the page says it: where the wallet was on another account than the page's
 * (`checkWalletAccount`, or the SDK's own check), a `WalletSwitchedError`, once the page has followed Unisat or OneKey to that account
 * (or a moment has gone by), for the form to say it over the account the page then shows. Xverse, reading whose account can open its
 * popup, is left, the connect page saying why, for the reader to connect it again
 */
export async function afterSigning(e: unknown, w: ConnectedWallet): Promise<unknown> {
  const switched = e instanceof WalletSwitchedError || (e instanceof Error && SDK_SWITCHED.test(e.message));
  if (!switched) return e;
  const chain = currentChain();
  if (w.kind === 'unisat') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([followWallet(), new Promise<void>((r) => (timer = setTimeout(r, FOLLOW_WAIT_MS)))]);
    clearTimeout(timer);
  } else if (connectedStore.get() === w && chain.kind === 'rpc') leave(w, chain, t().wallet.connect.signSwitchedLeft(w.name));
  return e instanceof WalletSwitchedError ? e : new WalletSwitchedError(w.name);
}

export function disconnectWallet(chain?: RpcChain) {
  connectedStore.set(null);
  connectingStore.set(null);
  savePref('walletKind', null);
  chain?.setWallet(null);
}

// Switching or reconnecting the data source creates a new data source object: the connected wallet is attached to the new node data
// source; when switching to the simulator, or when the new node's network does not match the wallet address, it is disconnected
// (the "last used wallet" is kept)
subscribeChain(() => {
  const w = connectedStore.get();
  if (!w) return;
  const next = currentChain();
  if (next.kind === 'rpc' && onNetwork(w.account, next)) {
    next.setWallet(walletKey(w.account));
    return;
  }
  connectedStore.set(null);
  connectingStore.set(null);
});

/** The last used wallet (no automatic popup after a reload; the wallet page only offers "continue with it") */
export function lastWalletKind(): WalletKind | null {
  return loadPref<WalletKind | null>('walletKind', null);
}

export function useConnectedWallet(): ConnectedWallet | null {
  return useStore(connectedStore);
}

export function useConnecting() {
  return useStore(connectingStore);
}
