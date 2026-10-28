import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BTC_FINAL_DATA_CONFS } from '../chain/params';
import { currentLocale, LOCALES, setLocale, t } from '../i18n';
import { fmtEta } from '../lib/format';

const markup = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node));

describe('The Verify page: typical time to BTC final', () => {
  it('writes the wait on mainnet as it writes the network one, in minutes up to three hours, each part a phrase (D-114)', async () => {
    const was = currentLocale();
    await setLocale('en', false);
    const v = t().verify.confirm;
    const mainnet = fmtEta(BTC_FINAL_DATA_CONFS * 600_000);
    // On the live signet it read "Mainnet ~110 min; signet currently ~2 h 24 min"
    expect(markup(v.finalTime(mainnet, 'signet', fmtEta(144 * 60_000)))).toBe(
      '<span class="phrase">Mainnet ~110\u00a0min;</span> <span class="phrase">signet currently ~144\u00a0min</span>',
    );
    // No figure for the network while its tip is BTC-final itself, or the page has not read the BTC-final block: it read "~0.0 s"
    expect(markup(v.finalTime(mainnet, 'signet'))).toBe('Mainnet ~110\u00a0min');
    // In every language, the estimates as they are and in two phrases
    for (const { code } of LOCALES) {
      await setLocale(code, false);
      const f = t().format;
      const text = markup(t().verify.confirm.finalTime(fmtEta(BTC_FINAL_DATA_CONFS * 600_000), 'signet', fmtEta(144 * 60_000)));
      expect(text, code).toContain(f.aboutMinutes(110));
      expect(text, code).toContain(f.aboutMinutes(144));
      expect(text.match(/<span class="phrase">/g)?.length, code).toBe(2);
    }
    await setLocale(was, false);
  });
});

describe('The Verify page: the checks this page made', () => {
  // The word each language says "all" with, which one check is not all of; and "the latest", which one mismatch is not the latest of
  const ALL: Record<string, string> = { en: 'all', es: 'todo', ja: '\u3059\u3079\u3066', ko: '\ubaa8\ub450', 'zh-CN': '\u5168\u90e8', 'zh-TW': '\u5168\u90e8' };
  const LATEST: Record<string, string> = { en: 'latest', es: '\u00faltima', ja: '\u6700\u5f8c', ko: '\ub9c8\uc9c0\ub9c9', 'zh-CN': '\u6700\u8fd1\u4e00\u6b21', 'zh-TW': '\u6700\u8fd1\u4e00\u6b21' };

  it('says one check matched, not that all did, and groups a count in thousands, in every language', async () => {
    const was = currentLocale();
    for (const { code } of LOCALES) {
      await setLocale(code, false);
      const f = t().verify.flow;
      // On the live signet, after the page's first check: "1 check on this page, all matching"
      expect(f.okCompared(1), code).not.toContain(ALL[code]);
      expect(f.okCompared(2), code).toContain(ALL[code]);
      expect(f.okCompared(1234), code).toContain('1,234');
      // A mismatch before the recent checks: one is not "the latest" of them, as the English and the Spanish said already
      expect(markup(f.earlier(1, 12, '#120')), code).not.toContain(LATEST[code]);
      expect(markup(f.earlier(2, 12, '#120')), code).toContain(LATEST[code]);
      expect(markup(f.earlier(2, 1234, '#120')), code).toContain('1,234');
    }
    await setLocale(was, false);
  });

  // The word each language says a check with, as the heading of the recent checks does
  const CHECK: Record<string, string> = { en: 'check', es: 'comprob', ja: '\u7167\u5408', ko: '\uac80\uc99d', 'zh-CN': '\u6838\u5bf9', 'zh-TW': '\u6838\u5c0d' };

  it('says a check with the word the heading of the recent checks says it with, in every language', async () => {
    const was = currentLocale();
    for (const { code } of LOCALES) {
      await setLocale(code, false);
      const v = t().verify;
      // The flow had said "compare" in Chinese, Korean and Spanish, beside the heading's "check"
      const flow = [v.flow.none, v.flow.unreachable, v.flow.okRecent, v.flow.okCompared(1), v.flow.okCompared(2)];
      for (const text of [v.checks.title, ...flow, markup(v.flow.earlier(1, 12, '#120')), markup(v.flow.earlier(2, 12, '#120'))]) {
        expect(text.toLowerCase(), code).toContain(CHECK[code]);
      }
    }
    await setLocale(was, false);
  });
});
