/**
 * The BTC side of the wallet under the node data source (shared by path C and top-ups): find the spendable UTXOs on the wallet
 * address, broadcast signed transactions, read the BTC tip height.
 * The Ksana node does not provide these (it only understands KSN1 payloads); the sources, in order of priority:
 * 1. the "Bitcoin RPC" in the data source settings (bitcoind's JSON-RPC through the same-origin proxy; the mock bitcoind of the local
 *    devnet tool web_devnet.rs works too): scantxoutset lists UTXOs, sendrawtransaction broadcasts, getblockchaininfo reads the
 *    tip's height and its block's time, and must name the BTC network of the page's network before coins are listed or a
 *    transaction is broadcast (A2-11, D-106). On the signet page an Esplora interface under the same URL (`<url>/esplora`, the
 *    public signet's proxy) lists the UTXOs instead, once its genesis block is signet's, since a scan takes up to a minute there
 *    (D-108);
 * 2. the Unisat extension: getBitcoinUtxos and pushTx, which work on Unisat's own account and the chain it is set to, so only for
 *    the connected Unisat wallet once its getChain names the page's BTC network (A2-11, D-106);
 * 3. manual: the user pastes `txid:vout:amount (sats)`, and the signed transaction is handed back as raw hex for the user to
 *    broadcast themselves (bitcoin-cli sendrawtransaction).
 * The page never touches private keys: the PSBT is signed by the wallet adapter (the SDK's signPsbt); only coin selection and
 * broadcasting happen here. A wallet that says it is set to another BTC network than the page's is refused (`checkWalletNetwork`).
 */

import {
  type BtcNetwork,
  type Utxo as SdkUtxo,
  type WalletAccount,
  extractTransaction,
  fromHex,
  injectedUnisat,
  p2trScriptFromOutputKey,
  scriptToAddress,
  toHex,
  txidFromRpc,
  txidToRpc,
} from '@ksana/sdk';
import type { Hex } from '../chain/types';
import { t } from '../i18n';
import type { ConnectedWallet } from './connect';

/** One UTXO on the wallet address (the transaction ID is in display byte order, the same as in the block explorer) */
export interface WalletUtxo {
  txid: Hex;
  vout: number;
  valueSat: number;
  /** The BTC height that confirmed it; absent when unconfirmed or unknown */
  height?: number;
}

export type UtxoSourceKind = 'btc_rpc' | 'unisat' | 'manual';

/** Methods of the Unisat extension beyond the SDK adapter (some versions lack them) */
interface UnisatExtra {
  getBitcoinUtxos?: (cursor?: number, size?: number) => Promise<{ txid: string; vout: number; satoshis: number; scriptPk?: string }[]>;
  pushTx?: (options: { rawtx: string }) => Promise<string>;
}

function unisatExtra(): UnisatExtra | undefined {
  return injectedUnisat() as (UnisatExtra & object) | undefined;
}

/**
 * The tip as `getblockchaininfo` gives it: its height (`blocks`), its block's hash (`bestblockhash`, in RPC byte order) and the time
 * that block gives (`time`, the header's, which a Bitcoin explorer shows; given from Bitcoin Core 23), in milliseconds
 */
export interface TipReading {
  height: number;
  hash?: string;
  time?: number;
}

/** The tip in an answer of `getblockchaininfo`; undefined when it gives no height */
function tipReading(info: { blocks?: unknown; bestblockhash?: unknown; time?: unknown } | null): TipReading | undefined {
  const blocks = info?.blocks;
  const hash = info?.bestblockhash;
  const time = info?.time;
  if (typeof blocks !== 'number' || !Number.isSafeInteger(blocks) || blocks < 0) return undefined;
  return {
    height: blocks,
    ...(typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash) ? { hash } : {}),
    ...(typeof time === 'number' && Number.isSafeInteger(time) && time > 0 ? { time: time * 1000 } : {}),
  };
}

/** bitcoind's name of each BTC network, as `getblockchaininfo` gives it in `chain` (the CLI compares the same, `check_btc_chain`) */
const CORE_CHAIN: Record<BtcNetwork, string> = { mainnet: 'main', testnet: 'test', signet: 'signet', regtest: 'regtest' };

