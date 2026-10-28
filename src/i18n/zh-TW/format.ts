import type { Messages } from '..';
import coins from './coins';

/** Traditional Chinese (Taiwan): time units */
const format: Messages['format'] = {
  justNow: '剛剛',
  secondsAgo: (n: number) => `${n} 秒前`,
  minutesAgo: (n: number) => `${n} 分鐘前`,
  hoursAgo: (n: number) => `${n} 小時前`,
  daysAgo: (n: number) => `${n} 天前`,
  seconds: (s: string) => `${s} 秒`,
  minSec: (m: number, s: number) => `${m} 分 ${s} 秒`,
  minutes: (m: number) => `${m} 分鐘`,
  hourMin: (h: number, m: number) => `${h} 小時 ${m} 分`,
  hours: (h: number) => `${h} 小時`,
  soon: '馬上',
  aboutSeconds: (n: number) => `約 ${n} 秒`,
  aboutMinutes: (n: number) => `約 ${n} 分鐘`,
  aboutHours: (n: number) => `約 ${n} 小時`,
  axisSeconds: (n: number) => `−${n} 秒`,
  axisMinutes: (n: number) => `−${n} 分`,
  sats: coins.sats,
  listSep: '、',
  comma: (thousands: string, decimals: string, comma?: string) => `是 ${thousands} 還是 ${decimals}？請寫成 ${thousands} 或 ${decimals}${comma ? `（也可寫 ${comma}）` : ''}`,
};

export default format;
