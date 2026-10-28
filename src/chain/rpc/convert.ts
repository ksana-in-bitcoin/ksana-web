/**
 * Node JSON-RPC results (parsed by `@ksana/sdk`) → the UI data model (chain/types.ts).
 *
 * - BTC transaction IDs and BTC block hashes are always converted to display byte order (the same as bitcoind and block
 *   explorers, D-001); fast-lane block hashes, op_ids, accounts, assets and contracts stay as lower-case hex as-is.
 * - Numbers that the entries and transactions do not carry (the amounts of the funding inputs, the commit transaction's fee) are
 *   left empty; the UI shows "—" and explains why instead of guessing.
 * - A settlement is two transactions, commit / reveal (D-081): the payload is in the KSN1 envelope (leaf script) of the reveal
 *   transaction's witness, read with the SDK's `txPayload` and `parseKsn1Envelope` by the rules of core/crates/ksana-btc/src/data.rs
 *   and envelope.rs.
 */

import {
  type BlockHeader as SdkBlockHeader,
  type BlockInfo,
  type BtcNetwork,
  type Entry as SdkEntry,
  type Ksn1Envelope,
  type Funds as SdkFunds,
  type Params,
  type Payload,
  type Receipt,
  type SettlementTxs,
  type Tx,
  type VmOp as SdkVmOp,
  blockHash as sdkBlockHash,
  blockHeaderEncodedLen,
  encode,
  encodePayload,
  encodeVmOp,
  entryData,
  isP2tr,
  isP2wpkh,
  opId as sdkOpId,
  parseKsn1Envelope,
  parseTx,
  scriptToAddress,
  sha256,
  toHex,
  txid as sdkTxid,
  txidToRpc,
  txPayload,
  txVsize,
  witnessLeaf,
} from '@ksana/sdk';
import { lazy, withText } from '../../i18n';
import type { Action, AssetChange, BlockHeader, BtcTx, Entry, ExecResult, FailReason, FeeMode, Funds, Hex, Path, TxIn, TxOut, VmEvent, VmOp } from '../types';

/** BTC transaction ID / block hash: internal byte order → display byte order (D-001) */
export const btcHex = (bytes: Uint8Array): Hex => txidToRpc(bytes);

export function toHeader(h: SdkBlockHeader): BlockHeader {
  return {
    version: h.version,
    height: Number(h.height),
    parents: h.parents.map(toHex),
    btcAnchor: { height: h.btc_anchor.height, hash: btcHex(h.btc_anchor.hash) },
    entriesRoot: toHex(h.entries_root),
    stateRoot: toHex(h.state_root),
    producer: toHex(h.producer),
    timestamp: Number(h.timestamp),
    bits: h.bits,
    nonce: h.nonce.toString(),
  };
}

function toFee(f: SdkVmOp['fee']): FeeMode {
  return f.kind === 'Token' ? { kind: 'Token', amount: f.amount } : { kind: 'BtcNative' };
}

const toFunds = (funds: SdkFunds[]): Funds[] => funds.map((f) => ({ asset: toHex(f.asset), amount: f.amount }));

/** The ID of the contract a deployment creates: sha256(deployer ‖ nonce (u64 little-endian) ‖ code_hash) (SPEC §9.2, D-015, `contract_id` in core/crates/ksana-execution/src/builtin.rs) */
export function contractIdOf(deployer: Uint8Array, nonce: bigint, codeHash: Uint8Array): Hex {
  const preimage = new Uint8Array(72);
  preimage.set(deployer, 0);
  new DataView(preimage.buffer).setBigUint64(32, nonce, true);
  preimage.set(codeHash, 40);
  return toHex(sha256(preimage));
}

