import type { Messages } from '..';
import coins from './coins';

const format: Messages['format'] = {
  justNow: 'hace un momento',
  secondsAgo: (n: number) => `hace ${n} s`,
  minutesAgo: (n: number) => `hace ${n} min`,
  hoursAgo: (n: number) => `hace ${n} h`,
  daysAgo: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
  seconds: (s: string) => `${s} s`,
  minSec: (m: number, s: number) => `${m} min ${s} s`,
  minutes: (m: number) => `${m} min`,
  hourMin: (h: number, m: number) => `${h} h ${m} min`,
  hours: (h: number) => `${h} h`,
  soon: 'en breve',
  aboutSeconds: (n: number) => `~${n} s`,
  aboutMinutes: (n: number) => `~${n} min`,
  aboutHours: (n: number) => `~${n} h`,
  axisSeconds: (n: number) => `−${n} s`,
  axisMinutes: (n: number) => `−${n} min`,
  sats: coins.sats,
  listSep: ', ',
  comma: (thousands: string, decimals: string, comma?: string) => `¿Es ${thousands} o ${decimals}? Escribe ${thousands}, o ${decimals}${comma ? ` (o ${comma})` : ''}`,
};

export default format;
