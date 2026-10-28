import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { paramDocs } from '../chain/params';
import {
  addressGroups,
  amountNotation,
  amountParts,
  clipText,
  commaQuestion,
  commaReadings,
  EDGE_CHARS,
  fieldAmount,
  fmtAmount,
  fmtDuration,
  fmtEta,
  fmtInt,
  fmtRoughDuration,
  halfWidth,
  parseAmount,
  parseCount,
  shortHash,
} from './format';
import { FLASH_MS, flashing, freshKeys } from './fresh';
import { heightWidth, labelStep, spacedHeights } from './labels';

describe('format', () => {
  it('thousands separators and amount splitting', () => {
    expect(fmtInt(1234567)).toBe('1,234,567');
    expect(fmtInt(-1000n)).toBe('-1,000');
    expect(amountParts(123_456_789n, 8)).toEqual({ sign: '', int: '1', frac: '23456789' });
    expect(fmtAmount(150_000_000n, 8)).toBe('1.5');
    expect(fmtAmount(150_000_000n, 8, { minFrac: 2 })).toBe('1.50');
    // Truncate instead of rounding, so a balance is never shown larger than it is
    expect(fmtAmount(199_999_999n, 8, { maxFrac: 2 })).toBe('1.99');
  });

  it('parses amounts typed by the user', () => {
    expect(parseAmount('42.5', 8)).toBe(4_250_000_000n);
    // Commas before a point, or two or more, group the whole part, as the page writes amounts
    expect(parseAmount('1,000.5', 8)).toBe(100_050_000_000n);
    expect(parseAmount('1,000,000', 8)).toBe(100_000_000_000_000n);
    expect(parseAmount('.5', 6)).toBe(500_000n);
    expect(parseAmount('1.123456789', 8)).toBeNull();
    expect(parseAmount('abc', 8)).toBeNull();
    expect(parseAmount('', 8)).toBeNull();
  });

  it("reads a lone comma as the decimal point a phone's keypad types in a region that writes one, and digits typed full width", () => {
    // An iPhone's decimal keypad in Spain, Germany or Brazil has a comma and no point: "0,5" read as 5
    expect(parseAmount('0,5', 8)).toBe(50_000_000n);
    expect(parseAmount('1,25', 8)).toBe(125_000_000n);
    expect(parseAmount('0,125', 8)).toBe(12_500_000n);
    expect(parseAmount('1,1250', 8)).toBe(112_500_000n);
    expect(parseAmount('1234,567', 8)).toBe(123_456_700_000n);
    expect(parseAmount('12,', 8)).toBe(1_200_000_000n);
    expect(parseAmount('1 000,5', 8)).toBe(100_050_000_000n);
    // A field that takes no fraction has no decimal comma: its commas group
    expect(parseAmount('1,000', 0)).toBe(1_000n);
    expect(parseAmount('1,5', 0)).toBeNull();
    // Commas grouping otherwise than in threes, or after a point, make no amount, where they were all dropped ("1,5.25" read as 15.25)
    for (const text of ['1,5.25', '1.234,5', '12,34,567', '1,000,', '0.,5']) expect(parseAmount(text, 8)).toBeNull();
    // A Chinese or Japanese input method's full-width digits and signs; its comma, full width or ideographic, only groups, as its
    // languages write no decimal comma
    expect(parseAmount('\uff11\uff12\uff0e\uff15', 8)).toBe(1_250_000_000n);
    expect(parseAmount('\uff11\uff12\u3002\uff15', 8)).toBe(1_250_000_000n);
    expect(parseAmount('\uff11\uff0c\uff10\uff10\uff10\uff0e\uff15', 8)).toBe(100_050_000_000n);
    expect(parseAmount('\uff11\uff0c\uff10\uff10\uff10', 8)).toBe(100_000_000_000n);
    expect(parseAmount('1\uff0c000', 2)).toBe(100_000n);
    expect(parseAmount('1\u3001000', 8)).toBe(100_000_000_000n);
    expect(parseAmount('\uff10\uff0c\uff15', 8)).toBeNull();
    expect(halfWidth('\uff03\uff11\uff12\uff13\u3000')).toBe('#123 ');
  });

  it('reads neither way a comma that could as well group thousands as mark decimals, and says how to write each', () => {
    // "10,000" as the page writes amounts, or ten as a keypad with a comma types it: one taken for the other is a thousand times off
    for (const text of ['1,250', '10,000', ' 250,000 ', '\uff11\uff10,\uff10\uff10\uff10']) {
      expect(parseAmount(text, 8)).toBeNull();
      expect(parseAmount(text, 2)).toBeNull();
      expect(amountNotation(text)).toBe(halfWidth(text));
    }
    expect(commaReadings('1,250')).toEqual({ thousands: '1250', decimals: '1.25', comma: '1,25' });
    expect(commaReadings('1,125')).toEqual({ thousands: '1125', decimals: '1.125', comma: '1,1250' });
    expect(commaReadings('10,000')).toEqual({ thousands: '10000', decimals: '10' });
    for (const text of ['0,125', '1234,567', '1,25', '12,5', '1,000.5', '1,000,000', '\uff11\uff0c\uff10\uff10\uff10', '1\u3001000']) {
      expect(commaReadings(text)).toBeUndefined();
    }
    // Each way it names reads as it says
    for (const text of ['1,250', '1,125', '10,000']) {
      const r = commaReadings(text);
      expect(r).toBeDefined();
      if (!r) continue;
      expect(parseAmount(r.thousands, 8)).toBe(BigInt(r.thousands) * 10n ** 8n);
      expect(parseAmount(r.decimals, 8)).not.toBeNull();
      expect(parseAmount(r.comma ?? r.decimals, 8)).toBe(parseAmount(r.decimals, 8));
    }
    expect(commaQuestion('1,250')).toBe('Is this 1250\u00a0or 1.25? Write 1250, or 1.25 (or 1,25)');
    expect(commaQuestion('10,000')).toBe('Is this 10000\u00a0or 10? Write 10000, or 10');
    expect(commaQuestion('1,25')).toBeUndefined();
    // A field that takes no fraction has none to ask about
    expect(parseAmount('10,000', 0)).toBe(10_000n);
  });

  it('parses counts typed by the user, full width too, and nothing from an empty field', () => {
    expect(parseCount('12345')).toBe(12_345n);
    expect(parseCount(' 10,000 ')).toBe(10_000n);
    expect(parseCount('\uff11\uff12\uff13')).toBe(123n);
    for (const text of ['', ' ', '1.5', '1,5', '-3', '0x10', '1e3', '12,34']) expect(parseCount(text)).toBeNull();
  });

  it('writes a decimal comma and full-width digits as the page writes them, read back the same', () => {
    expect(amountNotation('0,5')).toBe('0.5');
    expect(amountNotation('1,000.5')).toBe('1,000.5');
    expect(amountNotation('1,000,000')).toBe('1,000,000');
    expect(amountNotation('1,000', false)).toBe('1,000');
    expect(amountNotation('1,250')).toBe('1,250');
    // An input method's comma groups: a number it groups is written without it, as "1,000" would ask which, and anything else as typed
    expect(amountNotation('\uff11\uff0c\uff10\uff10\uff10')).toBe('1000');
    expect(amountNotation('1\u3001000\uff0e5')).toBe('1000.5');
    expect(amountNotation('\uff10\uff0c\uff15')).toBe('\uff10\uff0c\uff15');
    for (const text of ['0,5', '1,125', '1,000.5', '\uff11\uff12\uff0e\uff15', 'abc', '1,5.25', '\uff11\uff0c\uff10\uff10\uff10', '1\u3001000', '\uff10\uff0c\uff15']) {
      expect(amountNotation(amountNotation(text))).toBe(amountNotation(text));
      expect(parseAmount(amountNotation(text), 8)).toBe(parseAmount(text, 8));
    }
    // An amount the page writes into a field reads back as itself; written with its grouping comma, 10,000 could as well be ten
    const written: [bigint, number][] = [[10_000n * 10n ** 8n, 8], [123_456_789n, 8], [1n, 8], [1_000n, 0], [0n, 2]];
    for (const [units, decimals] of written) expect(parseAmount(fieldAmount(units, decimals), decimals)).toBe(units);
    expect(parseAmount(fmtAmount(10_000n * 10n ** 8n, 8), 8)).toBeNull();
  });

  it('durations carry whole minutes and hours instead of 60 seconds or 60 minutes, and leave out a zero', () => {
    const f = t().format;
    expect(fmtDuration(4_260)).toBe(f.seconds('4.3'));
    expect(fmtDuration(9_960)).toBe(f.seconds('10'));
    expect(fmtDuration(59_600)).toBe(f.minutes(1));
    // the status strip once read "6 min 60 s ago"
    expect(fmtDuration(419_700)).toBe(f.minutes(7));
    expect(fmtDuration(197_000)).toBe(f.minSec(3, 17));
    expect(fmtDuration(3_599_700)).toBe(f.hours(1));
    expect(fmtDuration(3_900_000)).toBe(f.hourMin(1, 5));
    // the verify page read "signet currently about 1 h 0 min"
    expect(fmtRoughDuration(3_610_000)).toBe(f.hours(1));
    expect(fmtDuration(-5)).toBe(f.seconds('0.0'));
    // given as "about": to the minute from two minutes on
    expect(fmtRoughDuration(2_309_000)).toBe(f.minutes(38));
    expect(fmtRoughDuration(95_000)).toBe(f.minSec(1, 35));
  });

  it('estimates read in minutes up to three hours, so BTC-final reads ~110 min on mainnet and ~144 min on a slower signet (D-114)', () => {
    const f = t().format;
    expect(fmtEta(45_000)).toBe(f.aboutSeconds(45));
    expect(fmtEta(110 * 60_000)).toBe(f.aboutMinutes(110));
    // The live signet's wait, which read "~2 h"
    expect(fmtEta(144 * 60_000)).toBe(f.aboutMinutes(144));
    expect(fmtEta(179 * 60_000)).toBe(f.aboutMinutes(179));
    expect(fmtEta(180 * 60_000)).toBe(f.aboutHours(3));
  });

  it('marks exactly the characters at the ends of an address that the other party checks', () => {
    const address = 'tb1pqsjfs4npwrd4ul8f0e5cdnt2zwnveptjkfxe2265dljug46j3jpqaepyy8';
    const { prefix, groups } = addressGroups(address);
    expect(prefix).toBe('tb1p');
    expect(groups.map((g) => g.join('')).join('')).toBe(address.slice(4));
    expect(groups.map((g) => g[0]).join('')).toBe('qsjfs4np');
    // the body is 58 characters: the last group is 2 long, and the group before last splits
    expect(groups.map((g) => g[2]).join('')).toBe('pqaepyy8');
    expect(groups.slice(-3)).toEqual([['', '3j', 'pq'], ['', '', 'aepy'], ['', '', 'y8']]);
    // a contract ID in groups of 8
    const hex = 'ab'.repeat(32);
    const h = addressGroups(hex);
    expect([h.prefix, h.groups.length, h.groups[0], h.groups[7]]).toEqual(['', 8, ['abababab', '', ''], ['', '', 'abababab']]);
    // shorter than both ends together: every character is marked once
    const short = addressGroups('bcrt1pqqqqzzzzxx', 4);
    expect(short.groups.every((g) => g[1] === '')).toBe(true);
    expect(short.groups.map((g) => g[0] + g[2]).join('')).toBe('qqqqzzzzxx');
    expect(EDGE_CHARS).toBe(8);
  });

  it('a name cut short for a symbol keeps its characters whole, and no space at its end', () => {
    expect(clipText('Wizards of the Lightning Coast', 8)).toBe('Wizards');
    expect(clipText('Ñandú ₿ Ünïcode', 8)).toBe('Ñandú ₿');
    // Cut by UTF-16 units, the rocket was half a surrogate pair, drawn as a replacement character
    expect(clipText('Abcdefg🚀x', 8)).toBe('Abcdefg🚀');
    // A family emoji of seven code points counts as one character, as an accent written as a combining mark does
    expect(clipText('👨‍👩‍👧‍👦 Family coin', 3)).toBe('👨‍👩‍👧‍👦 F');
    expect(clipText('n\u0303andu token', 4)).toBe('n\u0303and');
    expect(clipText('KSA', 8)).toBe('KSA');
  });

  it('elides the middle of a hash', () => {
    expect(shortHash('0123456789abcdef0123456789abcdef', 4, 4)).toBe('0123…cdef');
    expect(shortHash('abcd', 4, 4)).toBe('abcd');
  });

  it("the Verify page's parameter table gives KSA in KSA and long numbers with separators", () => {
    const value = (name: string) => paramDocs(t(), 'signet').find((p) => p.name === name)?.value;
    expect(value('BLOCK_REWARD')).toBe('9.9\u00a0KSA');
    expect(value('KSA_MAX_SUPPLY')).toBe('1,000,000,000\u00a0KSA');
    expect(value('ASERT_HALF_LIFE')).toBe(t().format.seconds('7,200'));
    expect(value('REORG_WINDOW')).toBe(t().params.blocks(1000));
    expect(value('REORG_WINDOW')).toContain('1,000');
  });

  it("the Verify page's parameter table gives SPEC §13's proof of work, carrier and upgrade schedule", () => {
    const docs = paramDocs(t(), 'signet');
    const value = (name: string) => docs.find((p) => p.name === name)?.value;
    expect(value('POW_LIMIT_BITS')).toBe('0x207fffff');
    expect(value('POW_ALGORITHM')).toBe('Argon2id');
    expect(value('POW_ARGON2_MEMORY')).toBe('2 MiB');
    expect(value('CARRIER_BPS')).toBe('5%');
    expect(value('CARRIER_FEE_BPS')).toBe('50%');
    expect(value('CARRIER_REPOST_DELAY')).toBe(t().params.btcBlocks(2));
    expect(value('UPGRADES')).toBe(t().params.none);
    // The 45 parameters but the block share's two
    expect(docs).toHaveLength(43);
  });

  it("the Verify page's parameter table leaves out the block share's ratio and end", () => {
    const docs = paramDocs(t(), 'signet');
    expect(docs.map((p) => p.name as string).filter((name) => name.startsWith('BLOCK_SHARE'))).toEqual([]);
    // The only parts of a reward it gives are the carrier's (D-095), which the project's docs give too
    expect(docs.filter((p) => p.value.includes('%')).map((p) => p.name)).toEqual(['CARRIER_BPS', 'CARRIER_FEE_BPS']);
    expect(docs.filter((p) => /\b20\s?%|\b2,?000\b|50,?457,?600/.test(`${p.value} ${p.note}`))).toEqual([]);
  });
});

