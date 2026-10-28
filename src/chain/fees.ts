/**
 * Fee formulas: the fee of a path C native transaction, and size estimates of the settlement transactions (commit / reveal,
 * D-081). Shared by the simulator and the node RPC data source.
 */

/** Virtual bytes of the parts of a transaction */
export const VB = {
  base: 10.5,
  in: { p2tr: 57.5, p2wpkh: 68 },
  out: { p2tr: 43, p2wpkh: 31 },
  p2a: 13,
  /** An empty OP_RETURN output (8-byte value + 1-byte length + OP_RETURN) */
  opReturnEmpty: 10,
};

/** Virtual bytes of a KSN1 data output (OP_RETURN, magic and the payload chunked at 520 bytes) */
export function opReturnVbytes(payload: number): number {
  const chunks = Math.max(1, Math.ceil(payload / 520));
  return 8 + 3 + 5 + payload + chunks * 3;
}

/** Number of data chunks the payload splits into (at most 520 bytes each) */
export function chunkCount(payload: number): number {
  return Math.max(1, Math.ceil(payload / 520));
}

/**
 * Virtual sizes of the settlement's commit / reveal transactions (D-081). Commit transaction: one P2TR funding input, change and
 * the commitment output; reveal transaction: the script-path input spending the commitment output (witness = signature + leaf
 * script + control block, with the payload in the leaf script, weighted at 1/4), the P2A anchor and an empty OP_RETURN.
 */
export function envelopeVbytes(payloadBytes: number): { commit: number; reveal: number } {
  const chunks = chunkCount(payloadBytes);
  // Leaf script: PUSH32 public key (33) + CHECKSIG + FALSE + IF + magic push (5) + data pushes (at most a 3-byte length prefix per chunk) + ENDIF
  const leaf = 33 + 3 + 5 + payloadBytes + chunks * 3 + 1;
  const witness = 1 + (1 + 64) + (3 + leaf) + (1 + 33);
  const reveal = VB.base + 41 + witness / 4 + VB.p2a + VB.opReturnEmpty;
  const commit = VB.base + VB.in.p2tr + VB.out.p2tr * 2;
  return { commit: Math.ceil(commit), reveal: Math.ceil(reveal) };
}

/** Path C: the fee of a native transaction with one P2TR input, change and a KSN1 data output (payload = 1-byte variant tag + encoded op + 4-byte magic) */
export function pathCFee(opBytes: number, rate: number): number {
  return nativeTxFee(opBytes, rate);
}

/**
 * The fee of a native transaction (`pathCFee`) with `inputs` P2TR inputs, and outputs paying others' scripts of the sizes given
 * besides: a top-up's payment to the seller (`buildTopUp`). An output is its 8-byte value, its script's length and the script
 */
export function nativeTxFee(opBytes: number, rate: number, inputs = 1, payments: readonly number[] = []): number {
  const paid = payments.reduce((sum, script) => sum + 9 + script, 0);
  return Math.ceil((VB.base + VB.in.p2tr * inputs + VB.out.p2tr + opReturnVbytes(opBytes + 5) + paid) * rate);
}
