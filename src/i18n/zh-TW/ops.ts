import type { Messages } from '..';

/** Traditional Chinese (Taiwan): operation list */
const ops: Messages['ops'] = {
  title: '操作',
  tabs: {
    label: '操作檢視',
    latest: '最新',
    mempool: '條目池',
    pendingLocal: '待收錄（本頁）',
  },

  filter: {
    label: '依路徑篩選',
    all: '全部路徑',
    path: (path: string, label: string) => `${path} ${label}`,
    failedOnly: '只看失敗',
    none: '沒有符合條件的操作',
  },

  mempool: {
    localOnly: '只顯示本頁提交、尚未收錄的操作。',
    minFees: (list: string) => `各出塊者的最低代付費：${list}`,
    waited: '已等待',
    note: '說明',
    emptyLocal: '本頁沒有待收錄的操作',
    empty: '條目池是空的',
    total: (n: number) => `共 ${n} 筆`,
    why: {
      nativeConfirmed: '已在 BTC 確認，下一個區塊強制收錄',
      nativeWaiting: '等待 BTC 確認',
      nativeConfs: (n: number, need: number) => `BTC 確認 ${n}/${need}，滿 ${need} 個後強制收錄`,
      backlog: '結算積壓已達上限，快速路徑暫停',
      censored: '出塊者不收錄這個帳戶，可改走路徑 C',
      lowFee: (producers: string) => `低於 ${producers} 的最低代付費，只有部分出塊者會收錄`,
      nonce: (nonce: string) => `等待 nonce ${nonce} 先被收錄`,
      gone: '已不再等待收錄',
    },
  },
};

export default ops;
