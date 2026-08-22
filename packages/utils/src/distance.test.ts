import { describe, expect, it } from 'vitest';
import { withinEditDistance } from './distance.ts';

describe('withinEditDistance', () => {
  it('counts an identical string as distance zero', () => {
    expect(withinEditDistance('memex', 'memex', 0)).toBe(true);
  });

  it('counts one substitution, insertion or deletion as one', () => {
    expect(withinEditDistance('memex', 'memux', 1)).toBe(true);
    expect(withinEditDistance('memex', 'memexx', 1)).toBe(true);
    expect(withinEditDistance('memex', 'meme', 1)).toBe(true);
  });

  it('refuses a pair further apart than asked', () => {
    expect(withinEditDistance('memex', 'memux', 0)).toBe(false);
    expect(withinEditDistance('memex', 'obsidian', 2)).toBe(false);
  });

  it('answers on length alone when the gap is already too wide', () => {
    expect(withinEditDistance('a', 'abcdefghij', 2)).toBe(false);
  });

  it('measures Hangul by character, not by byte', () => {
    expect(withinEditDistance('근거', '근가', 1)).toBe(true);
    expect(withinEditDistance('근거', '판단', 1)).toBe(false);
  });

  it('handles an empty string against a word', () => {
    expect(withinEditDistance('', 'abc', 3)).toBe(true);
    expect(withinEditDistance('', 'abcd', 3)).toBe(false);
  });
});
