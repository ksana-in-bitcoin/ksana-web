/** Search results page and "not found" page (pages/SearchPage.tsx, pages/NotFound.tsx) */
import { latinGap } from '../spacing';

export default {
  results: (q: string) => `「${q}」的结果`,
  none: (q: string) => `没有找到「${q}」`,
  count: (n: number) => `${n} 条`,
  howTo: '可以这样搜索：',

  /** Search tips: bold category + separator + description */
  tipSep: '：',
  tips: {
    height: { label: '快轨区块', text: '高度，如 128 或 #128；同一高度的平行块一并列出' },
    hash: { label: '区块哈希、op_id、BTC txid', text: '64 位十六进制，输入前 4 位即可联想' },
    /** prefix is the network's Taproot address prefix, such as tb1p */
    account: { label: '账户', text: (prefix: string) => `Taproot 地址（${prefix}…）或 64 位十六进制` },
    name: { label: '名字', text: '出块者（devnet-1）、合约（AMM）、水龙头' },
  },

  /** Why a search found nothing, where the query says it (chain/views.ts `searchMiss`) */
  miss: {
    /** tip is the Ksana chain's tip height the page knows, formatted: the page's view, which may trail the chain */
    aboveTip: (tip: string) => `就本页所知，这个高度还没有快轨区块：链顶是 #${tip}。`,
    /** Past Bitcoin's tip too: btcTip is the BTC tip height the page knows, formatted */
    aboveTips: (tip: string, btcTip: string) => `就本页所知，两条链在这个高度都还没有区块：快轨链顶是 #${tip}，BTC 链顶是 #${btcTip}。`,
    /** A Bitcoin address of the page's network that is not a Taproot one; prefix is how a Taproot address starts there (tb1p) */
    notTaproot: (prefix: string) =>
      `这是比特币地址，但不是 Taproot 地址，所以不是 Ksana 账户：账户是以 ${prefix} 开头的 Taproot 地址。要在这里用钱包，请在钱包里切换到 Taproot 账户。`,
    /** A Taproot address of the page's network whose program is no valid x-only key, which no account's is */
    noKey: '这个 Taproot 地址不可能是 Ksana 账户：没有任何密钥对应它，谁也无法为它签名。',
    /** nets: the Bitcoin networks the address is for, joined by `or` (mainnet; testnet or signet); net: the one this page's network runs on */
    otherNetwork: (nets: string, net: string, prefix: string) =>
      `这是比特币 ${nets} 的地址，而本页的网络跑在 BTC ${net} 上：这个网络的账户是以 ${prefix} 开头的 Taproot 地址。`,
    /** The link to the address on a public Bitcoin explorer; site is its name (mempool.space/signet) */
    viewAddress: (site: string) => `在 ${site} 查看这个地址`,
    /** Two Bitcoin networks joined, the last two of a list whose others are joined by `comma` (chain/views.ts `networksText`) */
    or: (a: string, b: string) => `${a} 或 ${b}`,
    comma: '、',
  },

  notFound: {
    eyebrow: '找不到',
    /** what is the thing looked for (block, account, …) */
    title: (what: string) => `没有这个${latinGap(what, 'before')}`,
    page: '页面',
    badPath: '地址可能拼错了，或页面已经移走。',
    /** An op page whose ID is not 64 hex digits: not asked of the node */
    badOpId: '操作 ID（op_id）是 64 位十六进制，这个不是。',
    /** An account's page for neither an account's Taproot address nor 64 hex digits: not asked of the node; prefix is how a Taproot address starts (tb1p) */
    badAccount: (prefix: string) => `账户是以 ${prefix} 开头的 Taproot 地址或 64 位十六进制，这个两样都不是。`,
    /** A block's page for a height above the chain's tip; tip is the tip's height, formatted */
    ahead: (tip: string) => `这个高度高于链顶 #${tip}，还没有出块。`,
    sim: '刷新页面会重新生成模拟链，旧链接里的哈希随之失效。',
    home: '回到概览',
  },
};
