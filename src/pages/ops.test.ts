import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { currentLocale, LOCALES, setLocale, t } from '../i18n';
import { PoolTotal } from './Ops';

describe("The pool's count", () => {
  it('stands under the table while it lists operations, and not under its empty state, in every language', async () => {
    const was = currentLocale();
    for (const { code } of LOCALES) {
      await setLocale(code, false);
      // Under "No pending operations from this page" it read "0 total", which the tab's count says too
      expect(renderToStaticMarkup(createElement(PoolTotal, { n: 0 })), code).toBe('');
      const three = renderToStaticMarkup(createElement(PoolTotal, { n: 3 }));
      expect(three, code).toMatch(/^<p class="small muted">.*<span class="num">3<\/span>.*<\/p>$/);
      expect(three.replace(/<[^>]+>/g, ''), code).toBe(t().ops.mempool.total(3));
    }
    await setLocale(was, false);
  });
});
