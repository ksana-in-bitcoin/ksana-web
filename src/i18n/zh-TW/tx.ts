import type { Messages } from '..';

/** Traditional Chinese (Taiwan): BTC transaction detail page */
const tx: Messages['tx'] = {
  notFoundRpc: '節點無法依 txid 查詢交易，請從區塊頁開啟，或用比特幣區塊瀏覽器查看。',
  /** Its title: the transaction may well exist */
  notFoundRpcTitle: '這裡查不到這筆 BTC 交易',
  /** A link to a public Bitcoin explorer's page for the transaction; site is its name */
  viewOn: (site: string) => `在 ${site} 查看`,

  eyebrow: (kind: string) => `BTC 交易 · ${kind}`,
  forBlock: '快軌區塊',

  pair: {
    commit: '結算 · 提交交易',
    reveal: '結算 · 揭示交易',
    commitTx: '提交交易',
    revealTx: '揭示交易',
    hint: '提交交易先鎖定承諾，揭示交易在見證裡給出酬載。',
  },

  stuck: {
    title: '卡在 BTC 記憶池',
    bumpAnchor: '用 P2A 錨點加速',
    bumpChange: '用找零做 CPFP',
    bumpedAnchor: (n: number) => `已掛上 ${n} 筆 CPFP 子交易，下一個 BTC 區塊會一起確認`,
    bumpedChange: '已用找零掛上 CPFP 子交易，下一個 BTC 區塊會一起確認',
    bumpFailed: '沒有可花的輸出，無法做 CPFP',
  },

  partial: {
    title: '節點只提供了這筆交易的一部分',
    more: '完整內容請用比特幣區塊瀏覽器查看。',
  },

  replacedBy: '替換為',
  invalidRebuilt: '結算已重建，無需任何人重新簽署。',
  rescueBanner: {
    rebuilt: '出塊者重建的結算',
    rescue: '救援結算',
  },

  structure: '交易結構',

  payload: {
    title: '酬載',
    type: '酬載類型',
    headers: '區塊頭',
    bodies: '區塊體',
    dataSize: '資料量',
    chunks: '資料塊',
    none: '不攜帶 Ksana 資料',
  },

  details: {
    title: '交易',
    vsize: '虛擬大小',
    broadcastAt: (time: string) => `廣播於 ${time}`,
    otherVersions: '同區塊的其他版本',
    author: {
      rebuilder: '重建者',
      rescuer: '救援者',
      user: '使用者',
      funder: '出資方',
    },
  },

  diagram: {
    inputs: '輸入',
    outputs: '輸出',
    inRole: {
      producer: '出塊者出資',
      commit: '來自提交交易',
      payer: '付款輸入',
      anchor: 'P2A 錨點（父交易）',
    },
    outRole: {
      change: '找零',
      commitment: '承諾輸出',
      anchor: 'P2A 錨點',
      payment: '付款',
    },
    producerChange: '出塊者找零',
    anyone: '任何人可花',
    commitmentHint: '由揭示交易花掉',
    opReturn: {
      native: 'NativeOp：一筆 VmOp',
      headers: (n: number) => `Headers：${n} 個區塊頭`,
      settlement: (headers: number, entries: number) => `${headers} 個區塊頭 + ${entries} 個條目`,
      empty: '空 OP_RETURN',
    },
    chunks: (n: number) => `${n} 個資料塊`,
    envelope: {
      title: '見證信封',
      headers: (n: number) => `${n} 個區塊頭`,
      bodies: (n: number) => `${n} 個區塊體`,
    },
  },
};

export default tx;
