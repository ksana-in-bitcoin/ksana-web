import en from './en/coins';
import es from './es/coins';
import ja from './ja/coins';
import ko from './ko/coins';
import zhCN from './zh-CN/coins';
import zhTW from './zh-TW/coins';

/**
 * What each of the page's languages calls bitcoin and its smallest unit (`<language>/coins.ts`, which its wallet and amounts name them by),
 * bundled with the app whichever language the page is shown in: a contract's asset named so reads as bitcoin (src/chain/assetNames.ts)
 */
export const COIN_NAMES: readonly { bitcoin: string; sats: string }[] = [en, zhCN, zhTW, ja, ko, es];
