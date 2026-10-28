import type { Messages } from '..';
import coins from './coins';

/** Time units (digits are written the same in every language, see lib/format.ts) */
const format: Messages['format'] = {
  justNow: 'just now',
  secondsAgo: (n: number) => `${n} s ago`,
  minutesAgo: (n: number) => `${n} min ago`,
  hoursAgo: (n: number) => `${n} h ago`,
  daysAgo: (n: number) => `${n} d ago`,
  /** s is already formatted (e.g. "3.0") */
  seconds: (s: string) => `${s} s`,
  minSec: (m: number, s: number) => `${m} min ${s} s`,
  minutes: (m: number) => `${m} min`,
  hourMin: (h: number, m: number) => `${h} h ${m} min`,
  hours: (h: number) => `${h} h`,
  soon: 'soon',
  aboutSeconds: (n: number) => `~${n} s`,
  aboutMinutes: (n: number) => `~${n} min`,
  aboutHours: (n: number) => `~${n} h`,
  /** Rail chart x-axis: −30 s, −2 min */
  axisSeconds: (n: number) => `−${n} s`,
  axisMinutes: (n: number) => `−${n} min`,
  sats: coins.sats,
  /** Between list items */
  listSep: ', ',
  /** A number whose comma could group thousands or mark decimals ("1,250"): its two readings as a field takes them, and the second with a comma, for a keypad with no point */
  comma: (thousands: string, decimals: string, comma?: string) => `Is this ${thousands} or ${decimals}? Write ${thousands}, or ${decimals}${comma ? ` (or ${comma})` : ''}`,
};

export default format;
