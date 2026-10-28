/**
 * The submission flow for path C and top-ups under the node data source (D-078, D-085, D-086):
 *
 * 1. coin selection: the UTXOs on the wallet address come from the Bitcoin RPC, Unisat or manual entry by the user (`./btc.ts`);
 * 2. signing: a path C operation's signature binds the first input of the carrying transaction (`nativeFirstInput(utxos[0])`,
 *    D-086) and is made by the wallet as a BIP322 signature; a top-up's claim operation is signed by the SDK with a one-time key
 *    (`buildTopUp`);
 * 3. construction: the SDK's `buildNativeTx` / `buildTopUp` give an unsigned PSBT (output 0 is the KSN1 data output);
 * 4. the wallet signs the PSBT's inputs (the page never touches private keys);
 * 5. broadcast: Bitcoin RPC → Unisat → hand back the raw hex for the user to broadcast themselves;
 * 6. record it in the data source (`RpcChain.noteNative`), then track progress by BTC confirmations and forced inclusion.
 *
 * Before step 2 the node's chain ID is checked again (`RpcChain.checkChain`, A2-11, D-106): an operation signed for another
 * network would be force-included and fail while the BTC payment confirms. So is the BTC network of the Bitcoin RPC when there is
 * one (`RpcChain.checkBtcChain`), since the transaction is broadcast there: on another BTC network the node never sees it, and a
 * top-up's payment to the seller is made anyway. Then the wallet's own BTC network, when it tells it (`checkWalletNetwork`): a
 * wallet set to another network is refused, and Unisat lists coins and broadcasts only once it names the page's (`./btc.ts`).
 * Before all of these, the fee rate is checked against the page's cap (`MAX_FEE_RATE`).
 */

import {
  type ExchangeLock,
  type VmOp as SdkVmOp,
  buildNativeTx,
  buildTopUp,
  extractTransaction,
  fromHex,
  getLock,
  nativeFirstInput,
  parseTx,
  quoteTopUp,
  signVmopWithWallet,
  txid as sdkTxid,
  txidToRpc,
} from '@ksana/sdk';
import type { RpcChain } from '../chain/rpc/chain';
import { opIdOf } from '../chain/rpc/convert';
import { NODE_POLICY } from '../chain/params';
import { t } from '../i18n';
import type { Hex } from '../chain/types';
import { type ConnectedWallet, checkWalletAccount } from './connect';
import { type BroadcastResult, type UtxoSourceKind, type WalletUtxo, broadcastSigned, checkWalletNetwork, parseManualUtxo, scriptOf, toSdkUtxos, walletUtxos } from './btc';

/** The UTXOs on the wallet address and their source; when the source is manual and the list is empty, the user has to enter them by hand */
export interface UtxoChoice {
  source: UtxoSourceKind;
  utxos: WalletUtxo[];
}