function toAction(op: SdkVmOp): Action {
  const a = op.action;
  switch (a.kind) {
    case 'Deploy': {
      const codeHash = sha256(a.code);
      return {
        kind: 'Deploy',
        codeHash: toHex(codeHash),
        codeSize: a.code.length,
        initArgsSize: a.init_args.length,
        name: '',
        contract: contractIdOf(op.account, op.nonce, codeHash),
        funds: toFunds(a.funds),
      };
    }
    case 'Call':
      // The args are Borsh-encoded bytes that cannot be decoded without knowing the contract's interface: given as hex as-is
      return { kind: 'Call', contract: toHex(a.contract), method: a.method, args: a.args.length > 0 ? { borsh: toHex(a.args) } : {}, funds: toFunds(a.funds) };
    case 'AssetTransfer':
      return { kind: 'AssetTransfer', asset: toHex(a.asset), to: toHex(a.to), amount: a.amount };
  }
}

export function toVmOp(op: SdkVmOp): VmOp {
  return {
    version: op.version,
    chainId: op.chain_id,
    account: toHex(op.account),
    nonce: Number(op.nonce),
    fee: toFee(op.fee),
    maxGas: Number(op.max_gas),
    action: toAction(op),
    sig: { kind: op.sig.kind, sig: toHex(op.sig.bytes) },
  };
}

export function pathOf(op: SdkVmOp): Path {
  return op.fee.kind === 'Token' ? 'B' : 'C';
}

export const opIdOf = (op: SdkVmOp): Hex => toHex(sdkOpId(op));
export const opBytesOf = (op: SdkVmOp): number => encodeVmOp(op).length;

/** The beginnings of the node's texts for a path C op that failed its authentication (`check_native_op`, core/crates/ksana-execution/src/executor.rs) */
const NOT_AUTHENTICATED = ['invalid signature', 'fee mode of a native op', 'chain_id ', 'unsupported vmop version', 'vmop encoding exceeds'];

/**
 * The receipt's failure reason (the node gives text) → the UI's classification, or none: a failure that cannot be classified is
 * shown as failed, with the node's text in message. The texts matched are the node's (core/crates/ksana-execution/src/executor.rs,
 * builtin.rs, core/crates/ksana-vm/src/engine.rs): a skipped op is rendered as `skipped: {reason}` (core/crates/ksana-node/src/rpc.rs), a
 * contract's own failures start `revert: ` or `trap: ` and are told apart before anything they may say, a path C op's nonce
 * failures start with `nonce`, and the rest are the VM's and the built-in modules' fixed texts
 */
export function failReason(message: string): FailReason | undefined {
  if (message.startsWith('skipped')) return 'skipped';
  const m = message.toLowerCase();
  if (m.startsWith('revert')) return 'revert';
  if (m.startsWith('trap')) return 'trap';
  if (m.startsWith('nonce')) return 'nonce_mismatch';
  if (m.includes('out of gas')) return 'out_of_gas';
  if (m.includes('insufficient btc block header depth')) return 'btc_header_too_shallow';
  // Also within `attached funds transfer failed: …` and a contract's own transfer
  if (m.includes('insufficient balance')) return 'insufficient_balance';
  if (m.includes('asset does not exist')) return 'unknown_asset';
  // Also `callee contract does not exist`
  if (m.includes('contract does not exist')) return 'no_contract';
  if (m.startsWith('deployment rejected')) return 'deploy_rejected';
  if (m.includes('native_max_gas')) return 'native_gas';
  if (NOT_AUTHENTICATED.some((p) => m.startsWith(p))) return 'not_authenticated';
  return undefined;
}

/**
 * An event's name, where its data starts with one: the node gives an event as the bytes the contract emitted, and the example
 * contracts emit a Borsh tuple that starts with the name (`sdk::emit(&("swap", trader, …))`: a u32 little-endian length, then the
 * name). Only a length of 1 to 32 followed by an identifier counts; anything else stays unnamed
 */
export function eventName(data: Uint8Array): string | undefined {
  const len = data[0] ?? 0;
  if (len < 1 || len > 32 || data[1] !== 0 || data[2] !== 0 || data[3] !== 0 || data.length < 4 + len) return undefined;
  const name = String.fromCharCode(...data.subarray(4, 4 + len));
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : undefined;
}