/** The genesis block of each BTC network by bitcoind's name, in display byte order as Esplora's `block-height/0` gives it */
const GENESIS: [chain: string, hash: string][] = [
  ['main', '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'],
  ['test', '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943'],
  ['testnet4', '00000000da84f2bafbbc53dee25a72ae507ff4914b867c565be350b0da8bf043'],
  ['signet', '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6'],
  ['regtest', '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206'],
];

/** The chain a genesis block is the genesis of, by bitcoind's name; a block of none is named by its hash */
function chainOfGenesis(hash: string): string {
  return GENESIS.find(([, h]) => h === hash)?.[0] ?? `genesis ${hash.slice(0, 16)}…`;
}

/**
 * The Bitcoin RPC is on another BTC network than the page's (A2-11, D-106). A `raw()` descriptor matches the same script on every
 * network and the wallet's signature does not depend on it, so the page would list the wallet's coins there and broadcast where
 * the node never looks: for a top-up, a real payment to the seller.
 */
export class BtcChainMismatchError extends Error {
  constructor(
    readonly url: string,
    /** bitcoind's chain: main, test, testnet4, signet or regtest */
    readonly chain: string,
    /** The chain the page's network runs on */
    readonly expected: string,
  ) {
    super(t().rpc.btcRpcWrongChain(url, chain, expected));
    this.name = 'BtcChainMismatchError';
  }
}

/**
 * An Esplora read that gets no answer, or a 5xx, is asked again this many times, after ESPLORA_RETRY_MS and then twice that: the
 * public signet's Esplora behind the proxy at times answers 502 or 503 ("busy"), and the scan the page would turn to instead is
 * refused there. The proxy's budget for Esplora refills two reads a second, and a 503 takes none of it.
 */
const ESPLORA_RETRIES = 2;
const ESPLORA_RETRY_MS = 400;
/**
 * A failure that took this long is not asked again: the proxy gives up waiting on mempool.space after 15 seconds, and each ask
 * again would keep the coins "being read" as long once more
 */
const ESPLORA_RETRY_WITHIN_MS = 5_000;

/** bitcoind's JSON-RPC (through the same-origin proxy, which adds the credentials) */
export class BtcRpc {
  private seq = 0;
  /** The Esplora interface's genesis block once it matched this network: it cannot change, so later listings do not ask again */
  private esploraGenesis: string | undefined;

