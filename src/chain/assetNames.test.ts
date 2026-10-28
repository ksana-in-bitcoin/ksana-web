import { describe, expect, it } from 'vitest';
import { COIN_NAMES } from '../i18n/coins';
import { cleanAssetName, nativeLookalike } from './assetNames';

describe("a contract's asset named like a native coin (the review of M33)", () => {
  it('reads as KSA whatever its case, width, invisible characters, punctuation or accents', () => {
    for (const name of [
      'KSA',
      'ksa',
      'Ksana',
      ' K S A ',
      'K.S.A',
      'K-S-A',
      // full-width letters, a zero-width space, a word joiner, a soft hyphen, a direction override
      '\u{ff2b}\u{ff33}\u{ff21}',
      'K\u{200b}SA',
      'K\u{2060}S\u{ad}A',
      '\u{202e}KSA',
      // accents, the Kelvin sign, circled and bold mathematical letters
      'K\u{301}S\u{308}A',
      '\u{212a}SA',
      '\u{24c0}\u{24c8}\u{24b6}',
      '\u{1d40a}\u{1d412}\u{1d400}',
      // the audit of M36: a zero-width non-joiner and joiner, a no-break and an ideographic space, Hangul fillers, a braille blank, a
      // variation selector, a tag character; parenthesized, squared and modifier letters
      'K\u{200c}S\u{200d}A',
      'K\u{a0}S\u{3000}A',
      'KSA\u{3164}\u{3164}',
      'K\u{2800}SA',
      'KSA\u{fe0f}',
      'K\u{e0041}SA',
      '\u{24a6}\u{24ae}\u{249c}',
      '\u{1f13a}\u{1f142}\u{1f130}',
      '\u{1d37}\u{2e2}\u{1d2c}',
    ])
      expect(nativeLookalike(name), name).toBe('KSA');
  });

  it('reads look-alike letters as the Latin ones: Cyrillic, Greek, Cherokee, small capitals, digits', () => {
    // Cyrillic KA, DZE and A; Greek KAPPA, Cyrillic DZE, Greek ALPHA; small capitals; Cherokee; lower-case Cyrillic
    for (const name of ['\u{41a}\u{405}\u{410}', '\u{39a}\u{405}\u{391}', '\u{1d0b}\u{a731}\u{1d00}', '\u{13e6}\u{13da}\u{13aa}', '\u{43a}\u{455}\u{430}', 'K5A', 'K$A'])
      expect(nativeLookalike(name), name).toBe('KSA');
    // Cyrillic VE, TE, ES; the Greek lunate sigma; digits and a lower-case L for the I and the O of bitcoin
    for (const name of ['\u{412}\u{422}\u{421}', 'BT\u{3f9}', 'bt\u{3f2}', '8TC', 'B1TC0IN', 'bltcoin', 'XBT', 'sats', 'Satoshi'])
      expect(nativeLookalike(name), name).toBe('BTC');
  });

  it("reads the letters Unicode's confusables data draws like Latin ones, and those it reads otherwise (the audit of M36)", () => {
    // Coptic KAPA; Cyrillic KA with descender; Latin K with hook; Armenian TIWN; Canadian syllabics for A; Coptic ALFA; Latin kra; Greek
    // LAMDA; a small Coptic kapa, which the upper-casing makes the capital the data reads as K
    for (const name of ['\u{2c94}SA', '\u{49a}SA', '\u{198}SA', 'K\u{54f}A', 'KS\u{15c5}', 'KS\u{2c80}', '\u{138}SA', 'KS\u{39b}', '\u{2c95}sa'])
      expect(nativeLookalike(name), name).toBe('KSA');
    // the Coptic SIMA is drawn like a C, as the Greek lunate sigma is: KAPA, SIMA and ALFA read as KCA
    expect(nativeLookalike('\u{2c94}\u{2ca4}\u{2c80}')).toBeUndefined();
    // Coptic TAU; Coptic VIDA, TAU and SIMA; Canadian syllabics for B and for C; Latin T and B with stroke; the down tack
    for (const name of ['B\u{2ca6}C', '\u{2c82}\u{2ca6}\u{2ca4}', '\u{15f7}TC', 'BT\u{1455}', 'B\u{166}C', '\u{243}TC', 'B\u{22a4}C'])
      expect(nativeLookalike(name), name).toBe('BTC');
  });

  it('reads a letter Unicode names as another with a stroke, a bar, a hook or another mark as that letter (the audit of M36, again)', () => {
    // K with diagonal stroke, with stroke and diagonal stroke, with oblique stroke; S with oblique stroke, with swash tail, with short
    // stroke overlay; A with stroke; Cyrillic KA with vertical stroke and with hook; a small S with oblique stroke
    for (const name of ['\u{a742}SA', '\u{a744}SA', '\u{a7a2}SA', 'K\u{a7a8}A', 'K\u{2c7e}A', 'K\u{a7c9}A', 'KS\u{23a}', '\u{49c}SA', '\u{4c3}SA', 'k\u{a7a9}a'])
      expect(nativeLookalike(name), name).toBe('KSA');
    // B with flourish; C with stroke, with bar, with palatal hook
    for (const name of ['\u{a796}TC', 'BT\u{23b}', 'BT\u{a792}', 'BT\u{a7c4}']) expect(nativeLookalike(name), name).toBe('BTC');
  });

  it('reads letters in boxes: negative squared and circled, and the regional indicators of flags', () => {
    for (const name of ['\u{1f17a}\u{1f182}\u{1f170}', '\u{1f15a}\u{1f162}\u{1f150}', '\u{1f1f0}\u{1f1f8}\u{1f1e6}'])
      expect(nativeLookalike(name), name).toBe('KSA');
  });

  it('reads the Bitcoin sign, and the baht sign that stood in for it, as bitcoin wherever they stand', () => {
    expect(nativeLookalike('\u{20bf}')).toBe('BTC');
    expect(nativeLookalike('Super \u{20bf} coin')).toBe('BTC');
    expect(nativeLookalike('\u{e3f}')).toBe('BTC');
    expect(nativeLookalike('\u{e3f}TC')).toBe('BTC');
  });

  it("reads bitcoin and its unit as the page's languages call them, set apart or with invisible characters, as bitcoin", () => {
    expect(COIN_NAMES).toHaveLength(6);
    for (const { bitcoin, sats } of COIN_NAMES)
      for (const word of [bitcoin, sats]) {
        expect(nativeLookalike(word), word).toBe('BTC');
        expect(nativeLookalike(` ${Array.from(word).join('\u{200b} ')} `), word).toBe('BTC');
        expect(nativeLookalike(`${word} LP`), word).toBeUndefined();
      }
    // bitcoin in hiragana, where the Japanese pack writes it in katakana
    const katakana = COIN_NAMES.map((w) => w.bitcoin).find((w) => /[\u{30a1}-\u{30f6}]/u.test(w)) ?? '';
    const hiragana = katakana.replace(/[\u{30a1}-\u{30f6}]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    expect(hiragana).not.toBe(katakana);
    expect(nativeLookalike(hiragana)).toBe('BTC');
    // bitcoin in Russian, which the page does not speak, is a name of its own
    expect(nativeLookalike('\u{411}\u{438}\u{442}\u{43a}\u{43e}\u{438}\u{43d}')).toBeUndefined();
  });

  it('leaves names of their own alone', () => {
    // a name with letters of its own beside look-alike ones: an umlaut, a Polish L with stroke, a Danish O with stroke; a flag beside a word
    for (const name of ['KSA2', 'sKSA', 'wBTC', 'KSA LP', 'Ksana Wizards', 'Token', 'TKN', 'Wizards', 'BTCB', 'SATOSHI NAKAMOTO', '', '\u{1f9d9}', 'K\u{fc}SA', 'Z\u{142}oty', '\u{d8}re', '\u{1f1fa}\u{1f1f8} Dollar'])
      expect(nativeLookalike(name), name).toBeUndefined();
  });
});

describe("a contract's asset's name as the page shows it", () => {
  it('drops control characters, direction overrides and zero-width spaces, and keeps one space for a run of white space', () => {
    expect(cleanAssetName('  Wizards\n\tGold  ')).toBe('Wizards Gold');
    expect(cleanAssetName('\u{1b}[31mRed')).toBe('[31mRed');
    expect(cleanAssetName('\u{202e}nioc')).toBe('nioc');
    expect(cleanAssetName('a\u{2066}b\u{2069}c\u{200f}')).toBe('abc');
    expect(cleanAssetName('K\u{200b}S\u{feff}A')).toBe('KSA');
  });

  it('keeps the joiners an emoji needs, and the text of every script', () => {
    const family = '\u{1f468}\u{200d}\u{1f469}\u{200d}\u{1f467}';
    expect(cleanAssetName(family)).toBe(family);
    expect(cleanAssetName('Gr\u{fc}n \u{f1}and\u{fa} \u{1e47}')).toBe('Gr\u{fc}n \u{f1}and\u{fa} \u{1e47}');
  });
});
