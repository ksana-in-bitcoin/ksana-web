import type { Messages } from '..';
import coins from './coins';

/** Japanese: time units (digits are written the same in every language) */
const format: Messages['format'] = {
  justNow: 'たった今',
  secondsAgo: (n: number) => `${n} 秒前`,
  minutesAgo: (n: number) => `${n} 分前`,
  hoursAgo: (n: number) => `${n} 時間前`,
  daysAgo: (n: number) => `${n} 日前`,
  seconds: (s: string) => `${s} 秒`,
  minSec: (m: number, s: number) => `${m} 分 ${s} 秒`,
  minutes: (m: number) => `${m} 分`,
  hourMin: (h: number, m: number) => `${h} 時間 ${m} 分`,
  hours: (h: number) => `${h} 時間`,
  soon: 'まもなく',
  aboutSeconds: (n: number) => `約 ${n} 秒`,
  aboutMinutes: (n: number) => `約 ${n} 分`,
  aboutHours: (n: number) => `約 ${n} 時間`,
  axisSeconds: (n: number) => `−${n} 秒`,
  axisMinutes: (n: number) => `−${n} 分`,
  sats: coins.sats,
  listSep: '、',
  comma: (thousands: string, decimals: string, comma?: string) => `${thousands} と ${decimals} のどちらですか。${thousands} か ${decimals}${comma ? `（${comma} でも可）` : ''} と入力してください`,
};

export default format;