  constructor(
    readonly url: string,
    /** The BTC network of the page's network: the one this bitcoind must be on */
    readonly network: BtcNetwork,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
    /** The pause before an Esplora read is asked again the first time */
    private readonly retryMs = ESPLORA_RETRY_MS,
  ) {}

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await this.fetchFn(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.seq, method, params }),
    });
    const text = await res.text();
    let json: { result?: T; error?: { code: number; message: string } | null };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new Error(t().rpc.btcRpcNotJson(method, res.status));
    }
    if (json.error) throw new Error(t().rpc.btcRpcFailed(method, json.error.code, json.error.message));
    if (!res.ok) throw new Error(t().rpc.btcRpcHttp(method, res.status));
    return json.result as T;
  }

  /**
   * This bitcoind must be on the page's BTC network (A2-11, D-106): compares `getblockchaininfo`'s `chain` with it and throws
   * `BtcChainMismatchError` otherwise. Read again before every listing of coins and every broadcast, as the CLI does before it
   * funds anything, and at every reading of the tip (`BtcTipReader`), so that a bitcoind on another network gives the page no tip
   * and no block time to keep. Returns its tip (`TipReading`), when the answer gives it.
   */
  async checkChain(): Promise<TipReading | undefined> {
    const expected = CORE_CHAIN[this.network];
    const info = await this.call<{ chain?: unknown; blocks?: unknown; bestblockhash?: unknown; time?: unknown } | null>('getblockchaininfo');
    const chain = String(info?.chain);
    if (chain !== expected) throw new BtcChainMismatchError(this.url, chain, expected);
    return tipReading(info);
  }

  /**
   * All UTXOs on a locking script: on the signet page from Esplora when there is one (`esploraUtxos`), otherwise scantxoutset's
   * raw() descriptor (supported by both bitcoind and the mock bitcoind) once the chain is checked
   */
  async utxosOf(script: Uint8Array): Promise<WalletUtxo[]> {
    const listed = this.network === 'signet' ? await this.esploraUtxos(script) : undefined;
    if (listed) return listed;
    await this.checkChain();
    const r = await this.call<{ unspents?: { txid: string; vout: number; amount: number; height?: number }[] }>('scantxoutset', ['start', [`raw(${toHex(script)})`]]);
    return (r.unspents ?? []).map((u) => ({ txid: u.txid.toLowerCase(), vout: u.vout, valueSat: btcToSats(u.amount), ...(u.height !== undefined ? { height: u.height } : {}) }));
  }

  /**
   * The UTXOs on a locking script where listing them is cheap, for the page to follow its own transactions: from Esplora on the
   * signet page, a scan elsewhere (a regtest's UTXO set is small); undefined on a signet page without an Esplora, where a scan takes
   * up to a minute and the hosted proxy refuses it
   */
  async listedUtxos(script: Uint8Array): Promise<WalletUtxo[] | undefined> {
    return this.network === 'signet' ? this.esploraUtxos(script) : this.utxosOf(script);
  }

  /**
   * The UTXOs from the Esplora interface under this URL (`<url>/esplora/address/<address>/utxo`, D-108): on the public signet it
   * answers at once, where a scan takes up to a minute and the proxy runs one at a time. Its chain is checked by its genesis block
   * (`block-height/0`, asked until it once matches) before its list counts, and another chain's throws `BtcChainMismatchError`; the
   * two are asked together, so that the wallet's first BTC balance takes one round trip, not two. Undefined when there is no Esplora
   * or it gives no well-formed answer, and the caller scans instead. Its answer is only a list of candidates: a wallet's Taproot
   * signature commits to every input's amount and script, and the checked bitcoind broadcasts.
   */
  private async esploraUtxos(script: Uint8Array): Promise<WalletUtxo[] | undefined> {
    const base = `${this.url.replace(/\/+$/, '')}/esplora`;
    const asked = this.esploraGenesis === undefined ? this.getText(`${base}/block-height/0`) : undefined;
    // not from the browser's cache: the list changes with every payment (getText never rejects, so a list left unread is no error)
    const listed = this.getText(`${base}/address/${scriptToAddress(script, this.network)}/utxo`, { cache: 'no-store' });
    const genesis = this.esploraGenesis ?? (await asked)?.trim();
    if (genesis === undefined || !/^[0-9a-f]{64}$/.test(genesis)) return undefined;
    const expected = CORE_CHAIN[this.network];
    if (chainOfGenesis(genesis) !== expected) throw new BtcChainMismatchError(base, chainOfGenesis(genesis), expected);
    this.esploraGenesis = genesis;
    const body = await listed;
    return body === undefined ? undefined : parseEsploraUtxos(body);
  }

  /**
   * The body of a GET, or undefined when it fails or answers with an error status. No answer or a 5xx is asked again
   * (ESPLORA_RETRIES) when it came quickly (ESPLORA_RETRY_WITHIN_MS); a 4xx, a refusal such as 429, is not
   */
  private async getText(url: string, init?: RequestInit): Promise<string | undefined> {
    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        const res = await this.fetchFn(url, init);
        if (res.ok) return await res.text();
        if (res.status < 500) return undefined;
      } catch {
        /* no answer: asked again below */
      }
      if (attempt >= ESPLORA_RETRIES || Date.now() - started >= ESPLORA_RETRY_WITHIN_MS) return undefined;
      await new Promise((resolve) => setTimeout(resolve, this.retryMs * (attempt + 1)));
    }
  }

  /** Broadcast, once the chain is checked; returns the transaction ID (display byte order) */
  async sendRawTransaction(raw: Uint8Array): Promise<Hex> {
    await this.checkChain();
    return (await this.call<string>('sendrawtransaction', [toHex(raw)])).toLowerCase();
  }

  /** Fee rate estimate (sat/vB); undefined when the node does not support it or has no data */
  async feeRate(blocks = 2): Promise<number | undefined> {
    try {
      const r = await this.call<{ feerate?: number }>('estimatesmartfee', [blocks]);
      return r.feerate !== undefined ? Math.max(1, Math.ceil((r.feerate * 1e8) / 1000)) : undefined;
    } catch {
      return undefined;
    }
  }
}

