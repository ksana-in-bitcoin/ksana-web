import { useEffect, useMemo, useRef, useState } from 'react';
import { type BtcNetwork, ChainMismatchError, type DecodedAddress, type VmOp as SdkVmOp, decodeAddress, fromHex, isValidXOnlyPublicKey, ks20Transfer, networkOfChainId, RPC_ERROR_CODES, RpcError, signVmopWithWallet, toHex, VMOP_VERSION } from '@ksana/sdk';
import { useEntryState, type Route } from '../../app/router';
import { explainChainMismatch } from '../../app/SourcePanel';
import { useChain, useNow } from '../../app/store';
import { recentRecipients, rememberRecipient, toast, useWalletPrefs, watchOp } from '../../app/prefs';
import { BTC_FINAL_DATA_CONFS, KSA_ASSET_ID, KSA_DECIMALS, PARAMS } from '../../chain/params';
import type { OpDraft } from '../../chain/sim/engine';
import type { Chain } from '../../chain/source';
import type { Action, AssetMeta, Hex, Path, VmOp } from '../../chain/types';
import { accountHasRecord, assetOf, balancesOf, ks20TransferArgs, nativeConfsOf, nativeWaiting, opProgress, PATH_LABEL, transferOf, txRoute, utxoState } from '../../chain/views';
import { amountNotation, commaQuestion, fieldAmount, fmtAmount, fmtDuration, fmtEta, fmtInt, parseAmount, shortHash, timeAgo } from '../../lib/format';
import { GroupedAddress } from '../../components/Address';
import { AccountSeal, AssetIssuer, CopyButton, FullHash, Hash, Link, LookalikeNote } from '../../components/Refs';
import { EnsoMark } from '../../components/Brand';
import { StatusMark } from '../../components/Status';
import { Tracker } from '../../components/Tracker';
import { Amount, Figures, PathBadge, Sats } from '../../components/Values';
import { Banner, Button, ButtonLink, Modal, PageHead, Section, SpecList, clearFootBar, keepClear } from '../../components/ui';
import { IconCheck, IconAlert } from '../../components/icons';
import { balancesKnown, linkAmount, resendViaNative, SEND_GAS_MIN, sendMaxGas, useMe } from '../../wallet/model';
import { useFolding } from '../../wallet/assets';
import { explainRefusal, knownContract, TOKEN_GAS_UNCHECKED, tokenTransferAction, useTokenBalance, useTokenTrial } from '../../wallet/tokenSend';
import { WalletSwitchedError, afterSigning, checkWalletAccount, connectedStore, isWalletRejection, useConnectedWallet } from '../../wallet/connect';
import type { BroadcastResult } from '../../wallet/btc';
import { MAX_FEE_RATE, type UtxoChoice, coverage, coveredOnceConfirmed, loadUtxos, offeredFeeRate, spendable, submitNative, unconfirmed } from '../../wallet/native';
import { nativeTxFee } from '../../chain/fees';
import type { RpcChain } from '../../chain/rpc/chain';
import { t, useT } from '../../i18n';
import { Wallet } from './Wallet';

type SendRoute = Extract<Route, { name: 'send' }>;

interface Recipient {
  id?: Hex;
  /** The account in address form (a contract ID has none) */
  address?: string;
  /** The user typed an address (otherwise hex) */
  typedAddress?: boolean;
  error?: string;
  warn?: string;
}

/** Abbreviated address: keeps the prefix and the head and tail */
function shortAddr(addr: string, head = 10, tail = 8): string {
  return addr.length > head + tail + 1 ? `${addr.slice(0, head)}…${addr.slice(-tail)}` : addr;
}

/** The data part of the address after the prefix (human-readable part, separator and witness version): for the other party to check the head and tail */
function addrBody(addr: string): string {
  const i = addr.lastIndexOf('1');
  return i > 0 ? addr.slice(i + 2) : addr;
}

/**
 * The recipient is an account (D-092): a Taproot address, or the same account as 64 hex digits. The address must be a P2TR address
 * of this network; the account is its 32-byte output key.
 */
function parseRecipient(raw: string, me: Hex, sim: Chain): Recipient {
  const m = t().send.to;
  const s = raw.trim().replace(/^0x/i, '');
  if (!s) return {};
  const network: BtcNetwork = sim.kind === 'rpc' ? sim.network : 'regtest';
  if (/^(bc|tb|bcrt)1/i.test(s)) {
    let decoded: DecodedAddress;
    try {
      decoded = decodeAddress(s);
    } catch {
      return { error: m.badAddress };
    }
    // P2TR: OP_1 <32-byte output key>
    if (decoded.script.length !== 34 || decoded.script[0] !== 0x51 || decoded.script[1] !== 0x20) return { error: m.notTaproot };
    if (!decoded.networks.includes(network)) return { error: m.wrongNetwork(network) };
    const key = decoded.script.subarray(2);
    if (!isValidXOnlyPublicKey(key)) return { error: m.notOnCurve };
    const id = toHex(key);
    return { id, address: s.toLowerCase(), typedAddress: true, ...(id === me ? { warn: m.self } : {}) };
  }
  const lower = s.toLowerCase();
  if (!/^[0-9a-f]*$/.test(lower)) return { error: m.badChars };
  if (lower.length !== 64) return { error: m.badLength(lower.length) };
  if (!isValidXOnlyPublicKey(fromHex(lower, 32))) return { error: m.notOnCurve };
  const address = sim.addressOf(lower);
  return { id: lower, ...(address ? { address } : {}), ...(lower === me ? { warn: m.self } : {}) };
}

export function Send({ route }: { route: SendRoute }) {
  const me = useMe();
  if (!me) return <Wallet />;
  return <SendForm route={route} me={me} />;
}

/** The VmOp shown to the user before signing (node data source): the same fields the wallet is about to sign, with the signature left empty */
function previewOp(draft: OpDraft, chainId: number, nonce: number): VmOp {
  return {
    version: VMOP_VERSION,
    chainId,
    account: draft.account,
    nonce,
    fee: draft.path === 'B' ? { kind: 'Token', amount: draft.tokenFee ?? 0n } : { kind: 'BtcNative' },
    maxGas: draft.maxGas,
    action: draft.action,
    sig: { kind: 'Bip322Simple', sig: '' },
  };
}

/** UI action → SDK action (the send page only sends transfers: a built-in asset's, or a KS-20 token's `transfer`, D-123) */
function sdkActionOf(a: Action): SdkVmOp['action'] {
  if (a.kind === 'AssetTransfer') return { kind: 'AssetTransfer', asset: fromHex(a.asset, 32), to: fromHex(a.to, 32), amount: a.amount };
  const token = ks20TransferArgs(a);
  if (a.kind !== 'Call' || !token) throw new Error(t().send.error.transferOnly);
  return ks20Transfer(fromHex(a.contract, 32), fromHex(token.to, 32), token.amount);
}

/** Node error code → a one-line explanation (core/docs/RPC.md) */
const RPC_REASON: Partial<Record<number, 'invalid' | 'policy' | 'params' | 'internal'>> = {
  [RPC_ERROR_CODES.OP_INVALID]: 'invalid',
  [RPC_ERROR_CODES.OP_REJECTED]: 'policy',
  [RPC_ERROR_CODES.INVALID_PARAMS]: 'params',
  [RPC_ERROR_CODES.INTERNAL]: 'internal',
};

