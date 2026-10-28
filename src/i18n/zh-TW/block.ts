import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Traditional Chinese (Taiwan): block detail */
const block: Messages['block'] = {
  head: {
    eyebrow: '快軌區塊',
    eyebrowSide: '快軌區塊 · 平行塊',
    anchor: '錨定',
    prev: '上一區塊',
    next: '下一區塊',
  },

  side: {
    mergedBy: (h: string) => `平行塊，已由 #${h} 合併`,
    waiting: '平行塊，等待合併',
    sibling: '同高度的主鏈塊',
  },

  header: {
    title: '區塊頭',
    hash: '區塊雜湊',
    genesis: '創世區塊',
    indexerMatch: '索引器核對一致',
    weight: '空區塊權重',
    weightHint: '連續空區塊時權重加倍，難度與獎勵隨之提高',
  },

  dag: {
    selectedParent: '選定父區塊',
    mergedParent: '被合併',
    acceptedBy: '合併它的主鏈塊',
    mergedStats: (entries: number, skipped: number) => `${entries} 個條目 · ${skipped} 個跳過`,
    closure: '已結算閉包',
  },

  settle: {
    title: '結算',
    own: '本區塊自帶結算交易',
    ownPair: '提交與揭示兩筆',
    none: '本區塊不單獨結算',
    genesis: '創世區塊不需要結算。',
    bodyCarried: '區塊體由後面的結算一併攜帶上鏈。',
    bodyCarriedLanded: '區塊體已由後面的結算一併攜帶上鏈。',
    bodyCarrier: '攜帶區塊體的結算',
    waiting: '等後面的結算攜帶',
    otherCarrier: '區塊體由別的交易攜帶',
    bodyOther: '區塊體已隨別的交易上鏈。',
    bodyCarrierBlock: '結算來自',
    carried: '空區塊或只含強制收錄的區塊，區塊頭隨別的交易上鏈。',
    carriedOwn: '空區塊或只含強制收錄的區塊本不需要結算；本區塊的結算交易攜帶此前各區塊的區塊體，區塊頭隨之上鏈。',
    carrier: '攜帶交易',
    carrierOf: (block: string, kind: string) => `${latinGap(block)}的${kind}`.trimStart(),
    otherBlock: '另一個區塊',
    noCarrier: '還沒有交易攜帶這個區塊頭。',
    carrierUnloaded: '本區塊的區塊頭已隨另一筆交易上鏈，本頁沒有找到那筆交易。',
    notBuilt: '結算交易尚未建構。',
    rescue: '救援 / 重建',
    confs: (n: number) => `${n.toLocaleString('en-US')} 個確認`,
    commit: '提交交易',
    reveal: '揭示交易',
    /** The fee of a settlement's reveal transaction alone, where the page does not know its commit transaction's (D-081) */
    revealFee: '揭示交易手續費',
    revealFeeHint: '提交交易另付手續費，本頁不知道為它出資的輸入金額，無法加上',
    /** A settlement's fee by transaction, the amounts already formatted */
    feeParts: (commit: string, reveal: string) => `提交 ${commit}\u00a0聰 + 揭示 ${reveal}\u00a0聰`,
    content: '交易內容',
    contentHint: '完整內容請用比特幣區塊瀏覽器查看',
    headers: '攜帶區塊頭',
    headerCount: (n: number) => `${n} 個`,
    bodies: '攜帶區塊體',
    bodyCount: (n: number) => `${n} 個`,
    dataSize: '資料量',
    dataMeter: '結算資料量',
    versions: (n: number) => `本區塊共建構過 ${n} 筆結算交易：`,
  },

  entries: {
    title: (n: number) => `條目（${n}）`,
    forced: '強制收錄 · 來自 BTC',
    system: '解鎖 · 已結算區塊的手續費與出塊獎勵到帳',
    fast: '快速路徑',
    unlockTo: (h: string, i: number) => `至 #${h} · 序號 ${i}`,
    unlockBlocks: (n: number) => `${n} 個區塊`,
    unlockTotal: '共',
    skipped: (n: number) => `${n} 個跳過`,
    gas: (used: string, sum: string) => `gas ${used} / 宣告上限合計 ${sum}`,
    data: (size: string) => `資料 ${size}`,
  },

  type: '類型',
  raw: '原始資料（JSON）',
};

export default block;
