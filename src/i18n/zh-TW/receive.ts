import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Traditional Chinese (Taiwan): receive page */
const receive: Messages['receive'] = {
  title: '收款',
  one: '這一個地址同時收 KSA、合約資產與 BTC。',
  card: '收款資訊',
  qr: '地址 QR 碼',
  address: (net: string) => `地址 · Taproot · ${net}`,
  hex: '帳戶（十六進位）· 合約參數用',
  checkEdges: '核對首尾各 8 碼：',
  copyAddress: '複製地址',
  copyHex: '複製十六進位帳戶',
  btcUse: '收到的 BTC 也能付路徑 C 的礦工費。',

  rules: {
    title: '入帳以哪種確認為準',
    below: (amount: string) => `低於 ${amount}\u00a0KSA：快軌確認即可`,
    above: '達到門檻：等到 BTC 最終',
    aboveEta: (net: string, eta: string) => `${net} ${eta}，主網約 110 分鐘`,
    edit: '修改門檻',
  },
  faucet: '從 devnet 水龍頭領取',
  faucetHosted: (net: string) => `從 ${net} 水龍頭領取測試 KSA`,
  faucetFailed: '水龍頭沒有發出 KSA',
  faucetWhy: {
    claimed: (wait: string) => `這個帳戶已經領過測試 KSA，${wait}後可以再領`,
    tooOften: (wait: string) => `這個網路連線的請求太多，請 ${wait}後再試`,
    busy: (wait: string) => `水龍頭正忙，請 ${wait}後再試`,
    today: '這個網路連線今天領取測試 KSA 的次數太多，請稍後再試',
    empty: '水龍頭的測試 KSA 已經發完，請稍後再試',
    down: '水龍頭暫時不能使用，請稍後再試',
    noAnswer: '水龍頭沒有回應，請檢查網路後再試一次',
  },
  back: '回到錢包',

  recent: {
    title: '最近收到',
    empty: '還沒有收到轉帳',
    emptyFaucet: '把地址傳給對方，或從水龍頭領取。',
    emptyShare: '把地址傳給對方。',
    from: (who: string) => `來自${latinGap(who, 'before')}`,
    big: '大額 · 等待 BTC 最終',
    final: '可以視為入帳',
    belowThreshold: '依你的門檻已可視為入帳',
  },
};

export default receive;