/** List the wallet address's UTXOs: text entered by hand (one `txid:vout:sats` per line) takes precedence, otherwise Bitcoin RPC → Unisat → empty list (manual entry) */
export async function loadUtxos(chain: RpcChain, wallet: ConnectedWallet, manualText = ''): Promise<UtxoChoice> {
  const manual = manualText
    .split(/\r?\n|[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (manual.length) {
    const utxos = manual.map(parseManualUtxo).filter((u): u is WalletUtxo => !!u);
    return { source: 'manual', utxos };
  }
  const found = await walletUtxos(wallet, chain);
  return found ?? { source: 'manual', utxos: [] };
}

export interface NativeSubmission {
  opId: Hex;
  /** The carrying transaction's ID (display byte order) */
  txid: Hex;
  feeSat: number;
  vsize: number;
  /** Which UTXOs were used */
  inputs: WalletUtxo[];
  broadcast: BroadcastResult;
}

/**
 * The highest BTC fee rate of a path C or top-up transaction the page builds (sat/vB): a node's own cap for its BTC transactions,
 * by default (--max-settlement-feerate, D-102). The rate the node suggests is taken up to it, and a higher one, suggested or entered,
 * is refused (the first audit's F-15): a node, or a slip of the finger, could otherwise have the wallet sign away any fee, which
 * only its review would show
 */
export const MAX_FEE_RATE = NODE_POLICY.MAX_SETTLEMENT_FEERATE;

/** The fee rate offered for a path C operation or a top-up: the node's suggestion, at most `MAX_FEE_RATE` */
export function offeredFeeRate(suggested: number): number {
  return Math.min(suggested, MAX_FEE_RATE);
}

/** Nothing is signed at a fee rate above `MAX_FEE_RATE`: the forms keep to it, and this holds whatever reaches the submission */
function checkFeeRate(feeRate: number) {
  if (!(feeRate <= MAX_FEE_RATE)) throw new Error(t().wallet.native.feeRateTooHigh(String(feeRate), String(MAX_FEE_RATE)));
}

/** A margin for the change above its dust limit, which the coins cover besides the payment and the fee */
const CHANGE_MARGIN = 1000;

/**
 * The coins a submission passes to the SDK, which takes them in this order until they cover it: largest first, and from the
 * Bitcoin RPC only confirmed ones (`unconfirmed` lists the rest); others, entered by hand or Unisat's, as given
 */
export function spendable(choice: UtxoChoice): WalletUtxo[] {
  return choice.utxos.filter((u) => choice.source !== 'btc_rpc' || u.height !== undefined).sort((a, b) => b.valueSat - a.valueSat);
}

/** The coins the Bitcoin RPC lists that wait for their first confirmation: shown apart, and spent once confirmed */
export function unconfirmed(choice: UtxoChoice): WalletUtxo[] {
  return choice.source === 'btc_rpc' ? choice.utxos.filter((u) => u.height === undefined) : [];
}

/**
 * Whether the coins pay for a path C or top-up transaction, taken in their order as the SDK takes them (`spendable`): the payment,
 * the miner fee with each input taken (`fee`, by the number of inputs) and a margin for the change. `inputs` is how many that takes,
 * every coin when they fall short, and `need` the sats it then needs
 */
export function coverage(coins: readonly WalletUtxo[], fee: (inputs: number) => number, payment = 0): { enough: boolean; inputs: number; need: number } {
  let sum = 0;
  for (const [i, coin] of coins.entries()) {
    sum += coin.valueSat;
    const need = payment + fee(i + 1) + CHANGE_MARGIN;
    if (sum >= need) return { enough: true, inputs: i + 1, need };
  }
  const inputs = Math.max(1, coins.length);
  return { enough: false, inputs, need: payment + fee(inputs) + CHANGE_MARGIN };
}

/** Whether the coins cover it (`coverage`) once those waiting for a confirmation are confirmed too */
export function coveredOnceConfirmed(choice: UtxoChoice, fee: (inputs: number) => number, payment = 0): boolean {
  const coins = [...spendable(choice), ...unconfirmed(choice)].sort((a, b) => b.valueSat - a.valueSat);
  return coverage(coins, fee, payment).enough;
}

/** The coins a submission passes to the SDK (`spendable`); with none, the error says whether some wait for a confirmation */
function candidates(choice: UtxoChoice): WalletUtxo[] {
  const coins = spendable(choice);
  if (!coins.length) throw new Error(unconfirmed(choice).length ? t().wallet.native.unconfirmed : t().wallet.native.noUtxo);
  return coins;
}

async function signAndBroadcast(
  chain: RpcChain,
  wallet: ConnectedWallet,
  op: SdkVmOp,
  draft: { psbt: Uint8Array; inputs: { value: bigint }[]; fee: bigint; vsize: number },
  picked: WalletUtxo[],
): Promise<NativeSubmission> {
  const signed = await wallet.adapter.signPsbt(draft.psbt, draft.inputs.map((_, index) => ({ index })));
  const raw = extractTransaction(signed);
  const id = sdkTxid(parseTx(raw));
  const broadcast = await broadcastSigned(signed, id, wallet, chain);
  const inputValues = draft.inputs.map((i) => Number(i.value));
  chain.noteNative(op, raw, { owner: wallet.account.account, ownerScript: scriptOf(wallet.account), inputValues, byHand: broadcast.via === 'manual' });
  return { opId: opIdOf(op), txid: txidToRpc(id), feeSat: Number(draft.fee), vsize: draft.vsize, inputs: picked.slice(0, draft.inputs.length), broadcast };
}

/**
 * Path C: `unsigned` is the wallet account's operation (`fee` is BtcNative, nonce and max_gas already filled in). The first input
 * is fixed first and the wallet signs against it (D-086); then build, sign the PSBT and broadcast.
 */
export async function submitNative(
  chain: RpcChain,
  wallet: ConnectedWallet,
  unsigned: Omit<SdkVmOp, 'sig'>,
  opts: { choice: UtxoChoice; feeRate: number },
): Promise<NativeSubmission> {
  checkFeeRate(opts.feeRate);
  await chain.checkChain();
  await chain.checkBtcChain();
  await checkWalletNetwork(wallet, chain.network);
  await checkWalletAccount(wallet);
  const picked = candidates(opts.choice);
  const utxos = toSdkUtxos(picked, wallet.account);
  const first = utxos[0];
  if (!first) throw new Error(t().wallet.native.noUtxo);
  const op = await signVmopWithWallet(unsigned, wallet.adapter, { firstInput: nativeFirstInput(first) });
  const draft = buildNativeTx({ op, utxos, changeScript: scriptOf(wallet.account), feeRate: opts.feeRate, params: chain.sdkParams });
  return signAndBroadcast(chain, wallet, op, draft, picked);
}

export interface TopUpQuote {
  lock: ExchangeLock;
  /** The KSA (base units) that paying `sats` sats buys */
  ksa: bigint;
  /** The sats needed to get all of the locked KSA */
  satsForAll: bigint;
}

/** Read the lock and quote it (the SDK's getLock / quoteTopUp) */
export async function quoteLock(chain: RpcChain, exchange: Hex, lockId: bigint, sats: bigint): Promise<TopUpQuote> {
  const lock = await getLock(chain.node, fromHex(exchange, 32), lockId);
  const q = quoteTopUp(lock, sats);
  return { lock, ksa: q.ksa, satsForAll: q.satsForAll };
}

/**
 * Top-up: pay `sats` sats to the lock's payment script, with the same transaction carrying the claim operation (one-time key
 * signature, bound to the first input). The lock is re-read before submitting, so as not to pay a lock that is already closed.
 */
export async function submitTopUp(
  chain: RpcChain,
  wallet: ConnectedWallet,
  args: { exchange: Hex; lockId: bigint; sats: bigint; choice: UtxoChoice; feeRate: number; allowPartial?: boolean; allowOverpay?: boolean },
): Promise<NativeSubmission & { payBy: number; ksa: bigint }> {
  checkFeeRate(args.feeRate);
  await chain.checkChain();
  await chain.checkBtcChain();
  await checkWalletNetwork(wallet, chain.network);
  await checkWalletAccount(wallet);
  const lock = await getLock(chain.node, fromHex(args.exchange, 32), args.lockId);
  const picked = candidates(args.choice);
  const utxos = toSdkUtxos(picked, wallet.account);
  const draft = buildTopUp({
    exchange: fromHex(args.exchange, 32),
    lockId: args.lockId,
    lock,
    beneficiary: fromHex(wallet.account.account, 32),
    sats: args.sats,
    currentBtcHeight: chain.currentBtcHeight(),
    utxos,
    changeScript: scriptOf(wallet.account),
    feeRate: args.feeRate,
    params: chain.sdkParams,
    ...(args.allowPartial ? { allowPartial: true } : {}),
    ...(args.allowOverpay ? { allowOverpay: true } : {}),
  });
  const done = await signAndBroadcast(chain, wallet, draft.op, draft, picked);
  return { ...done, payBy: draft.payBy, ksa: draft.ksa };
}
