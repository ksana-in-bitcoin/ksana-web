import type { Messages } from '..';

/** BTC transaction detail (pages/TxDetail.tsx): header, banners, structure diagram, payload and fees */
const tx: Messages['tx'] = {
  /** The node data source can't find the transaction */
  notFoundRpc: 'The node can’t look up transactions by txid; open it from its block page or use a Bitcoin explorer.',
  /** Its title: the transaction may well exist */
  notFoundRpcTitle: 'Can’t look up this BTC transaction here',
  /** A link to a public Bitcoin explorer's page for the transaction; site is its name */
  viewOn: (site: string) => `View it on ${site}`,

  eyebrow: (kind: string) => `BTC transaction · ${kind}`,
  /** Header label, followed by a link to the Ksana block */
  forBlock: 'Ksana block',

  /** A settlement is a commit and a reveal transaction: the header names this one and links the other */
  pair: {
    commit: 'Settlement · Commit transaction',
    reveal: 'Settlement · Reveal transaction',
    commitTx: 'Commit transaction',
    revealTx: 'Reveal transaction',
    hint: 'The commit transaction locks a commitment; the reveal transaction carries the payload in its witness.',
  },

  stuck: {
    title: 'Stuck in the BTC mempool',
    bumpAnchor: 'Bump via P2A anchor',
    bumpChange: 'CPFP with change',
    bumpedAnchor: (n: number) => `Attached ${n} CPFP child ${n === 1 ? 'transaction' : 'transactions'}; they’ll confirm together in the next BTC block`,
    bumpedChange: 'Attached a CPFP child spending the change; they’ll confirm together in the next BTC block',
    bumpFailed: 'No spendable output, so CPFP isn’t possible',
  },

  /** The node data source only knows a few facts such as the txid */
  partial: {
    title: 'The node provided only part of this transaction',
    more: 'See a Bitcoin explorer for the full transaction.',
  },

  /** Label, followed by a link to the replacing transaction */
  replacedBy: 'Replaced by',
  invalidRebuilt: 'The settlement was rebuilt; nobody needs to sign again.',
  rescueBanner: {
    rebuilt: 'Settlement rebuilt by the producer',
    rescue: 'Rescue settlement',
  },

  structure: 'Transaction structure',

  payload: {
    title: 'Payload',
    type: 'Payload type',
    headers: 'Headers',
    bodies: 'Bodies',
    dataSize: 'Data size',
    chunks: 'Chunks',
    none: 'No Ksana data',
  },

  details: {
    title: 'Transaction',
    vsize: 'Virtual size',
    broadcastAt: (time: string) => `Broadcast at ${time}`,
    otherVersions: 'Other versions for this block',
    author: {
      rebuilder: 'Rebuilder',
      rescuer: 'Rescuer',
      user: 'User',
      funder: 'Funder',
    },
  },

  /** Structure diagram: inputs and outputs by index */
  diagram: {
    inputs: 'Inputs',
    outputs: 'Outputs',
    inRole: {
      producer: 'Producer funding',
      commit: 'From the commit transaction',
      payer: 'Payment input',
      anchor: 'P2A anchor (parent)',
    },
    outRole: {
      change: 'Change',
      commitment: 'Commitment output',
      anchor: 'P2A anchor',
      payment: 'Payment',
    },
    producerChange: 'Producer change',
    /** A P2A anchor has no owner */
    anyone: 'Anyone can spend',
    /** Commitment output: spent by the reveal transaction */
    commitmentHint: 'Spent by the reveal transaction',
    opReturn: {
      native: 'NativeOp: 1 VmOp',
      headers: (n: number) => `Headers: ${n} block ${n === 1 ? 'header' : 'headers'}`,
      settlement: (headers: number, entries: number) =>
        `${headers} ${headers === 1 ? 'header' : 'headers'} + ${entries} ${entries === 1 ? 'entry' : 'entries'}`,
      empty: 'Empty OP_RETURN',
    },
    chunks: (n: number) => `${n} ${n === 1 ? 'chunk' : 'chunks'}`,
    /** Witness envelope: the payload carried in the reveal transaction's input witness */
    envelope: {
      title: 'Witness envelope',
      headers: (n: number) => `${n} block ${n === 1 ? 'header' : 'headers'}`,
      bodies: (n: number) => `${n} block ${n === 1 ? 'body' : 'bodies'}`,
    },
  },
};

export default tx;
