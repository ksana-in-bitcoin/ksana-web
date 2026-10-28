import coins from './coins';

/** Time units (the digits themselves are written the same in every language, see lib/format.ts) */
export default {
  justNow: '刚刚',
  secondsAgo: (n: number) => `${n} 秒前`,
  minutesAgo: (n: number) => `${n} 分钟前`,
  hoursAgo: (n: number) => `${n} 小时前`,
  daysAgo: (n: number) => `${n} 天前`,
  /** s is a formatted number of seconds (e.g. "3.0") */
  seconds: (s: string) => `${s} 秒`,
  minSec: (m: number, s: number) => `${m} 分 ${s} 秒`,
  minutes: (m: number) => `${m} 分钟`,
  hourMin: (h: number, m: number) => `${h} 小时 ${m} 分`,
  hours: (h: number) => `${h} 小时`,
  soon: '马上',
  aboutSeconds: (n: number) => `约 ${n} 秒`,
  aboutMinutes: (n: number) => `约 ${n} 分钟`,
  aboutHours: (n: number) => `约 ${n} 小时`,
  /** Two-lane rail chart x-axis: −30 s, −2 min */
  axisSeconds: (n: number) => `−${n} 秒`,
  axisMinutes: (n: number) => `−${n} 分`,
  sats: coins.sats,
  /** Between list items */
  listSep: '、',
  /** A number whose comma could group thousands or mark decimals ("1,250"): its two readings as a field takes them, and the second with a comma, for a keypad with no point */
  comma: (thousands: string, decimals: string, comma?: string) => `是 ${thousands} 还是 ${decimals}？请写成 ${thousands} 或 ${decimals}${comma ? `（也可写 ${comma}）` : ''}`,
};
