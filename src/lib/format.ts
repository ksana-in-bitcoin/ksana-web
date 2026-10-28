/**
 * Formatting of numbers, amounts, times and hashes. Every number in the interface goes through here so the notation stays consistent.
 * Numbers are written the same way in every language (comma thousands separators, decimal point), so amounts can be pasted straight into the command line; time units follow the current language (D-071).
 */

import { t } from '../i18n';

export function fmtInt(n: number | bigint): string {
  const s = typeof n === 'bigint' ? n.toString() : Math.trunc(n).toString();
  const neg = s.startsWith('-');
  const digits = neg ? s.slice(1) : s;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? `-${grouped}` : grouped;
}

export interface AmountParts {
  sign: '' | '-';
  int: string;
  frac: string;
}

/**
 * Splits raw units (u128) into integer and fractional parts according to the decimals.
 * minFrac guarantees a minimum number of fractional digits; maxFrac controls truncation (no rounding, so a balance is never shown larger than it is).
 * A non-zero amount is never shown as 0: when the integer part is 0 and the truncated fraction is all zeros, extend to two digits past the first non-zero digit (1,000 base units show as 0.00001 KSA).
 */
export function amountParts(units: bigint, decimals: number, opts: { minFrac?: number; maxFrac?: number } = {}): AmountParts {
  const { minFrac = 0, maxFrac = decimals } = opts;
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const intPart = abs / base;
  const full = decimals > 0 ? (abs % base).toString().padStart(decimals, '0') : '';
  let frac = full.slice(0, Math.max(maxFrac, 0));
  if (intPart === 0n && abs > 0n && !/[1-9]/.test(frac)) frac = full.slice(0, Math.min(decimals, full.search(/[1-9]/) + 3));
  frac = frac.replace(/0+$/, '');
  if (frac.length < minFrac) frac = frac.padEnd(minFrac, '0');
  return { sign: neg ? '-' : '', int: fmtInt(intPart), frac };
}

export function fmtAmount(units: bigint, decimals: number, opts: { minFrac?: number; maxFrac?: number } = {}): string {
  const p = amountParts(units, decimals, opts);
  return `${p.sign}${p.int}${p.frac ? `.${p.frac}` : ''}`;
}

/** An amount as the page writes it into a field: all its decimals and no grouping commas, which there could read as a decimal comma */
export function fieldAmount(units: bigint, decimals: number): string {
  return fmtAmount(units, decimals, { maxFrac: decimals }).replace(/,/g, '');
}

/** Text a Chinese or Japanese input method typed full width (U+FF01 to U+FF5E: digits, signs and Latin letters, and its space), in ASCII */
export function halfWidth(text: string): string {
  return text.replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, ' ');
}

/** The comma of a Chinese or Japanese input method, full width or ideographic: it groups digits, as the languages that type it write numbers */
const INPUT_METHOD_COMMA = /[\uff0c\u3001]/;

/** A number as typed, in ASCII: full width (`halfWidth`), and the ideographic comma and full stop a Japanese input method types for "," and "." */
function numberText(text: string): string {
  return halfWidth(text).replace(/\u3001/g, ',').replace(/\u3002/g, '.');
}

/**
 * The two readings of a number whose comma could as well group thousands as mark decimals: one ASCII comma, no point, three digits
 * after it and one to three before it, the first not a zero ("1,250": 1250 or 1.25). Each is written as a field takes it without a
 * doubt: `thousands` without the comma, `decimals` with a point and without its trailing zeros, and `comma`, for a keypad that has no
 * point, with a comma and other than three digits after it ("1,25", "1,1250"; none for a whole number). Undefined for any other text
 */
export function commaReadings(input: string): { thousands: string; decimals: string; comma?: string } | undefined {
  const m = INPUT_METHOD_COMMA.test(input) ? null : /^([1-9]\d{0,2}),(\d{3})$/.exec(numberText(input).replace(/[\s_]/g, ''));
  if (!m) return undefined;
  const [, whole = '', part = ''] = m;
  const kept = part.replace(/0+$/, '');
  if (!kept) return { thousands: whole + part, decimals: whole };
  return { thousands: whole + part, decimals: `${whole}.${kept}`, comma: `${whole},${kept.length === 3 ? `${kept}0` : kept}` };
}

