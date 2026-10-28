import type { ReactNode } from 'react';

/** Counts with thousands separators (same as fmtInt in lib/format; digits are written the same in every language) */
const int = (n: number) => n.toLocaleString('en-US');

/** Verify page: indexer checks, the two confirmations (explained only here on the whole site), protocol parameters, verify it yourself */
export default {
  eyebrow: '不必信任任何节点',
  title: '验证',
  lead: '索引器只读比特币上的数据，把每个块重新执行一遍，只有算出的状态与块头里的 state_root 相同才接受；本页核对它接受的是不是节点的块。',
  bitcoin: '比特币',

  /** Three-part flow: fast-lane node → Bitcoin → independent indexer */
  flow: {
    label: '验证链路',
    node: '快轨节点',
    settled: (height: ReactNode) => <>快轨已结算至 {height}</>,
    readOnly: '只读 BTC',
    indexer: '独立索引器',
    noIndexer: '未连接：在数据源设置里填写索引器地址',
    halted: (reason: string) => `索引器已停止：${reason}`,
    ok: '全部一致',
    /** Node data source: how many times this page has compared */
    okCompared: (n: number) => (n === 1 ? '本页核对 1 次，结果一致' : `本页核对 ${int(n)} 次，全部一致`),
    /** No check made yet */
    none: '尚未核对',
    /** The indexer did not answer the last time the page asked */
    unreachable: '没有应答：应答之前无法核对，页面每次更新都会再问',
    /** The recent checks match; an older one did not, as the line under it says */
    okRecent: '最近的核对一致',
    /** Checks that did not match, older than the recent ones the page keeps: failed of the n checks this page made, the latest at height */
    earlier: (failed: number, n: number, height: ReactNode) =>
      failed === 1 ? (
        <>此前本页 {int(n)} 次核对中有 1 次不一致，在 {height}</>
      ) : (
        <>此前本页 {int(n)} 次核对中有 {int(failed)} 次不一致，最近一次在 {height}</>
      ),
    forked: '主链不同：索引器在这一高度接受了另一个块；节点的块可能无效，或在一条未结算的分支上',
    /** The node's chain block above the indexer's height that it could have run (see stall below) */
    stalled: (height: ReactNode) => <>还没执行 {height}，但它本可以执行</>,
    mismatch: '发现不一致：快轨可能有无效块',
  },
  /** n: the blocks the indexer trails the tip by; unwritten: how many of them, the newest, are not yet written to Bitcoin; depth: SETTLEMENT_DEPTH, the blocks after a block that are written too before the indexer runs it */
  lag: (n: number, unwritten: number, depth: number) => {
    if (unwritten >= n) return `索引器落后链顶 ${int(n)} 块，这些块还在等写入比特币。`;
    const rule = `一个块要等它之后的 ${int(depth)} 块也写入比特币，索引器才会执行它。`;
    if (unwritten === 0) return `索引器落后链顶 ${int(n)} 块：${rule}`;
    return `索引器落后链顶 ${int(n)} 块：最新的 ${int(unwritten)} 块还在等写入比特币；${rule}`;
  },
  /** height: the block the indexer could have run; btc: the BTC block its data and the headers after it were all on by; depth: SETTLEMENT_DEPTH */
  stall: (height: ReactNode, btc: ReactNode, depth: number) => (
    <>
      索引器还没执行 {height}，可这个块的数据和它之后 {int(depth)} 个块的块头从 {btc} 起就已在比特币上：它可能在追赶进度或卡在本地故障上，也可能判定了这个块无效。在它执行之前，从这个块起往后只有节点自己担保。
    </>
  ),

  checks: {
    title: '最近核对',
    caption: 'state_root 核对',
    noIndexer: '没有连接索引器',
    none: '还没有核对记录',
    nodeRoot: '节点的 state_root',
    indexerRoot: '索引器重算的 state_root',
    match: '一致',
    forked: '主链不同',
    mismatch: '不一致',
    /** Hover text when the main chains differ */
    nodeBlock: (hash: string) => `节点在这一高度的主链块：${hash}`,
    at: '核对时间',
  },

  /** The two confirmations: a short phrase each */
  confirm: {
    title: '两种确认',
    when: '条件',
    time: '典型耗时',
    security: '安全性来自',
    fit: '适合',
    fastWhen: '被快轨块收录',
    fastSecurity: '快轨的 PoW 算力',
    fastFit: '日常小额操作',
    /** The two parts of D-114 without their sum (D-116); confs is BTC_FINALITY_CONFS */
    finalWhen: (confs: number) => `数据有 ${confs} 个比特币确认，作出判定的比特币块也有 ${confs} 个确认`,
    /**
     * mainnet, now: estimates from fmtEta, which carry their "~"; network: devnet / signet; now is left out when the network has no figure.
     * Each part a phrase, whole on a line where it fits: on a phone the Chinese line split a number from its unit
     */
    finalTime: (mainnet: string, network: string, now?: string) =>
      now === undefined ? (
        `主网${mainnet}`
      ) : (
        <>
          <span className="phrase">主网{mainnet}；</span>
          <span className="phrase">{network} 当前{now}</span>
        </>
      ),
    finalFit: '大额、需要比特币保障的结果',
    risk: '快轨的多数算力攻击只能回滚尚未 BTC 最终的块。',
  },

  params: {
    title: '协议参数',
    eyebrow: (chain: string) => `${chain} 参数`,
    name: '参数',
    value: '值',
    note: '说明',
    count: (n: number) => `${n} 个参数`,
  },

  self: {
    title: '自己核对',
    /** indexer and txindex are ksana-indexer and txindex in code style */
    how: (indexer: ReactNode, txindex: ReactNode) => (
      <>
        运行 {indexer}，连接一个开启 {txindex} 的 bitcoind 即可。
      </>
    ),
    btcTip: '链顶',
    indexerAt: '索引器已处理到',
    console: '打开 regtest 控制台，制造异常场景',
    settings: '数据源与索引器设置',
  },
};
