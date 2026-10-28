/** Block detail (pages/BlockDetail.tsx) */
import { latinGap } from '../spacing';

export default {
  head: {
    eyebrow: '快轨区块',
    eyebrowSide: '快轨区块 · 平行块',
    /** Followed by a BTC block ref */
    anchor: '锚定',
    prev: '上一块',
    next: '下一块',
  },

  /** Banner at the top of a parallel block page */
  side: {
    /** h is a formatted height */
    mergedBy: (h: string) => `平行块，已由 #${h} 合并`,
    waiting: '平行块，等待合并',
    /** Followed by a ref to the chain block at the same height */
    sibling: '同高度的主链块',
  },

  header: {
    title: '区块头',
    hash: '区块哈希',
    genesis: '创世块',
    indexerMatch: '索引器核对一致',
    /** Empty-block weight (×12, ×24, …): doubles over consecutive empty blocks, and difficulty and reward slots increase with it */
    weight: '空块权重',
    weightHint: '连续空块时权重加倍，难度与奖励随之提高',
  },

  /** The DAG column and the tags in the parents list */
  dag: {
    selectedParent: '选定父块',
    mergedParent: '被合并',
    acceptedBy: '合并它的主链块',
    mergedStats: (entries: number, skipped: number) => `${entries} 个条目 · ${skipped} 个跳过`,
    closure: '已结算闭包',
  },

  settle: {
    title: '结算',
    own: '本块自带结算交易',
    /** Follows own: a settlement is two transactions, commit and reveal */
    ownPair: '提交与揭示两笔',
    none: '本块不单独结算',
    genesis: '创世块不需要结算。',
    /** The block body is carried to Bitcoin by a later block's settlement */
    bodyCarried: '区块体由后面的结算一并携带上链。',
    bodyCarriedLanded: '区块体已由后面的结算一并携带上链。',
    bodyCarrier: '携带区块体的结算',
    /** A body that must go to Bitcoin, with no settlement of its own and none carrying it yet (D-077) */
    waiting: '等后面的结算携带',
    /** A body that went to Bitcoin with a transaction other than a later block's settlement: a republish or a rescue (D-045, D-047) */
    otherCarrier: '区块体由别的交易携带',
    bodyOther: '区块体已随别的交易上链。',
    /** The block whose settlement carries this block's body */
    bodyCarrierBlock: '结算来自',
    carried: '空块或只含强制收录的块，区块头随别的交易上链。',
    /** An empty block that sent a settlement itself, carrying bodies from the backlog (D-077) */
    carriedOwn: '空块或只含强制收录的块本不需要结算；本块的结算交易携带此前各块的区块体，区块头随之上链。',
    carrier: '携带交易',
    /** A block's settlement transaction: block is the block title (#1,024), kind is the transaction type */
    carrierOf: (block: string, kind: string) => `${latinGap(block)}的${kind}`.trimStart(),
    otherBlock: '另一块',
    noCarrier: '还没有交易携带这个区块头。',
    /** A header on Bitcoin, as the block's life says, that no main-chain settlement the page read carried: a republish or a parallel block's landed it (D-047) */
    carrierUnloaded: '本块的区块头已随另一笔交易上链，本页没有找到那笔交易。',
    notBuilt: '结算交易尚未构造。',
    rescue: '救援 / 重建',
    confs: (n: number) => `${n.toLocaleString('en-US')} 个确认`,
    commit: '提交交易',
    reveal: '揭示交易',
    /** The fee of a settlement's reveal transaction alone, where the page does not know its commit transaction's (D-081) */
    revealFee: '揭示交易手续费',
    revealFeeHint: '提交交易另付手续费，本页不知道为它出资的输入金额，无法加上',
    /** A settlement's fee by transaction, the amounts already formatted */
    feeParts: (commit: string, reveal: string) => `提交 ${commit}\u00a0聪 + 揭示 ${reveal}\u00a0聪`,
    content: '交易内容',
    /** Hover text for "—" when the node data source doesn't provide the transaction details */
    contentHint: '完整内容请用比特币浏览器查看',
    headers: '携带区块头',
    headerCount: (n: number) => `${n} 个`,
    bodies: '携带区块体',
    bodyCount: (n: number) => `${n} 个`,
    dataSize: '数据量',
    dataMeter: '结算数据量',
    /** Followed by the list of versions */
    versions: (n: number) => `本块共构造过 ${n} 笔结算交易：`,
  },

  entries: {
    title: (n: number) => `条目（${n}）`,
    forced: '强制收录 · 来自 BTC',
    /** The group of the unlock entry (at most one a block): what it does */
    system: '解锁 · 已结算块的手续费与出块奖励到账',
    fast: '快速路径',
    /** The unlock entry's row, after its tag: up to #1,024 · index 3 · 12 blocks · total 36 KSA */
    unlockTo: (h: string, i: number) => `至 #${h} · 序号 ${i}`,
    unlockBlocks: (n: number) => `${n} 个块`,
    unlockTotal: '共',
    /** Stats column: 3 skipped · gas … · data … */
    skipped: (n: number) => `${n} 个跳过`,
    gas: (used: string, sum: string) => `gas ${used} / 声明上限合计 ${sum}`,
    data: (size: string) => `数据 ${size}`,
  },

  type: '类型',
  raw: '原始数据（JSON）',
};
