#!/usr/bin/env node
// Writes src/chain/confusables.ts: the characters Unicode's confusables data (UTS #39) draws like one Latin letter or digit, and the letters
// Unicode names after one with a mark added, for the look-alike check of contracts' asset names (src/chain/assetNames.ts). From copies of
// the data, both of one version:
//
//   curl -O https://www.unicode.org/Public/security/latest/confusables.txt
//   curl -O https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt
//   node scripts/confusables.mjs confusables.txt UnicodeData.txt
//
// The table is committed; run this again for a new version of the data. A character is kept when it is outside ASCII, a name still has it
// after its compatibility decomposition (NFKD) and once its marks and format characters are dropped, and its prototype reads as one Latin
// capital or digit once its marks are dropped, a lower-case L is read as a capital I, and it is upper-cased (as assetNames.ts folds a name).
// A letter the confusables data leaves out, named as another letter with a stroke, a bar, a hook or another mark ("LATIN CAPITAL LETTER S
// WITH OBLIQUE STROKE", "CYRILLIC CAPITAL LETTER KA WITH HOOK"), is kept as that letter reads (the audit of M36 found eleven such
// letters spelling KSA and BTC without a warning).

import { readFileSync, writeFileSync } from 'node:fs';

const [source, names] = process.argv.slice(2);
if (!source || !names) {
  console.error('usage: node scripts/confusables.mjs <confusables.txt> <UnicodeData.txt>');
  process.exit(1);
}
const text = readFileSync(source, 'utf8').replace(/^﻿/, '');
const version = text.match(/^# Version: (\S+)/m)?.[1];
const date = text.match(/^# Date: (\d{4}-\d{2}-\d{2})/m)?.[1];
const copyright = text.match(/^# (© .+)$/m)?.[1];
if (!version || !date || !copyright) throw new Error(`${source} does not read as Unicode's confusables.txt (no version, date or copyright line)`);

const fold = (s) =>
  s
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .replace(/l/g, 'I')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Letter or digit → the characters drawn like it */
const like = new Map();
/** Each character kept → the letter or digit it reads as */
const reads = new Map();
let lines = 0;
for (const line of text.split('\n')) {
  const data = line.split('#', 1)[0].trim();
  if (!data) continue;
  const [from, to] = data.split(';').map((field) => field.trim());
  if (!from || !to || !/^[0-9A-F]{4,6}$/.test(from) || !/^[0-9A-F]{4,6}( [0-9A-F]{4,6})*$/.test(to)) throw new Error(`unexpected line: ${line}`);
  lines++;
  const c = String.fromCodePoint(parseInt(from, 16));
  if (c.codePointAt(0) < 0x80 || c.normalize('NFKD') !== c || /[\p{M}\p{Cf}]/u.test(c)) continue;
  const reading = fold(String.fromCodePoint(...to.split(' ').map((cp) => parseInt(cp, 16))));
  if (reading.length !== 1) continue;
  like.set(reading, [...(like.get(reading) ?? []), c]);
  reads.set(c, reading);
}
if (lines < 6000) throw new Error(`only ${lines} mappings in ${source}`);
const drawn = reads.size;

// A letter named as another with a mark added reads as that letter does: an ASCII one as itself, another as the confusables data reads it
const named = new Map();
const letters = [];
for (const line of readFileSync(names, 'utf8').split('\n')) {
  const [code, name, category] = line.split(';');
  if (!code || !name || !/^[0-9A-F]{4,6}$/.test(code)) continue;
  const c = String.fromCodePoint(parseInt(code, 16));
  named.set(name, c);
  if (category?.startsWith('L')) letters.push([c, name]);
}
if (named.get('LATIN CAPITAL LETTER A') !== 'A' || named.size < 30000) throw new Error(`${names} does not read as Unicode's UnicodeData.txt`);
for (const [c, name] of letters) {
  const m = name.match(/^(.+) LETTER (.+?) WITH /);
  if (!m || c.codePointAt(0) < 0x80 || reads.has(c) || c.normalize('NFKD') !== c) continue;
  const base = named.get(`${m[1]} LETTER ${m[2]}`);
  const reading = base === undefined ? '' : base.codePointAt(0) < 0x80 ? fold(base) : (reads.get(base) ?? '');
  if (reading.length !== 1) continue;
  like.set(reading, [...(like.get(reading) ?? []), c]);
  reads.set(c, reading);
}

const escape = (c) => `\\u{${c.codePointAt(0).toString(16)}}`;
const rows = [...like.entries()]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([latin, chars]) => {
    const sorted = chars.sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
    const chunks = [];
    for (let i = 0; i < sorted.length; i += 16) chunks.push(`'${sorted.slice(i, i + 16).map(escape).join('')}'`);
    return `  ${/^[0-9]/.test(latin) ? `'${latin}'` : latin}:\n    ${chunks.join(' +\n    ')},`;
  });
const count = [...like.values()].reduce((n, chars) => n + chars.length, 0);

writeFileSync(
  new URL('../src/chain/confusables.ts', import.meta.url),
  `// Written by scripts/confusables.mjs from Unicode's confusables data (UTS #39), confusables.txt version ${version} of ${date}
// (https://www.unicode.org/Public/security/latest/confusables.txt), and the character names of the same version (UnicodeData.txt,
// https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt); not edited by hand.
// ${copyright} For terms of use and license, see https://www.unicode.org/terms_of_use.html

/**
 * The characters the data draws like one Latin letter or digit (${drawn}), and the letters it names as another with a stroke, a hook or
 * another mark added (${count - drawn}), by that letter or digit as a capital: those outside ASCII that a name still has after its
 * compatibility decomposition, whose prototype, or the letter they are named after, reads as one Latin capital or digit
 */
const LIKE: Readonly<Record<string, string>> = {
${rows.join('\n')}
};

/** Each character to the Latin capital or digit it is drawn like */
export const CONFUSABLE: ReadonlyMap<string, string> = new Map(Object.entries(LIKE).flatMap(([latin, chars]) => Array.from(chars, (c) => [c, latin] as const)));
`,
);
console.log(`src/chain/confusables.ts: ${count} characters, ${drawn} from confusables.txt ${version} (${lines} mappings) and ${count - drawn} by name`);