describe('rows marked as new', () => {
  const fresh = (seen: string[] | null, keys: string[]) => [...freshKeys(seen && new Set(seen), keys)];

  it('those that arrive above a row already shown', () => {
    expect(fresh(['c', 'd'], ['a', 'b', 'c', 'd'])).toEqual(['b', 'a']);
    // above some of the rows shown, below others: an operation still waiting stays on top
    expect(fresh(['p', 'c'], ['p', 'b', 'c'])).toEqual(['b']);
  });

  it('not older history listed below the rows shown, a list filling in at once, another list, or the first render', () => {
    expect(fresh(['a', 'b'], ['a', 'b', 'c', 'd'])).toEqual([]);
    expect(fresh([], ['a', 'b', 'c'])).toEqual([]);
    expect(fresh(['x', 'y'], ['a', 'b'])).toEqual([]);
    expect(fresh(null, ['a', 'b'])).toEqual([]);
  });

  it('stay marked while they flash, however often the list is drawn again, and no longer', () => {
    const marked = new Map<string, number>();
    const shown = (fresh: string[], now: number) => [...flashing(marked, new Set(fresh), now)];
    // A row arrives at 1 000 ms, the list is drawn again as the next arrives 300 ms later, and as a status changes at 899 ms
    expect(shown(['a'], 1000)).toEqual(['a']);
    expect(shown(['b'], 1300)).toEqual(['a', 'b']);
    expect(shown([], 1899)).toEqual(['a', 'b']);
    expect(shown([], 1900)).toEqual(['b']);
    expect(shown([], 2200)).toEqual([]);
    expect(marked.size).toBe(0);
  });

  it('for as long as the flash the stylesheets give them', () => {
    const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const rules = [
      ['../styles/components.css', '.table tr.row-new'],
      ['../styles/pages.css', '.op-lines li.row-new'],
    ] as const;
    for (const [file, rule] of rules) expect(css(file).split(`${rule} {`)[1]?.split('}')[0], rule).toContain(`animation: row-in ${FLASH_MS}ms `);
  });
});

