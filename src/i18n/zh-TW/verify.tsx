import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Counts with thousands separators (same as fmtInt in lib/format; digits are written the same in every language) */
const int = (n: number) => n.toLocaleString('en-US');

/** Traditional Chinese (Taiwan): verify page */
const verify: Messages['verify'] = {
  eyebrow: '不必信任任何節點',
  title: '驗證',
  lead: '索引器只讀比特幣上的資料，把每個區塊重新執行一遍，只有算出的狀態與區塊頭裡的 state_root 相同才接受；本頁核對它接受的是不是節點的區塊。',
  bitcoin: '比特幣',

  flow: {
    label: '驗證鏈路',
    node: '快軌節點',
    settled: (height: ReactNode) => <>快軌已結算至 {height}</>,
    readOnly: '只讀 BTC',
    indexer: '獨立索引器',
    noIndexer: '未連接：在資料來源設定裡填寫索引器網址',
    halted: (reason: string) => `索引器已停止：${reason}`,
    ok: '全部一致',
    okCompared: (n: number) => (n === 1 ? '本頁核對 1 次，結果一致' : `本頁核對 ${int(n)} 次，全部一致`),
    /** No check made yet */
    none: '尚未核對',
    /** The indexer did not answer the last time the page asked */
    unreachable: '沒有回應：回應之前無法核對，頁面每次更新都會再問',
    /** The recent checks match; an older one did not, as the line under it says */
    okRecent: '最近的核對一致',
    /** Checks that did not match, older than the recent ones the page keeps: failed of the n checks this page made, the latest at height */
    earlier: (failed: number, n: number, height: ReactNode) =>
      failed === 1 ? (
        <>此前本頁 {int(n)} 次核對中有 1 次不一致，在 {height}</>
      ) : (
        <>此前本頁 {int(n)} 次核對中有 {int(failed)} 次不一致，最近一次在 {height}</>
      ),
    forked: '主鏈不同：索引器在這一高度接受了另一個區塊；節點的區塊可能無效，或在一條未結算的分支上',
    stalled: (height: ReactNode) => <>還沒執行 {height}，但它本可以執行</>,
    mismatch: '發現不一致：快軌可能有無效區塊',
  },
  lag: (n: number, unwritten: number, depth: number) => {
    if (unwritten >= n) return `索引器落後鏈頂 ${int(n)} 個區塊，這些區塊還在等待寫入比特幣。`;
    const rule = `一個區塊要等它之後的 ${int(depth)} 個區塊也寫入比特幣，索引器才會執行它。`;
    if (unwritten === 0) return `索引器落後鏈頂 ${int(n)} 個區塊：${rule}`;
    return `索引器落後鏈頂 ${int(n)} 個區塊：最新的 ${int(unwritten)} 個區塊還在等待寫入比特幣；${rule}`;
  },
  stall: (height: ReactNode, btc: ReactNode, depth: number) => (
    <>
      索引器還沒執行 {height}，可這個區塊的資料和它之後 {int(depth)} 個區塊的區塊頭從 {btc} 起就已在比特幣上：它可能在追趕進度或卡在本機故障上，也可能判定了這個區塊無效。在它執行之前，從這個區塊起往後只有節點自己擔保。
    </>
  ),

  checks: {
    title: '最近核對',
    caption: 'state_root 核對',
    noIndexer: '沒有連接索引器',
    none: '還沒有核對紀錄',
    nodeRoot: '節點的 state_root',
    indexerRoot: '索引器重算的 state_root',
    match: '一致',
    forked: '主鏈不同',
    mismatch: '不一致',
    nodeBlock: (hash: string) => `節點在這一高度的主鏈塊：${hash}`,
    at: '核對時間',
  },

  confirm: {
    title: '兩種確認',
    when: '條件',
    time: '典型耗時',
    security: '安全性來自',
    fit: '適合',
    fastWhen: '被快軌區塊收錄',
    fastSecurity: '快軌的 PoW 算力',
    fastFit: '日常小額操作',
    finalWhen: (confs: number) => `資料有 ${confs} 個比特幣確認，作出判定的比特幣區塊也有 ${confs} 個確認`,
    finalTime: (mainnet: string, network: string, now?: string) =>
      now === undefined ? (
        `主網${mainnet}`
      ) : (
        <>
          <span className="phrase">主網{mainnet}；</span>
          <span className="phrase">{network} 目前{now}</span>
        </>
      ),
    finalFit: '大額、需要比特幣保障的結果',
    risk: '快軌的多數算力攻擊只能回滾尚未 BTC 最終的區塊。',
  },

  params: {
    title: '協定參數',
    eyebrow: (chain: string) => `${chain} 參數`,
    name: '參數',
    value: '值',
    note: '說明',
    count: (n: number) => `${n} 個參數`,
  },

  self: {
    title: '自己核對',
    how: (indexer: ReactNode, txindex: ReactNode) => (
      <>
        執行 {indexer}，連接一個啟用 {txindex} 的 bitcoind 即可。
      </>
    ),
    btcTip: '鏈頂',
    indexerAt: '索引器已處理到',
    console: '開啟 regtest 主控台，製造異常情境',
    settings: '資料來源與索引器設定',
  },
};

export default verify;
