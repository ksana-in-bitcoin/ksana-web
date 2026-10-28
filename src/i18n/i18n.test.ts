import { createElement, Fragment, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LOCALES, detectLocale, lazy, localized, matchLocale, setLocale, t, type Locale } from './index';
import { keepFigures, typeset } from './spacing';
import zhCN from './zh-CN';

/** Flattens the messages into path → text: functions are called with `arg` for each argument, JSX is rendered to text */
function flatten(obj: unknown, path: string[] = [], out = new Map<string, string>(), arg: number = 2): Map<string, string> {
  if (typeof obj === 'string') out.set(path.join('.'), obj);
  else if (typeof obj === 'function') {
    const v = (obj as (...a: unknown[]) => unknown)(...Array.from({ length: obj.length }, () => arg));
    out.set(path.join('.'), typeof v === 'string' ? v : isValidElement(v) || Array.isArray(v) ? renderToStaticMarkup(createElement(Fragment, null, v as never)) : String(v));
  } else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) flatten(v, [...path, k], out, arg);
  return out;
}

/** Kana, Han characters and Hangul */
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

describe('UI language', () => {
  const has = (l: Locale) => LOCALES.some((x) => x.code === l);

  it('the page opens in English whatever the browser’s languages, unless ?lang= or a choice made in the menu says otherwise', () => {
    const saved = new Map<string, string>();
    const at = (search: string) => vi.stubGlobal('window', { location: { search }, localStorage: { getItem: (k: string) => saved.get(k) ?? null } });
    vi.stubGlobal('navigator', { language: 'zh-CN', languages: ['zh-CN', 'zh'] });
    try {
      at('');
      expect(detectLocale()).toBe('en');
      saved.set('ksana:locale', JSON.stringify('zh-CN'));
      expect(detectLocale()).toBe('zh-CN');
      if (has('ja')) {
        at('?lang=ja');
        expect(detectLocale()).toBe('ja');
      }
      saved.clear();
      at('?lang=zh-Hant');
      expect(detectLocale()).toBe(has('zh-TW') ? 'zh-TW' : 'en');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('language tags map to supported locales', () => {
    expect(matchLocale(['zh-CN'])).toBe('zh-CN');
    expect(matchLocale(['zh'])).toBe('zh-CN');
    expect(matchLocale(['zh-SG'])).toBe('zh-CN');
    expect(matchLocale(['fr-FR', 'de'])).toBe(null);
    if (has('zh-TW')) {
      expect(matchLocale(['zh-TW'])).toBe('zh-TW');
      expect(matchLocale(['zh-HK'])).toBe('zh-TW');
      expect(matchLocale(['zh-Hant-MO'])).toBe('zh-TW');
    }
    if (has('en')) expect(matchLocale(['fr', 'en-GB'])).toBe('en');
    if (has('ja')) expect(matchLocale(['ja-JP'])).toBe('ja');
    if (has('ko')) expect(matchLocale(['ko-KR'])).toBe('ko');
    if (has('es')) expect(matchLocale(['es-419'])).toBe('es');
  });

  const source = flatten(zhCN);

  // A count of one is in the singular: every message given 1 for each of its arguments ("after 1 BTC confirmations" read wrong)
  const plurals: Partial<Record<Locale, RegExp>> = {
    en: /(?<![\d.,]|\+\s)1(?:\s|\u00a0)+(?:BTC\s+)?(?:confirmations|outputs|inputs|times|blocks|operations|entries|transactions|seconds|minutes|hours|days|accounts|checks|bodies|headers|parameters|producers)\b/,
    es: /(?<![\d.,]|\+\s)1(?:\s|\u00a0)+(?:confirmaciones|salidas|entradas|veces|bloques|operaciones|transacciones|segundos|minutos|horas|días|cuentas|comprobaciones|cuerpos|cabeceras|parámetros|productores)\b/,
  };
  for (const [code, plural] of Object.entries(plurals)) {
    it(`${code}: a count of one reads in the singular`, async () => {
      await setLocale(code as Locale, false);
      // Not counts: a network's name, and the parameter table's thirty-odd rows
      const exempt = new Set(['verify.params.eyebrow', 'verify.params.count']);
      const wrong = [...flatten(t(), [], new Map(), 1)].filter(([key, text]) => !exempt.has(key) && plural.test(text)).map(([key, text]) => `${key}: ${text}`);
      expect(wrong).toEqual([]);
      await setLocale('zh-CN', false);
    });
  }

  for (const { code } of LOCALES) {
    it(`${code}: messages match Simplified Chinese one to one, none are blank, no CJK text remains in English and Spanish`, async () => {
      await setLocale(code, false);
      const m = flatten(t());
      expect([...m.keys()].sort()).toEqual([...source.keys()].sort());
      for (const [key, text] of m) {
        expect(text.trim(), key).not.toBe('');
        if (code === 'en' || code === 'es') expect(CJK.test(text), `${key}: ${text}`).toBe(false);
      }
    });
  }

  // A figure in the page's words keeps the word after it, which it counts or measures, on its line: on a phone the search page's tips
  // ended a line with "64" before "hex characters", and the Verify page with the "2" of "the 2 after it" and, in Japanese, before its
  // word for blocks
  const SPLIT = /(?<![\p{L}\p{N}_.,\-/#§:])\d+(?:[.,]\d+)* \p{L}/u;
  for (const { code } of LOCALES) {
    it(`${code}: a figure keeps the word after it on its line, in a message's text and in its elements (\`typeset\`)`, async () => {
      await setLocale(code, false);
      for (const arg of [1, 2, 12]) {
        const split = [...flatten(t(), [], new Map(), arg)].filter(([, text]) => SPLIT.test(text.replace(/<[^>]+>/g, '')));
        expect(split.map(([key, text]) => `${key}: ${text}`)).toEqual([]);
      }
      await setLocale('zh-CN', false);
    });
  }

  // Two figures with a mark or the words of a range or a fraction between them keep to one line, as do the parts of a sum ("k + 1"):
  // unjoined, the send page's error could end a line with "from 1 to". A mark is joined as a language loads (`typeset`), the words in
  // each language by hand. Not ranges: a word given as a parameter ("Transferencia de 5 KSA", "Transacción de liquidación de #2,299")
  const APART = [
    /\d(?: (?:[/<>\u2264\u2265=+\u2212\u00d7\u2013~]|to|and|of|a|y|de|\u5230|\u81f3)[ \u00a0]|\u00a0(?:[/<>\u2264\u2265=+\u2212\u00d7\u2013~]|to|and|of|a|y|de|\u5230|\u81f3) )#?\d/u,
    /(?<![\p{L}\p{N}_'’])\p{L}(?: [+\u2212\u00d7][ \u00a0]|\u00a0[+\u2212\u00d7] )\d/u,
  ];
  const notRanges = new Set(['shell.toast.what', 'block.settle.carrierOf']);
  for (const { code } of LOCALES) {
    it(`${code}: a range, a fraction, a comparison or a sum keeps to one line`, async () => {
      await setLocale(code, false);
      for (const arg of [1, 2, 12]) {
        const apart = [...flatten(t(), [], new Map(), arg)].filter(([key, text]) => !notRanges.has(key) && APART.some((re) => re.test(text.replace(/<[^>]+>/g, ''))));
        expect(apart.map(([key, text]) => `${key}: ${text}`)).toEqual([]);
      }
      await setLocale('zh-CN', false);
    });
  }

  // Japanese names a transaction's inputs and outputs by one pair of words, the one its send page and wallet use: the structure's
  // headings paired a katakana word for the inputs with the kanji one for the outputs, and the top-up page named in katakana the coins
  // the send page names in kanji
  it('ja: a transaction’s inputs and outputs are named by one pair of words on every page', async () => {
    await setLocale('ja', false);
    const katakana = [...flatten(t())].filter(([, text]) => /\u30a4\u30f3\u30d7\u30c3\u30c8|\u30a2\u30a6\u30c8\u30d7\u30c3\u30c8/.test(text));
    expect(katakana.map(([key, text]) => `${key}: ${text}`)).toEqual([]);
    expect([t().tx.diagram.inputs, t().tx.diagram.outputs]).toEqual(['\u5165\u529b', '\u51fa\u529b']);
    expect(t().topup.pay.utxo.label).toBe(t().send.native.utxos);
    await setLocale('zh-CN', false);
  });

  it('lookup tables and lazy text follow the current language', async () => {
    const labels = localized(() => t().status.stage);
    const later = lazy((m) => m.status.step.waited, 3);
    await setLocale('zh-CN', false);
    const zh = [labels.fast, later()];
    // As the page sets it (`typeset`): the figure keeps its measure word
    const set = typeset(zhCN);
    expect(zh).toEqual([set.status.stage.fast, set.status.step.waited(3)]);
    const other = LOCALES.find((l) => l.code !== 'zh-CN');
    if (!other) return;
    await setLocale(other.code, false);
    expect([labels.fast, later()]).toEqual([t().status.stage.fast, t().status.step.waited(3)]);
    await setLocale('zh-CN', false);
  });
});

describe('A figure and the word after it', () => {
  it('are joined by a no-break space, the space before the figure left to break, as are two figures and a mark between them', () => {
    expect(keepFigures('Taproot address or 64 hex characters')).toBe('Taproot address or 64\u00a0hex characters');
    expect(keepFigures('Los datos tienen 6 confirmaciones')).toBe('Los datos tienen 6\u00a0confirmaciones');
    expect(keepFigures('\u305d\u306e\u5f8c\u306e 2 \u30d6\u30ed\u30c3\u30af')).toBe('\u305d\u306e\u5f8c\u306e 2\u00a0\u30d6\u30ed\u30c3\u30af');
    expect(keepFigures('every ~2 s, −30 s, 2.5 seconds')).toBe('every ~2\u00a0s, −30\u00a0s, 2.5\u00a0seconds');
    expect(keepFigures('1,000 KSA (2 outputs)')).toBe('1,000\u00a0KSA (2\u00a0outputs)');
    expect(keepFigures('Before them, 2 of the 12 checks')).toBe('Before them, 2\u00a0of the 12\u00a0checks');
    expect(keepFigures('12 / 12 blocks, fee rate 2 < 5 sat/vB')).toBe('12\u00a0/\u00a012\u00a0blocks, fee rate 2\u00a0<\u00a05\u00a0sat/vB');
    expect(keepFigures('#2,297 \u2013 #2,299, 1 + 1 = 2')).toBe('#2,297\u00a0\u2013\u00a0#2,299, 1\u00a0+\u00a01\u00a0=\u00a02');
  });

  it('leave a figure that ends a word or a name or is part of one, one that no word or figure follows, and one already joined', () => {
    // After a letter, a digit, an underscore, a dot, a comma, a hyphen, a slash, a number sign, a section sign or a colon
    const names = ['Argon2id memory', 'BIP340 signatures', 'tx_2 inputs', 'v0.2 rules', 'SHA-256 hash', "m/86'/1'/0'/0/2 key", '#2,299 merged', '§6.9 says', 'at 12:30 UTC'];
    // A separator between two figures is no mark
    for (const text of [...names, 'every 2.5', 'Path 1 · 2', '64\u00a0hex']) expect(keepFigures(text)).toBe(text);
  });

  it('are joined in every message as a language loads, in its text and in its elements, a figure given as a node of its own too', () => {
    const set = typeset({
      tip: '64 hex characters',
      count: (n: number, word: string) => `${n} ${word}`,
      lanes: (secs: number) => createElement(Fragment, null, createElement('span', { className: 'nobr' }, 'Top'), ', a block every ~', secs, ' s'),
      nested: { deep: (n: number) => createElement('span', null, `${n} blocks after it`) },
      inner: (n: number) => createElement('p', null, createElement('b', null, n, ' blocks')),
      gap: (secs: number, sats: bigint) => createElement('span', null, '~', secs, false, null, ' s, ', sats, ' sats'),
      list: (n: number) => [`${n} blocks`, `${n} entries`],
    });
    expect(set.tip).toBe('64\u00a0hex characters');
    expect(set.count(6, 'confirmations')).toBe('6\u00a0confirmations');
    expect(set.count.length).toBe(2);
    expect(renderToStaticMarkup(set.lanes(2))).toBe('<span class="nobr">Top</span>, a block every ~2\u00a0s');
    expect(renderToStaticMarkup(set.nested.deep(12))).toBe('<span>12\u00a0blocks after it</span>');
    // In an element inside another, past what draws nothing, a large figure (bigint) as a figure, and a list a function makes item by item
    expect(renderToStaticMarkup(set.inner(12))).toBe('<p><b>12\u00a0blocks</b></p>');
    expect(renderToStaticMarkup(set.gap(2, BigInt(546)))).toBe('<span>~2\u00a0s, 546\u00a0sats</span>');
    expect(set.list(2)).toEqual(['2\u00a0blocks', '2\u00a0entries']);
  });

  it('leave the text of code and the like, and an element the page gives a message, as they are', () => {
    const Amount = ({ children }: { children?: ReactNode }) => createElement('span', null, children);
    const set = typeset({
      run: (cmd: ReactNode) => createElement(Fragment, null, 'Run ', cmd, ' within 2 blocks'),
      pick: () => createElement('select', null, createElement('option', null, '2 blocks')),
    });
    expect(renderToStaticMarkup(set.run(createElement('code', null, 'getblock 2 true')))).toBe('Run <code>getblock 2 true</code> within 2\u00a0blocks');
    const amount = createElement(Amount, null, 2, ' sats');
    const made = set.run(amount);
    expect(isValidElement<{ children: ReactNode[] }>(made) && made.props.children[1]).toBe(amount);
    expect(renderToStaticMarkup(set.pick())).toBe('<select><option>2 blocks</option></select>');
  });
});
