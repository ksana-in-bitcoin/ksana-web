import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Grouped counts (same as fmtInt in lib/format; digits are written the same in every language) */
const int = (n: number) => n.toLocaleString('en-US');

/** Verify page: indexer checks, the two confirmations (explained only here), protocol parameters, verify it yourself */
const verify: Messages['verify'] = {
  eyebrow: 'No need to trust any node',
  title: 'Verify',
  lead: 'The indexer reads only Bitcoin data and runs every block again, accepting a block only when its state comes out at the state_root in its header; this page checks that it accepted the node’s blocks.',
  bitcoin: 'Bitcoin',

  /** Three-part flow: Ksana node → Bitcoin → independent indexer */
  flow: {
    label: 'Verification flow',
    node: 'Ksana node',
    /** The fast-lane height settled on Bitcoin, as the status strip's "Settled" */
    settled: (height: ReactNode) => <>Ksana settled up to {height}</>,
    readOnly: 'Reads BTC only',
    indexer: 'Independent indexer',
    noIndexer: 'Not connected: add an indexer URL in data source settings',
    halted: (reason: string) => `Indexer halted: ${reason}`,
    ok: 'All match',
    /** Node data source: how many times this page has compared */
    okCompared: (n: number) => (n === 1 ? '1 check on this page, matching' : `${int(n)} checks on this page, all matching`),
    /** No check made yet */
    none: 'No check yet',
    /** The indexer did not answer the last time the page asked */
    unreachable: 'Not answering: no check until it does; the page asks again with each update',
    /** The recent checks match; an older one did not, as the line under it says */
    okRecent: 'The recent checks match',
    /** Checks that did not match, older than the recent ones the page keeps: failed of the n checks this page made, the latest at height */
    earlier: (failed: number, n: number, height: ReactNode) => {
      const of = `${int(failed)} of the ${int(n)} ${n === 1 ? 'check' : 'checks'} on this page`;
      return failed === 1 ? <>Before them, {of} did not match, at {height}</> : <>Before them, {of} did not match, the latest at {height}</>;
    },
    forked: 'Different chains: the indexer accepted another block at this height; the node’s may be invalid, or on a branch not yet settled',
    /** The node's chain block above the indexer's height that it could have run (see stall below) */
    stalled: (height: ReactNode) => <>Hasn’t run {height}, though it could</>,
    mismatch: 'Mismatch found: Ksana may have an invalid block',
  },
  /** n: the blocks the indexer trails the tip by; unwritten: how many of them, the newest, are not yet written to Bitcoin; depth: SETTLEMENT_DEPTH, the blocks after a block that are written too before the indexer runs it */
  lag: (n: number, unwritten: number, depth: number) => {
    const blocks = `${int(n)} ${n === 1 ? 'block' : 'blocks'}`;
    if (unwritten >= n) return `The indexer trails the tip by ${blocks} not yet written to Bitcoin.`;
    const after = depth === 1 ? 'the block after it is' : `the ${int(depth)} after it are`;
    if (unwritten === 0) return `The indexer trails the tip by ${blocks}: it runs a block once ${after} written to Bitcoin too.`;
    const newest = unwritten === 1 ? 'the newest is' : `the newest ${int(unwritten)} are`;
    return `The indexer trails the tip by ${blocks}: ${newest} not yet written to Bitcoin, and it runs a block once ${after} written too.`;
  },
  /** height: the block the indexer could have run; btc: the BTC block its data and the headers after it were all on by; depth: SETTLEMENT_DEPTH */
  stall: (height: ReactNode, btc: ReactNode, depth: number) => (
    <>
      The indexer hasn’t run {height}, though the block’s data and the headers of the {depth === 1 ? 'block' : `${int(depth)} blocks`} after it have been on Bitcoin since {btc}:
      it may be catching up or held back by a fault, or it found the block invalid. Until it runs it, only the node vouches for the blocks from there on.
    </>
  ),

  checks: {
    title: 'Recent checks',
    caption: 'state_root checks',
    noIndexer: 'No indexer connected',
    none: 'No checks yet',
    nodeRoot: 'Node state_root',
    indexerRoot: 'Recomputed by indexer',
    match: 'Match',
    forked: 'Different chain',
    mismatch: 'Mismatch',
    /** Hover text when the chains differ */
    nodeBlock: (hash: string) => `Node’s chain block at this height: ${hash}`,
    at: 'Checked',
  },

  /** The two confirmations: a short phrase each */
  confirm: {
    title: 'Two kinds of confirmation',
    when: 'When',
    time: 'Typical time',
    security: 'Secured by',
    fit: 'Good for',
    fastWhen: 'Included in a Ksana block',
    fastSecurity: 'Ksana’s PoW hashrate',
    fastFit: 'Everyday, smaller amounts',
    finalWhen: (confs: number) => `The data has ${confs} Bitcoin ${confs === 1 ? 'confirmation' : 'confirmations'}, and so does the BTC block that decided it`,
    /**
     * mainnet, now: estimates from fmtEta, which carry their "~"; network: devnet / signet; now is left out when the network has no figure.
     * Each part a phrase, whole on a line where it fits: on a phone the Chinese line split a number from its unit
     */
    finalTime: (mainnet: string, network: string, now?: string) =>
      now === undefined ? (
        `Mainnet ${mainnet}`
      ) : (
        <>
          <span className="phrase">Mainnet {mainnet};</span> <span className="phrase">{network} currently {now}</span>
        </>
      ),
    finalFit: 'Large amounts and anything that needs Bitcoin’s guarantees',
    risk: 'A majority-hashrate attack on Ksana can only roll back blocks that aren’t BTC final yet.',
  },

  params: {
    title: 'Protocol parameters',
    eyebrow: (chain: string) => `${chain} parameters`,
    name: 'Parameter',
    value: 'Value',
    note: 'Description',
    /** The fold that holds the list on a phone */
    count: (n: number) => `${n} parameters`,
  },

  self: {
    title: 'Verify it yourself',
    /** indexer and txindex are ksana-indexer and txindex in code style */
    how: (indexer: ReactNode, txindex: ReactNode) => (
      <>
        Run {indexer} against a bitcoind with {txindex} enabled.
      </>
    ),
    btcTip: 'Chain tip',
    indexerAt: 'Indexer is at',
    console: 'Open the regtest console to simulate failures',
    settings: 'Data source and indexer settings',
  },
};

export default verify;
