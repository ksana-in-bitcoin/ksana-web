/**
 * Top-up page (pages/wallet/TopUp.tsx): buy KSA with BTC by paying the seller's lock on the exchange contract; the same transaction
 * claims the locked KSA
 */
export default {
  title: '充值',
  one: '用 BTC 换 KSA：向卖方锁定的收款地址付款，同一笔交易领取。',
  nav: '充值',

  lock: {
    section: '锁定',
    /** Simulator: list of the locks for this account */
    mine: '给你的锁定',
    none: '还没有给你的锁定。卖方要先在兑换合约上为你的账户锁定 KSA。',
    exchange: '兑换合约',
    exchangePlaceholder: '64 位十六进制合约 ID',
    id: '锁定编号',
    load: '读取',
    loading: '读取中…',
    notFound: '读不到这个锁定：合约 ID 或编号有误，或者合约不是兑换合约',
    /** The node did not answer the read, or answered with an error; `why` is the explained error, which says what to do */
    readFailed: (why: string) => `读取锁定失败。${why}`,
    badExchange: '合约 ID 要是 64 位十六进制',
    badId: '编号要是非负整数',
    seller: '卖方',
    beneficiary: '受益账户',
    notYours: '这个锁定的受益账户不是你：付款会把 KSA 记给别人',
    /** price is the formatted KSA per sat */
    price: '价格',
    perSat: (ksa: string) => `${ksa}\u00a0KSA / 聪`,
    ksa: '锁定的 KSA',
    payTo: '收款地址',
    expiry: '到期',
    /** n is the number of BTC blocks left, h the expiry height */
    blocksLeft: (n: number, h: string) => `还剩 ${n} 个 BTC 块（高度 ${h}）`,
    expired: (h: string) => `已到期（高度 ${h}）`,
    state: { Open: '开放', Claimed: '已领取', Released: '已释放' },
    /** paid is a formatted sat count, ksa a formatted KSA amount */
    claimed: (paid: string, ksa: string) => `买方付了 ${paid}\u00a0聪，领到 ${ksa}\u00a0KSA`,
  },

  pay: {
    section: '付款',
    /** The payment column before a lock is loaded */
    needLock: '先读取一个锁定',
    needLockHint: '卖方在兑换合约上为你锁定 KSA 后，会告诉你合约 ID 和锁定编号。填好、读取之后，就在这里付 BTC。',
    amount: '付款金额',
    all: '全部',
    /** sats is a formatted sat count */
    forAll: (sats: string) => `拿到全部锁定的 KSA 要 ${sats}\u00a0聪`,
    get: '可换到',
    partial: '少付只换到对应的 KSA，其余继续为你锁定，直到付清或到期后卖方释放',
    over: (sats: string) => `多于 ${sats}\u00a0聪的部分换不到更多`,
    positive: '金额需要大于 0',
    tooLate: '离到期不足，付款可能来不及在卖方释放前被收录',
    nearExpiry: (n: number) => `离到期只剩 ${n} 个 BTC 块`,
    minerFee: '矿工费',
    rate: (rate: string) => `${rate}\u00a0sat/vB`,
    utxo: {
      label: 'BTC 输出',
      source: { btc_rpc: '来自比特币 RPC', unisat: '来自钱包', manual: '手动填写' },
      available: (sats: string, n: number) => `可用 ${sats}\u00a0聪（${n} 个输出）`,
      /** As send.native.unconfirmed */
      unconfirmed: (sats: string, n: number) => `尚未确认：${sats}\u00a0聪（${n} 个输出），进入 BTC 区块后即可使用`,
      /** The coins fall short of the payment, its miner fee and the change */
      short: (sats: string) => `BTC 不够：这笔付款连同矿工费至少需要 ${sats}\u00a0聪。请少付一些，或往你的地址里加 BTC`,
      none: '没有可用的输出',
      manualLabel: '手动填写输出',
      manualPlaceholder: 'txid:vout:聪，每行一个',
      manualHint: '没有接比特币 RPC 或钱包的 UTXO 接口时填写',
      loading: '读取输出…',
    },
    submit: '签名并广播',
    submitSim: '付款并领取',
    signing: '签名中…',
    disconnected: '先连接钱包',
    /** Explanation shown before signing */
    how: '钱包只签 BTC 交易的输入；领取操作由一次性密钥签名，绑定这笔交易的第一个输入。',
  },

  sent: {
    title: '已广播付款交易',
    titleSim: '已付款',
    /** n is the number of BTC confirmations */
    then: (n: number) => `${n} 个 BTC 确认后被强制收录，KSA 记入你的账户`,
    tx: 'BTC 交易',
    claim: '领取操作',
    payBy: (h: string) => `最晚应在 BTC 高度 ${h} 前确认`,
    /** No broadcast route: show the raw transaction for the user to broadcast themselves */
    manual: '没有可用的广播途径，请自行广播这笔交易：',
    copyRaw: '复制原始交易',
    ksa: (ksa: string) => `将换到 ${ksa}\u00a0KSA`,
    another: '再充一笔',
    back: '回到钱包',
  },

  error: {
    /** detail: the node's or wallet's own error message */
    failed: (detail: string) => `充值失败：${detail}`,
    rejected: (detail: string) => `钱包拒绝了签名：${detail}`,
  },
};
