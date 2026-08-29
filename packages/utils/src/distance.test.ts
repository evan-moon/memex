import { describe, expect, it } from 'vitest';
import { findNearest, withinEditDistance } from './distance.ts';

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

describe('findNearest', () => {
  const titles = [
    'Obsidian 정합성 재편',
    'memex',
    '모순 탐지 — 낡음 다음에 오는 것',
    'Opula 유료화 전략',
    'signals mint',
  ];

  it('finds the title a target is one edit away from', () => {
    expect(findNearest('Obsidian 정합성 재편본', titles, 2)).toBe('Obsidian 정합성 재편');
  });

  it('ignores a candidate that only differs in case', () => {
    expect(findNearest('MEMEX', ['memex', 'memux'], 1)).toBe('memux');
  });

  it('returns nothing when every candidate is too far', () => {
    expect(findNearest('완전히 다른 제목입니다', titles, 2)).toBeUndefined();
  });

  it('takes the first candidate that matches, not the closest', () => {
    expect(findNearest('memux', ['memex', 'memax'], 1)).toBe('memex');
  });

  it('never rejects a pair the exact measure would accept', () => {
    const alphabet = [...'ab근거x '];
    const words = alphabet.flatMap((a) =>
      alphabet.flatMap((b) =>
        alphabet.flatMap((c) => alphabet.map((d) => `${a}${b}${c}${d}단어`)),
      ),
    );

    for (const max of [1, 2]) {
      const target = 'ab근거단어';
      const exact = words.filter(
        (word) =>
          word.toLowerCase() !== target.toLowerCase() &&
          withinEditDistance(word.toLowerCase(), target.toLowerCase(), max),
      );
      expect(findNearest(target, words, max)).toBe(exact[0]);
    }
  });
});
