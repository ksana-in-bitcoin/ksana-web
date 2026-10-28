/** BTC transaction detail page (pages/TxDetail.tsx): header, banners, transaction structure diagram, payload and fees */
export default {
  /** The transaction can't be found in the node data source */
  notFoundRpc: '节点不能按 txid 查询交易，请从区块页打开，或用比特币浏览器查看。',
  /** Its title: the transaction may well exist */
  notFoundRpcTitle: '这里查不到这笔 BTC 交易',
  /** A link to a public Bitcoin explorer's page for the transaction; site is its name */
  viewOn: (site: string) => `在 ${site} 查看`,

  eyebrow: (kind: string) => `BTC 交易 · ${kind}`,
  /** Header label, followed by a link to the fast-lane block */
  forBlock: '快轨块',

  /** A settlement is two transactions, commit and reveal: the header shows whichever this one is and links to the other */
  pair: {
    commit: '结算 · 提交交易',
    reveal: '结算 · 揭示交易',
    commitTx: '提交交易',
    revealTx: '揭示交易',
    hint: '提交交易先锁定承诺，揭示交易在见证里给出载荷。',
  },

  stuck: {
    title: '卡在 BTC 内存池',
    bumpAnchor: '用 P2A 锚点加速',
    bumpChange: '用找零做 CPFP',
    bumpedAnchor: (n: number) => `已挂上 ${n} 笔 CPFP 子交易，下一个 BTC 块会一起确认`,
    bumpedChange: '已用找零挂上 CPFP 子交易，下一个 BTC 块会一起确认',
    bumpFailed: '没有可花的输出，无法做 CPFP',
  },

  /** The node data source only knows a few facts such as the transaction ID */
  partial: {
    title: '节点只提供了这笔交易的一部分',
    more: '完整内容请用比特币浏览器查看。',
  },

  /** Label, followed by a link to the transaction that replaced it */
  replacedBy: '替换为',
  invalidRebuilt: '结算已重建，无需任何人重新签名。',
  rescueBanner: {
    rebuilt: '出块者重建的结算',
    rescue: '救援结算',
  },

  structure: '交易结构',

  payload: {
    title: '载荷',
    type: '载荷类型',
    headers: '区块头',
    bodies: '区块体',
    dataSize: '数据量',
    chunks: '数据块',
    none: '不携带 Ksana 数据',
  },

  /** The transaction's own facts: its ID, size, fee, funder and status */
  details: {
    title: '交易',
    vsize: '虚拟大小',
    broadcastAt: (time: string) => `广播于 ${time}`,
    otherVersions: '同块的其他版本',
    author: {
      rebuilder: '重建者',
      rescuer: '救援者',
      user: '用户',
      funder: '出资方',
    },
  },

  /** Transaction structure diagram: inputs and outputs laid out by index */
  diagram: {
    inputs: '输入',
    outputs: '输出',
    inRole: {
      producer: '出块者出资',
      commit: '来自提交交易',
      payer: '付款输入',
      anchor: 'P2A 锚点（父交易）',
    },
    outRole: {
      change: '找零',
      commitment: '承诺输出',
      anchor: 'P2A 锚点',
      payment: '付款',
    },
    producerChange: '出块者找零',
    /** A P2A anchor has no owner */
    anyone: '任何人可花',
    /** Commitment output: the reveal transaction spends it */
    commitmentHint: '由揭示交易花掉',
    opReturn: {
      native: 'NativeOp：一笔 VmOp',
      headers: (n: number) => `Headers：${n} 个区块头`,
      settlement: (headers: number, entries: number) => `${headers} 个区块头 + ${entries} 个条目`,
      empty: '空 OP_RETURN',
    },
    chunks: (n: number) => `${n} 个数据块`,
    /** Witness envelope: the payload carried in the reveal transaction's input witness */
    envelope: {
      title: '见证信封',
      headers: (n: number) => `${n} 个区块头`,
      bodies: (n: number) => `${n} 个区块体`,
    },
  },
};