type FieldKind = 'u32' | 'u64' | 'u128' | 'key' | 'txid';
type Layout = readonly (readonly [string, FieldKind])[];
const FIELD_BYTES: Record<FieldKind, number> = { u32: 4, u64: 8, u128: 16, key: 32, txid: 32 };

/**
 * The events of the example contracts (core/contracts/examples), each read by its name and exact length: the exchange's (ksa-exchange,
 * whose claim pays a top-up's KSA to the lock's beneficiary under a one-time key's signature, D-085), the payment trigger's claim
 * (btc-payment-trigger), the fixed-supply token's issue (asset-token), the amm's and the token's. A key is an account, a contract
 * or an asset; a txid is in internal byte order, given in display order. Another contract's event of the same name and length
 * reads the same
 */
const EVENT_LAYOUTS: Readonly<Record<string, readonly Layout[]>> = {
  deposit: [[['seller', 'key'], ['amount', 'u128'], ['balance', 'u128']]],
  withdraw: [[['seller', 'key'], ['amount', 'u128'], ['balance', 'u128']]],
  lock: [[['lock', 'u64'], ['seller', 'key'], ['beneficiary', 'key'], ['price', 'u128'], ['ksa', 'u128'], ['expiry', 'u32']]],
  claim: [
    [['lock', 'u64'], ['beneficiary', 'key'], ['txid', 'txid'], ['paid_sats', 'u64'], ['ksa_paid', 'u128'], ['remaining', 'u128']],
    [['txid', 'txid'], ['vout', 'u32'], ['beneficiary', 'key'], ['asset', 'key'], ['amount', 'u128']],
  ],
  release: [[['lock', 'u64'], ['ksa', 'u128']]],
  issue: [[['asset', 'key'], ['owner', 'key'], ['supply', 'u128']]],
  swap: [[['trader', 'key'], ['asset_in', 'key'], ['amount_in', 'u128'], ['amount_out', 'u128']]],
  add_liquidity: [[['provider', 'key'], ['used_a', 'u128'], ['used_b', 'u128'], ['shares', 'u128']]],
  remove_liquidity: [[['provider', 'key'], ['shares', 'u128'], ['out_a', 'u128'], ['out_b', 'u128']]],
  transfer: [[['from', 'key'], ['to', 'key'], ['amount', 'u128']]],
  approve: [[['owner', 'key'], ['spender', 'key'], ['amount', 'u128']]],
};

/** Little-endian unsigned integer of `len` bytes at `at` */
function uintLe(data: Uint8Array, at: number, len: number): bigint {
  let v = 0n;
  for (let i = len - 1; i >= 0; i--) v = (v << 8n) | BigInt(data[at + i] ?? 0);
  return v;
}

/** An example contract's event fields after its name (`EVENT_LAYOUTS`), each as a decimal string or hex; undefined for any other layout */
export function eventFields(name: string, data: Uint8Array): Record<string, string> | undefined {
  const start = 4 + name.length;
  for (const layout of EVENT_LAYOUTS[name] ?? []) {
    if (start + layout.reduce((n, [, kind]) => n + FIELD_BYTES[kind], 0) !== data.length) continue;
    const fields: Record<string, string> = {};
    let at = start;
    for (const [key, kind] of layout) {
      const bytes = data.subarray(at, at + FIELD_BYTES[kind]);
      fields[key] = kind === 'key' ? toHex(bytes) : kind === 'txid' ? btcHex(bytes) : uintLe(data, at, FIELD_BYTES[kind]).toString();
      at += FIELD_BYTES[kind];
    }
    return fields;
  }
  return undefined;
}

function toEvent(e: Receipt['events'][number]): VmEvent {
  const name = eventName(e.data);
  const fields = name ? eventFields(name, e.data) : undefined;
  return { name: name ?? 'Event', fields: { contract: toHex(e.contract), ...(fields ?? { data: toHex(e.data) }) }, raw: toHex(e.data) };
}

