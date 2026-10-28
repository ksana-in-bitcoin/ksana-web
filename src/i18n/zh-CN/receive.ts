/** Receive page (pages/wallet/Receive.tsx) */
import { latinGap } from '../spacing';

export default {
  title: '收款',
  /** One line in the header: the account is the Taproot address, and one address receives everything */
  one: '这一个地址同时收 KSA、合约资产与 BTC。',
  card: '收款信息',
  qr: '地址二维码',
  /** net is the Bitcoin network (regtest, signet) */
  address: (net: string) => `地址 · Taproot · ${net}`,
  hex: '账户（十六进制）· 合约参数用',
  checkEdges: '核对首尾各 8 位：',
  copyAddress: '复制地址',
  copyHex: '复制十六进制账户',
  btcUse: '收到的 BTC 也能付路径 C 的矿工费。',

  rules: {
    title: '到账以哪种确认为准',
    /** amount is the formatted threshold */
    below: (amount: string) => `低于 ${amount}\u00a0KSA：快轨确认即可`,
    above: '达到阈值：等到 BTC 最终',
    /** net is devnet (its BTC blocks come faster than mainnet's), eta a formatted estimate (~2 min) */
    aboveEta: (net: string, eta: string) => `${net} ${eta}，主网约 110 分钟`,
    edit: '修改阈值',
  },
  faucet: '从 devnet 水龙头领取',
  /** net is the network of the hosted page (signet) */
  faucetHosted: (net: string) => `从 ${net} 水龙头领取测试 KSA`,
  faucetFailed: '水龙头没有发出 KSA',
  /** Why the hosted faucet sent nothing (core/signet/services/faucet.mjs); wait is a duration ("22 h 35 min") */
  faucetWhy: {
    claimed: (wait: string) => `这个账户已经领过测试 KSA，${wait}后可以再领`,
    tooOften: (wait: string) => `这个网络连接的请求太多，请 ${wait}后再试`,
    busy: (wait: string) => `水龙头正忙，请 ${wait}后再试`,
    today: '这个网络连接今天领取测试 KSA 的次数太多，请稍后再试',
    empty: '水龙头的测试 KSA 已经发完，请稍后再试',
    down: '水龙头暂时不能使用，请稍后再试',
    noAnswer: '水龙头没有回应，请检查网络后再试一次',
  },
  back: '回到钱包',

  recent: {
    title: '最近收到',
    empty: '还没有收到转账',
    // Below an empty list: with a faucet (the simulation's, or a hosted signet's) / without one
    emptyFaucet: '把地址发给对方，或从水龙头领取。',
    emptyShare: '把地址发给对方。',
    from: (who: string) => `来自${latinGap(who, 'before')}`,
    big: '大额 · 等待 BTC 最终',
    final: '可以视为到账',
    belowThreshold: '按你的阈值已可视为到账',
  },
};
