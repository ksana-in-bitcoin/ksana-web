import type { Messages } from '..';

/** Search results and "not found" pages (pages/SearchPage.tsx, pages/NotFound.tsx) */
const search: Messages['search'] = {
  results: (q: string) => `Results for “${q}”`,
  none: (q: string) => `No results for “${q}”`,
  count: (n: number) => `${n} ${n === 1 ? 'result' : 'results'}`,
  howTo: 'Try searching for:',

  /** Search tips: bold category + separator + description */
  tipSep: ': ',
  tips: {
    height: { label: 'Ksana blocks', text: 'Height, like 128 or #128; parallel blocks at that height are listed too' },
    hash: { label: 'Block hash, op_id, BTC txid', text: '64 hex characters; type the first 4 for suggestions' },
    /** prefix is the network's Taproot address prefix, such as tb1p */
    account: { label: 'Accounts', text: (prefix: string) => `Taproot address (${prefix}…) or 64 hex characters` },
    name: { label: 'Names', text: 'Producers (devnet-1), contracts (AMM), faucet' },
  },

  /** Why a search found nothing, where the query says it (chain/views.ts `searchMiss`) */
  miss: {
    /** tip is the Ksana chain's tip height the page knows, formatted: the page's view, which may trail the chain */
    aboveTip: (tip: string) => `As far as this page knows, no Ksana block is at this height yet: the chain’s tip is #${tip}.`,
    /** Past Bitcoin's tip too: btcTip is the BTC tip height the page knows, formatted */
    aboveTips: (tip: string, btcTip: string) => `As far as this page knows, no block of either chain is at this height yet: Ksana’s tip is #${tip}, and Bitcoin’s #${btcTip}.`,
    /** A Bitcoin address of the page's network that is not a Taproot one; prefix is how a Taproot address starts there (tb1p) */
    notTaproot: (prefix: string) =>
      `This is a Bitcoin address, but not a Taproot one, so it isn’t a Ksana account: an account is a Taproot address, starting with ${prefix}. To use a wallet here, switch it to its Taproot account.`,
    /** A Taproot address of the page's network whose program is no valid x-only key, which no account's is */
    noKey: 'This Taproot address can’t be a Ksana account: no key stands behind it, so no one can sign for it.',
    /** nets: the Bitcoin networks the address is for, joined by `or` (mainnet; testnet or signet); net: the one this page's network runs on */
    otherNetwork: (nets: string, net: string, prefix: string) =>
      `This is a Bitcoin ${nets} address, but this page’s network runs on BTC ${net}: its accounts are Taproot addresses starting with ${prefix}.`,
    /** The link to the address on a public Bitcoin explorer; site is its name (mempool.space/signet) */
    viewAddress: (site: string) => `View this address on ${site}`,
    /** Two Bitcoin networks joined, the last two of a list whose others are joined by `comma` (chain/views.ts `networksText`) */
    or: (a: string, b: string) => `${a} or ${b}`,
    comma: ', ',
  },

  notFound: {
    eyebrow: 'Not found',
    /**
     * what is the thing looked for (block, account…). It can also be a capitalized label such as
     * common.contract ("Contract"), so a leading capital is lowered unless it starts an acronym ("BTC block").
     */
    title: (what: string) => `No such ${/^[A-Z][a-z]/.test(what) ? what.toLowerCase() : what}`,
    page: 'page',
    badPath: 'The URL may be mistyped, or the page has moved.',
    /** An op page whose ID is not 64 hex digits: not asked of the node */
    badOpId: 'An operation ID (op_id) is 64 hex digits; this is not one.',
    /** An account's page for neither an account's Taproot address nor 64 hex digits: not asked of the node; prefix is how a Taproot address starts (tb1p) */
    badAccount: (prefix: string) => `An account is a Taproot address, starting with ${prefix}, or 64 hex digits; this is neither.`,
    /** A block's page for a height above the chain's tip; tip is the tip's height, formatted */
    ahead: (tip: string) => `This height is above the chain’s tip, #${tip}: the block has not been produced yet.`,
    sim: 'Reloading the page regenerates the simulated chain, so hashes in old links no longer work.',
    home: 'Back to overview',
  },
};

export default search;
