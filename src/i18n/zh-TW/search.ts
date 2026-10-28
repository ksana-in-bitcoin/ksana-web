import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Traditional Chinese (Taiwan): search results and "not found" pages */
const search: Messages['search'] = {
  results: (q: string) => `「${q}」的結果`,
  none: (q: string) => `找不到「${q}」`,
  count: (n: number) => `${n} 筆`,
  howTo: '可以這樣搜尋：',

  tipSep: '：',
  tips: {
    height: { label: '快軌區塊', text: '高度，如 128 或 #128；同一高度的平行塊一併列出' },
    hash: { label: '區塊雜湊、op_id、BTC txid', text: '64 碼十六進位，輸入前 4 碼即可聯想' },
    /** prefix is the network's Taproot address prefix, such as tb1p */
    account: { label: '帳戶', text: (prefix: string) => `Taproot 地址（${prefix}…）或 64 碼十六進位` },
    name: { label: '名稱', text: '出塊者（devnet-1）、合約（AMM）、水龍頭' },
  },

  miss: {
    aboveTip: (tip: string) => `就本頁所知，這個高度還沒有快軌區塊：鏈頂是 #${tip}。`,
    aboveTips: (tip: string, btcTip: string) => `就本頁所知，兩條鏈在這個高度都還沒有區塊：快軌鏈頂是 #${tip}，BTC 鏈頂是 #${btcTip}。`,
    notTaproot: (prefix: string) =>
      `這是比特幣地址，但不是 Taproot 地址，所以不是 Ksana 帳戶：帳戶是以 ${prefix} 開頭的 Taproot 地址。要在這裡使用錢包，請在錢包裡切換到 Taproot 帳戶。`,
    noKey: '這個 Taproot 地址不可能是 Ksana 帳戶：沒有任何金鑰對應它，誰也無法為它簽名。',
    otherNetwork: (nets: string, net: string, prefix: string) =>
      `這是比特幣 ${nets} 的地址，而本頁的網路跑在 BTC ${net} 上：這個網路的帳戶是以 ${prefix} 開頭的 Taproot 地址。`,
    viewAddress: (site: string) => `在 ${site} 查看這個地址`,
    or: (a: string, b: string) => `${a} 或 ${b}`,
    comma: '、',
  },

  notFound: {
    eyebrow: '找不到',
    title: (what: string) => `沒有這個${latinGap(what, 'before')}`,
    page: '頁面',
    badPath: '網址可能拼錯了，或頁面已經移走。',
    badOpId: '操作 ID（op_id）是 64 位十六進位，這個不是。',
    badAccount: (prefix: string) => `帳戶是以 ${prefix} 開頭的 Taproot 地址或 64 位十六進位，這個兩樣都不是。`,
    ahead: (tip: string) => `這個高度高於鏈頂 #${tip}，還沒有出塊。`,
    sim: '重新整理頁面會產生新的模擬鏈，舊連結裡的雜湊隨之失效。',
    home: '回到概覽',
  },
};

export default search;
