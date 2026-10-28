import type { Messages } from '..';

/** Account page */
const account: Messages['account'] = {
  mine: 'My account',
  /** Simulator producer tag: fee is the Path B minimum sponsor fee (formatted) */
  producerFee: (fee: string) => `Producer · min sponsor fee ${fee}\u00a0KSA`,
  censored: 'Producers won’t include its fast-path operations (demo scenario)',
  sendTo: 'Send to this account',

  /** Address plate: the address is the primary form, hex is for contract arguments; contracts only have hex */
  address: 'Address',
  copyAddress: 'Copy address',
  hex: 'Account (hex)',
  copyHex: 'Copy hex account',
  addrNote: 'The address and the hex are two spellings of one account; contracts only have hex.',

  noAssets: 'No assets',
  balanceCaption: 'Asset balances',
  available: 'Available',
  lockedFees: 'Rewards and fees awaiting unlock',
  lockedFeesHint: 'Unlocked once their block is on Bitcoin',
  unlockedTotal: 'Unlocked (total)',

  /**
   * Below the account's nonce: what it is, not what it counts: a path C operation refused for its nonce or its signature is included
   * as failed without using one
   */
  nonceHint: 'The nonce its next operation must use',
  sent: 'Operations sent',
  policy: 'Local policy',
  /** fee is the Path B minimum sponsor fee (formatted) */
  policyValue: (fee: string) => `Path B min sponsor fee ${fee}\u00a0KSA`,

  history: 'Operation history',
  direction: 'Direction',
  out: 'Sent',
  noRecords: 'No records',

  /** A producer's block rewards and sponsored fees: locked first, unlocked after their block settles */
  locked: {
    title: 'Reward and fee locks and unlocks',
    caption: 'Locked block rewards and fees',
    fee: 'Reward and fees',
    unlocked: 'Unlocked',
    settled: 'Settled, awaiting unlock entry',
    waiting: 'Locked until the block is on Bitcoin',
    carriedFor: (producer: string) => `Carried for ${producer}`,
  },
};

export default account;
