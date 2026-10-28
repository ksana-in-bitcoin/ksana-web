import type { Messages } from '..';
import coins from './coins';

const format: Messages['format'] = {
  justNow: '방금',
  secondsAgo: (n: number) => `${n}초 전`,
  minutesAgo: (n: number) => `${n}분 전`,
  hoursAgo: (n: number) => `${n}시간 전`,
  daysAgo: (n: number) => `${n}일 전`,
  seconds: (s: string) => `${s}초`,
  minSec: (m: number, s: number) => `${m}분 ${s}초`,
  minutes: (m: number) => `${m}분`,
  hourMin: (h: number, m: number) => `${h}시간 ${m}분`,
  hours: (h: number) => `${h}시간`,
  soon: '곧',
  aboutSeconds: (n: number) => `약 ${n}초`,
  aboutMinutes: (n: number) => `약 ${n}분`,
  aboutHours: (n: number) => `약 ${n}시간`,
  axisSeconds: (n: number) => `−${n}초`,
  axisMinutes: (n: number) => `−${n}분`,
  sats: coins.sats,
  listSep: ', ',
  comma: (thousands: string, decimals: string, comma?: string) => `${thousands}인지 ${decimals}인지 알 수 없습니다. ${thousands} 또는 ${decimals}${comma ? `(${comma}도 가능)` : ''}처럼 입력하세요`,
};

export default format;
