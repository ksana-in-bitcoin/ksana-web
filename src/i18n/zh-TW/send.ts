import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Traditional Chinese (Taiwan): send page */
const send: Messages['send'] = {
  eyebrow: '錢包',
  title: '發送',
  step: (n: number, total: number) => `第 ${n} 步，共 ${total} 步`,

  to: {
    section: '收款與金額',
    label: '收款帳戶',
    placeholder: 'Taproot 地址，或十六進位帳戶',
    hint: '貼上後核對首尾各 8 碼與帳戶印',
    headTail: '首尾',
    asAddress: '對應地址',
    notTaproot: '只能是 Taproot（bc1p / tb1p / bcrt1p）地址',
    wrongNetwork: (net: string) => `這個地址不屬於目前的網路（${net}）`,
    badAddress: '地址無效，可能抄錯了某一碼',
    badChars: '只能包含 0–9 與 a–f',
    badLength: (n: number) => `需要 64 碼，目前是 ${n} 碼`,
    notOnCurve: '不是有效的帳戶，可能抄錯了某一碼',
    self: '收款方是你自己的帳戶',
    noRecord: '這個帳戶在鏈上沒有紀錄，請再核對首尾',
  },

  recent: {
    title: '最近發給過',
    sentBefore: (n: number, ago: string) => `最近發給過 ${n} 次，上次 ${ago}`,
  },

  amount: {
    max: '全部',
    available: '可用',
    integer: (symbol: string) => `${symbol} 只能填整數`,
    decimals: (symbol: string, n: number) => `${symbol} 最多 ${n} 位小數`,
    notNumber: '金額需要寫成數字，如 12.5',
    positive: '金額需要大於 0',
    overBalance: (amount: string, symbol: string) => `超過可用餘額 ${amount}\u00a0${symbol}`,
    withFee: '餘額不夠同時支付金額與代付費',
  },

  path: {
    section: '提交方式',
    more: '更多提交方式',
    tagDefault: '預設',
    tagRecommended: '推薦',
    tagCensorship: '抗審查',
    speedFast: (s: number) => `約 ${s} 秒生效`,
    speedNative: (n: number) => `${n} 個 BTC 確認後強制收錄`,
    paused: '暫停中',
    mayNotInclude: '可能不被收錄',
    backlog: '結算積壓中，解除前不會收錄',
    censored: '出塊者最近沒有收錄你的操作',
    sameNonce: '同一個 nonce 重送只能走路徑 C',
    ksaShort: 'KSA 不夠付代付費',
    noOutputC: '沒有可用的 BTC 輸出付礦工費',
    nativeGas: (max: string) => `路徑 C 的 max_gas 不能超過 ${max}`,
    nativeWaiting: (nonce: string) => `你的路徑 C 操作（nonce ${nonce}）還在等 BTC 確認；它被收錄後才能再走路徑 C`,
    feeSpike: 'BTC 費率偏高',
  },


  sponsor: {
    label: '代付費',
    suggestedTag: '按建議值，進階選項裡可改',
    customTag: '自訂數額',
    custom: '代付費',
    hint: (amount: string) => `留空按建議值 ${amount}\u00a0KSA：最近 20 個區塊路徑 B 費用的中位數`,
    hintRate: (amount: string) => `留空按建議值 ${amount}\u00a0KSA：節點從最近 20 個區塊得出的費率，按這筆轉帳計算`,
    hintMin: (amount: string) => `留空按建議值 ${amount}\u00a0KSA：節點的最低費用`,
    invalid: '代付費要是大於 0 的 KSA 數額',
    belowMin: '低於某位出塊者的最低數額時，只能等別的出塊者收錄',
  },

  native: {
    feeRate: '費率',
    feeRateHint: (rate: string) => `預設按節點的結算費率 ${rate}\u00a0sat/vB`,
    feeRateRange: (cap: string) => `請填 1\u00a0到\u00a0${cap}\u00a0sat/vB 的費率`,
    utxos: 'BTC 輸出',
    loading: '讀取錢包地址上的輸出…',
    source: { btc_rpc: '來自比特幣 RPC', unisat: '來自錢包', manual: '手動填寫' },
    available: (sats: string, n: number) => `可用 ${sats}\u00a0聰（${n} 個輸出）`,
    unconfirmed: (sats: string, n: number) => `尚未確認：${sats}\u00a0聰（${n} 個輸出），進入 BTC 區塊後即可使用`,
    need: (sats: string) => `至少需要 ${sats}\u00a0聰`,
    short: (sats: string) => `BTC 輸出不夠，至少需要 ${sats}\u00a0聰`,
    manualNeeded: '需要手動填寫 BTC 輸出',
    loadFailed: (detail: string) => `讀不到 BTC 輸出：${detail}`,
    manualLabel: '手動填寫輸出',
    manualPlaceholder: 'txid:vout:聰，每行一個',
    manualHint: '沒有接比特幣 RPC 或錢包的 UTXO 介面時填寫',
  },

  nativeRates: (rate: string, min: string) => `BTC 費率 ${rate}\u00a0sat/vB · 入塊門檻 ${min}\u00a0sat/vB`,

  advanced: {
    title: '進階選項',
    gasHint: (n: string) => `超出則執行失敗、照扣費；一筆轉帳用 ${n}`,
    gasRange: (min: string, max: string) => `max_gas 需在 ${min}\u00a0到\u00a0${max} 之間`,
  },

  nonce: {
    title: (nonce: string) => `用同一個 nonce（${nonce}）改走路徑 C`,
    race: '只有先被收錄的一筆生效；原來那筆先被收錄時，這筆的礦工費不退',
    fixed: (nonce: string) => `${nonce}（指定）`,
  },

  summary: {
    title: '摘要',
    needTo: '先填寫收款帳戶',
    needAmount: '再填寫金額',
    readingBalance: '正在讀取餘額…',
    badFee: '代付費無效',
    badGas: 'max_gas 超出範圍',
    badRate: '費率超出範圍',
    unavailable: (path: string, reason: string) => `路徑 ${path} 不可用：${reason}`,
    needUtxo: '先提供夠付礦工費的 BTC 輸出',
    waitUtxo: '等 BTC 區塊確認你的 BTC 輸出',
  },

  review: {
    title: '檢查並簽署',
    edit: '返回修改',
    signing: '簽署中…',
    submit: '簽署並提交',
    to: '給',
    signedBy: (wallet: string) => `由${latinGap(wallet)}簽署`,
    signedLocal: '由本機開發金鑰簽署',
    lockB: '執行前從你的 KSA 餘額扣除',
    lockC: '將廣播一筆 BTC 交易，找零回到你的地址',
    warnings: '請留意',
    large: (threshold: string, eta: string) => `達到大額門檻（${threshold}\u00a0KSA），${eta}後才達到 BTC 最終`,
    afterNative: (nonce: string) => `用的是你還在等 BTC 確認的路徑 C 操作（nonce ${nonce}）之後的 nonce；那一筆收錄後緊接著收錄這一筆`,
    network: (name: string, id: string) => `網路 ${name}（chain_id ${id}）`,
    raw: '你簽署的 VmOp',
    minUnit: '最小單位',
    sigHash: '簽名雜湊',
    /** Path C: on the review page there is no carrying transaction yet, so the sighash can't be given in advance */
    sigHashNative: '簽名時按承載交易的第一個輸入計算（D-086），此時還沒有',
  },

  error: {
    transferOnly: '只支援轉帳',
    disconnected: '錢包已中斷連線，請重新連接',
    walletDeclined: (detail: string) => `錢包未簽署：${detail}`,
    rpc: {
      invalid: '節點拒絕：操作無效',
      policy: '節點拒絕：不符合本節點的策略',
      params: '節點拒絕：格式錯誤',
      internal: '節點內部錯誤',
    },
    rpcCode: (code: string) => `節點回傳錯誤 ${code}`,
    retrySuggested: '按建議值重試',
    node: (what: string, detail: string) => `${what}（${detail}）`,
  },

  toast: {
    submitted: '已簽署並提交',
    broadcast: '已簽署並廣播到 BTC',
  },

  sent: {
    broadcastNative: '已廣播到 BTC',
    failedFoot: '手續費照扣，轉帳沒有生效',
    droppedFoot: '沒有上鏈，也沒有扣費',
    failedFootB: (fee: string, amount: string) => `已扣代付費 ${fee}；轉帳 ${amount} 沒有生效，這筆金額仍在你的餘額裡`,
    failedFootC: (amount: string) => `礦工費已付給 BTC 礦工，不退；轉帳 ${amount} 沒有生效，這筆金額仍在你的餘額裡`,
    againWait: '等這筆快軌確認後再發下一筆',
    latency: (d: string) => `快軌確認耗時 ${d}`,
    waited: '出塊者可以不收錄它；改走路徑 C 不需要出塊者',
    resendC: '用路徑 C 重新提交',
    next: '下一步',
    again: '再發一筆',
    backToWallet: '回到錢包',
    tx: 'BTC 交易',
    manualBroadcast: '沒有可用的廣播途徑，請自行廣播這筆交易：',
    copyRaw: '複製原始交易',
  },
};

export default send;
