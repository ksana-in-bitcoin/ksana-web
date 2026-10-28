/** Operation list (pages/Ops.tsx) */
export default {
  title: '操作',
  tabs: {
    label: '操作视图',
    latest: '最新',
    mempool: '条目池',
    /** Node data source: only operations submitted from this page */
    pendingLocal: '待收录（本页）',
  },

  filter: {
    label: '按路径筛选',
    all: '全部路径',
    /** Filter option: A Merged */
    path: (path: string, label: string) => `${path} ${label}`,
    failedOnly: '只看失败',
    none: '没有符合条件的操作',
  },

  mempool: {
    localOnly: '只显示本页提交、尚未收录的操作。',
    /** list is a list of "producer amount KSA" items, already joined with the language's list separator */
    minFees: (list: string) => `各出块者的最低代付费：${list}`,
    waited: '已等待',
    note: '说明',
    emptyLocal: '本页没有待收录的操作',
    empty: '条目池是空的',
    total: (n: number) => `共 ${n} 笔`,
    /** "Note" column: what it is still waiting for */
    why: {
      nativeConfirmed: '已在 BTC 确认，下一块强制收录',
      nativeWaiting: '等待 BTC 确认',
      /** n of the `need` BTC confirmations forced inclusion takes */
      nativeConfs: (n: number, need: number) => `BTC 确认 ${n}/${need}，满 ${need} 个后强制收录`,
      backlog: '结算积压已达上限，快速路径暂停',
      censored: '出块者不收录这个账户，可改走路径 C',
      /** producers is a list of producer names */
      lowFee: (producers: string) => `低于 ${producers} 的最低代付费，只有部分出块者会收录`,
      nonce: (nonce: string) => `等待 nonce ${nonce} 先被收录`,
      /** An operation the pool no longer has, kept while the keyboard is in the table */
      gone: '已不再等待收录',
    },
  },
};