describe('height labels under the lanes', () => {
  const labels = (points: [number, number][], floor: number, fromX = 0) => [...spacedHeights(points.map(([x, height]) => ({ x, height })), floor, fromX)];

  it('keep 10 px between two labels however long the heights grow, the newest first', () => {
    expect(heightWidth(326_440)).toBe(42);
    // BTC heights 46 px apart touched: now the older of two is left out, and one 52 px away is labeled
    expect(labels([[100, 326_438], [146, 326_440]], 46)).toEqual([326_440]);
    expect(labels([[94, 326_438], [146, 326_440]], 46)).toEqual([326_440, 326_438]);
    // The fast lane's floor of 38 px holds for short heights, and gives way for a six-figure one
    expect(labels([[100, 580], [138, 600]], 38)).toEqual([600, 580]);
    expect(labels([[100, 123_450], [138, 123_500], [152, 123_550]], 38)).toEqual([123_550, 123_450]);
  });

  it('not one that would start under the fade at the left edge', () => {
    expect(labels([[30, 326_430], [100, 326_435]], 46, 12)).toEqual([326_435]);
    expect(labels([[34, 326_430], [100, 326_435]], 46, 12)).toEqual([326_435, 326_430]);
  });

  it('on the fast lane, every round step that leaves 50 px, and room for the newest label beside the next', () => {
    expect(labelStep(10, 633)).toBe(5);
    expect(labelStep(60, 633)).toBe(1);
    expect(labelStep(0.01, 633)).toBe(1000);
    // "123,456" is 42 px wide and needs 52 px to the next of its length: 5 blocks of 10 px are too few
    expect(heightWidth(123_456)).toBe(42);
    expect(labelStep(10, 123_456)).toBe(10);
    expect(labelStep(10.4, 123_456)).toBe(5);
  });

  it('on the fast lane, evenly spaced blocks keep every label of the step, however long their heights', () => {
    for (const [first, spacing] of [[560, 10], [123_400, 10], [1_234_000, 7]] as const) {
      const points = Array.from({ length: 101 }, (_, i) => ({ x: 40 + i * spacing, height: first + i }));
      const step = labelStep(spacing, first + 100);
      const due = points.filter((p) => p.height % step === 0);
      expect([...spacedHeights(due, 38, 0)]).toEqual(due.map((p) => p.height).reverse());
    }
  });
});
