/**
 * Deterministic pseudo-hash for the simulator: the same input yields the same 32-byte hex.
 * Used only to generate illustrative IDs (op_id, contract_id, etc.); it has no cryptographic properties whatsoever.
 * Once a real node is connected, these IDs are computed by the node per the SPEC and returned.
 */
export function phash(...parts: (string | number | bigint)[]): string {
  const s = parts.map(String).join('\u0001');
  let out = '';
  for (let k = 0; k < 8; k++) {
    let h = (0x811c9dc5 ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}