/** What a field says of a number whose comma could be either (`commaReadings`): which it is, and how to write each; undefined otherwise */
export function commaQuestion(input: string): string | undefined {
  const r = commaReadings(input);
  return r && t().format.comma(r.thousands, r.decimals, r.comma);
}

/** Digits with a decimal point, the whole part grouped by commas in threes or not at all */
const GROUPED = /^(\d{1,3}(,\d{3})+|\d*)(\.\d*)?$/;

/**
 * A number as typed, in the page's notation: ASCII (`numberText`) with a decimal point. A phone's decimal keypad types the decimal
 * separator of its region, which in Spain, Germany or Brazil is a comma, and has no point: without a point, a lone ASCII comma is the
 * decimal point of a field that takes a fraction ("0,5" is a half, "1,25" one and a quarter), unless it could as well group thousands
 * ("1,250", `commaReadings`), when it is left as typed. Commas before a point, or two or more, group the whole part, as the page writes
 * amounts (D-071), and so does an input method's comma: a number it groups is written without it, which in ASCII could read
 * otherwise, and anything else is left as typed
 */
export function amountNotation(input: string, fraction = true): string {
  const s = numberText(input);
  if (INPUT_METHOD_COMMA.test(input)) return /\d/.test(s) && GROUPED.test(s.replace(/[\s_]/g, '')) ? s.replace(/,/g, '') : input;
  const comma = s.indexOf(',');
  const decimal = fraction && comma >= 0 && comma === s.lastIndexOf(',') && !s.includes('.') && !commaReadings(input);
  return decimal ? `${s.slice(0, comma)}.${s.slice(comma + 1)}` : s;
}

/**
 * Parses a decimal amount typed by the user (`amountNotation`; spaces and underscores, which may group digits, left out); returns null
 * when it is malformed or exceeds the decimals, or, in a field that takes a fraction, when its comma could be either (`commaReadings`).
 * Commas group the whole part in threes: "1,5.25" is no amount, where its commas were once dropped and it read as 15.25
 */
export function parseAmount(input: string, decimals: number): bigint | null {
  if (decimals > 0 && commaReadings(input)) return null;
  const s = amountNotation(input, decimals > 0).replace(/[\s_]/g, '');
  if (!/\d/.test(s) || !GROUPED.test(s)) return null;
  const [i = '', f = ''] = s.replace(/,/g, '').split('.');
  if (f.length > decimals) return null;
  return BigInt(i || '0') * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, '0') || '0');
}

/** A count typed by the user (a height, sats, a lock's number): digits (`halfWidth`), which commas may group in threes; null otherwise */
export function parseCount(input: string): bigint | null {
  const s = halfWidth(input).replace(/[\s_]/g, '');
  return /^(\d{1,3}(,\d{3})+|\d+)$/.test(s) ? BigInt(s.replace(/,/g, '')) : null;
}

export function fmtSats(n: number): string {
  return fmtInt(n);
}

export function fmtBtc(sats: number): string {
  return fmtAmount(BigInt(sats), 8, { minFrac: 2 });
}

/** Abbreviated address: keeps the bcrt1p / tb1p / bc1p prefix and the tail, eliding the middle */
export function shortAddress(addr: string, head = 8, tail = 6): string {
  const sep = addr.indexOf('1');
  const hrp = sep > 0 ? addr.slice(0, sep + 1) : '';
  const data = addr.slice(hrp.length);
  if (data.length <= head + tail + 1) return addr;
  return `${hrp}${data.slice(0, head)}…${data.slice(-tail)}`;
}

/** A connected wallet's address as the wallet page's head shows it: its first 12 characters and its last 6 */
export function walletAddress(addr: string): string {
  return `${addr.slice(0, 12)}…${addr.slice(-6)}`;
}

/** The address prefix (human-readable part, separator and witness version), e.g. bcrt1p, tb1p */
export function hrpOf(address: string): string {
  const i = address.lastIndexOf('1');
  return i > 0 ? address.slice(0, i + 2) : '';
}

/** How many characters at each end of an address the other party checks (against address poisoning) */
export const EDGE_CHARS = 8;

