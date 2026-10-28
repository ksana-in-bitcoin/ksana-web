/** Assets as the wallet and the explorer list them: built-in assets, KS-20 tokens and KS-721 collections (D-123) */
export default {
  /** A token or a collection that named itself nothing, or a name that reads as KSA's or bitcoin's: by its ID */
  tokenSymbol: (id: string) => `代币 ${id}`,
  tokenName: (head: string, tail: string) => `代币 ${head}…${tail}`,
  collectionSymbol: (id: string) => `合集 ${id}`,
  collectionName: (head: string, tail: string) => `合集 ${head}…${tail}`,

  /** An asset's page, `#/asset/<id>` */
  page: {
    /** Eyebrows: KSA, another built-in asset, a token, a collection */
    native: '原生资产',
    builtIn: '内置资产',
    ks20: 'KS-20 代币',
    ks721: 'KS-721 合集',
    pausedTitle: '已暂停',
    paused: '发行合约暂停了这个资产：恢复之前，除了发行合约谁都不能转出或销毁它；从发行合约收款照常。',
    details: '详情',
    /** Hints beside the asset's ID */
    ksaId: 'KSA 的 ID 是 32 个零字节',
    assetIdHint: 'sha256(发行合约 ‖ sub_id)',
    name: '名称',
    symbol: '符号',
    decimals: '小数位数',
    supply: '总量',
    ksaSupply: '创世分配与已发放的区块奖励，减去已销毁的',
    issuer: '发行合约',
    capabilities: '发行方权限',
    capabilitiesHint: '发行合约还保留的权限，只能放弃，不能再取得',
    /** The connected account's standing for an asset its issuer can stop (`ksana_getAssetStatus`) */
    yours: '你的账户',
    ksa: 'KSA 是 Ksana 的原生资产：手续费用它支付，区块奖励也发放它。它没有发行合约：只有区块奖励会增加它的总量，谁也不能冻结或暂停它。',
    /** The issuer capabilities, by the node's names */
    caps: {
      none: '无：总量固定，谁也不能冻结或暂停',
      mint: '增发',
      freeze: '冻结账户',
      allowlist: '白名单',
      pause: '暂停',
    },
    standing: {
      frozen: '已冻结',
      allowed: '在白名单上',
      canSend: '可以转出',
      cannotSend: '不能转出',
      canReceive: '可以收款',
      cannotReceive: '不能收款',
    },
    /** A token's or a collection's page: anyone can give a token any name (core/docs/STANDARDS.md §7) */
    anyNameTitle: '名称谁都能用',
    anyName: '代币的名称和符号由它的合约自己声明，任何人都能取任何名字，也能和别的代币同名。请认准完整的合约 ID。',
    irregularTitle: '索引跳过了它的部分事件',
    irregular: '这个合约发出过索引无法应用的标准事件，索引统计的总量和余额可能与合约自己的回答不同，以合约的回答为准。',
    standard: '标准',
    /** A name, a symbol or decimals the contract did not declare */
    unnamed: '未声明',
    nfts: 'NFT 数量',
    holders: '持有账户',
    declared: '声明于',
    declaredHint: '合约声明标准的区块',
    deployer: '部署者',
    topHolders: '最大的持有者',
    noHolders: '还没有账户持有',
    /** total: a formatted count of the holders; shown: how many are listed */
    moreHolders: (total: string, shown: number) => `共 ${total} 个账户持有，这里列出最大的 ${shown} 个。`,
    history: '相关操作',
    noHistory: '没有找到相关操作',
  },

  /** An operation's page: the changes its receipt records to built-in assets (D-122), and the standards' events read by their layout */
  op: {
    changes: '资产变动',
    changesHint: '不含 KSA 的手续费、解锁和区块奖励',
    unrecorded: '节点没有记录这个操作的资产变动',
    /** The kinds of change, by the node's names; freezing, the allowlist and pausing by which way they went */
    kind: {
      transfer: '转账',
      funds: '附带资金',
      payout: '合约转出',
      issue: '发行',
      burn: '销毁',
      create: '创建资产',
      renounce: '放弃权限',
      freeze: '冻结',
      unfreeze: '解冻',
      allow: '加入白名单',
      disallow: '移出白名单',
      pause: '暂停',
      resume: '恢复',
    },
    none: '无',
    /** A token's transfer from the zero account, and one to it */
    minted: '铸造',
    burned: '销毁',
    /** A KS-721 approval cleared as its token changes owner */
    cleared: '已清除',
    /** A minter set to none: minting ends for good */
    ended: '无：铸造永久结束',
    never: '永不过期',
    allTokens: '全部 NFT',
    yes: '是',
    no: '否',
  },

  /** The KS-721 collections an account holds NFTs of: its page, a contract's, the wallet */
  collections: {
    title: 'NFT',
    caption: '持有的 NFT，按合集',
    collection: '合集',
    count: '数量',
  },
  /** A contract's page: the page of the token or the collection it is */
  contract: {
    tokenPage: '代币页',
    collectionPage: '合集页',
  },

  /** The wallet's list: assets nobody asked for are folded away (core/docs/STANDARDS.md §7) */
  wallet: {
    others: (n: number) => `其他资产（${n}）`,
    otherCollections: (n: number) => `其他合集（${n}）`,
    othersHint: '别人转给你、你从没用过的资产收在这里。名称谁都能用：先打开资产页，看清完整 ID 和发行方，再决定保留。',
    keep: '保留',
    keepHint: '在这台设备上把它留在列表里',
    fold: '收起',
    foldHint: '放回其他资产',
    /** n is a formatted count */
    nfts: (n: string) => `${n} 个 NFT`,
  },
  /** The send page with a KS-20 token, and the asset field with any asset but KSA (D-123) */
  send: {
    /** Before the whole ID of the asset chosen */
    assetId: '资产 ID',
    checking: '正在请节点试运行这笔转账',
    /** reason: the token's refusal, as `refusal` words it */
    refused: (reason: string) => `代币合约不接受这笔转账：${reason}`,
    /** The fixed revert reasons of a transfer (core/docs/STANDARDS.md §5.1) */
    refusal: {
      balance: '余额不足',
      zero: '数量不能是 0',
      zeroAccount: '不能转给零账户',
      self: '不能转给代币合约本身',
      /** reason: the contract's own words */
      rules: (reason: string) => `它自己的规则不允许（「${reason}」）`,
      /** reason: the contract's own words */
      other: (reason: string) => `「${reason}」`,
    },
    toToken: '不能转给代币合约本身：转进去的代币谁也取不出来',
    toContractToken: '收款方是一个合约。普通转账不会通知它，不接收 KS-20 的合约既用不了、也退不回这些代币；要交给合约，请用它支持的 transfer_and_call。',
    toContractAsset: '收款方是一个合约。普通转账不会调用它，它未必会记到你名下；要付给合约，请在调用它的方法时附上资产。',
    /** used: the gas the dry run used, formatted */
    gasHint: (used: string) => `超出则执行失败、照扣费；节点试运行这笔转账用了 ${used}，默认多留一半`,
    /** gas: the max_gas offered, formatted */
    unchecked: (gas: string) => `没能先试运行这笔转账，默认给 ${gas}；超出则执行失败、照扣费`,
    /** Before the dry run: the recipient or the amount is still missing */
    gasLater: '超出则执行失败、照扣费；填好收款方和数量后，按节点试运行的用量给出',
    uncheckedWarn: '节点没能先试运行这笔转账：它可能会失败，失败了费用照付',
  },
};
