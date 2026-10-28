/**
 * Multilingual UI text (D-071).
 *
 * - Messages are split into namespaces by page (one file each under `zh-CN/`). Simplified Chinese is the source language and its structure is the `Messages` type:
 *   another language with one message missing, one message extra or the wrong parameters fails the type check.
 * - The page opens in English unless `?lang=` or a choice made in the language menu says otherwise (D-115), so English is bundled with the app and the other languages,
 *   Simplified Chinese among them, are loaded on demand. Switching language remounts the whole UI (see main.tsx); the chain and wallet state live outside React and are unaffected.
 * - Components use `useT()`; code outside components, such as view functions and the simulator, uses `t()`; both return the messages of the current language.
 * - Numbers, hashes and timestamps are written the same way in every language (comma thousands separators, decimal point, 24-hour clock), so amounts can be pasted straight into the command line; only words and time units are translated.
 * - A language's messages are set as they load (`typeset` in spacing.ts): a figure keeps the word after it, which it counts or measures, on its line, and two figures
 *   the mark between them ("12 / 12 blocks").
 */

import { useSyncExternalStore } from 'react';
import type zhCN from './zh-CN';
import en from './en';
import enName from './en/name';
import { typeset } from './spacing';
import esName from './es/name';
import jaName from './ja/name';
import koName from './ko/name';
import zhCNName from './zh-CN/name';
import zhTWName from './zh-TW/name';

export type Messages = typeof zhCN;
export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko' | 'es';

/** Languages listed in the UI, each named in its own language (`<locale>/name.ts`); the order is the menu order */
const ALL: readonly { code: Locale; name: string; short: string }[] = [
  { code: 'en', ...enName },
  { code: 'zh-CN', ...zhCNName },
  { code: 'zh-TW', ...zhTWName },
  { code: 'ja', ...jaName },
  { code: 'ko', ...koName },
  { code: 'es', ...esName },
];

const loaders: Partial<Record<Locale, () => Promise<{ default: Messages }>>> = {
  'zh-CN': () => import('./zh-CN'),
  'zh-TW': () => import('./zh-TW'),
  ja: () => import('./ja'),
  ko: () => import('./ko'),
  es: () => import('./es'),
};

export const LOCALES = ALL.filter((l) => l.code === 'en' || loaders[l.code]);

/** The language the page opens in, whatever the browser's (D-115) */
const DEFAULT: Locale = 'en';
const PREF_KEY = 'ksana:locale';

/** English as the page sets it (`typeset`), loaded with the page */
const EN = typeset(en);

let locale: Locale = DEFAULT;
let messages: Messages = EN;
const listeners = new Set<() => void>();

/** Messages of the current language (for code outside components; components use useT, which re-renders on a language switch) */
export function t(): Messages {
  return messages;
}

export function currentLocale(): Locale {
  return locale;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Called after a language switch (before the UI re-renders): the simulator uses it to regenerate the names in the address book */
export function onLocaleChange(fn: () => void): () => void {
  return subscribe(fn);
}

export function useT(): Messages {
  return useSyncExternalStore(subscribe, t, t);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, currentLocale, currentLocale);
}

const available = (l: string): l is Locale => LOCALES.some((x) => x.code === l);

/** Language tags (`?lang=zh`, `?lang=en-GB`) → supported locale; Traditional Chinese (Taiwan, Hong Kong, Macau and Hant) maps to zh-TW, other Chinese to zh-CN */
export function matchLocale(tags: readonly string[]): Locale | null {
  for (const raw of tags) {
    const tag = raw.toLowerCase();
    let hit: string | null = null;
    if (tag === 'zh' || tag.startsWith('zh-')) hit = /^zh-(tw|hk|mo)\b|hant/.test(tag) ? 'zh-TW' : 'zh-CN';
    else hit = ['en', 'ja', 'ko', 'es'].find((l) => tag === l || tag.startsWith(`${l}-`)) ?? null;
    if (hit && available(hit)) return hit;
  }
  return null;
}

function readQuery(): Locale | null {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    return q && available(q) ? q : q ? matchLocale([q]) : null;
  } catch {
    return null;
  }
}

function readSaved(): Locale | null {
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    const l = v ? (JSON.parse(v) as unknown) : null;
    return typeof l === 'string' && available(l) ? l : null;
  } catch {
    return null;
  }
}

/** ?lang= in the address bar first, then the language last chosen in the menu on this device; English otherwise, whatever the browser's languages (D-115) */
export function detectLocale(): Locale {
  return readQuery() ?? readSaved() ?? DEFAULT;
}

async function load(l: Locale): Promise<Messages> {
  const loader = loaders[l];
  return loader ? typeset((await loader()).default) : EN;
}

/**
 * Switches the language, and says whether it did. A choice the user makes in the menu is remembered, and ?lang= is removed from the
 * address bar (otherwise a reload would switch back), also when its language does not load: the page opens in it next time, as after
 * the reload a newer version of the page asks for (app/update.ts). On a load failure the current language is kept
 */
export async function setLocale(next: Locale, chosen = true): Promise<boolean> {
  if (chosen) {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(next));
      const url = new URL(window.location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.delete('lang');
        window.history.replaceState(window.history.state, '', url.toString());
      }
    } catch {
      /* failing to save the preference does not affect use */
    }
  }
  let m: Messages;
  try {
    m = await load(next);
  } catch {
    return false;
  }
  locale = next;
  messages = m;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const fn of listeners) fn();
  return true;
}

export async function initLocale(): Promise<void> {
  await setLocale(detectLocale(), false);
}

/**
 * An object read in the current language: lookup tables used everywhere, such as `STAGE_LABEL[stage]`, keep their syntax, and every read takes the message of the current language.
 */
export function localized<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get: (_, key) => Reflect.get(get(), key),
    has: (_, key) => Reflect.has(get(), key),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_, key) => {
      const d = Reflect.getOwnPropertyDescriptor(get(), key);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

/**
 * Functions in the messages produce text from their parameters. lazy records which message and which parameters first, and produces the text in the current language only when read:
 * receipts, events and explanations in the simulator follow a language switch. The parameters are evaluated when lazy is called; later state changes do not affect them.
 *   lazy((m) => m.sim.exec.nonceConflict, '3', '4')
 */
export function lazy<A extends unknown[]>(pick: (m: Messages) => string | ((...args: A) => string), ...args: A): () => string {
  return () => {
    const v = pick(t());
    return typeof v === 'function' ? v(...args) : v;
  };
}

/** A property (getter) on an object whose text is produced in the current language: the type is still string, and the text is produced on read */
export function withText<T extends object, K extends string>(obj: T, key: K, text: () => string): T & Record<K, string> {
  Object.defineProperty(obj, key, { get: text, enumerable: true, configurable: true });
  return obj as T & Record<K, string>;
}
