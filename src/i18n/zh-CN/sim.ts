/** Text produced by the in-browser simulator: receipts, submit errors, event log, settlement transaction notes, and names of built-in accounts and assets */
import { latinGap } from '../spacing';

export default {
  label: {
    faucet: 'devnet 水龙头',
    operator: 'devnet 运营',
    demo: '演示账户',
    share: '区块分享账户',
    seller: 'KSA 卖方',
    contract: (name: string) => `合约 · ${name}`,
    tknContract: 'TKN 代币',
    ammContract: 'AMM',
    triggerContract: 'BTC 付款触发',
    exchangeContract: 'KSA 兑换',
  },
  /** Names of the contracts and assets built into the simulated chain */
  name: {
    tknContract: '示例代币 TKN',
    ammContract: '恒定乘积 AMM（KSA/TKN）',
    triggerContract: 'BTC 付款触发发放',
    exchangeContract: 'KSA 兑换（用 BTC 换 KSA）',
    tknAsset: '示例代币',
    passAsset: 'BTC 付款凭证',
  },

  /** Rejected by this node on submit (shown on the Send page) */
  reject: {
    tooLarge: (size: number) => `操作太大：${size} 字节，上限 64 KiB`,
    nativeGas: (max: string) => `路径 C 的 max_gas 不能超过 ${max}`,
    feeLow: (min: string) => `代付费不能低于 ${min}\u00a0KSA`,
    ksa: 'KSA 余额不够付代付费',
    noUtxo: '没有可用的 BTC UTXO 支付矿工费',
    lockNotOpen: '锁定不处于 Open',
    lockMissing: '找不到这个锁定',
    sats: '付款金额必须大于 0',
    notBeneficiary: '只有锁定的受益账户能充值',
    nonceUsed: (nonce: string) => `nonce ${nonce} 已被使用`,
  },

  /** Failure and skip reasons in receipts */
  exec: {
    skipped: (reason: string) => `跳过：${reason}`,
    unaccepted: '尚未被主链合并',
    thisBlock: '本块',
    duplicate: (where: string) => `重复收录，已在${latinGap(where)}执行`,
    nonceConflict: (cur: string, op: string) => `nonce 冲突：账户当前 ${cur}，操作为 ${op}`,
    ksaShort: 'KSA 余额不够付代付费',
    unknownOp: '未知的操作',
    nonceMismatch: (cur: string, op: string) => `nonce 不匹配：账户当前 ${cur}，操作为 ${op}`,
    outOfGas: (max: string) => `执行超出 max_gas（${max}）`,
    trap: '合约 trap：unreachable',
    noAsset: '资产不存在',
    balanceShort: (symbol: string) => `${symbol} 余额不足`,
    noContract: '合约不存在',
    liquidityShort: '余额不足，无法添加流动性',
    slippage: (out: string, min: string) => `滑点超出：可得 ${out}，低于 min_out ${min}`,
    headerShallow: (min: number, h: string, depth: number) => `btc_header 只能读取深度 ≥ ${min} 的块，BTC #${h} 深度为 ${depth}`,
    lockNotOpen: '锁定不处于 Open',
    alreadyUnlocked: '解锁游标已经越过这个位置',
    unlockNotSettled: '目标块还没有进入已结算闭包',
    mergedUnlock: '平行块的解锁条目不执行，只有主链块自己的解锁条目推进游标',
    fundsShort: (symbol: string) => `附带的 ${symbol} 余额不足`,
    noMethod: (method: string) => `合约没有 ${method} 方法`,
    lockInvalid: '锁定参数无效：数量与价格要大于 0，到期高度要在锚定高度之后',
    scriptUsed: '收款脚本已被另一个锁定使用',
    exchangeShort: '兑换合约里的可用余额不足',
    notNative: '只有路径 C 的操作才能领取',
    noPayment: '交易里没有付给锁定收款地址的输出',
    notSeller: '只有卖方可以释放锁定',
    notExpired: (h: string) => `锁定要到 BTC #${h} 之后才能释放`,
  },

  /** Why an operation was dropped from the mempool */
  dropped: {
    nonceUsed: (nonce: string) => `nonce ${nonce} 已被同一账户的另一笔操作使用`,
  },

  /** Notes on BTC transactions */
  note: {
    commit: '提交交易',
    reveal: '揭示交易',
    carriedBodies: (n: number) => `携带 ${n} 个区块体`,
    rebuiltOffline: '出块者离线，由其他节点重建',
    carriedElsewhere: '载荷里的数据已由别的交易上链，不再广播',
  },

  /** Event log (regtest console and toasts) */
  event: {
    sideBlock: (hash: string, h: string) => `平行块 ${hash}（#${h}）`,
    backlogOn: (block: string, n: number) => `结算积压：${latinGap(block).trimStart()}已等 ${n} 个 BTC 块，快速路径暂停`,
    backlogOff: '结算积压解除，快速路径恢复',
    merged: (h: string, n: number) => `#${h} 合并了 ${n} 个平行块`,
    mergedSkipped: (n: number) => `，跳过 ${n} 个重复或冲突的条目`,
    rescue: (block: string) => `${latinGap(block)}的结算交易失效，已发起救援结算`.trimStart(),
    headers: (n: number) => `补发 ${n} 个区块头`,
    settledTo: (h: string) => `已结算推进到 #${h}`,
    finalTo: (h: string) => `BTC 最终推进到 #${h}`,
    btcBlock: (h: string, n: number) => `BTC #${h} 出块，含 ${n} 笔 Ksana 交易`,
    mined: (n: number) => `regtest：手动挖出 ${n} 个 BTC 块`,
    faucet: '水龙头：发出 5,000\u00a0KSA 与 0.1\u00a0BTC',
    unlock: (h: string, amount: string) => `解锁到 #${h}，共 ${amount}\u00a0KSA`,
    emptyWeight: (w: number) => `空块权重 ×${w}`,
    topUp: (sats: string, ksa: string) => `充值：付 ${sats}\u00a0聪，领取 ${ksa}\u00a0KSA`,
    censorOn: '场景：出块者不再收录这个账户',
    censorOff: '场景：出块者恢复收录这个账户',
    feeSpikeOn: '场景：BTC 费率涨到 40\u00a0sat/vB，结算交易卡住',
    feeSpikeOff: '场景：BTC 费率回落',
    cpfpMany: (n: number) => `用 P2A 锚点为 ${n} 笔卡住的交易做了 CPFP`,
    cpfpOne: '为卡住的交易做了 CPFP',
    offline: (name: string) => `场景：${latinGap(name).trimStart()}下线`,
    online: '场景：出块者恢复在线',
  },
};
