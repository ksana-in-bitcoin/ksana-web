import { latinGap } from '../spacing';

/** Account page */
export default {
  mine: '我的账户',
  /** Producer tag in the simulator: fee is the path B minimum sponsor fee (formatted) */
  producerFee: (fee: string) => `出块者 · 最低代付 ${fee}\u00a0KSA`,
  censored: '出块者不收录其快速路径操作（演示场景）',
  sendTo: '向此账户转账',

  /** Address plate: the address is the account's primary spelling, hex is for contract arguments; contracts only have hex */
  address: '地址',
  copyAddress: '复制地址',
  hex: '账户（十六进制）',
  copyHex: '复制十六进制账户',
  addrNote: '地址与十六进制是同一个账户的两种写法；合约只有十六进制。',

  noAssets: '没有资产',
  balanceCaption: '资产余额',
  available: '可用',
  lockedFees: '待解锁的奖励与手续费',
  lockedFeesHint: '所在块写入比特币后解锁',
  unlockedTotal: '已解锁（累计）',

  /**
   * Below the account's nonce: what it is, not what it counts: a path C operation refused for its nonce or its signature is included
   * as failed without using one
   */
  nonceHint: '下一笔操作要用的 nonce',
  sent: '发出的操作',
  policy: '本地策略',
  /** fee is the path B minimum sponsor fee (formatted) */
  policyValue: (fee: string) => `路径 B 最低代付 ${fee}\u00a0KSA`,

  history: '操作记录',
  direction: '方向',
  out: '发出',
  noRecords: '没有记录',

  /** A producer's block rewards and sponsored fees: locked first, unlocked once their block settles */
  locked: {
    title: '奖励与手续费的锁定与解锁',
    caption: '锁定的出块奖励与手续费',
    fee: '奖励与手续费',
    unlocked: '已解锁',
    settled: '已结算，等待解锁条目',
    waiting: '锁定中：等待写入比特币',
    /** The portion of another producer's block an account takes as its carrier (D-095): producer is that block's producer */
    carriedFor: (producer: string) => `代${latinGap(producer)}携带`,
  },
};
