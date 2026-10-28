import { languageMissed } from '../app/update';
import { LOCALES, setLocale, useLocale, useT, type Locale } from '../i18n';
import { IconGlobe } from './icons';

/** A language that does not load is said: in a page left open while a newer version was published, with the reload that brings it (app/update.ts) */
async function choose(next: Locale) {
  if (!(await setLocale(next))) await languageMissed(LOCALES.find((l) => l.code === next)?.name ?? next);
}

/**
 * UI language. Uses a native select: on phones it opens the system picker, and it works with screen readers and the keyboard.
 * Hidden when only one language is available.
 */
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  if (LOCALES.length < 2) return null;
  const select = (
    <select className="lang-select-input" value={locale} onChange={(e) => void choose(e.target.value as Locale)} aria-label={t.common.language}>
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code} lang={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
  if (compact) {
    return (
      <label className="lang-select lang-select--compact icon-btn" title={t.common.language}>
        <IconGlobe />
        <span className="lang-select-code" aria-hidden="true">
          {LOCALES.find((l) => l.code === locale)?.short ?? locale}
        </span>
        {select}
      </label>
    );
  }
  return (
    <label className="lang-select">
      <IconGlobe size={14} />
      {select}
    </label>
  );
}
