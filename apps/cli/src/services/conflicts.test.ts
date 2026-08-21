import { describe, expect, it } from 'vitest';
import { buildPrompt, parseJudgement } from './conflicts.ts';

describe('parseJudgement', () => {
  it('reads the verdict off the first line', () => {
    expect(parseJudgement('CONTRADICTION\n둘 다 따를 수 없어.')).toEqual({
      verdict: 'contradiction',
      explanation: '둘 다 따를 수 없어.',
    });
  });

  it('accepts the explanation on the same line as the verdict', () => {
    expect(parseJudgement('COMPLEMENT: 하나가 다른 하나의 범위를 좁힌다.')).toEqual({
      verdict: 'complement',
      explanation: '하나가 다른 하나의 범위를 좁힌다.',
    });
  });

  it('joins an explanation that runs over several lines', () => {
    const parsed = parseJudgement('same\n\n같은 말을 한다.\n한쪽이 더 길 뿐이다.');
    expect(parsed?.explanation).toBe('같은 말을 한다. 한쪽이 더 길 뿐이다.');
  });

  it('refuses an answer that does not open with one of the four words', () => {
    expect(parseJudgement('둘은 서로 모순됩니다.')).toBeNull();
    expect(parseJudgement('')).toBeNull();
  });

  it('does not read "unrelated" out of a sentence that merely contains it', () => {
    expect(parseJudgement('It is not unrelated, they contradict.')).toBeNull();
  });
});

describe('buildPrompt', () => {
  const side = (id: number, body: string) => ({ id, title: `제목 ${id}`, body, at: '2026-01-01' });

  it('names all four answers, so agreement is not reported as conflict', () => {
    const prompt = buildPrompt(side(1, 'a'), side(2, 'b'));

    for (const word of ['CONTRADICTION', 'SAME', 'COMPLEMENT', 'UNRELATED']) {
      expect(prompt).toContain(word);
    }
  });

  it('clips a long note rather than sending the whole vault', () => {
    const prompt = buildPrompt(side(1, 'ㄱ'.repeat(9000)), side(2, 'b'));

    expect(prompt).toContain('[...]');
    expect(prompt.length).toBeLessThan(9000);
  });
});
