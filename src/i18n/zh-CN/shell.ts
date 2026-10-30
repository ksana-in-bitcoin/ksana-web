/** App shell (app/Shell.tsx, app/App.tsx): top bar, navigation, status strip, toasts, console, footer and the "connecting to node" page */
import { latinGap } from '../spacing';

export default {
  skipToMain: '跳到正文',

  /** Navigation in the top bar and the mobile bottom bar */
  mainNav: '主导航',
  nav: {
    overview: '概览',
    blocks: '区块',
    ops: '操作',
    settlements: '结算',
    verify: '验证',
    wallet: '钱包',
    /** Mobile bottom bar in wallet mode: back to the explorer */
    explorer: '浏览器',
    /** The contract playground (core/playground/, D-119): a page of its own, opened in a new tab from the top bar and the footer */
    playground: 'Playground',
  },
  /** Title of the playground's links in the top bar and the footer */
  playground: '合约 Playground：在浏览器里修改、编译、部署合约，在新标签页打开',

  /** Theme: top-bar button and footer */
  theme: '主题',
  themes: { system: '跟随系统', light: '浅色', dark: '深色' },
  themeNow: (current: string) => `主题：${current}`,
  themeSwitch: (current: string, next: string) => `主题：${current}，点击切换为${next}`,

  top: {
    connectWallet: '连接钱包',
    myWallet: '我的钱包',
    walletTitle: (account: string) => `我的钱包 · 账户 ${account}`,
    pending: (n: number) => `${n} 笔操作等待收录`,
    closeSearch: '关闭搜索',
    /** Network chip in the top bar: simulator */
    simTitle: '打开 regtest 控制台与数据源设置',
    simLabel: (chainId: string) => `网络 devnet，chain_id ${chainId}，浏览器内模拟器；打开 regtest 控制台`,
    sim: '模拟器',
    /** Network chip in the top bar: node (state is the connection state) */
    node: '节点',
    nodeTitle: (url: string, state: string) => `节点 ${url}：${state}`,
    nodeLabel: (chain: string, state: string) => `网络 ${chain}，节点数据源，${state}；打开数据源设置`,
  },

  /** Two-lane status strip under the top bar */
  strip: {
    label: '链状态',
    disconnected: '节点连接中断',
    disconnectedSince: (ago: string) => `节点连接中断 · 数据停在 ${ago}`,
    backlogFull: '结算积压已达上限，快速路径暂停',
    fast: '快轨',
    settled: '已结算',
    btcTipHint: '节点不提供 BTC 链顶，按已知数据推算',
    btcTipRead: '每 30 秒从比特币 RPC 读取一次，其间随节点的新区块推进',
    backlog: (waited: number, limit: number) => `结算积压 ${waited}/${limit}`,
    backlogHint: '最早一个块的数据，等待算作上链已经过的 BTC 块数；下一个块的锚定到达数据所在的 BTC 块时，才算上链',
    settleFee: '结算费率',
    settleFeeHint: '节点给结算交易出资的费率，不是 BTC 市场费率',
    fee: '费率',
    feeHint: 'BTC 估计费率',
    minFee: (rate: string) => `入块门槛 ${rate}`,
    noIndexer: '未接索引器',
    indexer: { ok: '索引器一致', mismatch: '索引器不一致', halted: '索引器已停止', none: '索引器尚未核对', unreachable: '索引器连不上', stalled: '索引器卡在' },
    mempool: '条目池',
    pendingHint: '只显示本页提交、尚未收录的操作',
    sourceNode: (host: string) => `数据源：节点 ${host}`,
    sourceSim: '数据源：浏览器内模拟器',
  },

  /** Toasts: stage changes of wallet operations and incoming transfers */
  toast: {
    close: '关闭提示',
    /** One-line description of an operation: Transfer 5 KSA */
    what: (verb: string, amount: string, symbol: string) => `${verb} ${amount}\u00a0${symbol}`,
    failed: '操作执行失败',
    dropped: '操作已被移出条目池',
    skipped: '操作在平行块里被跳过',
    received: (amount: string, symbol: string) => `收到 ${amount}\u00a0${symbol}`,
    large: '达到大额阈值，建议等 BTC 最终再视为到账',
    /** After the data's sixth Bitcoin confirmation (D-116) */
    deepNext: '接下来是 BTC 最终',
    /**
     * The node no longer reports the block BTC-final: after a Bitcoin reorg of BTC_FINALITY_CONFS blocks or more reached the BTC block
     * that decided it (D-114), or while a node that restarted has yet to decide again, which the page cannot tell apart; so the words
     * say what the page saw, not why
     */
    finalTakenBack: 'BTC 最终被收回',
    finalTakenBackBody: '节点不再把它报告为 BTC 最终，要重新等 BTC 最终',
    from: (name: string) => `来自${latinGap(name, 'before')}`,
  },

  /**
   * A newer version of the page (app/update.ts): the notice in a page left open while one was published, which offers the reload, and a
   * language picked in the menu that did not load
   */
  update: {
    title: '页面有新版本',
    body: '刷新页面即可使用',
    /** A language picked in an older page: its pack is the newer version's */
    language: (name: string) => `刷新页面即可使用，并切换到${latinGap(name, 'before')}`,
    reload: '刷新',
    missed: (name: string) => `未能加载${latinGap(name, 'before')}`,
    missedBody: '服务器没有回应，请检查网络后再试一次',
  },

  /** The node's network started over from another genesis block while the page was open (app/store.ts, `readAnew`) */
  startedOver: {
    title: '网络已从新的创世块重新开始',
    body: '页面已重新读取节点的链，之前的区块、操作和余额都不在这条链上',
  },

  /**
   * The line under the status strip, on every network the page shows: each is a test network, which may start over from a new genesis
   * block at any time, the signet without notice as much as a devnet (a risk to what the user holds, so a sentence, §8.1)
   */
  testnet: '测试网络可能随时从新的创世块重新开始，余额和合约都不会保留',

  /** Console drawer */
  console: {
    sim: 'regtest 控制台',
    rpc: '数据源与节点',
    loaded: (n: number) => `已加载最近 ${n} 个主链块，更早的块打开时再查询`,
    disconnect: '断开钱包',
    disconnectDemo: '断开演示钱包',
    events: '最近事件',
    needWallet: '连接钱包后可以使用审查场景',
  },

  /** Simulator regtest scenarios: one line of description each */
  scenario: {
    mine: {
      title: (seconds: number) => `比特币出块 · 平均 ${seconds} 秒一块`,
      hint: '连续挖块可能短暂触发积压上限',
      button: (n: number) => `挖 ${n} 个块`,
    },
    fee: {
      title: 'BTC 费率暴涨',
      hint: '结算交易会卡在 BTC 内存池，积压满后快速路径暂停',
      toggle: '费率暴涨',
      cpfp: '用 P2A 锚点做 CPFP',
      cpfpCount: (n: number) => `用 P2A 锚点做 CPFP（${n}）`,
      cpfpDone: (n: number) => `已加速 ${n} 笔交易，下一个 BTC 块确认`,
      backlog: (waited: number, limit: number) => `积压 ${waited} / ${limit} 个 BTC 块`,
      paused: '快速路径已暂停',
    },
    censor: {
      title: '出块者审查我的账户',
      hint: '出块者不再收录你的快速路径操作',
      toggle: '审查我的账户',
    },
    offline: {
      title: '出块者下线',
      hint: (name: string) => `${name} 停止出块，它的结算由其他节点代为广播`,
      toggle: (name: string) => `${name} 下线`,
    },
  },

  footer: {
    /** Brand tagline: each language renders it freely as one natural sentence; the brand stays "Ksana" in every language */
    tagline: '在 Ksana 上瞬间确认，最终永久写进比特币。',
    fromSim: '数据来自浏览器内模拟器，刷新页面会重新生成链',
    fromNode: (url: string) => `数据来自节点 ${url}`,
    /** Build fingerprint in the footer: the word before the git commit hash at build time (9-character short form, set in the monospace face), the two linking to that commit in the repository */
    build: '构建',
    buildHint: '构建时的 git 提交号；核对方法见 README.md「Verify this page」',
  },

  /** Full page shown until the node data source finishes its first sync (App.tsx) */
  connecting: {
    eyebrow: '连接中',
    title: '正在连接节点…',
    failedEyebrow: '连接失败',
    failedTitle: '连不上节点',
    wrongNetworkTitle: '节点在另一个网络上',
    detail: (message: string) => `错误详情：${message}`,
    retrying: '本页每 2.5 秒重试一次，节点一应答就自动打开。',
    settings: '数据源设置',
    useSim: '改用浏览器内模拟器',
    switchTo: (chain: string) => `切换到 ${chain}`,
  },
  /** A link naming another node than the one this copy of the page reads from (app/store.ts, `startingSource`): asked before anything is read from it */
  linkSource: {
    eyebrow: '数据源',
    title: '改从这个链接指定的节点读取？',
    body: '这个链接要求本页改从下面这些地址读取数据，而不是平常读取的节点。之后本页显示的一切（余额、操作、确认进度）都将来自它们，钱包签名的内容也会发给它们。只有在你自己运行它们、或信任运行者时才这样做。',
    node: '节点',
    indexer: '索引器',
    btc: '比特币 RPC',
    network: '网络',
    note: '两种选择都不会保存，只在当前标签页有效。',
    keep: '继续用平常的节点',
    follow: '改从这个节点读取',
  },
  /** A node an earlier version of the page saved, perhaps from a link (store.ts, `savedSource`): asked about once */
  savedSource: {
    eyebrow: '数据源',
    title: '继续从以前保存的节点读取？',
    body: '本页的旧版本把下面这些地址保存成了数据源。旧版本会像保存在数据源面板里的选择一样，保存链接指定的节点，所以它们可能来自你打开过的某个链接。本页显示的一切（余额、操作、确认进度）都将来自它们，钱包签名的内容也会发给它们。只有它们是你自己选的才继续使用。',
    node: '节点',
    indexer: '索引器',
    btc: '比特币 RPC',
    network: '网络',
    note: '只问这一次；以后随时可以在数据源面板里更改。',
    keep: '改用本页的节点',
    follow: '继续从它读取',
  },
};
