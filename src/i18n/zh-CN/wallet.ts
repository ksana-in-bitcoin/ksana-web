/** Wallet home and connect page (pages/wallet/Wallet.tsx), plus wallet/connect.ts */
import { latinGap } from '../spacing';
import coins from './coins';

export default {
  title: '钱包',
  /** Two spellings of an account: the address is the primary one, hex is for contract arguments */
  address: '地址',
  copyAddress: '复制地址',
  accountHex: '账户（十六进制）',
  copyAccountHex: '复制十六进制账户',

  /** Connect page and wallet/connect.ts */
  connect: {
    title: '连接钱包',
    noCustody: 'Ksana 只请求签名，不托管你的资产。',
    /** The three points at the bottom of the connect page */
    points: {
      key: '账户就是你的 Taproot 地址',
      topup: '没有 KSA 时，可以用 BTC 充值',
      pathC: '出块者都拒绝时，路径 C 仍然有效',
    },
    /** The line under each point; n is the BTC confirmations after which Ksana blocks must include a Path C operation */
    pointNotes: {
      key: '由你现在用的比特币钱包签名，不需要新的私钥或助记词；同一个地址既收 KSA，也收 BTC。',
      topup: '卖方先为你锁定 KSA；付给卖方的那笔比特币交易，同时就领取了这些 KSA。',
      pathC: (n: number) => `路径 C 的操作放在你自己发出的比特币交易里；${n}\u00a0个 BTC 确认后，Ksana 的区块必须收录它。`,
    },
    go: '连接',
    waiting: '等待钱包…',
    demoName: '本地开发密钥',
    demoNote: '创世块预分配的测试账户',
    demoConnected: '已连接演示账户',
    needsNode: '连接节点后可用',
    switchSource: '切换数据源',
    lastUsed: '上次使用',
    localOnly: '仅限本地 regtest',
    /** The tag of a wallet the page did not find: a computer's names the extension, a touch screen's (which has no extensions) does not */
    notDetected: '未检测到扩展',
    notDetectedTouch: '未检测到',
    install: '安装扩展后刷新本页。',
    /** What a touch screen (a phone, a tablet without a trackpad), which has no extensions, is told instead of install */
    openInApp: {
      unisat: '在 Unisat 或 OneKey App 内的浏览器中打开本页。',
      xverse: '在 Xverse App 内的浏览器中打开本页。',
    },
    failed: (name: string) => `没有连上${latinGap(name, 'before')}`,
    /** net is the Bitcoin network (regtest, signet), prefix how an account's Taproot address starts there (bcrt1p, tb1p) */
    network: (net: string, prefix: string) => `钱包要切到 ${net}：地址以 ${prefix} 开头。`,
    mockHint: '本地 regtest 可用测试私钥钱包：',
    mockParam: '?wallet=mock&key=<私钥>',
    /** The character in the test-key wallet icon */
    mockIcon: '测',
    mockName: '测试私钥钱包',
    unisatNote: 'Taproot（P2TR）账户',
    xverseNote: '使用 Ordinals 地址（P2TR）',
    mockNote: '私钥来自地址栏，只留在本页内存中。',
    /** Message shown in the Xverse connect popup */
    xverseMessage: '连接 Ksana 钱包',
    noMockKey: '地址栏里没有测试私钥',
    keyRefusedTitle: '链接里的私钥没有使用',
    keyRefused: '测试私钥钱包仅限本地 regtest。本页已把私钥从地址栏移除，但链接里的私钥也会发到提供本页的服务器：别把它用在任何有资产的账户上。',
    /** addr is the first 8 characters of the wallet address, net the node's Bitcoin network */
    wrongNetwork: (addr: string, net: string) => `钱包地址 ${addr}… 不是 ${net} 地址，请在钱包里切换比特币网络。`,
    /**
     * The wallet says it is set to another BTC network than the page's (A2-11, D-106): wallet is its name (Unisat, Xverse), chain its
     * own name of that network (Bitcoin Testnet4, Testnet4), net the page's Bitcoin network (signet, regtest)
     */
    wrongChain: (wallet: string, chain: string, net: string) =>
      `${latinGap(wallet).trimStart()}现在设在 ${chain} 上，而本页的网络跑在 BTC ${net} 上，请在钱包里把比特币网络切到 ${net}。`,
    /** The wallet is on an account that is not a Taproot address, which an account is (D-092) */
    notTaproot: '钱包当前的账户不是 Taproot 地址，请在钱包里切换到 Taproot 账户。',
    /** The wallet's Taproot address is not the standard one of its key (BIP86, no script tree), which an account is (D-092) */
    notBip86: '钱包的 Taproot 地址不是其密钥的标准地址（BIP86），请在钱包里换一个 Taproot 账户。',
    /** A toast: the wallet switched to another account while the page was open, and the page with it; addr is that account's address, shortened */
    switched: (wallet: string) => `${latinGap(wallet).trimStart()}切换了账户`,
    switchedTo: (addr: string) => `本页现在显示 ${addr}。`,
    /** The page disconnected from a wallet that switched to an account or a network it cannot use; why follows */
    left: (wallet: string) => `已断开${latinGap(wallet, 'before')}`,
    /** A signature asked of a wallet that had switched to another account than the one the page showed */
    signSwitched: (wallet: string) => `没有签名：${latinGap(wallet).trimStart()}现在用的账户不是本页显示的那个。请核对后再签名。`,
    /**
     * The same refused by Xverse, which the page does not follow, as reading its account can open its popup: the page disconnects, and
     * this says why on the connect page
     */
    signSwitchedLeft: (wallet: string) => `没有签名：${latinGap(wallet).trimStart()}现在用的账户不是本页显示的那个。要用那个账户，请重新连接。`,
  },

  home: {
    eyebrowDemo: '钱包 · 演示账户',
    eyebrow: (name: string) => `钱包 · ${name}`,
    title: '我的钱包',
    viewInExplorer: '在区块浏览器中查看',
    send: '发送',
    showBalances: '显示余额',
    hideBalances: '隐藏余额',
  },

  /** Alert banners at the top of the wallet home */
  alert: {
    backlogTitle: '结算积压已达上限，快速路径暂停',
    /** rate is the current BTC fee rate */
    backlog: (rate: string) => `已生效的余额不变；急用可改走路径 C，矿工费按当前 ${rate}\u00a0sat/vB。`,
    censoredTitle: '出块者没有收录你的快速路径操作（演示场景）',
    censored: '出块者可以不收录；改走路径 C 不需要出块者。',
  },

  balances: {
    ksa: '快轨 · KSA',
    btc: (net: string) => `${coins.bitcoin} · ${net}`,
    /** at and final are formatted heights */
    loading: (at: string, final: string) => `正在补取区块（已到 #${at}，最终边界 #${final}）；BTC 最终余额暂不完整。`,
    /** "Final 1,234" in the other-assets rows */
    finalShort: '最终',
    utxoCount: (n: number) => `${n} 个 UTXO`,
    btcInWallet: (name: string) => `在${latinGap(name)}里查看 BTC 余额。`,
    /** Empty wallet (0 KSA and no operations in progress): one sentence plus the top-up entry point */
    empty: '还没有 KSA：用 BTC 充值，或请别人转到你的地址。',
    /** In node mode without an indexer, follows "No indexer" */
    noIndexerNote: '此时「BTC 最终」只是节点的说法',
    /** The other fast-lane assets, below KSA */
    tokens: '代币',
    /** Under the BTC balance: the part not confirmed yet (amount is formatted sats) */
    btcUnconfirmed: (amount: string) => `其中 ${amount}\u00a0聪未确认`,
    btcReading: '正在读取 BTC 余额…',
    /** Node data source: under "…" until the node has answered for the account */
    ksaReading: '正在读取 KSA 余额…',
    /** The BTC balance could not be read (the reason is in the hover text); stale: the numbers shown are from the read before */
    btcFailed: '暂时读不到 BTC 余额',
    btcStale: '暂时读不到最新的 BTC 余额',
    /** The BTC card's refresh button: the page does not poll the balance (wallet/holdings.ts) */
    btcRefresh: '刷新 BTC 余额',
    /** Empty wallet on a network with a faucet (the hosted signet) */
    emptyFaucet: '还没有 KSA：先领一些测试 KSA，或用 BTC 充值。',
  },

  /** Balance under the two confirmations: BTC-final balance ± changes not yet final = current balance */
  split: {
    allFinal: '余额已全部 BTC 最终',
    finalBalance: 'BTC 最终余额',
    inflow: '转入，尚未最终',
    outflow: '转出与费用，尚未最终',
    total: '当前余额（立即可用）',
    /** Instead of allFinal: a contract call not final yet may have paid in an amount the page cannot read (an amm's payout, an unknown contract's) */
    unreadAll: '未必已全部 BTC 最终：一笔尚未最终的合约调用可能也向这里付了款，页面读不出金额。',
    /** Under the equation, whose BTC-final balance then reads ≤ */
    unreadMore: '一笔尚未最终的合约调用可能也向这里付了款，页面读不出金额；那样的话 BTC 最终余额更低。',
  },

  inflight: {
    title: '进行中',
    eyebrow: (n: number) => `尚未 BTC 最终 · ${n}`,
    failed: '执行失败',
    resend: '改走路径 C',
    skipped: '被跳过，等待重新收录',
    stuck: '卡住，见详情',
    /** eta is a formatted estimate (~3 min) */
    eta: (eta: string) => `${eta}后最终`,
    waitInclusion: '等待收录',
    waitSettlement: '等待结算',
  },

  activity: {
    title: '活动',
    filter: '筛选',
    out: '发出',
    in: '收到',
    empty: '没有记录',
  },

  utxos: {
    title: 'BTC 输出',
    output: '输出',
    change: '结算找零',
    showSpent: '显示已花费',
    empty: '没有 BTC 输出',
    /** section is the title of the "Test funds" group in the regtest console */
    emptyHint: (section: string) => `去「${section}」领一些 regtest BTC。`,
    state: {
      available: '可用',
      unconfirmed: '未确认',
      spent: '已花费',
    },
  },

  /** Node data source: the connected browser wallet */
  info: {
    address: '地址',
    signing: '签名方式',
    signingValue: 'BIP322 simple',
    disconnect: '断开钱包',
  },

  settings: {
    title: '到账确认',
    threshold: '大额阈值',
    save: '保存',
    saved: '已保存',
    hint: '低于阈值的到账，快轨确认即可；达到阈值的，提醒你等到 BTC 最终。',
  },

  /** Node data source: the BTC side of path C and top-ups (wallet/native.ts) */
  native: {
    noUtxo: '没有可用的 BTC 输出',
    /** A submission found only outputs that wait for their first confirmation */
    unconfirmed: '你的 BTC 输出尚未确认：请等它们进入 BTC 区块后再试',
    feeRateTooHigh: (rate: string, cap: string) => `费率 ${rate}\u00a0sat/vB 超过本页的上限 ${cap}\u00a0sat/vB，什么都没有签名；请用更低的费率`,
  },

  faucet: {
    title: '测试资产',
    /** s is the fast-lane block interval (seconds) */
    hint: (s: number) => `KSA 约 ${s} 秒到账，BTC 要等下一个 BTC 块。`,
    claim: '领取 5,000\u00a0KSA 与 0.1\u00a0BTC',
    requested: '已向水龙头申请',
    /** The hosted faucet's button in the empty wallet, and its label once the faucet has answered */
    claimHosted: '领取测试 KSA',
    claimed: '已申请，等待到账',
    console: 'regtest 控制台',
  },

  /** The contract playground's card on the wallet home (D-119); it opens in a new tab */
  playground: {
    title: '合约 Playground',
    body: '在浏览器里修改、编译、部署智能合约。代币、NFT、AMM、借贷、多签钱包和锁仓释放，每个示例都有自己的界面，跑在公共 signet 上。',
    open: '打开 Playground',
  },
};