/**
 * The wallet says it is set to another BTC network than the page's (A2-11, D-106). The address does not pin the network on signet,
 * whose `tb1…` addresses are testnet3's and testnet4's too, nor on mainnet, whose addresses are Fractal Bitcoin's too: Unisat would
 * list the coins and broadcast on that network, where the node never looks.
 */
export class WalletNetworkMismatchError extends Error {
  constructor(
    /** The wallet's name (Unisat, Xverse) */
    readonly wallet: string,
    /** The wallet's own name of the chain it is set to (Bitcoin Testnet4 (Beta), Testnet4) */
    readonly chain: string,
    /** The page's BTC network */
    readonly expected: BtcNetwork,
  ) {
    super(t().wallet.connect.wrongChain(wallet, chain, expected));
    this.name = 'WalletNetworkMismatchError';
  }
}

/**
 * The BTC network the wallet says it is set to (the SDK's `WalletAdapter.getNetwork`: Unisat getChain, Xverse wallet_getNetwork)
 * must be the page's, `network` (A2-11, D-106): throws `WalletNetworkMismatchError` when it names another. Returns whether it named
 * the page's network: false when it cannot tell, which leaves the check of the address's network (./connect).
 */
export async function checkWalletNetwork(wallet: Pick<ConnectedWallet, 'name' | 'adapter'>, network: BtcNetwork): Promise<boolean> {
  const told = await wallet.adapter.getNetwork?.();
  if (!told) return false;
  if (told.network !== network) throw new WalletNetworkMismatchError(wallet.name, told.name, network);
  return true;
}

/**
 * Unisat's own coin listing and broadcast: they work on the account Unisat has selected and on the chain it is set to, so they are
 * used only when the connected wallet is Unisat and it names the page's BTC network (A2-11, D-106). Otherwise the page falls back
 * to manual entry and hands the signed transaction back, as for a wallet without them.
 */
async function unisatServices(wallet: Pick<ConnectedWallet, 'kind' | 'name' | 'adapter'>, network: BtcNetwork): Promise<UnisatExtra | undefined> {
  const extra = wallet.kind === 'unisat' ? unisatExtra() : undefined;
  if (!extra?.getBitcoinUtxos && !extra?.pushTx) return undefined;
  return (await checkWalletNetwork(wallet, network)) ? extra : undefined;
}

/** The wallet as listing and broadcasting need it, and the page's Bitcoin RPC and BTC network (`RpcChain`) */
type BtcWallet = Pick<ConnectedWallet, 'kind' | 'name' | 'adapter' | 'account'>;
type BtcSide = { btc: BtcRpc | null; network: BtcNetwork };

/** Esplora's `address/<address>/utxo` (confirmed outputs carry their height); undefined when the reply is not such a list */
function parseEsploraUtxos(text: string): WalletUtxo[] | undefined {
  let list: unknown;
  try {
    list = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!Array.isArray(list)) return undefined;
  const utxos: WalletUtxo[] = [];
  for (const item of list as unknown[]) {
    const u = (typeof item === 'object' && item !== null ? item : {}) as { txid?: unknown; vout?: unknown; value?: unknown; status?: unknown };
    const status = (typeof u.status === 'object' && u.status !== null ? u.status : {}) as { confirmed?: unknown; block_height?: unknown };
    const { txid, vout, value } = u;
    if (typeof txid !== 'string' || !/^[0-9a-fA-F]{64}$/.test(txid)) return undefined;
    if (typeof vout !== 'number' || !Number.isSafeInteger(vout) || vout < 0) return undefined;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return undefined;
    if (typeof status.confirmed !== 'boolean') return undefined;
    const height = status.block_height;
    if (status.confirmed && (typeof height !== 'number' || !Number.isSafeInteger(height) || height < 0)) return undefined;
    utxos.push({ txid: txid.toLowerCase(), vout, valueSat: value, ...(status.confirmed ? { height: height as number } : {}) });
  }
  return utxos;
}