/** Wallet and node errors → a human-readable explanation; the node's and the wallet's original text is attached as is, untranslated */
function explainSubmitError(e: unknown): string {
  const m = t().send.error;
  if (e instanceof ChainMismatchError) return explainChainMismatch(e);
  if (e instanceof RpcError) {
    // The SDK prefixes the node's text with "method: "; the UI does not show the RPC method name
    const detail = e.method && e.message.startsWith(`${e.method}: `) ? e.message.slice(e.method.length + 2) : e.message;
    const reason = RPC_REASON[e.code];
    return m.node(reason ? m.rpc[reason] : m.rpcCode(String(e.code)), detail);
  }
  if (e instanceof WalletSwitchedError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (isWalletRejection(msg)) return m.walletDeclined(msg);
  return msg;
}

interface Avail {
  ok: boolean;
  reason?: string;
  warn?: string;
}

interface SentInfo {
  id: Hex;
  /** Path C (node data source): the broadcast result of the carrying transaction; the raw transaction is handed back when there is no broadcast route */
  broadcast?: BroadcastResult;
}

function SendForm({ route, me }: { route: SendRoute; me: Hex }) {
  const t = useT();
  const sim = useChain();
  const now = useNow();
  const prefs = useWalletPrefs();
  const wallet = useConnectedWallet();
  const rpc = sim.kind === 'rpc' ? sim : null;
  const chainId = rpc ? rpc.sdkParams.chain_id : PARAMS.CHAIN_ID;
  // An asset the node has yet to name is offered once it is: the amount typed is read in its decimals
  const held = balancesOf(sim, me).filter((b) => (b.available > 0n || b.asset.id === KSA_ASSET_ID) && !b.asset.pending);
  // Nothing is listed before the node has answered for the account: KSA is offered all the same
  const assets = held.length ? held : [{ asset: sim.assets.get(KSA_ASSET_ID) as AssetMeta, available: 0n }];
  const folding = useFolding(me);
  const nonceOverride = route.nonce !== undefined && /^\d+$/.test(route.nonce) ? Number(route.nonce) : undefined;

  const [toText, setToText] = useState(route.to ?? '');
  const [toTouched, setToTouched] = useState(!!route.to);
  const [assetId, setAssetId] = useState<Hex>(route.asset && assetOf(sim, route.asset) ? route.asset : KSA_ASSET_ID);
  // The asset chosen stays offered where the account holds none of it (a link's, or one the last account held before the wallet
  // switched), at its balance of 0, rather than the list showing another asset than the form's
  const chosen = assetOf(sim, assetId);
  const offered = assets.some((b) => b.asset.id === assetId) || !chosen ? assets : [...assets, { asset: chosen, available: 0n }];
  const [amountText, setAmountText] = useState(linkAmount(route.amount));
  const [amountTouched, setAmountTouched] = useState(!!route.amount);
  const [pathChoice, setPathChoice] = useState<Path | null>(nonceOverride !== undefined ? 'C' : route.path === 'B' || route.path === 'C' ? route.path : null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [feeText, setFeeText] = useState('');
  const [policyRejected, setPolicyRejected] = useState(false);
  const [gasText, setGasText] = useState(route.gas && /^\d+$/.test(route.gas) ? route.gas : '50000');
  const [gasTouched, setGasTouched] = useState(false);
  const lastGas = useRef(50_000);
  // The max_gas the page wrote itself, which follows what the transfer takes (a token's, from its trial run) until the user types one of
  // their own; null once they have, or when a link gave it
  const autoGas = useRef<number | null>(route.gas && /^\d+$/.test(route.gas) ? null : 50_000);
  const [rateText, setRateText] = useState('');
  const [manualUtxoText, setManualUtxoText] = useState('');
  const [choice, setChoice] = useState<UtxoChoice | null>(null);
  const [utxoError, setUtxoError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [signing, setSigning] = useState(false);
  // The operation being signed: the review shows it until the signing ends, whatever the form turns into meanwhile (the page following a
  // wallet that switched account, whose balances are then read)
  const [signingOp, setSigningOp] = useState<{ preview: VmOp; draft: OpDraft; minerFee: number } | null>(null);
  // Kept for the history entry: Back from the operation's page shows the result again, not an empty form
  const [sent, setSent] = useEntryState<SentInfo | null>('send', null);
  // A result found on the way back is the page as it was left, not one that turned in place
  const [found, setFound] = useState(sent !== null);
  // The form came back from the sent view ("Send another"), in place
  const [again, setAgain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The wallet switched to another account (wallet/connect.ts followWallet): the coins picked or typed for the last one go, and an
  // open review with them and what it said, unless it is being signed: it stays on the operation being signed until the signing ends,
  // and what that ended in is said then (`submitRpc`). What was typed for the transfer stays
  useEffect(() => {
    setChoice(null);
    setUtxoError(null);
    setManualUtxoText('');
    setPolicyRejected(false);
    if (signing) return;
    setReviewing(false);
    setError(null);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  const asset = chosen as AssetMeta;
  const ksa = sim.assets.get(KSA_ASSET_ID) as AssetMeta;
  // A KS-20 token's balance is the contract's to say, the index's until it has (D-123)
  const token = asset.standard === 'KS-20' ? assetId : null;
  const tokenBalance = useTokenBalance(rpc, me, token);
  const balance = token ? (tokenBalance ?? held.find((b) => b.asset.id === token)?.available ?? 0n) : sim.balance(me, assetId);
  // Until the node has answered for the account nothing is said, recommended or sent on its balances
  const balanceKnown = balancesKnown(sim, me) && (!token || tokenBalance !== undefined || !!rpc?.tokenBook.holdings.has(me));
  const parsed = parseRecipient(toText, me, sim);
  // What is sent to the token's own contract stays there for good, and the token refuses it (`core/docs/STANDARDS.md` §5.1)
  const recipient: Recipient = token && parsed.id === token ? { error: t.asset.send.toToken } : parsed;
  // Recently used recipients (recorded on this device): listed for picking while the recipient field is empty; once it is filled in, show how many times it was sent to
  const recents = useMemo(() => recentRecipients(chainId, me).filter((r) => r.id !== me), [chainId, me, sent]); // eslint-disable-line react-hooks/exhaustive-deps
  const recentHit = recipient.id ? recents.find((r) => r.id === recipient.id) : undefined;
  const remember = (d: OpDraft) => {
    const to = transferOf(sim, d.action)?.to;
    if (to) rememberRecipient(chainId, me, { id: to, address: sim.addressOf(to) });
  };
  // Node data source: ask the node about the recipient account to learn whether it has a record on chain (no conclusion until the lookup returns)
  useEffect(() => {
    if (sim.kind !== 'rpc' || !recipient.id) return;
    sim.request('account', recipient.id);
    // And whether it is a contract, which a plain transfer does not call (`reviewWarnings`)
    sim.tokenBook.wantDeclaration(recipient.id);
  }, [sim, recipient.id]);
  const amount = amountText.trim() ? parseAmount(amountText, asset.decimals) : null;
  const est = sim.estimateFee();
  const action: Action | null =
    recipient.id && amount !== null && amount > 0n ? (token ? tokenTransferAction(token, recipient.id, amount) : { kind: 'AssetTransfer', asset: assetId, to: recipient.id, amount }) : null;
  // A token's transfer takes the same bytes whatever its amount
  const placeholder: Action = (token && tokenTransferAction(token, me, 1n)) || { kind: 'AssetTransfer', asset: assetId, to: me, amount: 0n };
  // A token's transfer is tried first (wallet/tokenSend.ts): a refusal holds the review back, and what it used sets max_gas
  const trial = useTokenTrial(rpc, me, token, recipient.id ?? null, amount);
  const tokenReady = !token || trial.state === 'ok' || trial.state === 'unchecked';
  // Browser wallets sign with BIP322 simple (D-052); the witness is longer than a BIP340 signature
  const scheme = rpc ? 'Bip322Simple' : 'Bip340';
  const bytesFor = (p: Path) => sim.opSize(p, action ?? placeholder, scheme);

  // max_gas: not rewritten while typing, validated on blur (review feedback: clamping on every keystroke turns 100000 into 5,000,000)
  const typedGas = sendMaxGas(gasText);
  const gasValid = typedGas !== undefined;
  if (gasValid) lastGas.current = typedGas;
  const maxGas = typedGas ?? lastGas.current;
  const gasError = !gasValid ? t.send.advanced.gasRange(fmtInt(SEND_GAS_MIN), fmtInt(PARAMS.BLOCK_GAS_LIMIT)) : undefined;
  const gasTarget = !token ? 50_000 : trial.state === 'ok' ? trial.gas : trial.state === 'unchecked' ? TOKEN_GAS_UNCHECKED : undefined;
  useEffect(() => {
    const last = autoGas.current;
    if (gasTarget === undefined || last === null || gasTarget === last) return;
    if (gasText.trim() !== String(last)) {
      autoGas.current = null;
      return;
    }
    autoGas.current = gasTarget;
    setGasText(String(gasTarget));
  }, [gasTarget]); // eslint-disable-line react-hooks/exhaustive-deps
  const gasHint = !token
    ? t.send.advanced.gasHint(fmtInt(PARAMS.ASSET_TRANSFER_GAS))
    : trial.used !== undefined
      ? t.asset.send.gasHint(fmtInt(trial.used))
      : trial.state === 'unchecked'
        ? t.asset.send.unchecked(fmtInt(TOKEN_GAS_UNCHECKED))
        : t.asset.send.gasLater;

  // Path B: defaults to the suggested sponsored fee for this op (D-054; on a node its fee rate applied to this op's cost, D-095); the
  // number can be changed under advanced options; no three-tier choice (UI/UX review §2.3)
  const suggestedFee = est.pathB.forOp(bytesFor('B'), maxGas);
  const feeParsed = feeText.trim() ? parseAmount(feeText, ksa.decimals) : null;
  const feeCustom = feeText.trim() !== '' && feeParsed !== null && feeParsed > 0n;
  const feeValid = feeText.trim() === '' || feeCustom;
  const tokenFee = feeCustom ? (feeParsed as bigint) : suggestedFee;
  // The simulator knows each producer's minimum; warn when below one of them (the node data source does not know them)
  const producerTop = est.pathB.producerMins.reduce((m, x) => (x.min > m ? x.min : m), 0n);
  const feeBelowMin = !rpc && feeCustom && tokenFee < producerTop;

  // Path C: the miner fee follows the BTC fee rate. The node data source defaults to the node's settlement fee rate, at most the
  // page's cap, and the user can enter another one up to the cap (F-15); the simulator uses the market fee rate
  const defaultRate = rpc ? offeredFeeRate(est.feerateSatVb) : Math.max(est.market.feeRate, est.market.minFeeRate);
  const rateNum = Number(amountNotation(rateText).trim());
  const rateTyped = rpc && rateText.trim() !== '';
  const rateValid = !rateTyped || (Number.isFinite(rateNum) && rateNum >= 1 && rateNum <= MAX_FEE_RATE);
  const nativeRate = rateTyped && rateValid ? rateNum : defaultRate;
  const opBytesC = bytesFor('C');
  // Node data source: the UTXOs on the wallet address (Bitcoin RPC → wallet → entered by hand, wallet/native.ts), those it spends
  // apart from those waiting for a confirmation; the miner fee counts each input they take
  const coins = choice ? spendable(choice) : [];
  const waiting = choice ? unconfirmed(choice) : [];
  const availableSat = coins.reduce((s, u) => s + u.valueSat, 0);
  const feeC = (inputs: number) => nativeTxFee(opBytesC, nativeRate, inputs);
  const cover = coverage(coins, feeC);
  // Short only until the coins waiting for a confirmation are confirmed
  const coverLater = !!choice && !cover.enough && waiting.length > 0 && coveredOnceConfirmed(choice, feeC);
  const minerFee = nativeTxFee(opBytesC, nativeRate, rpc && cover.enough ? cover.inputs : 1);
  const needSat = cover.need;
  const cReady = !rpc || (!!choice && cover.enough);
  // Simulator: this account's UTXOs
  const utxos = sim.getUtxos(me).filter((u) => utxoState(u) === 'available');

  // Whether each path is available
  const backlog = sim.backlogStatus();
  const censored = sim.censored.has(me);
  const ksaBal = sim.balance(me, KSA_ASSET_ID);
  const ksaNeedB = tokenFee + (assetId === KSA_ASSET_ID ? (amount ?? 0n) : 0n);
  const tp = t.send.path;
  const nat = t.send.native;
  const fastWarn = backlog.triggered ? tp.backlog : censored ? tp.censored : undefined;
  const lockedToC = nonceOverride !== undefined ? tp.sameNonce : undefined;
  const cWarn = rpc
    ? utxoError
      ? nat.loadFailed(utxoError)
      : choice && choice.source === 'manual' && choice.utxos.length === 0
        ? nat.manualNeeded
        : choice && !cover.enough
          ? coverLater
            ? t.wallet.native.unconfirmed
            : nat.short(fmtInt(needSat))
          : undefined
    : sim.feeSpike
      ? tp.feeSpike
      : undefined;
  // An account's path C operations are forced in the order their BTC transactions confirm, and one out of nonce order fails with its
  // miner fee spent (§7.4): a second one waits until the first is included
  const waitingC = nativeWaiting(sim, me);
  const availability: Record<Path, Avail> = {
    B: lockedToC
      ? { ok: false, reason: lockedToC }
      : balanceKnown && ksaBal < ksaNeedB
        ? { ok: false, reason: tp.ksaShort }
        : { ok: true, ...(fastWarn ? { warn: fastWarn } : {}) },
    C: waitingC
      ? { ok: false, reason: tp.nativeWaiting(String(waitingC.op.nonce)) }
      : maxGas > PARAMS.NATIVE_MAX_GAS
        ? { ok: false, reason: tp.nativeGas(fmtInt(PARAMS.NATIVE_MAX_GAS)) }
        : rpc
          ? !wallet
            ? { ok: false, reason: t.send.error.disconnected }
            : choice && choice.source !== 'manual' && choice.utxos.length === 0
              ? { ok: false, reason: tp.noOutputC }
              : { ok: true, ...(cWarn ? { warn: cWarn } : {}) }
          : utxos.length === 0
            ? { ok: false, reason: tp.noOutputC }
            : { ok: true, ...(cWarn ? { warn: cWarn } : {}) },
  };
  // Path B by default; path C is recommended only under a settlement backlog, when censored, or when KSA is short. Once chosen by hand, it is no longer changed for the user
  const needC = backlog.triggered || censored || (balanceKnown && ksaBal < ksaNeedB);
  const auto: Path = needC && availability.C.ok ? 'C' : availability.B.ok ? 'B' : availability.C.ok ? 'C' : 'B';
  const path = pathChoice ?? auto;
  const recommendC = needC && availability.C.ok;
  useEffect(() => {
    if (path === 'C' || recommendC) setMoreOpen(true);
  }, [path, recommendC]);

  // Node data source: load the UTXOs on the wallet address once the path C card is shown; text entered by hand takes precedence
  const wantUtxos = !!rpc && !!wallet && (moreOpen || path === 'C');
  const btcHeight = rpc?.currentBtcHeight();
  useEffect(() => {
    if (!rpc || !wallet || !wantUtxos) return;
    let cancelled = false;
    setUtxoError(null);
    loadUtxos(rpc, wallet, manualUtxoText).then(
      (c) => {
        if (!cancelled) setChoice(c);
      },
      (e: unknown) => {
        if (!cancelled) setUtxoError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rpc, wallet, wantUtxos, manualUtxoText, btcHeight]);

  // Amount validation. Going over the balance is said while the amount is typed, as typing on only adds to it; "0" or "1." on the
  // way to "0.5" is said once the field is left
  const ta = t.send.amount;
  let amountError: string | undefined;
  let amountErrorNow = false;
  if (amountText.trim()) {
    // A comma that could be either asks which, an amount past its decimals is told so, anything else that is no number how one is written
    const which = commaQuestion(amountText);
    if (amount === null) amountError = asset.decimals === 0 ? ta.integer(asset.symbol) : (which ?? (parseAmount(amountText, 64) !== null ? ta.decimals(asset.symbol, asset.decimals) : ta.notNumber));
    else if (amount <= 0n) amountError = ta.positive;
    else if (balanceKnown && amount > balance) {
      amountError = ta.overBalance(fmtAmount(balance, asset.decimals), asset.symbol);
      amountErrorNow = true;
    } else if (balanceKnown && path === 'B' && assetId === KSA_ASSET_ID && amount + tokenFee > balance) {
      amountError = ta.withFee;
      amountErrorNow = true;
    }
  }
  const shownAmountError = amountTouched || amountErrorNow ? amountError : undefined;

  const draft: OpDraft | null =
    action && balanceKnown && !asset.pending && !amountError && gasValid && feeValid && tokenReady && availability[path].ok && (path !== 'C' || (cReady && rateValid))
      ? {
          account: me,
          path,
          action,
          maxGas,
          ...(path === 'B' ? { tokenFee } : {}),
          ...(path === 'C' ? { nativeFeeRate: nativeRate } : {}),
          ...(nonceOverride !== undefined ? { nonce: nonceOverride } : {}),
        }
      : null;
  const preview: VmOp | null = useMemo(
    () => (draft ? (sim.kind === 'sim' ? sim.buildOp(draft) : previewOp(draft, sim.sdkParams.chain_id, draft.nonce ?? sim.nextNonce(me))) : null),
    [draft ? JSON.stringify(draft, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) : null, sim.version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Node data source: for path B the wallet makes a BIP322 message signature and the op is submitted to the node; for path C coins are selected first, the wallet signs against the first input (D-086), then signs the PSBT and broadcasts
  const submitRpc = async (chain: RpcChain) => {
    if (!draft || !preview) return;
    const w = connectedStore.get();
    if (!w) {
      setError(t.send.error.disconnected);
      return;
    }
    setSigning(true);
    setSigningOp({ preview, draft, minerFee });
    setError(null);
    setPolicyRejected(false);
    const startedAt = Date.now();
    try {
      const sdkAction = sdkActionOf(draft.action);
      const nonce = BigInt(preview.nonce);
      // The node must still be on the page's network before anything is signed (A2-11, D-106)
      await chain.checkChain();
      const base = { version: VMOP_VERSION, chain_id: chain.sdkParams.chain_id, account: fromHex(me, 32), nonce, max_gas: BigInt(draft.maxGas), action: sdkAction };
      if (draft.path === 'C') {
        const picked = choice ?? (await loadUtxos(chain, w, manualUtxoText));
        const res = await submitNative(chain, w, { ...base, fee: { kind: 'BtcNative' } }, { choice: picked, feeRate: draft.nativeFeeRate ?? nativeRate });
        watchOp(res.opId);
        remember(draft);
        setReviewing(false);
        setSent({ id: res.opId, broadcast: res.broadcast });
        // Nothing here could broadcast it: signed only, and the result hands the transaction back
        toast(res.broadcast.via === 'manual' ? { tone: 'warn', title: t.status.step.signedByHand } : { tone: 'neutral', title: t.send.toast.broadcast });
        return;
      }
      await checkWalletAccount(w);
      const signed = await signVmopWithWallet({ ...base, fee: { kind: 'Token', amount: draft.tokenFee ?? 0n } }, w.adapter);
      const opId = toHex((await chain.node.submitOp(signed)).op_id);
      chain.noteSubmitted(signed, opId, startedAt);
      watchOp(opId);
      remember(draft);
      setReviewing(false);
      setSent({ id: opId });
      toast({ tone: 'neutral', title: t.send.toast.submitted });
    } catch (caught) {
      // Said once the page has followed the wallet to the account it is on, where it was on another (wallet/connect.ts afterSigning)
      const e = await afterSigning(caught, w);
      const now = connectedStore.get();
      // The page left the wallet meanwhile: the connect page says why
      if (!now) return;
      // It moved to another account: the review, of the last one's operation, goes, and what the signing ended in is said over the form
      // of the account the page now shows
      if (now.account.account !== draft.account) {
        setReviewing(false);
        toast({ tone: 'warn', title: explainSubmitError(e) });
        return;
      }
      setError(explainSubmitError(e));
      // Rejected by the node's policy (-32011) while the fee is below the suggested value: offer a "retry with the suggested fee" button
      setPolicyRejected(e instanceof RpcError && e.code === RPC_ERROR_CODES.OP_REJECTED && draft.path === 'B' && tokenFee < suggestedFee);
    } finally {
      setSigning(false);
      setSigningOp(null);
    }
  };

  const submit = () => {
    if (!draft) return;
    if (sim.kind === 'rpc') {
      void submitRpc(sim);
      return;
    }
    setSigning(true);
    setError(null);
    // Local key signing: a short but perceptible pause gives the "signing" step some weight
    setTimeout(() => {
      const res = sim.submit(draft);
      setSigning(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      watchOp(res.opId);
      remember(draft);
      setReviewing(false);
      setSent({ id: res.opId });
      toast({ tone: 'neutral', title: path === 'C' ? t.send.toast.broadcast : t.send.toast.submitted });
    }, 650);
  };

  // A result found on the way back whose operation the page no longer knows gives the form rather than an empty page
  if (sent && (!found || sim.getOp(sent.id)))
    return (
      <Sent
        info={sent}
        turned={!found}
        onAgain={() => {
          setSent(null);
          setFound(false);
          setAgain(true);
          setAmountText('');
          setAmountTouched(false);
        }}
      />
    );

  // The data's six confirmations come first, BTC-final after them (D-114, D-116)
  const etaDeep = etaAtConfs(sim, path, PARAMS.BTC_FINALITY_CONFS);
  const etaFinal = etaAtConfs(sim, path, BTC_FINAL_DATA_CONFS);
  const fastSpeed = backlog.triggered ? tp.paused : censored ? tp.mayNotInclude : tp.speedFast(PARAMS.TARGET_BLOCK_TIME);
  const ts = t.send.summary;
  const formHint = !recipient.id
    ? ts.needTo
    : !amount || amountError
      ? (shownAmountError ?? ts.needAmount)
      : !balanceKnown
        ? ts.readingBalance
        : !gasValid
          ? ts.badGas
          : !feeValid
            ? ts.badFee
            : !availability[path].ok
              ? ts.unavailable(path, availability[path].reason ?? '')
              : path === 'C' && !rateValid
                ? ts.badRate
                : path === 'C' && !cReady
                  ? coverLater
                    ? ts.waitUtxo
                    : ts.needUtxo
                  : '';
  // What the token said of the transfer comes after what the form still needs
  const ctaHint = formHint || (trial.state === 'checking' ? t.asset.send.checking : trial.state === 'refused' ? t.asset.send.refused(explainRefusal(trial.reason ?? '')) : '');
  const openReview = () => {
    setAmountTouched(true);
    setToTouched(true);
    setGasTouched(true);
    if (!draft) return;
    // A review opens without what the last one ended in
    setError(null);
    setPolicyRejected(false);
    setReviewing(true);
  };
  const review = signingOp ?? (preview && draft ? { preview, draft, minerFee } : null);
  const recipientLabel = recipient.id ? sim.labels.get(recipient.id) : undefined;
  const feeNode = path === 'B' ? <Amount value={tokenFee} asset={ksa} size="sm" /> : <Sats value={minerFee} size="sm" />;
  // The fee goes by one name in the bar, the summary and the review: the summary's "Fee" beside the bar's "Sponsor fee" read as
  // a second fee, in Chinese most of all, where the two were different words
  const feeName = path === 'B' ? t.send.sponsor.label : t.ui.minerFee;
  const showManual = !!rpc && (!!utxoError || choice?.source === 'manual');
  // A contract's asset or a token with its issuer's short ID: two assets can take one symbol (the review of M33)
  const assetOption = (b: { asset: AssetMeta; available: bigint }) => {
    const name = b.asset.issuer && b.asset.id !== KSA_ASSET_ID ? `${b.asset.symbol} · ${shortHash(b.asset.issuer, 4, 4)}` : b.asset.symbol;
    return (
      <option key={b.asset.id} value={b.asset.id}>
        {balanceKnown ? `${name} · ${t.common.balance} ${fmtAmount(b.asset.id === assetId ? balance : b.available, b.asset.decimals, { maxFrac: 4 })}` : name}
      </option>
    );
  };
  const others = offered.filter((b) => !folding.shows(b.asset.id));

  return (
    <div className="page">
      <PageHead eyebrow={t.send.eyebrow} title={t.send.title} turned={again} />

      {nonceOverride !== undefined && (
        <Banner tone="warn" title={t.send.nonce.title(String(nonceOverride))}>
          {t.send.nonce.race}
        </Banner>
      )}

      <div className="send-grid">
        <div className="stack gap-24">
          <Section title={<StepTitle n={1}>{t.send.to.section}</StepTitle>}>
            <div className="form-grid">
              <div className="field field--wide">
                <label htmlFor="send-to" className="field-label">
                  {t.send.to.label}
                </label>
                <div className={`input-recipient${recipient.id ? ' is-valid' : ''}`}>
                  {recipient.id ? <AccountSeal id={recipient.id} size={22} /> : <span className="input-recipient-blank" />}
                  <input
                    id="send-to"
                    className="input mono"
                    placeholder={t.send.to.placeholder}
                    value={toText}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    onChange={(e) => setToText(e.target.value)}
                    onBlur={() => setToTouched(true)}
                    aria-invalid={toTouched && !!recipient.error}
                    aria-describedby="send-to-msg"
                  />
                </div>
                <div id="send-to-msg" className="field-msg">
                  {toTouched && recipient.error ? (
                    <span className="field-error">{recipient.error}</span>
                  ) : recipient.id ? (
                    <span className="field-hint">
                      {recipientLabel ? <b className="recipient-label">{recipientLabel}</b> : null}{' '}
                      {recipient.typedAddress && recipient.address ? (
                        // An address was typed: check 8 characters at each end (against address poisoning)
                        <>
                          {t.send.to.headTail} <span className="mono">{addrBody(recipient.address).slice(0, 8)}</span>…<span className="mono">{addrBody(recipient.address).slice(-8)}</span>
                        </>
                      ) : recipient.address ? (
                        // Hex was typed: show the same account's address
                        <>
                          {t.send.to.asAddress} <span className="mono break">{recipient.address}</span>
                        </>
                      ) : (
                        <>
                          {t.send.to.headTail} <span className="mono">{recipient.id.slice(0, 8)}</span>…<span className="mono">{recipient.id.slice(-8)}</span>
                        </>
                      )}
                      {recipient.warn ? <span className="field-warn"> · {recipient.warn}</span> : null}
                      {accountHasRecord(sim, recipient.id) === false && <span className="field-warn"> · {t.send.to.noRecord}</span>}
                      {recentHit && <span className="ticking"> · {t.send.recent.sentBefore(recentHit.count, timeAgo(recentHit.lastAt, now))}</span>}
                    </span>
                  ) : (
                    <span className="field-hint">{t.send.to.hint}</span>
                  )}
                </div>
                {!toText.trim() && recents.length > 0 && (
                  <div className="recent-list" aria-label={t.send.recent.title}>
                    <span className="small soft">{t.send.recent.title}</span>
                    {recents.slice(0, 5).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="recent-chip"
                        title={r.address || r.id}
                        onClick={() => {
                          setToText(r.address || r.id);
                          setToTouched(true);
                        }}
                      >
                        <AccountSeal id={r.id} size={16} />
                        <span className="mono">{sim.labels.get(r.id) ?? (r.address ? shortAddr(r.address, 8, 6) : shortHash(r.id, 8, 6))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="field">
                <label htmlFor="send-asset" className="field-label">
                  {t.common.asset}
                </label>
                <select id="send-asset" className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                  {offered.filter((b) => folding.shows(b.asset.id)).map(assetOption)}
                  {/* Sent by others and never used: apart, as the wallet folds them away (`core/docs/STANDARDS.md` §7) */}
                  {others.length > 0 && <optgroup label={t.asset.wallet.others(others.length)}>{others.map(assetOption)}</optgroup>}
                </select>
                {asset.id !== KSA_ASSET_ID && (asset.issuer || asset.lookalike) && (
                  <span className="field-hint stack gap-4">
                    <AssetIssuer asset={asset} />
                    <LookalikeNote asset={asset} />
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor="send-amount" className="field-label">
                  {t.common.amount}
                </label>
                <div className="input-affix">
                  <input
                    id="send-amount"
                    className="input mono"
                    inputMode={asset.decimals === 0 ? 'numeric' : 'decimal'}
                    placeholder="0"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    onBlur={() => {
                      // A decimal comma, or digits typed full width, written as the page writes them, so the field shows how it was read
                      setAmountText((text) => amountNotation(text, asset.decimals > 0));
                      setAmountTouched(true);
                    }}
                    aria-invalid={!!shownAmountError}
                    aria-describedby="send-amount-msg"
                  />
                  <span className="input-end" ref={keepClear}>
                    <button
                      type="button"
                      className="input-max"
                      disabled={!balanceKnown}
                      onClick={() => {
                        const max = path === 'B' && assetId === KSA_ASSET_ID ? balance - tokenFee : balance;
                        setAmountText(fieldAmount(max > 0n ? max : 0n, asset.decimals));
                        setAmountTouched(true);
                      }}
                    >
                      {t.send.amount.max}
                    </button>
                    <span className="input-suffix">{asset.symbol}</span>
                  </span>
                </div>
                <div id="send-amount-msg" className="field-msg">
                  {shownAmountError ? (
                    <span className="field-error">{shownAmountError}</span>
                  ) : (
                    <span className="field-hint">
                      {balanceKnown ? (
                        <>
                          {t.send.amount.available} <Amount value={balance} asset={asset} size="sm" maxFrac={asset.decimals} />
                        </>
                      ) : (
                        ts.readingBalance
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section title={<StepTitle n={2}>{tp.section}</StepTitle>}>
            <div className="stack gap-12" role="radiogroup" aria-label={tp.section}>
              {/* Default path B: the sponsored fee is paid in KSA, the producer advances the BTC */}
              <div className="paths">
                <PathCard
                  path="B"
                  selected={path === 'B'}
                  onSelect={() => setPathChoice('B')}
                  avail={availability.B}
                  badge={tp.tagDefault}
                  fee={<Amount value={tokenFee} asset={ksa} size="lg" />}
                  feeSub={feeCustom ? t.send.sponsor.customTag : t.send.sponsor.suggestedTag}
                  speed={fastSpeed}
                  speedStage={backlog.triggered || censored ? 'pending' : 'fast'}
                />
              </div>
              {/* Path C is folded under "more ways to submit": it unfolds and is recommended automatically under a settlement backlog, when censored, or when KSA is short */}
              <details className="advanced" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
                <summary>{tp.more}</summary>
                <div className="paths">
                  <PathCard
                    path="C"
                    selected={path === 'C'}
                    onSelect={() => setPathChoice('C')}
                    avail={availability.C}
                    badge={recommendC ? tp.tagRecommended : tp.tagCensorship}
                    fee={<Sats value={minerFee} size="lg" />}
                    feeSub={`${t.ui.minerFee} · ${nativeRate}\u00a0sat/vB`}
                    speed={tp.speedNative(nativeConfsOf(sim))}
                    speedStage="on_btc"
                  />
                </div>
                {path === 'C' && availability.C.ok && !rpc && (
                  <div className="path-detail small soft">
                    <p>{t.send.nativeRates(String(est.market.feeRate), String(est.market.minFeeRate))}</p>
                  </div>
                )}
                {path === 'C' && availability.C.ok && rpc && (
                  <div className="path-detail">
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="send-rate" className="field-label">
                          {nat.feeRate}
                        </label>
                        <div className="input-affix">
                          <input
                            id="send-rate"
                            className="input mono"
                            inputMode="decimal"
                            placeholder={String(defaultRate)}
                            value={rateText}
                            onChange={(e) => setRateText(e.target.value)}
                            onBlur={() => setRateText((text) => amountNotation(text))}
                            aria-invalid={!rateValid}
                            aria-describedby="send-rate-msg"
                          />
                          <span className="input-suffix">sat/vB</span>
                        </div>
                        <span id="send-rate-msg" className="field-msg">
                          {!rateValid ? (
                            <span className="field-error">{commaQuestion(rateText) ?? nat.feeRateRange(String(MAX_FEE_RATE))}</span>
                          ) : est.feerateSatVb > MAX_FEE_RATE ? (
                            <span className="field-warn">{t.ui.feeRateCapped(String(est.feerateSatVb), String(MAX_FEE_RATE))}</span>
                          ) : (
                            <span className="field-hint">{nat.feeRateHint(String(est.feerateSatVb))}</span>
                          )}
                        </span>
                      </div>
                      <div className="field">
                        <span className="field-label">{nat.utxos}</span>
                        <span className="small">
                          {utxoError ? (
                            <span className="field-error">{nat.loadFailed(utxoError)}</span>
                          ) : !choice ? (
                            <span className="soft">{nat.loading}</span>
                          ) : choice.utxos.length === 0 ? (
                            <span className="field-warn">{choice.source === 'manual' ? nat.manualNeeded : tp.noOutputC}</span>
                          ) : (
                            <>
                              {nat.available(fmtInt(availableSat), coins.length)} <span className="soft">· {nat.source[choice.source]}</span>
                              {waiting.length > 0 && <span className="soft coins-waiting">{nat.unconfirmed(fmtInt(waiting.reduce((s, u) => s + u.valueSat, 0)), waiting.length)}</span>}
                            </>
                          )}
                        </span>
                        <span className="field-msg">
                          <span className={choice && !cover.enough ? 'field-warn' : 'field-hint'}>{nat.need(fmtInt(needSat))}</span>
                        </span>
                      </div>
                    </div>
                    {showManual && (
                      <div className="field field--wide">
                        <label htmlFor="send-utxos" className="field-label">
                          {nat.manualLabel}
                        </label>
                        <textarea
                          id="send-utxos"
                          className="input mono"
                          rows={3}
                          placeholder={nat.manualPlaceholder}
                          value={manualUtxoText}
                          spellCheck={false}
                          autoCapitalize="off"
                          autoCorrect="off"
                          onChange={(e) => setManualUtxoText(e.target.value)}
                          aria-describedby="send-utxos-msg"
                        />
                        <span id="send-utxos-msg" className="field-msg">
                          <span className="field-hint">{nat.manualHint}</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </details>
            </div>
          </Section>

          <details className="advanced" open={!gasValid || maxGas !== (autoGas.current ?? 50_000) || feeText.trim() !== '' || undefined}>
            <summary>{t.send.advanced.title}</summary>
            <div className="form-grid">
              {path === 'B' && (
                <div className="field">
                  <label htmlFor="send-fee" className="field-label">
                    {t.send.sponsor.custom}
                  </label>
                  <div className="input-affix">
                    <input
                      id="send-fee"
                      className="input mono"
                      inputMode="decimal"
                      placeholder={fieldAmount(suggestedFee, ksa.decimals)}
                      value={feeText}
                      onChange={(e) => setFeeText(e.target.value)}
                      onBlur={() => setFeeText((text) => amountNotation(text))}
                      aria-invalid={!feeValid}
                      aria-describedby="send-fee-msg"
                    />
                    <span className="input-suffix">KSA</span>
                  </div>
                  <span id="send-fee-msg" className="field-msg">
                    {!feeValid ? (
                      <span className="field-error">{commaQuestion(feeText) ?? t.send.sponsor.invalid}</span>
                    ) : feeBelowMin ? (
                      <span className="field-warn">{t.send.sponsor.belowMin}</span>
                    ) : (
                      <span className="field-hint">
                        {(est.pathB.basis === 'rate' ? t.send.sponsor.hintRate : est.pathB.basis === 'minimum' ? t.send.sponsor.hintMin : t.send.sponsor.hint)(fmtAmount(suggestedFee, ksa.decimals))}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="field">
                <label htmlFor="send-gas" className="field-label">
                  max_gas
                </label>
                <input
                  id="send-gas"
                  className="input mono"
                  inputMode="numeric"
                  value={gasText}
                  onChange={(e) => setGasText(e.target.value)}
                  onBlur={() => setGasTouched(true)}
                  aria-invalid={gasTouched && !gasValid}
                  aria-describedby="send-gas-msg"
                />
                <span id="send-gas-msg" className="field-msg">
                  {gasTouched && gasError ? <span className="field-error">{gasError}</span> : <span className="field-hint">{gasHint}</span>}
                </span>
              </div>
            </div>
          </details>

          {/* Phones: until the operation can be reviewed, the bar says what it still needs beside the button it holds back */}
          <div className="send-sticky" ref={clearFootBar}>
            <span className="send-sticky-fee small">
              {!draft && ctaHint ? (
                <span className="muted">{ctaHint}</span>
              ) : (
                // The amount beside the path, the fee below them: on one line they left a phone's button no room
                <>
                  <span className="send-sticky-line">
                    <PathBadge path={path} />
                    {amount !== null && amount > 0n && !amountError && <Amount value={amount} asset={asset} size="sm" maxFrac={asset.decimals} />}
                  </span>
                  <span className="send-sticky-line">
                    <span className="soft send-sticky-label">{feeName}</span>
                    {feeNode}
                  </span>
                </>
              )}
            </span>
            <Button variant="primary" disabled={!draft} onClick={openReview}>
              {t.send.review.title}
            </Button>
          </div>
        </div>

        <aside className="send-summary panel" aria-label={t.send.summary.title}>
          <div className="summary-title">{t.send.summary.title}</div>
          <SpecList
            rows={[
              {
                label: t.send.to.label,
                value: recipient.id ? (
                  <span className="row gap-6 mark-words">
                    <AccountSeal id={recipient.id} />
                    {recipientLabel ?? <span className="mono small">{recipient.address ? shortAddr(recipient.address, 10, 6) : shortHash(recipient.id, 8, 8)}</span>}
                  </span>
                ) : (
                  <span className="muted">—</span>
                ),
              },
              { label: t.common.amount, value: amount && !amountError ? <Amount value={amount} asset={asset} maxFrac={asset.decimals} /> : <span className="muted">—</span> },
              {
                label: t.common.path,
                value: (
                  <span className="row gap-6">
                    <PathBadge path={path} named /> {PATH_LABEL[path]}
                  </span>
                ),
              },
              { label: feeName, value: path === 'B' ? <Amount value={tokenFee} asset={ksa} /> : <Sats value={minerFee} /> },
              {
                label: t.status.stage.fast,
                value: (
                  <span className="row gap-6 mark-words">
                    <StatusMark stage={path !== 'C' && (backlog.triggered || censored) ? 'pending' : 'fast'} />
                    {/* Path C waits for its BTC confirmations first: about 20 minutes on signet, so it is not written in seconds */}
                    {path === 'C' ? fmtEta(nativeConfsOf(sim) * sim.btcIntervalMs + PARAMS.TARGET_BLOCK_TIME * 1000) : backlog.triggered ? tp.paused : censored ? tp.mayNotInclude : t.format.aboutSeconds(PARAMS.TARGET_BLOCK_TIME)}
                  </span>
                ),
              },
              {
                label: t.status.stage.deep,
                value: (
                  <span className="row gap-6 mark-words">
                    <StatusMark stage="deep" />
                    {fmtEta(etaDeep)}
                  </span>
                ),
              },
              {
                label: t.status.stage.final,
                value: (
                  <span className="row gap-6 mark-words">
                    <StatusMark stage="final" />
                    {fmtEta(etaFinal)}
                  </span>
                ),
              },
              nonceOverride !== undefined && { label: 'nonce', value: <span><Figures text={t.send.nonce.fixed(String(nonceOverride))} /></span> },
            ]}
          />
          <Button variant="primary" size="lg" className="summary-cta" disabled={!draft} onClick={openReview}>
            <span className="step-no step-no--inv mono" aria-hidden="true">
              3
            </span>{' '}
            {t.send.review.title}
          </Button>
          {!draft && ctaHint && <p className="summary-hint small muted">{ctaHint}</p>}
        </aside>
      </div>

      {review && (
        <Modal
          open={reviewing}
          onClose={() => !signing && setReviewing(false)}
          title={t.send.review.title}
          wide
          footer={
            <>
              {error && (
                <span className="field-error modal-error">
                  <IconAlert /> {error}
                </span>
              )}
              {error && policyRejected && (
                <Button
                  onClick={() => {
                    setFeeText('');
                    setPolicyRejected(false);
                    setError(null);
                  }}
                  disabled={signing}
                >
                  {t.send.error.retrySuggested}
                </Button>
              )}
              <Button onClick={() => setReviewing(false)} disabled={signing}>
                {t.send.review.edit}
              </Button>
              <Button variant="primary" onClick={submit} disabled={signing} aria-busy={signing}>
                {signing ? (
                  <span className="signing">
                    <EnsoMark size={16} /> {t.send.review.signing}
                  </span>
                ) : (
                  t.send.review.submit
                )}
              </Button>
            </>
          }
        >
          <Review
            op={review.preview}
            draft={review.draft}
            asset={asset}
            minerFee={review.minerFee}
            warnings={reviewWarnings(sim, review.draft, prefs.largeThreshold, availability[review.draft.path].warn, trial.state === 'unchecked')}
            {...(rpc && wallet ? { signer: wallet.name } : {})}
          />
        </Modal>
      )}
    </div>
  );
}

/** About when the data has `confs` Bitcoin confirmations: path C first waits for its own BTC confirmations; the block that includes it then settles like any other */
function etaAtConfs(sim: Chain, path: Path, confs: number): number {
  return sim.btcIntervalMs * (confs + (path === 'C' ? nativeConfsOf(sim) : 0)) + 10_000;
}

/** `unchecked`: a token's transfer the node could not try first */
function reviewWarnings(sim: Chain, draft: OpDraft, largeThreshold: string, pathWarn?: string, unchecked = false): string[] {
  const m = t().send;
  const out: string[] = [];
  const a = transferOf(sim, draft.action);
  if (a) {
    if (a.to === draft.account) out.push(m.to.self);
    // A plain transfer does not call a contract (D-123)
    else if (knownContract(sim, a.to)) out.push(a.token ? t().asset.send.toContractToken : t().asset.send.toContractAsset);
    else if (accountHasRecord(sim, a.to) === false) out.push(m.to.noRecord);
    if (!a.token && a.id === KSA_ASSET_ID && a.amount >= BigInt(largeThreshold)) out.push(m.review.large(fmtAmount(BigInt(largeThreshold), KSA_DECIMALS), fmtEta(etaAtConfs(sim, draft.path, BTC_FINAL_DATA_CONFS))));
    const coin = a.asset?.lookalike;
    if (coin) out.push(t().ui.lookalike(coin));
    if (a.token && unchecked) out.push(t().asset.send.uncheckedWarn);
  }
  if (pathWarn) out.push(pathWarn);
  const waitingC = draft.path === 'B' ? nativeWaiting(sim, draft.account) : undefined;
  if (waitingC) out.push(m.review.afterNative(String(waitingC.op.nonce)));
  if (draft.nonce !== undefined) out.push(m.nonce.race);
  return out;
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  const t = useT();
  return (
    <span className="step-title">
      <span className="step-no mono" aria-label={t.send.step(n, 3)}>
        {n}
      </span>
      {children}
    </span>
  );
}

/** One path card: a single sentence of description (status.pathDesc); the rest is the fee, the timing and the reason it is unavailable */
function PathCard({
  path,
  selected,
  onSelect,
  avail,
  badge,
  fee,
  feeSub,
  speed,
  speedStage,
}: {
  path: Path;
  selected: boolean;
  onSelect: () => void;
  avail: Avail;
  badge?: string;
  fee: React.ReactNode;
  feeSub: string;
  speed: string;
  speedStage: 'fast' | 'pending' | 'on_btc';
}) {
  const t = useT();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={!avail.ok}
      className={`path-card${selected ? ' path-card--on' : ''}${avail.ok ? '' : ' path-card--off'}`}
      onClick={() => avail.ok && onSelect()}
    >
      <span className="path-card-head">
        <PathBadge path={path} named />
        <span className="path-card-name">{PATH_LABEL[path]}</span>
        {badge && avail.ok && <span className="tag">{badge}</span>}
        <span className="path-card-radio" aria-hidden="true">
          {selected && <IconCheck size={12} />}
        </span>
      </span>
      <span className="path-card-title">{t.status.pathDesc[path]}</span>
      <span className="path-card-fee">{fee}</span>
      <span className="path-card-sub">{feeSub}</span>
      <span className={`path-card-speed${speedStage === 'pending' ? ' path-card-speed--warn' : ''}`}>
        <StatusMark stage={speedStage} size={10} />
        {speed}
      </span>
      {!avail.ok && <span className="path-card-reason">{avail.reason}</span>}
      {avail.ok && avail.warn && <span className="path-card-warn">{avail.warn}</span>}
    </button>
  );
}

/**
 * Item-by-item check before signing: first what is done and what is paid, then the risks, and only last the full VmOp (collapsible).
 * The recipient and the account are shown in address form; the raw VmOp still has them in hex.
 */
function Review({
  op,
  draft,
  asset,
  minerFee,
  warnings,
  signer,
}: {
  op: VmOp;
  draft: OpDraft;
  asset: AssetMeta;
  /** Path C: the miner fee as the form gives it, with the inputs the coins take */
  minerFee: number;
  warnings: string[];
  /** Node data source: the signing wallet */
  signer?: string;
}) {
  const sim = useChain();
  const t = useT();
  const a = op.action;
  const moved = transferOf(sim, a);
  const ksa = sim.assets.get(KSA_ASSET_ID) as AssetMeta;
  const tr = t.send.review;
  const myAddr = sim.addressOf(op.account);
  return (
    <div className="review">
      <div className="review-lead">
        <span className="review-verb">{t.status.verb.transfer}</span>
        {moved && (
          <>
            <Amount value={moved.amount} asset={asset} size="lg" maxFrac={asset.decimals} />
            <span className="review-verb">{tr.to}</span>
            <span className="row gap-6 review-to">
              <AccountSeal id={moved.to} size={22} />
              <span className="stack gap-2">
                {sim.labels.get(moved.to) && <b>{sim.labels.get(moved.to)}</b>}
                {/* The last check before signing: the full address, with 8 characters at each end in bold (UI/UX review §2.3) */}
                <GroupedAddress address={sim.addressOf(moved.to) || moved.to} className="review-addr" />
              </span>
            </span>
          </>
        )}
      </div>
      {asset.id !== KSA_ASSET_ID && (
        // Anyone can take any name: the asset is its whole ID (`core/docs/STANDARDS.md` §7)
        <p className="review-asset small soft">
          {t.asset.send.assetId} <FullHash value={asset.id} />
        </p>
      )}
      <div className="review-signer small soft">
        {t.status.pathName(draft.path, PATH_LABEL[draft.path])} · {signer ? tr.signedBy(signer) : tr.signedLocal} ·{' '}
        {/* The account and its address on one line: on a phone the address broke at its ellipsis */}
        <span className="nobr">
          {t.common.account} <span className="mono">{myAddr ? shortAddr(myAddr, 10, 6) : shortHash(op.account, 8, 6)}</span>
        </span>
      </div>

      {draft.path === 'B' && (
        // The sponsored fee is first locked for the producer and unlocks only after the settlement lands on BTC (§8.5)
        <p className="review-money small">
          {t.send.sponsor.label} <Amount value={draft.tokenFee ?? 0n} asset={ksa} size="sm" /> · {tr.lockB}
        </p>
      )}
      {draft.path === 'C' && (
        // The native transaction's OP_RETURN carries KSN1 and this VmOp
        <p className="review-money small">
          {tr.lockC} · {t.ui.minerFee} <Sats value={minerFee} size="sm" /> · {draft.nativeFeeRate}&nbsp;sat/vB
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="warns" aria-label={tr.warnings}>
          {warnings.map((w) => (
            <li key={w}>
              <IconAlert size={14} /> {w}
            </li>
          ))}
        </ul>
      )}

      {/* chain_id is part of the signature: the signature cannot be replayed on another network */}
      <ul className="checks">
        <li>
          <IconCheck size={14} /> {tr.network(networkOfChainId(op.chainId) ?? '—', String(op.chainId))}
        </li>
      </ul>

      <details className="review-raw">
        <summary>{tr.raw}</summary>
        <SpecList
          rows={[
            { label: 'version', value: <span className="num">{op.version}</span> },
            { label: 'chain_id', value: <span className="num">{op.chainId}</span> },
            { label: 'account', value: <span className="mono small">{shortHash(op.account, 12, 8)}</span> },
            { label: 'nonce', value: <span className="num">{op.nonce}</span> },
            {
              label: 'fee',
              value:
                op.fee.kind === 'Token' ? (
                  <span className="row gap-6">
                    <span className="mono small">Token</span>
                    <Amount value={op.fee.amount} asset={ksa} size="sm" />
                  </span>
                ) : (
                  <span className="mono small">BtcNative</span>
                ),
            },
            { label: 'max_gas', value: <span className="num">{fmtInt(op.maxGas)}</span> },
            a.kind === 'AssetTransfer' && {
              label: 'action',
              value: (
                <span className="kv">
                  <span className="mono small kv-k">AssetTransfer</span>
                  <span className="kv-row">
                    <span className="kv-k">asset</span>
                    {asset.symbol} <span className="mono small">{shortHash(asset.id, 8, 4)}</span>
                  </span>
                  <span className="kv-row">
                    <span className="kv-k">to</span>
                    <span className="mono small">{shortHash(a.to, 12, 8)}</span>
                  </span>
                  <span className="kv-row">
                    <span className="kv-k">amount</span>
                    <span className="mono small">{a.amount.toString()}</span>
                    <span className="small soft">{tr.minUnit}</span>
                  </span>
                </span>
              ),
            },
            a.kind === 'Call' &&
              moved && {
                label: 'action',
                value: (
                  <span className="kv">
                    <span className="mono small kv-k">Call</span>
                    <span className="kv-row">
                      <span className="kv-k">contract</span>
                      {asset.symbol} <span className="mono small">{shortHash(a.contract, 8, 4)}</span>
                    </span>
                    <span className="kv-row">
                      <span className="kv-k">method</span>
                      <span className="mono small">{a.method}</span>
                    </span>
                    <span className="kv-row">
                      <span className="kv-k">to</span>
                      <span className="mono small">{shortHash(moved.to, 12, 8)}</span>
                    </span>
                    <span className="kv-row">
                      <span className="kv-k">amount</span>
                      <span className="mono small">{moved.amount.toString()}</span>
                      <span className="small soft">{tr.minUnit}</span>
                    </span>
                  </span>
                ),
              },
            // Tagged hash "Ksana/VmOp/v1": it can never be used as a BTC transaction signature
            { label: tr.sigHash, value: draft.path === 'C' ? <span className="small soft">{tr.sigHashNative}</span> : <Hash value={sim.sigHash(op)} head={14} tail={8} /> },
          ]}
        />
      </details>
    </div>
  );
}

/** After submission: the page turns in place into the live progress of this operation */
function Sent({ info, turned, onAgain }: { info: SentInfo; turned: boolean; onAgain: () => void }) {
  const sim = useChain();
  const now = useNow();
  const t = useT();
  const id = info.id;
  const r = sim.getOp(id);
  if (!r) return null;
  const p = opProgress(sim, r, now);
  const stage = t.status.stage;
  // Handed back to be broadcast by hand, until the page sees the transaction confirmed
  const byHand = info.broadcast?.via === 'manual' && sim.getBtcTx(info.broadcast.txid)?.status !== 'confirmed';
  const title =
    p.status === 'btc_final'
      ? stage.final
      : p.status === 'failed'
        ? t.status.step.includedFailed
        : p.status === 'dropped'
          ? stage.dropped
          : p.status === 'skipped'
            ? stage.skipped
            : p.stage === 'pending'
              ? r.path === 'C'
                ? byHand
                  ? t.status.step.signedByHand
                  : t.send.sent.broadcastNative
                : stage.pending
              : p.stage === 'on_btc' || p.stage === 'deep'
                ? stage[p.stage]
                : stage.fast;
  const warnTitle = p.status === 'dropped' || p.status === 'skipped';
  const mark = p.status === 'btc_final' ? <StatusMark stage="final" size={28} /> : <StatusMark stage={p.status === 'failed' ? 'failed' : p.stage} size={22} />;
  // On failure, spell out the numbers: how much sponsored fee was charged and which amount did not take effect (UI/UX review §2.3, "where did the money go")
  const moved = transferOf(sim, r.op.action);
  const actAsset = moved?.asset;
  const amountText = moved && actAsset ? `${fmtAmount(moved.amount, actAsset.decimals, { maxFrac: actAsset.decimals })}\u00a0${actAsset.symbol}` : undefined;
  const ksa = sim.assets.get(KSA_ASSET_ID);
  const failedFoot = !amountText
    ? t.send.sent.failedFoot
    : r.op.fee.kind === 'Token' && ksa
      ? t.send.sent.failedFootB(`${fmtAmount(r.op.fee.amount, ksa.decimals, { maxFrac: ksa.decimals })}\u00a0${ksa.symbol}`, amountText)
      : t.send.sent.failedFootC(amountText);
  // Only say something when something went wrong: the stages the tracker already draws are not repeated; the reasons for dropping and skipping are in the tracker
  const foot =
    p.status === 'dropped'
      ? t.send.sent.droppedFoot
      : p.status === 'skipped'
        ? p.skipNote
        : p.status === 'failed'
          ? failedFoot
          : undefined;
  // No "send another" before fast-lane confirmation: sending again right after signing easily leads to duplicate sends (UI/UX review §2.3)
  const againLocked = p.status === 'pending';
  return (
    <div className="page">
      <PageHead
        eyebrow={t.send.title}
        title={
          <span className={`sent-title${warnTitle ? ' sent-title--warn' : ''}`}>
            {mark}
            {title}
          </span>
        }
        doc={title}
        turned={turned}
        meta={
          <>
            <Link to={{ name: 'op', id }} className="link">
              {t.common.op} {shortHash(id, 8, 6)}
            </Link>
            {info.broadcast && (
              <span>
                {t.send.sent.tx} <Hash value={info.broadcast.txid} to={txRoute(sim, info.broadcast.txid)} head={8} tail={6} />
              </span>
            )}
            {p.fastLatency !== undefined && <span>{t.send.sent.latency(fmtDuration(p.fastLatency))}</span>}
          </>
        }
      />
      <p className="sr-only" aria-live="polite">
        {title}
      </p>
      {/* No broadcast route (no Bitcoin RPC connected and the wallet cannot broadcast): hand back the raw transaction for the user to broadcast themselves */}
      {byHand && info.broadcast?.via === 'manual' && (
        <Banner tone="warn" title={t.send.sent.manualBroadcast} actions={<CopyButton text={info.broadcast.rawHex} label={t.send.sent.copyRaw} showLabel />}>
          <code className="mono small break">{info.broadcast.rawHex}</code>
        </Banner>
      )}
      <div className="panel panel-pad journey">
        <Tracker progress={p} />
        {foot && <p className="journey-foot small soft">{foot}</p>}
      </div>
      {p.suggestNative && (
        <Banner
          tone="warn"
          title={t.status.step.waited(p.waitedBlocks)}
          actions={
            <ButtonLink to={resendViaNative(r, sim)} size="sm">
              {t.send.sent.resendC}
            </ButtonLink>
          }
        >
          {t.send.sent.waited}
        </Banner>
      )}
      <Section title={t.send.sent.next}>
        <div className="row wrap">
          <ButtonLink to={{ name: 'wallet' }} variant="primary">
            {t.send.sent.backToWallet}
          </ButtonLink>
          <ButtonLink to={{ name: 'op', id }}>{t.common.details}</ButtonLink>
          {/* Bordered as its neighbours: in English and Spanish it takes a line of its own on a phone, where a ghost button reads as plain text */}
          <Button onClick={onAgain} disabled={againLocked} title={againLocked ? t.send.sent.againWait : undefined}>
            {t.send.sent.again}
          </Button>
        </div>
        {againLocked && <p className="small soft">{t.send.sent.againWait}</p>}
      </Section>
    </div>
  );
}
