import type { Messages } from '..';
import { latinGap } from '../spacing';
import coins from './coins';

/** Traditional Chinese (Taiwan): wallet home and connect page, plus wallet/connect.ts */
const wallet: Messages['wallet'] = {
  title: '錢包',
  address: '地址',
  copyAddress: '複製地址',
  accountHex: '帳戶（十六進位）',
  copyAccountHex: '複製十六進位帳戶',

  connect: {
    title: '連接錢包',
    noCustody: 'Ksana 只請求簽名，不託管你的資產。',
    points: {
      key: '帳戶就是你的 Taproot 地址',
      topup: '沒有 KSA 時，可以用 BTC 充值',
      pathC: '出塊者都拒絕時，路徑 C 仍然有效',
    },
    /** The line under each point; n is the BTC confirmations after which Ksana blocks must include a Path C operation */
    pointNotes: {
      key: '由你現在用的比特幣錢包簽名，不需要新的私鑰或助記詞；同一個地址既收 KSA，也收 BTC。',
      topup: '賣方先為你鎖定 KSA；付給賣方的那筆比特幣交易，同時就領取了這些 KSA。',
      pathC: (n: number) => `路徑 C 的操作放在你自己發出的比特幣交易裡；${n}\u00a0個 BTC 確認後，Ksana 的區塊必須收錄它。`,
    },
    go: '連接',
    waiting: '等待錢包…',
    demoName: '本機開發金鑰',
    demoNote: '創世區塊預先分配的測試帳戶',
    demoConnected: '已連接示範帳戶',
    needsNode: '連接節點後可用',
    switchSource: '切換資料來源',
    lastUsed: '上次使用',
    localOnly: '僅限本機 regtest',
    notDetected: '未偵測到擴充功能',
    notDetectedTouch: '未偵測到',
    install: '安裝擴充功能後重新整理本頁。',
    openInApp: {
      unisat: '在 Unisat 或 OneKey App 內的瀏覽器中開啟本頁。',
      xverse: '在 Xverse App 內的瀏覽器中開啟本頁。',
    },
    failed: (name: string) => `沒有連上${latinGap(name, 'before')}`,
    network: (net: string, prefix: string) => `錢包要切換到 ${net}：地址以 ${prefix} 開頭。`,
    mockHint: '本機 regtest 可用測試私鑰錢包：',
    mockParam: '?wallet=mock&key=<私鑰>',
    mockIcon: '測',
    mockName: '測試私鑰錢包',
    unisatNote: 'Taproot（P2TR）帳戶',
    xverseNote: '使用 Ordinals 地址（P2TR）',
    mockNote: '私鑰來自網址列，只留在本頁記憶體中。',
    xverseMessage: '連接 Ksana 錢包',
    noMockKey: '網址列裡沒有測試私鑰',
    keyRefusedTitle: '連結裡的私鑰沒有使用',
    keyRefused: '測試私鑰錢包僅限本機 regtest。本頁已把私鑰從網址列移除，但連結裡的私鑰也會傳到提供本頁的伺服器：別把它用在任何有資產的帳戶上。',
    wrongNetwork: (addr: string, net: string) => `錢包地址 ${addr}… 不是 ${net} 地址，請在錢包裡切換比特幣網路。`,
    wrongChain: (wallet: string, chain: string, net: string) =>
      `${latinGap(wallet).trimStart()}現在設在 ${chain} 上，而本頁的網路跑在 BTC ${net} 上，請在錢包裡把比特幣網路切換到 ${net}。`,
    notTaproot: '錢包目前的帳戶不是 Taproot 地址，請在錢包裡切換到 Taproot 帳戶。',
    notBip86: '錢包的 Taproot 地址不是其金鑰的標準地址（BIP86），請在錢包裡換一個 Taproot 帳戶。',
    switched: (wallet: string) => `${latinGap(wallet).trimStart()}切換了帳戶`,
    switchedTo: (addr: string) => `本頁現在顯示 ${addr}。`,
    left: (wallet: string) => `已斷開${latinGap(wallet, 'before')}`,
    signSwitched: (wallet: string) => `未簽署：${latinGap(wallet).trimStart()}現在用的帳戶不是本頁顯示的那個。請核對後再簽署。`,
    signSwitchedLeft: (wallet: string) => `未簽署：${latinGap(wallet).trimStart()}現在用的帳戶不是本頁顯示的那個。要用那個帳戶，請重新連接。`,
  },

  home: {
    eyebrowDemo: '錢包 · 示範帳戶',
    eyebrow: (name: string) => `錢包 · ${name}`,
    title: '我的錢包',
    viewInExplorer: '在區塊瀏覽器查看',
    send: '發送',
    showBalances: '顯示餘額',
    hideBalances: '隱藏餘額',
  },

  alert: {
    backlogTitle: '結算積壓已達上限，快速路徑暫停',
    backlog: (rate: string) => `已生效的餘額不變；急用可改走路徑 C，礦工費依目前的 ${rate}\u00a0sat/vB。`,
    censoredTitle: '出塊者沒有收錄你的快速路徑操作（示範情境）',
    censored: '出塊者可以不收錄；改走路徑 C 不需要出塊者。',
  },

  balances: {
    ksa: '快軌 · KSA',
    btc: (net: string) => `${coins.bitcoin} · ${net}`,
    loading: (at: string, final: string) => `正在補取區塊（已到 #${at}，最終邊界 #${final}）；BTC 最終餘額暫不完整。`,
    finalShort: '最終',
    utxoCount: (n: number) => `${n} 個 UTXO`,
    btcInWallet: (name: string) => `在${latinGap(name)}裡查看 BTC 餘額。`,
    empty: '還沒有 KSA：用 BTC 充值，或請別人轉到你的地址。',
    noIndexerNote: '此時「BTC 最終」只是節點的說法',
    tokens: '代幣',
    btcUnconfirmed: (amount: string) => `其中 ${amount}\u00a0聰未確認`,
    btcReading: '正在讀取 BTC 餘額…',
    ksaReading: '正在讀取 KSA 餘額…',
    btcFailed: '暫時讀不到 BTC 餘額',
    btcStale: '暫時讀不到最新的 BTC 餘額',
    btcRefresh: '重新整理 BTC 餘額',
    emptyFaucet: '還沒有 KSA：先領一些測試 KSA，或用 BTC 充值。',
  },

  split: {
    allFinal: '餘額已全部 BTC 最終',
    finalBalance: 'BTC 最終餘額',
    inflow: '轉入，尚未最終',
    outflow: '轉出與費用，尚未最終',
    total: '目前餘額（立即可用）',
    unreadAll: '未必已全部 BTC 最終：一筆尚未最終的合約呼叫可能也向這裡付了款，頁面讀不出金額。',
    unreadMore: '一筆尚未最終的合約呼叫可能也向這裡付了款，頁面讀不出金額；那樣的話 BTC 最終餘額更低。',
  },

  inflight: {
    title: '進行中',
    eyebrow: (n: number) => `尚未 BTC 最終 · ${n}`,
    failed: '執行失敗',
    resend: '改走路徑 C',
    skipped: '被跳過，等待重新收錄',
    stuck: '卡住，見詳情',
    eta: (eta: string) => `${eta}後最終`,
    waitInclusion: '等待收錄',
    waitSettlement: '等待結算',
  },

  activity: {
    title: '活動',
    filter: '篩選',
    out: '發出',
    in: '收到',
    empty: '沒有紀錄',
  },

  utxos: {
    title: 'BTC 輸出',
    output: '輸出',
    change: '結算找零',
    showSpent: '顯示已花費',
    empty: '沒有 BTC 輸出',
    emptyHint: (section: string) => `去「${section}」領一些 regtest BTC。`,
    state: {
      available: '可用',
      unconfirmed: '未確認',
      spent: '已花費',
    },
  },

  info: {
    address: '地址',
    signing: '簽署方式',
    signingValue: 'BIP322 simple',
    disconnect: '中斷錢包連線',
  },

  settings: {
    title: '入帳確認',
    threshold: '大額門檻',
    save: '儲存',
    saved: '已儲存',
    hint: '低於門檻的入帳，快軌確認即可；達到門檻的，提醒你等到 BTC 最終。',
  },

  native: {
    noUtxo: '沒有可用的 BTC 輸出',
    unconfirmed: '你的 BTC 輸出尚未確認：請等它們進入 BTC 區塊後再試',
    feeRateTooHigh: (rate: string, cap: string) => `費率 ${rate}\u00a0sat/vB 超過本頁的上限 ${cap}\u00a0sat/vB，什麼都沒有簽署；請用更低的費率`,
  },

  faucet: {
    title: '測試資產',
    hint: (s: number) => `KSA 約 ${s} 秒入帳，BTC 要等下一個 BTC 區塊。`,
    claim: '領取 5,000\u00a0KSA 與 0.1\u00a0BTC',
    requested: '已向水龍頭申請',
    claimHosted: '領取測試 KSA',
    claimed: '已申請，等待入帳',
    console: 'regtest 主控台',
  },

  playground: {
    title: '合約 Playground',
    body: '在瀏覽器裡修改、編譯、部署智慧合約。代幣、NFT、AMM、借貸、多簽錢包和鎖倉釋放，每個範例都有自己的介面，跑在公共 signet 上。',
    open: '開啟 Playground',
  },
};

export default wallet;
