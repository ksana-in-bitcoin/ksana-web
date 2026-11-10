import { describe, expect, it } from 'vitest';
import { typedOption } from './LanguageSelect';

const OPTIONS = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'tr', name: 'Ünlü' },
  { code: 'es', name: 'Español' },
];

describe('typedOption', () => {
  it('moves to the next language that starts with the typed letter, by name or code', () => {
    expect(typedOption('e', 0, OPTIONS)).toBe(3);
    expect(typedOption('E', 3, OPTIONS)).toBe(0);
    expect(typedOption('d', 0, OPTIONS)).toBe(1);
    expect(typedOption('ü', 0, OPTIONS)).toBe(2);
    expect(typedOption('t', 0, OPTIONS)).toBe(2);
  });

  it('stays where it is when the letter starts only the current language, and finds none for any other', () => {
    expect(typedOption('t', 2, OPTIONS)).toBe(2);
    expect(typedOption('q', 0, OPTIONS)).toBe(-1);
  });
});