/**
 * An address in groups of `size` characters after its prefix (64-character hex, a contract ID or an account without an address
 * form, in groups of 8), each group split into [characters among the first `EDGE_CHARS`, the others, characters among the last
 * `EDGE_CHARS`]. The ends are counted by character, not by group: the last group of an address is often shorter.
 */
export function addressGroups(address: string, size = 4): { prefix: string; groups: [string, string, string][] } {
  const isHex = /^[0-9a-fA-F]{64}$/.test(address);
  const prefix = isHex ? '' : hrpOf(address);
  const body = address.slice(prefix.length);
  const group = isHex ? 8 : Math.max(1, size);
  const tail = body.length - EDGE_CHARS;
  const groups: [string, string, string][] = [];
  for (let start = 0; start < body.length; start += group) {
    const g = body.slice(start, start + group);
    const headEnd = Math.min(g.length, Math.max(0, EDGE_CHARS - start));
    const tailStart = Math.min(g.length, Math.max(headEnd, tail - start));
    groups.push([g.slice(0, headEnd), g.slice(headEnd, tailStart), g.slice(tailStart)]);
  }
  return { prefix, groups };
}

/**
 * The first `n` characters of a text as a reader counts them (an emoji or an accented letter whole, never half of one), with no space
 * left at the end; the text itself when it is no longer
 */
export function clipText(text: string, n: number): string {
  const chars = typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment) : Array.from(text);
  return chars.length > n ? chars.slice(0, n).join('').trimEnd() : text;
}

export function shortHash(hex: string, head = 8, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/** Groups a full hash into 8-digit chunks so it can be verified piece by piece */
export function groupHex(hex: string, size = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < hex.length; i += size) out.push(hex.slice(i, i + size));
  return out;
}

/** A no-break space joins the number and its unit, so that a line never ends between them */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${fmtInt(n)}\u00a0B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 2 : 1)}\u00a0KiB`;
  return `${(n / 1024 / 1024).toFixed(2)}\u00a0MiB`;
}

export function timeAgo(ms: number, now: number): string {
  const f = t().format;
  const d = Math.max(0, now - ms);
  const s = Math.floor(d / 1000);
  if (s < 2) return f.justNow;
  if (s < 60) return f.secondsAgo(s);
  const m = Math.floor(s / 60);
  if (m < 60) return f.minutesAgo(m);
  const h = Math.floor(m / 60);
  if (h < 24) return f.hoursAgo(h);
  return f.daysAgo(Math.floor(h / 24));
}

export function fmtDuration(ms: number): string {
  const f = t().format;
  // Rounded once, to tenths below 10 seconds and to seconds above: rounding the seconds of a minute on their own wrote "6 min 60 s"
  const tenths = Math.round(Math.max(0, ms) / 100);
  if (tenths < 100) return f.seconds((tenths / 10).toFixed(1));
  const s = Math.round(ms / 1000);
  if (s < 60) return f.seconds(String(s));
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  if (m < 60) return rest ? f.minSec(m, rest) : f.minutes(m);
  const h = Math.floor(m / 60);
  const restMin = m - h * 60;
  return restMin ? f.hourMin(h, restMin) : f.hours(h);
}

/** A duration given as "about" so much: to the minute from two minutes on, to the second below */
export function fmtRoughDuration(ms: number): string {
  return fmtDuration(ms >= 120_000 ? Math.round(ms / 60_000) * 60_000 : ms);
}

/** A rough "about x" notation, used for estimated times */
export function fmtEta(ms: number): string {
  const f = t().format;
  const s = Math.max(0, ms) / 1000;
  if (s < 1.5) return f.soon;
  if (s < 60) return f.aboutSeconds(Math.ceil(s));
  const m = Math.round(s / 60);
  // Minutes up to three hours: the wait for BTC-final, 11 BTC blocks, reads ~110 min on mainnet, and on signet, where BTC blocks often
  // come slower, ~144 min rather than ~2 h
  if (m < 180) return f.aboutMinutes(m);
  return f.aboutHours(Math.round(m / 60));
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

export function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${fmtClock(ms)}`;
}

export function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.max(0, Math.min(1, n / d));
}