/** A receipt's changes to built-in assets (D-122) with their IDs in hex; null when the node did not record them */
export function toChanges(changes: Receipt['asset_changes']): AssetChange[] | null {
  if (changes === null) return null;
  return changes.map((c): AssetChange => {
    const head = { asset: toHex(c.asset), events: c.events };
    switch (c.kind) {
      case 'transfer':
      case 'funds':
      case 'payout':
        return { kind: c.kind, ...head, from: toHex(c.from), to: toHex(c.to), amount: c.amount };
      case 'issue':
        return { kind: c.kind, ...head, to: toHex(c.to), amount: c.amount };
      case 'burn':
        return { kind: c.kind, ...head, from: toHex(c.from), amount: c.amount };
      case 'create':
      case 'renounce':
        return { kind: c.kind, ...head, capabilities: [...c.capabilities] };
      case 'freeze':
        return { kind: c.kind, ...head, account: toHex(c.account), frozen: c.frozen };
      case 'allow':
        return { kind: c.kind, ...head, account: toHex(c.account), allowed: c.allowed };
      case 'pause':
        return { kind: c.kind, ...head, paused: c.paused };
    }
  });
}

/** Receipt → execution result; unaccepted when there is no receipt (a block not yet accepted by the main chain) */
export function toResult(r: Receipt | undefined): ExecResult {
  if (!r) return withText({ ok: false, gasUsed: 0, reason: 'unaccepted' as const, events: [] }, 'message', lazy((m) => m.rpc.unaccepted));
  const changes = toChanges(r.asset_changes);
  if (r.success) return { ok: true, gasUsed: Number(r.gas_used), events: r.events.map(toEvent), changes };
  const message = r.error ?? '';
  const reason = failReason(message);
  return {
    ok: false,
    gasUsed: Number(r.gas_used),
    ...(reason ? { reason } : {}),
    ...(message ? { message } : {}),
    events: r.events.map(toEvent),
    changes,
  };
}

/** Bytes an entry writes into the settlement payload (D-003: Forced writes only btc_txid; counted as Borsh, the compact encoding in the payload (D-080) is slightly smaller) */
export const entryDataBytes = (e: SdkEntry): number => encode('EntryData', entryData(e)).length;

export const headerBytes = (h: SdkBlockHeader): number => blockHeaderEncodedLen(h);

function scriptKind(script: Uint8Array): 'p2tr' | 'p2wpkh' | null {
  return isP2tr(script) ? 'p2tr' : isP2wpkh(script) ? 'p2wpkh' : null;
}

export function addressOfScript(script: Uint8Array, network: BtcNetwork): string | undefined {
  if (scriptKind(script) === null) return undefined;
  try {
    return scriptToAddress(script, network);
  } catch {
    return undefined;
  }
}

/** The UI representation of one entry; the caller registers the op (only the op_id is given here) */
export function toEntry(e: SdkEntry): Entry {
  switch (e.kind) {
    case 'Forced':
      return { kind: 'Forced', btcTxid: btcHex(e.btc_txid), opId: opIdOf(e.op) };
    case 'Sponsored':
      return { kind: 'Sponsored', opId: opIdOf(e.op) };
    case 'Unlock':
      return { kind: 'Unlock', height: Number(e.height), index: e.index };
  }
}

export const entryOp = (e: SdkEntry): SdkVmOp | null => (e.kind === 'Forced' || e.kind === 'Sponsored' ? e.op : null);

// —— KSN1 envelope (D-081, core/crates/ksana-btc/src/envelope.rs) ——

