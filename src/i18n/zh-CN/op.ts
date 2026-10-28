/** Operation detail (pages/OpDetail.tsx) */
export default {
  head: {
    mine: '你的操作',
    toMe: '转给你',
    execFailed: '执行失败',
    /** Screen reader: announced when the status changes */
    liveStatus: (status: string) => `当前状态：${status}`,
  },

  /** Top banners: shown only for problems, long waits and risks; one sentence each */
  banner: {
    /** reason is the short name of the failure reason (exceeded max_gas, contract revert, …) */
    failed: (reason: string) => `执行失败：${reason}`,
    /** Path B: the fee and the nonce are taken before the action runs (§8.1) */
    failedCharged: '手续费照扣，nonce 也已用掉，其余改动已回滚。',
    /** Path C that failed its authentication or nonce: nothing changes (§7.4) */
    failedNative: '状态没有改变，付给 BTC 矿工的手续费不退。',
    /** Path C whose nonce was taken before the action failed (§7.4) */
    failedNativeUsed: 'nonce 已用掉，付给 BTC 矿工的手续费不退，其余改动已回滚。',
    skipped: '被跳过：没有执行，也没有扣费',
    dropped: '已移出条目池：不会上链，也不扣费',
    waitedBody: '出块者可以不收录它；改走路径 C 不需要出块者。',
    resendNative: '用路径 C 重新提交',
    large: '大额到账：建议等到 BTC 最终',
    largeBody: '金额达到你设置的大额阈值。',
  },

  journey: {
    title: '从快轨确认到 BTC 最终',
    /** Followed by the duration (3.2 s) */
    fastLatency: '从提交到快轨确认用时',
  },

  /** VmOp plate */
  vmop: {
    sigHash: '签名哈希',
    size: '编码长度',
    /** n is a formatted byte count */
    bytes: (n: string) => `${n} 字节`,
    /** Limit for max_gas and the encoded size */
    cap: (n: string) => `上限 ${n}`,
    /** Before the gas an executed op used, under its max_gas */
    gasUsed: '已用',
    /** Path C miner fee: formatted sats and fee rate */
    minerFee: (sats: string, rate: string) => `${sats}\u00a0聪（${rate}\u00a0sat/vB）`,
    name: '名称',
    code: '代码',
    wasm: (n: string) => `${n} 字节 WASM`,
  },

  exec: {
    title: '执行',
    block: '所在区块',
    entry: (index: number) => `条目 #${index}`,
    accepted: '接受高度',
    fastDepth: '快轨深度',
    confs: (n: number) => `${n.toLocaleString('en-US')} 个确认`,
    events: '事件',
    nativeTx: '原生交易',
    closure: '已结算闭包',
  },

  raw: '原始数据（JSON）',
};
