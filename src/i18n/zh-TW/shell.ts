import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Traditional Chinese (Taiwan): app shell (top bar, nav, status strip, toasts, console, footer and the "connecting to node" page) */
const shell: Messages['shell'] = {
  skipToMain: '跳到主要內容',

  mainNav: '主要導覽',
  nav: {
    overview: '概覽',
    blocks: '區塊',
    ops: '操作',
    settlements: '結算',
    verify: '驗證',
    wallet: '錢包',
    explorer: '瀏覽器',
    playground: 'Playground',
  },
  playground: '合約 Playground：在瀏覽器裡修改、編譯、部署合約，在新分頁開啟',

  theme: '主題',
  themes: { system: '跟隨系統', light: '淺色', dark: '深色' },
  themeNow: (current: string) => `主題：${current}`,
  themeSwitch: (current: string, next: string) => `主題：${current}，點選切換為${next}`,

  top: {
    connectWallet: '連接錢包',
    myWallet: '我的錢包',
    walletTitle: (account: string) => `我的錢包 · 帳戶 ${account}`,
    pending: (n: number) => `${n} 筆操作等待收錄`,
    closeSearch: '關閉搜尋',
    simTitle: '開啟 regtest 主控台與資料來源設定',
    simLabel: (chainId: string) => `網路 devnet，chain_id ${chainId}，瀏覽器內模擬器；開啟 regtest 主控台`,
    sim: '模擬器',
    node: '節點',
    nodeTitle: (url: string, state: string) => `節點 ${url}：${state}`,
    nodeLabel: (chain: string, state: string) => `網路 ${chain}，節點資料來源，${state}；開啟資料來源設定`,
  },

  strip: {
    label: '鏈狀態',
    disconnected: '節點連線中斷',
    disconnectedSince: (ago: string) => `節點連線中斷 · 資料停在 ${ago}`,
    backlogFull: '結算積壓已達上限，快速路徑暫停',
    fast: '快軌',
    settled: '已結算',
    btcTipHint: '節點不提供 BTC 鏈頂，依已知資料推算',
    btcTipRead: '每 30 秒從比特幣 RPC 讀取一次，其間隨節點的新區塊推進',
    backlog: (waited: number, limit: number) => `結算積壓 ${waited}/${limit}`,
    backlogHint: '最早一個區塊的資料，等待算作上鏈已經過的 BTC 區塊數；下一個區塊的錨定到達資料所在的 BTC 區塊時，才算上鏈',
    settleFee: '結算費率',
    settleFeeHint: '節點為結算交易出資的費率，不是 BTC 市場費率',
    fee: '費率',
    feeHint: 'BTC 估計費率',
    minFee: (rate: string) => `入塊門檻 ${rate}`,
    noIndexer: '未接索引器',
    indexer: { ok: '索引器一致', mismatch: '索引器不一致', halted: '索引器已停止', none: '索引器尚未核對', unreachable: '索引器連不上', stalled: '索引器卡在' },
    mempool: '條目池',
    pendingHint: '只顯示本頁提交、尚未收錄的操作',
    sourceNode: (host: string) => `資料來源：節點 ${host}`,
    sourceSim: '資料來源：瀏覽器內模擬器',
  },

  toast: {
    close: '關閉提示',
    what: (verb: string, amount: string, symbol: string) => `${verb} ${amount}\u00a0${symbol}`,
    failed: '操作執行失敗',
    dropped: '操作已被移出條目池',
    skipped: '操作在平行塊裡被跳過',
    received: (amount: string, symbol: string) => `收到 ${amount}\u00a0${symbol}`,
    large: '達到大額門檻，建議等 BTC 最終再視為入帳',
    deepNext: '接下來是 BTC 最終',
    finalTakenBack: 'BTC 最終被收回',
    finalTakenBackBody: '節點不再把它回報為 BTC 最終，要重新等 BTC 最終',
    from: (name: string) => `來自${latinGap(name, 'before')}`,
  },

  update: {
    title: '頁面有新版本',
    body: '重新整理頁面即可使用',
    language: (name: string) => `重新整理頁面即可使用，並切換到${latinGap(name, 'before')}`,
    reload: '重新整理',
    missed: (name: string) => `未能載入${latinGap(name, 'before')}`,
    missedBody: '伺服器沒有回應，請檢查網路後再試一次',
  },

  /** The node's network started over from another genesis block while the page was open (app/store.ts, `readAnew`) */
  startedOver: {
    title: '網路已從新的創世區塊重新開始',
    body: '頁面已重新讀取節點的鏈，之前的區塊、操作和餘額都不在這條鏈上',
  },

  console: {
    sim: 'regtest 主控台',
    rpc: '資料來源與節點',
    loaded: (n: number) => `已載入最近 ${n} 個主鏈塊，更早的區塊開啟時再查詢`,
    disconnect: '中斷錢包連線',
    disconnectDemo: '中斷示範錢包連線',
    events: '最近事件',
    needWallet: '連接錢包後可以使用審查情境',
  },

  scenario: {
    mine: {
      title: (seconds: number) => `比特幣出塊 · 平均 ${seconds} 秒一個區塊`,
      hint: '連續挖礦可能短暫觸發積壓上限',
      button: (n: number) => `挖 ${n} 個區塊`,
    },
    fee: {
      title: 'BTC 費率暴漲',
      hint: '結算交易會卡在 BTC 記憶池，積壓滿後快速路徑暫停',
      toggle: '費率暴漲',
      cpfp: '用 P2A 錨點做 CPFP',
      cpfpCount: (n: number) => `用 P2A 錨點做 CPFP（${n}）`,
      cpfpDone: (n: number) => `已加速 ${n} 筆交易，下一個 BTC 區塊確認`,
      backlog: (waited: number, limit: number) => `積壓 ${waited} / ${limit} 個 BTC 區塊`,
      paused: '快速路徑已暫停',
    },
    censor: {
      title: '出塊者審查我的帳戶',
      hint: '出塊者不再收錄你的快速路徑操作',
      toggle: '審查我的帳戶',
    },
    offline: {
      title: '出塊者離線',
      hint: (name: string) => `${name} 停止出塊，它的結算由其他節點代為廣播`,
      toggle: (name: string) => `${name} 離線`,
    },
  },

  footer: {
    tagline: '在 Ksana 上瞬間確認，最終永久寫進比特幣。',
    fromSim: '資料來自瀏覽器內模擬器，重新整理頁面會產生新的鏈',
    fromNode: (url: string) => `資料來自節點 ${url}`,
    build: '建置',
    buildHint: '建置時的 git 提交號；核對方法見 README.md「Verify this page」',
  },

  connecting: {
    eyebrow: '連線中',
    title: '正在連接節點…',
    failedEyebrow: '連線失敗',
    failedTitle: '連不上節點',
    wrongNetworkTitle: '節點在另一個網路上',
    detail: (message: string) => `錯誤詳情：${message}`,
    retrying: '本頁每 2.5 秒重試一次，節點一回應就自動開啟。',
    settings: '資料來源設定',
    useSim: '改用瀏覽器內模擬器',
    switchTo: (chain: string) => `切換到 ${chain}`,
  },
  linkSource: {
    eyebrow: '資料來源',
    title: '改從這個連結指定的節點讀取？',
    body: '這個連結要求本頁改從下面這些網址讀取資料，而不是平常讀取的節點。之後本頁顯示的一切（餘額、操作、確認進度）都將來自它們，錢包簽名的內容也會傳給它們。只有在你自己執行它們、或信任執行者時才這樣做。',
    node: '節點',
    indexer: '索引器',
    btc: '比特幣 RPC',
    network: '網路',
    note: '兩種選擇都不會儲存，只在目前的分頁有效。',
    keep: '繼續用平常的節點',
    follow: '改從這個節點讀取',
  },
  /** A node an earlier version of the page saved, perhaps from a link (store.ts, `savedSource`): asked about once */
  savedSource: {
    eyebrow: '資料來源',
    title: '繼續從以前儲存的節點讀取？',
    body: '本頁的舊版本把下面這些網址儲存成了資料來源。舊版本會像儲存在資料來源面板裡的選擇一樣，儲存連結指定的節點，所以它們可能來自你開過的某個連結。本頁顯示的一切（餘額、操作、確認進度）都將來自它們，錢包簽名的內容也會傳給它們。只有它們是你自己選的才繼續使用。',
    node: '節點',
    indexer: '索引器',
    btc: '比特幣 RPC',
    network: '網路',
    note: '只問這一次；之後隨時可以在資料來源面板裡變更。',
    keep: '改用本頁的節點',
    follow: '繼續從它讀取',
  },
};

export default shell;
