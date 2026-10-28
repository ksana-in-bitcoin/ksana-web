/** Send page (pages/wallet/Send.tsx): recipient and amount, how to submit, review and sign, progress after submitting */
import { latinGap } from '../spacing';

export default {
  eyebrow: '钱包',
  title: '发送',
  /** Screen-reader label of the step number */
  step: (n: number, total: number) => `第 ${n} 步，共 ${total} 步`,

  /** Step 1: recipient account (a Taproot address, or the same account as 64 hex characters) */
  to: {
    section: '收款与金额',
    label: '收款账户',
    placeholder: 'Taproot 地址，或十六进制账户',
    hint: '粘贴后核对首尾各 8 位与账户印',
    /** Followed by the first and last 8 characters of the address */
    headTail: '首尾',
    /** When hex was entered, shows the matching address */
    asAddress: '对应地址',
    notTaproot: '只能是 Taproot（bc1p / tb1p / bcrt1p）地址',
    /** net is the current Bitcoin network */
    wrongNetwork: (net: string) => `这个地址不属于当前网络（${net}）`,
    badAddress: '地址无效，可能抄错了某一位',
    badChars: '只能包含 0–9 与 a–f',
    badLength: (n: number) => `需要 64 位，现在是 ${n} 位`,
    notOnCurve: '不是有效的账户，可能抄错了某一位',
    self: '收款方是你自己的账户',
    noRecord: '这个账户在链上没有记录，请再核对首尾',
  },

  /** Accounts recently sent to (stored locally only, UI/UX review §2.3) */
  recent: {
    title: '最近发给过',
    sentBefore: (n: number, ago: string) => `最近发给过 ${n} 次，上次 ${ago}`,
  },

  /** Step 1: amount */
  amount: {
    max: '全部',
    available: '可用',
    integer: (symbol: string) => `${symbol} 只能填整数`,
    decimals: (symbol: string, n: number) => `${symbol} 最多 ${n} 位小数`,
    notNumber: '金额需要写成数字，如 12.5',
    positive: '金额需要大于 0',
    /** amount is a formatted amount */
    overBalance: (amount: string, symbol: string) => `超过可用余额 ${amount}\u00a0${symbol}`,
    withFee: '余额不够同时支付金额与代付费',
  },

  /** Step 2: how to submit. Path B by default; path C is tucked under "More ways to submit" (each card's description uses status.pathDesc) */
  path: {
    section: '提交方式',
    more: '更多提交方式',
    tagDefault: '默认',
    tagRecommended: '推荐',
    tagCensorship: '抗审查',
    speedFast: (s: number) => `约 ${s} 秒生效`,
    speedNative: (n: number) => `${n} 个 BTC 确认后强制收录`,
    paused: '暂停中',
    mayNotInclude: '可能不被收录',
    // Why a path is unavailable, and warnings
    backlog: '结算积压中，解除前不会收录',
    censored: '出块者最近没有收录你的操作',
    sameNonce: '同一个 nonce 重发只能走路径 C',
    ksaShort: 'KSA 不够付代付费',
    noOutputC: '没有可用的 BTC 输出付矿工费',
    nativeGas: (max: string) => `路径 C 的 max_gas 不能超过 ${max}`,
    nativeWaiting: (nonce: string) => `你的路径 C 操作（nonce ${nonce}）还在等 BTC 确认；它被收录后才能再走路径 C`,
    feeSpike: 'BTC 费率偏高',
  },

  /** Path B: sponsor fee. Defaults to the node's suggested value (median of the last 20 blocks, D-054), changeable under Advanced; no three-level choice (UI/UX review §2.3) */
  sponsor: {
    label: '代付费',
    /** Subtitle on the path B card */
    suggestedTag: '按建议值，高级选项里可改',
    customTag: '自定数额',
    /** Input under Advanced: same label as above */
    custom: '代付费',
    /** amount is the formatted suggested value */
    hint: (amount: string) => `留空按建议值 ${amount}\u00a0KSA：最近 20 个块路径 B 费用的中位数`,
    hintRate: (amount: string) => `留空按建议值 ${amount}\u00a0KSA：节点从最近 20 个块得出的费率，按这笔转账计算`,
    hintMin: (amount: string) => `留空按建议值 ${amount}\u00a0KSA：节点的最低费用`,
    invalid: '代付费要是大于 0 的 KSA 数额',
    belowMin: '低于某位出块者的最低数额时，只能等别的出块者收录',
  },

  /** Path C (node data source): fee rate and the BTC outputs at the wallet address (wallet/native.ts) */
  native: {
    feeRate: '费率',
    /** rate is the node's settlement fee rate */
    feeRateHint: (rate: string) => `缺省按节点的结算费率 ${rate}\u00a0sat/vB`,
    feeRateRange: (cap: string) => `请填 1\u00a0到\u00a0${cap}\u00a0sat/vB 的费率`,
    utxos: 'BTC 输出',
    loading: '读取钱包地址上的输出…',
    source: { btc_rpc: '来自比特币 RPC', unisat: '来自钱包', manual: '手动填写' },
    /** sats is a formatted sat count */
    available: (sats: string, n: number) => `可用 ${sats}\u00a0聪（${n} 个输出）`,
    /** Outputs the Bitcoin RPC lists that wait for their first confirmation: shown apart, not spent until then */
    unconfirmed: (sats: string, n: number) => `尚未确认：${sats}\u00a0聪（${n} 个输出），进入 BTC 区块后即可使用`,
    need: (sats: string) => `至少需要 ${sats}\u00a0聪`,
    short: (sats: string) => `BTC 输出不够，至少需要 ${sats}\u00a0聪`,
    manualNeeded: '需要手动填写 BTC 输出',
    loadFailed: (detail: string) => `读不到 BTC 输出：${detail}`,
    manualLabel: '手动填写输出',
    manualPlaceholder: 'txid:vout:聪，每行一个',
    manualHint: '没有接比特币 RPC 或钱包的 UTXO 接口时填写',
  },

  /** Path C: BTC market fee rate */
  nativeRates: (rate: string, min: string) => `BTC 费率 ${rate}\u00a0sat/vB · 入块门槛 ${min}\u00a0sat/vB`,

  advanced: {
    title: '高级选项',
    /** n: the gas a transfer uses, formatted */
    gasHint: (n: string) => `超出则执行失败、照扣费；一笔转账用 ${n}`,
    gasRange: (min: string, max: string) => `max_gas 需在 ${min}\u00a0到\u00a0${max} 之间`,
  },

  /** Switching to path C with the same nonce */
  nonce: {
    title: (nonce: string) => `用同一个 nonce（${nonce}）改走路径 C`,
    race: '只有先被收录的一笔生效；原来那笔先被收录时，这笔的矿工费不退',
    fixed: (nonce: string) => `${nonce}（指定）`,
  },

  /** Summary panel on the right and why the button is disabled */
  summary: {
    title: '摘要',
    needTo: '先填写收款账户',
    needAmount: '再填写金额',
    /** Node data source: the node has not answered for the account yet (also under the amount) */
    readingBalance: '正在读取余额…',
    badFee: '代付费无效',
    badGas: 'max_gas 超出范围',
    badRate: '费率超出范围',
    unavailable: (path: string, reason: string) => `路径 ${path} 不可用：${reason}`,
    needUtxo: '先提供够付矿工费的 BTC 输出',
    /** The outputs that would pay wait for their first confirmation */
    waitUtxo: '等 BTC 区块确认你的 BTC 输出',
  },

  /** Review and sign */
  review: {
    title: '检查并签名',
    edit: '返回修改',
    signing: '签名中…',
    submit: '签名并提交',
    /** Transfer <amount> to <recipient> */
    to: '给',
    signedBy: (wallet: string) => `${latinGap(wallet)}签名`.trimStart(),
    signedLocal: '本地开发密钥签名',
    /** Follows the sponsor fee amount */
    lockB: '执行前从你的 KSA 余额扣除',
    /** Followed by the miner fee and fee rate */
    lockC: '将广播一笔 BTC 交易，找零回到你的地址',
    warnings: '请留意',
    /** eta is a formatted estimate (~110 min) */
    large: (threshold: string, eta: string) => `达到大额阈值（${threshold}\u00a0KSA），${eta}后才 BTC 最终`,
    afterNative: (nonce: string) => `用的是你还在等 BTC 确认的路径 C 操作（nonce ${nonce}）之后的 nonce；那一笔收录后紧接着收录这一笔`,
    network: (name: string, id: string) => `网络 ${name}（chain_id ${id}）`,
    raw: '你签名的 VmOp',
    minUnit: '最小单位',
    sigHash: '签名哈希',
    /** Path C: on the review page there is no carrying transaction yet, so the sighash can't be given in advance */
    sigHashNative: '签名时按承载交易的第一个输入计算（D-086），此时还没有',
  },

  /** Submit failures: the result first; the wallet's and node's own messages are appended as usual (not translated) */
  error: {
    transferOnly: '只支持转账',
    disconnected: '钱包已断开，请重新连接',
    walletDeclined: (detail: string) => `钱包没有签名：${detail}`,
    /** By node error code (core/docs/RPC.md) */
    rpc: {
      invalid: '节点拒绝：操作无效',
      policy: '节点拒绝：不符合本节点的策略',
      params: '节点拒绝：格式错误',
      internal: '节点内部错误',
    },
    rpcCode: (code: string) => `节点返回错误 ${code}`,
    /** Button shown when the node rejected by policy and the fee is below the suggested value */
    retrySuggested: '按建议值重试',
    /** Explanation + the node's own message */
    node: (what: string, detail: string) => `${what}（${detail}）`,
  },

  toast: {
    submitted: '已签名并提交',
    broadcast: '已签名并广播到 BTC',
  },

  /** After submitting: titles mostly use status.stage; a line is added only when something went wrong */
  sent: {
    broadcastNative: '已广播到 BTC',
    failedFoot: '手续费照扣，转账没有生效',
    droppedFoot: '没有上链，也没有扣费',
    /** Execution failed: spell out the numbers; fee and amount are formatted and carry units */
    failedFootB: (fee: string, amount: string) => `已扣代付费 ${fee}；转账 ${amount} 没有生效，这笔金额仍在你的余额里`,
    failedFootC: (amount: string) => `矿工费已付给 BTC 矿工，不退；转账 ${amount} 没有生效，这笔金额仍在你的余额里`,
    /** Why "Send another" is disabled before the fast-lane confirmation */
    againWait: '等这笔快轨确认后再发下一笔',
    latency: (d: string) => `快轨确认用时 ${d}`,
    waited: '出块者可以不收录它；改走路径 C 不需要出块者',
    resendC: '用路径 C 重新提交',
    next: '下一步',
    again: '再发一笔',
    backToWallet: '回到钱包',
    tx: 'BTC 交易',
    /** No broadcast route: show the raw transaction for the user to broadcast themselves */
    manualBroadcast: '没有可用的广播途径，请自行广播这笔交易：',
    copyRaw: '复制原始交易',
  },
};
