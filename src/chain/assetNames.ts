import { COIN_NAMES } from '../i18n/coins';
import { CONFUSABLE } from './confusables';

/**
 * Names of contracts' assets as the page shows them. Anyone can issue an asset under any name (the review of M33, §3), so a name
 * is shown without what would hide or reorder text, and a name that reads as a native coin's, KSA's or bitcoin's, is never taken for
 * the asset's symbol, whatever its case, its width, the invisible characters in it or the look-alike letters it is written with.
 */

/** The native coins a contract's asset may pass itself off as: Ksana's own KSA, and bitcoin */
export type Native = 'KSA' | 'BTC';

/** Their names, in capital letters without spaces or punctuation */
const NATIVE_NAMES: readonly (readonly [Native, readonly string[]])[] = [
  ['KSA', ['KSA', 'KSANA']],
  ['BTC', ['BTC', 'XBT', 'BITCOIN', 'SAT', 'SATS', 'SATOSHI', 'SATOSHIS']],
];

/**
 * Characters drawn like the Latin capitals of those names that Unicode's confusables data and character names (`CONFUSABLE`) do not
 * read so, once upper-cased: small capitals, the Coptic ALFA, the Greek LAMDA, the Latin kra, the Canadian syllabics TA, the digits
 * 0, 1, 5 and 8, and the dollar sign and the vertical bar. The Greek lunate sigma, drawn like a C, is read so before the decomposition,
 * which makes it a sigma
 */
const LOOKALIKE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries({
    A: '\u1d00\u2c80\u039b',
    B: '\u0299' + '8',
    C: '\u1455',
    I: '1|',
    K: '\u1d0b\u0138',
    N: '\u0274',
    O: '0',
    S: '5$',
    T: '\u1d1b',
  }).flatMap(([latin, like]) => Array.from(like, (c) => [c, latin])),
);

/** Letters in a box the decomposition leaves alone: negative circled and negative squared, and the regional indicators of flags */
const BOXED: readonly (readonly [number, number])[] = [
  [0x1f150, 0x1f169],
  [0x1f170, 0x1f189],
  [0x1f1e6, 0x1f1ff],
];

/** A character as the Latin capital or digit it is drawn like, if any */
function latinOf(c: string): string | undefined {
  const cp = c.codePointAt(0) ?? 0;
  const box = BOXED.find(([first, last]) => cp >= first && cp <= last);
  return CONFUSABLE.get(c) ?? LOOKALIKE[c] ?? (box ? String.fromCharCode(65 + cp - box[0]) : undefined);
}

/**
 * A name folded for comparison: compatibility decomposition (full-width letters, the Kelvin sign, circled and mathematical letters become
 * their Latin letters, half-width kana full-width ones), without accents or invisible characters, hiragana as katakana, in capitals, with
 * look-alike letters read as the Latin ones (before and after the upper-casing, which turns a small letter into the capital the data
 * knows) and a lower-case L as a capital I
 */
function fold(name: string): string {
  const read = (c: string) => latinOf(c) ?? c;
  const bare = name
    .replace(/[\u03f2\u03f9]/g, 'C')
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  return Array.from(Array.from(bare, read).join('').replace(/l/g, 'I').toUpperCase(), read).join('');
}

/** Bitcoin and its unit as the page's languages call them (`src/i18n/coins.ts`), folded as a name is, without spaces or punctuation */
let coinWords: ReadonlySet<string> | undefined;
const lettersOf = (folded: string) => folded.replace(/[^\p{L}\p{N}]/gu, '');

/**
 * The native coin a name reads as, if any: compared once folded, without spaces or punctuation, and without the letters of other scripts
 * that look like no Latin one. So "ksa" in full-width letters, "K.S.A", "k", a zero-width space and "sa", and KSA in Cyrillic or Coptic
 * letters read as KSA, and "Bitcoin", the Bitcoin sign and the baht sign that stood in for it, and bitcoin as the page's languages call it
 * read as bitcoin; "KSA2", "sKSA" and "KSA LP" are names of their own
 */
export function nativeLookalike(name: string): Native | undefined {
  if (/[\u20bf\u0e3f]/.test(name)) return 'BTC';
  const folded = fold(name);
  const latin = folded.replace(/[^A-Z0-9]/g, '');
  const native = NATIVE_NAMES.find(([, names]) => names.includes(latin))?.[0];
  if (native) return native;
  coinWords ??= new Set(COIN_NAMES.flatMap(({ bitcoin, sats }) => [bitcoin, sats]).map((word) => lettersOf(fold(word))));
  return coinWords.has(lettersOf(folded)) ? 'BTC' : undefined;
}

/**
 * A name as the page shows it: control characters as spaces, and without the invisible format characters (direction overrides and
 * isolates, which draw the text after them in another order, and zero-width spaces) but the joiners that emoji and some scripts
 * need; runs of white space as one space
 */
export function cleanAssetName(name: string): string {
  return name
    .replace(/\p{Cc}/gu, ' ')
    .replace(/(?![\u200c\u200d])\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