/** bitcoind amounts are decimal BTC: round to sats (0.0015 → 150000) */
export function btcToSats(amount: number): number {
  return Math.round(amount * 1e8);
}

/**
 * Parse a manually entered UTXO: `txid:vout:amount (sats)` (the amount may also be written as BTC with a decimal point). The
 * separator may also be the full-width colon U+FF1A that CJK input methods type.
 */
export function parseManualUtxo(text: string): WalletUtxo | null {
  const m = /^\s*([0-9a-fA-F]{64})\s*[:\uff1a]\s*(\d+)\s*[:\uff1a]\s*([\d.]+)\s*$/.exec(text);
  if (!m) return null;
  const vout = Number(m[2]);
  const amount = m[3] as string;
  const valueSat = amount.includes('.') ? btcToSats(Number(amount)) : Number(amount);
  if (!Number.isSafeInteger(vout) || !Number.isSafeInteger(valueSat) || valueSat <= 0) return null;
  return { txid: (m[1] as string).toLowerCase(), vout, valueSat };
}

/** The wallet account's UTXOs: ask the Bitcoin RPC first, then Unisat; null when neither is available (the page falls back to manual entry) */
export async function walletUtxos(wallet: BtcWallet, chain: BtcSide): Promise<{ source: UtxoSourceKind; utxos: WalletUtxo[] } | null> {
  if (chain.btc) return { source: 'btc_rpc', utxos: await chain.btc.utxosOf(scriptOf(wallet.account)) };
  const unisat = await unisatServices(wallet, chain.network);
  if (unisat?.getBitcoinUtxos) {
    const list = await unisat.getBitcoinUtxos(0, 200);
    return { source: 'unisat', utxos: list.map((u) => ({ txid: u.txid.toLowerCase(), vout: u.vout, valueSat: u.satoshis })) };
  }
  return null;
}

/** The account's locking script (P2TR: OP_1 <account>, D-092) */
export function scriptOf(account: WalletAccount): Uint8Array {
  return p2trScriptFromOutputKey(fromHex(account.account, 32));
}

/** UI UTXO → SDK UTXO (internal byte order, with the internal key so the wallet can sign) */
export function toSdkUtxos(utxos: readonly WalletUtxo[], account: WalletAccount): SdkUtxo[] {
  const script = scriptOf(account);
  const tapInternalKey = fromHex(account.internalKey, 32);
  return utxos.map((u) => ({ txid: txidFromRpc(u.txid), vout: u.vout, value: BigInt(u.valueSat), script, tapInternalKey }));
}

export type BroadcastResult = { via: 'btc_rpc' | 'unisat'; txid: Hex } | { via: 'manual'; txid: Hex; rawHex: string };

/** Extract the transaction from the signed PSBT and broadcast it; when no broadcast route is available, hand back the raw hex for the user to broadcast themselves */
export async function broadcastSigned(signedPsbt: Uint8Array, expectedTxid: Uint8Array, wallet: BtcWallet, chain: BtcSide): Promise<BroadcastResult> {
  const raw = extractTransaction(signedPsbt);
  const txid = txidToRpc(expectedTxid);
  if (chain.btc) {
    const got = await chain.btc.sendRawTransaction(raw);
    return { via: 'btc_rpc', txid: got };
  }
  const unisat = await unisatServices(wallet, chain.network);
  if (unisat?.pushTx) {
    const got = await unisat.pushTx({ rawtx: toHex(raw) });
    return { via: 'unisat', txid: got.toLowerCase() };
  }
  return { via: 'manual', txid, rawHex: toHex(raw) };
}
