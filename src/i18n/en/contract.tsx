import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Contract page */
const contract: Messages['contract'] = {
  /** by: deployer account link; at: block link */
  deployed: (by: ReactNode, at: ReactNode) => (
    <>
      Deployed by {by} in {at}
    </>
  ),
  /** Node data source: the deployment is being looked for in the node's listing (D-111), in its place under the title */
  seeking: 'Looking for its deployment…',
  /** Node data source: the node doesn't serve contract metadata */
  rpcNote: 'The node doesn’t serve contract metadata; use ksana-cli or the SDK for read-only calls.',
  /** Node data source on the signet: the contract opened in the contract playground (D-119), in a new tab */
  playground: 'Open in the playground',
  playgroundHint: 'An example’s contract opens on its own page there; any other gets forms from the ABI in its source',
  /** Node data source: the calls and asset transfers to the contract, from the node's listing (D-111) */
  history: 'Calls and transfers in',
  noHistory: 'No calls or transfers in',

  idHint: 'sha256(deployer ‖ nonce ‖ code_hash)',
  code: 'Code',
  /** n is a formatted byte count */
  codeBytes: (n: string) => `${n} ${n === '1' ? 'byte' : 'bytes'}`,
  deployOp: 'Deploy operation',
  methods: 'Methods',
  issued: 'Issued assets',
  supply: 'Supply',
  holdings: 'Held by contract',

  read: {
    title: 'Read-only call',
    eyebrow: 'Off-chain, no fee',
    method: 'Method',
    arg: 'Argument',
    call: 'Call',
    ok: 'Returned',
    error: 'Error',
  },
  /** Argument input placeholders, keyed by method name */
  argHint: {
    balance_of: 'account: address or 64 hex characters',
    claimed: 'account: address or 64 hex characters',
    quote: 'amount_in: KSA amount',
    get_lock: 'lock: lock number',
    lock_of_script: 'script: payment script in hex',
    balance: 'seller: address or 64 hex characters',
    lock_count: 'seller: address or 64 hex characters',
    locks_of: 'seller: address or 64 hex characters',
  },
  /** Read-only call results and errors */
  result: {
    notIssued: 'Asset not issued yet',
    needAccount: 'The account argument needs a Taproot address or 64 hex characters',
    needAmount: (decimals: number) => `The amount_in argument must be a positive KSA amount, with at most ${decimals} decimals`,
    needLock: 'The lock argument needs a lock number, a whole number from 0',
    noLock: 'No lock with this number: the contract fails the call',
    needScript: 'The script argument needs the payment script in hex',
    needSeller: 'The seller argument needs a Taproot address or 64 hex characters',
    /** A read-only method of a demo contract the simulator does not model */
    notSimulated: 'The simulator does not answer this method; on a node, the contract does',
    /** Formatted KSA in and TKN out */
    quote: (ksaIn: string, tknOut: string) => `${ksaIn}\u00a0KSA → ${tknOut}\u00a0TKN (incl. 0.3% fee)`,
  },

  recent: 'Recent calls',
  noCalls: 'No calls found',
};

export default contract;
