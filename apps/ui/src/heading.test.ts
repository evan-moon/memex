import { describe, expect, it } from 'vitest';
import { bodyUnder, isUntouched, titleOf, withTitle } from './heading.ts';

describe('titleOf', () => {
  it('reads the first heading as the note’s name', () => {
    expect(titleOf('# 오늘 결정한 것\n\n## 맥락\n')).toBe('오늘 결정한 것');
  });

  it('reads nothing when the note does not open with one', () => {
    expect(titleOf('그냥 본문이다.')).toBe('');
    expect(titleOf('## 맥락\n')).toBe('');
    expect(titleOf('')).toBe('');
  });

  it('does not mind the blank lines a template leaves above it', () => {
    expect(titleOf('\n\n# 제목\n')).toBe('제목');
  });

  it('is empty while the title is still being typed', () => {
    expect(titleOf('# \n\n## 맥락')).toBe('');
  });
});

describe('bodyUnder', () => {
  it('is everything after the title line', () => {
    expect(bodyUnder('# 제목\n\n## 맥락\n\n- a\n')).toBe('## 맥락\n\n- a\n');
  });

  it('is the whole thing when there is no title yet', () => {
    expect(bodyUnder('## 맥락\n')).toBe('## 맥락\n');
  });

  it('round-trips through withTitle', () => {
    const body = '# 제목\n\n## 맥락\n\n- a\n';
    expect(withTitle(titleOf(body), bodyUnder(body))).toBe(body);
  });
});

describe('isUntouched', () => {
  const templates = ['## 맥락\n\n## 결정과 이유', '## 지금 참인 것'];

  it('is untouched while it is empty or still the scaffold', () => {
    expect(isUntouched('', templates)).toBe(true);
    expect(isUntouched('  \n ', templates)).toBe(true);
    expect(isUntouched('## 맥락\n\n## 결정과 이유\n', templates)).toBe(true);
  });

  // The whole point: swapping the kind of note must never eat a sentence.
  it('is touched the moment a word is in it', () => {
    expect(isUntouched('## 맥락\n\n오늘 정했다\n\n## 결정과 이유', templates)).toBe(false);
  });
});