const P2A_SCRIPT = Uint8Array.of(0x51, 0x02, 0x4e, 0x73);

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The payload in a reveal transaction as the node reads it (`txPayload`: exactly one data carrier among the KSN1 outputs and the
 * inputs' envelopes, and the payload one an envelope carries): returned with the index of its input and the envelope
 */
export function revealPayload(tx: Tx, params: Params): { vin: number; envelope: Ksn1Envelope; payload: Payload } | null {
  const found = txPayload(tx, params);
  if (found === null || found.carrier.kind !== 'Input') return null;
  const leaf = witnessLeaf(tx.inputs[found.carrier.index]?.witness ?? []);
  const envelope = leaf === null ? null : parseKsn1Envelope(params.magic, leaf);
  return envelope === null ? null : { vin: found.carrier.index, envelope, payload: found.payload };
}

/** Infer the input type and sighash type from the witness stack: P2TR key-path has one item (a 64- or 65-byte signature), P2WPKH two (DER signature + compressed pubkey), script path three or more */
function inputShape(witness: Uint8Array[]): Pick<TxIn, 'scriptType' | 'sighash'> {
  if (witness.length === 1) {
    const sig = witness[0] as Uint8Array;
    return { scriptType: 'p2tr', sighash: sig.length === 64 ? 'DEFAULT' : 'ALL' };
  }
  if (witness.length === 2) return { scriptType: 'p2wpkh', sighash: 'ALL' };
  const sig = witness[0];
  return { scriptType: 'envelope', sighash: sig && sig.length === 64 ? 'DEFAULT' : 'ALL' };
}

export interface ParsedSettlement {
  /** The reveal transaction (the payload is here; the "settlement transaction" in the UI) */
  reveal: BtcTx;
  /** The commit transaction */
  commit: BtcTx;
  /** The block headers the payload carries (block hashes); the last one is this block */
  headers: Hex[];
  /** The blocks whose bodies the payload carries (D-077): this block and the blocks in bodies */
  bodies: Hex[];
}

/**
 * The block headers and bodies the payload carries (block hashes), and the headers' heights in the same order. The last header of a
 * Settlement payload is this block; its entries are in entries, which also counts as a body
 */
export function payloadBlocks(payload: Payload): { headers: Hex[]; heights: number[]; bodies: Hex[] } {
  if (payload.kind === 'NativeOp') return { headers: [], heights: [], bodies: [] };
  const headers = payload.headers.map((h) => toHex(sdkBlockHash(h)));
  const heights = payload.headers.map((h) => Number(h.height));
  const bodies = payload.bodies.map((b) => headers[b.header]).filter((h): h is Hex => h !== undefined);
  if (payload.kind === 'Settlement') {
    const own = headers[headers.length - 1];
    if (own !== undefined && payload.entries.length > 0) bodies.push(own);
  }
  return { headers, heights, bodies };
}

/**
 * Parse the settlement transactions a block carries (commit / reveal, Bitcoin network serialization, D-081). The commit
 * transaction's inputs are the producer node's funding and its outputs the change and the commitment output; the reveal transaction
 * spends the commitment output (envelope and payload in the witness) and outputs a P2A anchor and an empty OP_RETURN. The
 * transactions themselves do not carry the funding inputs' amounts, so the commit transaction's fee is left empty; the reveal
 * transaction's fee = commitment output amount − anchor amount. Nor do they carry whose the inputs are: the funding key is the
 * node's own, apart from the block's producer account (SPEC §7.7), so only an output paying that account's address names it.
 */
/**
 * The block's producer account, where a settlement output pays its address: a node may fund its settlements with the key of its
 * producer account, as ksana-keytool sets it up, or with a key no account of the block names (SPEC §7.7), and its change may go
 * to its revenue address (D-060)
 */
function producerOwned(script: Uint8Array, producer: Hex): Hex | null {
  return isP2tr(script) && toHex(script.subarray(2)) === producer ? producer : null;
}

export function parseSettlement(
  txs: SettlementTxs,
  block: { hash: Hex; height: number; producer: Hex; time: number },
  params: Params,
  network: BtcNetwork,
): ParsedSettlement | null {
  let commit: Tx;
  let reveal: Tx;
  try {
    commit = parseTx(txs.commit);
    reveal = parseTx(txs.reveal);
  } catch {
    return null;
  }
  const found = revealPayload(reveal, params);
  if (!found) return null;
  const commitTxidBytes = sdkTxid(commit);
  const commitTxid = btcHex(commitTxidBytes);
  const revealTxid = btcHex(sdkTxid(reveal));
  const envelopeIn = reveal.inputs[found.vin];
  const commitmentVout = envelopeIn && equal(envelopeIn.txid, commitTxidBytes) ? envelopeIn.vout : -1;
  const commitmentValue = commitmentVout >= 0 ? Number(commit.outputs[commitmentVout]?.value ?? 0n) : undefined;

  const commitInputs: TxIn[] = commit.inputs.map((i) => ({
    prevout: { txid: btcHex(i.txid), vout: i.vout },
    owner: null,
    role: 'producer',
    ...inputShape(i.witness),
  }));
  const commitOutputs: TxOut[] = commit.outputs.map((o, index) => {
    const valueSat = Number(o.value);
    if (index === commitmentVout) return { valueSat, role: 'commitment', owner: null, scriptType: 'p2tr' };
    if (o.script[0] === 0x6a) return { valueSat, role: 'op_return', owner: null, scriptType: 'op_return' };
    const address = addressOfScript(o.script, network);
    return { valueSat, role: 'change', owner: producerOwned(o.script, block.producer), scriptType: scriptKind(o.script) ?? 'p2tr', ...(address ? { address } : {}) };
  });
  const revealInputs: TxIn[] = reveal.inputs.map((i, vin) => ({
    prevout: { txid: btcHex(i.txid), vout: i.vout },
    owner: null,
    role: vin === found.vin ? 'commit' : 'producer',
    ...inputShape(i.witness),
    ...(vin === found.vin && commitmentValue !== undefined ? { valueSat: commitmentValue } : {}),
  }));
  const revealOutputs: TxOut[] = reveal.outputs.map((o) => {
    const valueSat = Number(o.value);
    if (equal(o.script, P2A_SCRIPT)) return { valueSat, role: 'anchor', owner: null, scriptType: 'p2a' };
    if (o.script[0] === 0x6a) return { valueSat, role: 'op_return', owner: null, scriptType: 'op_return' };
    const address = addressOfScript(o.script, network);
    return { valueSat, role: 'change', owner: producerOwned(o.script, block.producer), scriptType: scriptKind(o.script) ?? 'p2tr', ...(address ? { address } : {}) };
  });
  const { headers, heights, bodies } = payloadBlocks(found.payload);
  const payloadBytes = found.envelope.payload.length;
  const revealVsize = txVsize(reveal);
  const revealOut = reveal.outputs.reduce((s, o) => s + Number(o.value), 0);
  const revealFee = commitmentValue !== undefined && reveal.inputs.length === 1 ? Math.max(0, commitmentValue - revealOut) : undefined;
  const revealTx: BtcTx = {
    txid: revealTxid,
    kind: 'settlement',
    status: 'built',
    forBlock: block.hash,
    forHeight: block.height,
    headers,
    headerHeights: heights,
    bodies,
    entryCount: found.payload.kind === 'Settlement' ? found.payload.entries.length + found.payload.bodies.reduce((n, body) => n + body.entries.length, 0) : 0,
    inputs: revealInputs,
    outputs: revealOutputs,
    vsize: revealVsize,
    payloadBytes,
    chunks: found.envelope.chunks,
    commitTxid,
    createdAt: block.time,
    ...(revealFee !== undefined ? { feeSat: revealFee, feeRate: Math.round((revealFee / revealVsize) * 100) / 100 } : {}),
  };
  const commitTx: BtcTx = {
    txid: commitTxid,
    kind: 'commit',
    status: 'built',
    forBlock: block.hash,
    forHeight: block.height,
    headers: [],
    bodies: [],
    entryCount: 0,
    inputs: commitInputs,
    outputs: commitOutputs,
    vsize: txVsize(commit),
    payloadBytes: 0,
    revealTxid,
    createdAt: block.time,
  };
  return { reveal: revealTx, commit: commitTx, headers, bodies };
}

/**
 * An output of a settlement's commit transaction read on its own, for a later commit transaction that spends it (`RpcChain.readFunding`):
 * its amount, its address, and the key a P2TR output pays, by which the block of the commit that spends it names the owner, as
 * `producerOwned` names a settlement's own
 */
export interface FundingOut {
  valueSat: number;
  address?: string;
  key?: Hex;
}

/** A settlement's commit transaction (network serialization) read on its own: its ID, and its outputs as `FundingOut` */
export function parseFunding(raw: Uint8Array, network: BtcNetwork): { txid: Hex; outputs: FundingOut[] } | null {
  let tx: Tx;
  try {
    tx = parseTx(raw);
  } catch {
    return null;
  }
  const outputs = tx.outputs.map((o): FundingOut => {
    const address = addressOfScript(o.script, network);
    return { valueSat: Number(o.value), ...(address ? { address } : {}), ...(isP2tr(o.script) ? { key: toHex(o.script.subarray(2)) } : {}) };
  });
  return { txid: btcHex(sdkTxid(tx)), outputs };
}

/** Bytes a block writes into the settlement payload (block header + entry data, D-003) */
export function blockDataBytes(info: BlockInfo): number {
  return headerBytes(info.header) + info.entries.reduce((s, e) => s + entryDataBytes(e), 0);
}

/**
 * Parse a path C native transaction (or a top-up transaction) built by this page: the inputs are the wallet's UTXOs (payer),
 * output 0 is the KSN1 data output, outputs paying the wallet's own address are change and the rest are payments (for a
 * top-up, to the lock's payment script). Fee = input amount − output amount (the input amounts come from the caller).
 */
export function parseNativeTx(
  bytes: Uint8Array,
  args: { owner: Hex; ownerScript: Uint8Array; inputValues: readonly number[]; opId: Hex; at: number; params: Params; network: BtcNetwork },
): BtcTx | null {
  let tx: Tx;
  try {
    tx = parseTx(bytes);
  } catch {
    return null;
  }
  const found = txPayload(tx, args.params);
  const payloadBytes = found ? encodePayloadLen(found.payload, args.params) : 0;
  const inputs: TxIn[] = tx.inputs.map((i, index) => ({
    prevout: { txid: btcHex(i.txid), vout: i.vout },
    owner: args.owner,
    role: 'payer',
    ...inputShape(i.witness),
    ...(args.inputValues[index] !== undefined ? { valueSat: args.inputValues[index] as number } : {}),
  }));
  const outputs: TxOut[] = tx.outputs.map((o, index) => {
    const valueSat = Number(o.value);
    if (found?.carrier.kind === 'Output' && found.carrier.index === index) {
      return { valueSat, role: 'op_return', owner: null, scriptType: 'op_return', chunks: Math.ceil(payloadBytes / 520), payloadBytes };
    }
    if (o.script[0] === 0x6a) return { valueSat, role: 'op_return', owner: null, scriptType: 'op_return' };
    const address = addressOfScript(o.script, args.network);
    const mine = equal(o.script, args.ownerScript);
    return { valueSat, role: mine ? 'change' : 'payment', owner: mine ? args.owner : null, scriptType: scriptKind(o.script) ?? 'p2tr', ...(address ? { address } : {}) };
  });
  const inSum = args.inputValues.reduce((s, v) => s + v, 0);
  const outSum = tx.outputs.reduce((s, o) => s + Number(o.value), 0);
  const vsize = txVsize(tx);
  const fee = args.inputValues.length === tx.inputs.length ? Math.max(0, inSum - outSum) : undefined;
  return {
    txid: btcHex(sdkTxid(tx)),
    kind: 'native',
    status: 'broadcast',
    headers: [],
    bodies: [],
    entryCount: 1,
    inputs,
    outputs,
    vsize,
    payloadBytes,
    createdAt: args.at,
    broadcastAt: args.at,
    author: args.owner,
    opId: args.opId,
    ...(fee !== undefined ? { feeSat: fee, feeRate: Math.round((fee / vsize) * 100) / 100 } : {}),
  };
}

function encodePayloadLen(payload: Payload, params: Params): number {
  try {
    return encodePayload(payload, params).length;
  } catch {
    return 0;
  }
}
