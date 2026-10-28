import { describe, expect, it } from 'vitest';
import { titleQuery } from './SearchPage';

describe("The search page's title", () => {
  it('gives a long query with no space in it shortened in its middle, the box below holding it whole', () => {
    // An address that is no account here: in full, a phone's title broke it over three lines, and a tablet's left "sx" on a line of its own
    expect(titleQuery('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBe('tb1qw508\u2060\u2026\u2060xpjzsx');
    expect(titleQuery('ab'.repeat(32))).toBe('abababab\u2060\u2026\u2060ababab');
    // Up to 20 characters, it stays whole: it fits a phone's line
    expect(titleQuery('0123456789abcdefghij')).toBe('0123456789abcdefghij');
    expect(titleQuery('0123456789abcdefghijk')).toBe('01234567\u2060\u2026\u2060fghijk');
  });

  it('leaves words as they are, which break between them, and cuts no character in two', () => {
    expect(titleQuery('the settlement transaction of a block')).toBe('the settlement transaction of a block');
    expect(titleQuery('Producer 1')).toBe('Producer 1');
    // Counted in characters: an emoji is two UTF-16 units, and each half would show as a stray mark
    const emoji = '\u{1F680}'.repeat(21);
    expect(titleQuery(emoji)).toBe(`${'\u{1F680}'.repeat(8)}\u2060\u2026\u2060${'\u{1F680}'.repeat(6)}`);
  });
});
