import type { Messages } from '..';

/** Operation detail (pages/OpDetail.tsx) */
const op: Messages['op'] = {
  head: {
    mine: 'Your operation',
    toMe: 'To you',
    execFailed: 'Execution failed',
    /** Screen reader: announced when the status changes */
    liveStatus: (status: string) => `Status: ${status}`,
  },

  /** Top banners: only for problems, long waits and risks; one sentence each */
  banner: {
    /** reason is a short failure label (Exceeded max_gas, Contract reverted…) */
    failed: (reason: string) => `Execution failed: ${reason}`,
    failedCharged: 'The fee is still charged and the nonce is used; all other changes were rolled back.',
    failedNative: 'State is unchanged; the fee paid to BTC miners isn’t refunded.',
    failedNativeUsed: 'The nonce is used and the fee paid to BTC miners isn’t refunded; all other changes were rolled back.',
    skipped: 'Skipped: not executed, not charged',
    dropped: 'Dropped from the mempool: won’t be included, no fee charged',
    waitedBody: 'Producers can decline to include it; Path C doesn’t need a producer.',
    resendNative: 'Resubmit via Path C',
    large: 'Large incoming transfer: wait for BTC final',
    largeBody: 'The amount reaches your large-amount threshold.',
  },

  journey: {
    title: 'From confirmed to final',
    /** Followed by the duration (3.2 s) */
    fastLatency: 'Submission to fast confirmation:',
  },

  /** VmOp plate */
  vmop: {
    sigHash: 'Signature hash',
    size: 'Encoded size',
    /** n is a formatted byte count */
    bytes: (n: string) => `${n} ${n === '1' ? 'byte' : 'bytes'}`,
    /** Limit for max_gas and the encoded size */
    cap: (n: string) => `Limit ${n}`,
    /** Before the gas an executed op used, under its max_gas */
    gasUsed: 'Used',
    /** Path C miner fee: formatted sats and fee rate */
    minerFee: (sats: string, rate: string) => `${sats}\u00a0sats (${rate}\u00a0sat/vB)`,
    name: 'Name',
    code: 'Code',
    wasm: (n: string) => `${n} ${n === '1' ? 'byte' : 'bytes'} of WASM`,
  },

  exec: {
    title: 'Execution',
    block: 'Block',
    entry: (index: number) => `Entry #${index}`,
    accepted: 'Accepted at',
    fastDepth: 'Ksana depth',
    confs: (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'confirmation' : 'confirmations'}`,
    events: 'Events',
    nativeTx: 'Native transaction',
    closure: 'Settled closure',
  },

  raw: 'Raw data (JSON)',
};

export default op;
