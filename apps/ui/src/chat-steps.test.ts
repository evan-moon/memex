import { describe, expect, it } from 'vitest';
import type { ChatStep } from './api.ts';
import { shownSteps, stepLine } from './chat-steps.ts';
import { dictionaries } from './i18n.ts';

const t = dictionaries.en;

describe('what a running turn says it is doing', () => {
  it('names the looking, not just the waiting', () => {
    expect(stepLine({ kind: 'searched', query: 'opula', found: 3 }, t)).toBe(
      'Searched “opula” — 3 notes',
    );
    expect(stepLine({ kind: 'searched', query: 'opula', found: 0 }, t)).toBe(
      'Searched “opula” — nothing',
    );
    expect(stepLine({ kind: 'read', count: 1 }, t)).toBe('Read 1 note');
    expect(stepLine({ kind: 'skill', title: '글쓰기' }, t)).toBe('Following “글쓰기”');
  });

  // Waiting for an answer and waiting for a note are the same blank pause
  // otherwise, and they are the two the reader most wants told apart.
  it('tells writing an answer from writing a note', () => {
    expect(stepLine({ kind: 'acting', action: 'answer' }, t)).toBe('Writing the answer…');
    expect(stepLine({ kind: 'acting', action: 'new-note' }, t)).toBe('Writing it out…');
  });

  it('falls back rather than showing an action word it has no sentence for', () => {
    expect(stepLine({ kind: 'acting', action: 'rule-decision' }, t)).toBe(t.chat.thinking);
    expect(stepLine({ kind: 'thinking' }, t)).toBe(t.chat.thinking);
  });
});

describe('the trail a long turn leaves', () => {
  const steps: ChatStep[] = Array.from({ length: 9 }, () => ({ kind: 'thinking' }));

  // The line drawn for the fourth step has to stay the fourth step's line when
  // a ninth arrives. Numbering from the end of a window that slides would move
  // every line up by one each time the turn looked again.
  it('keeps each step at the place it had in the whole turn', () => {
    expect(shownSteps(steps).map((one) => one.at)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(shownSteps(steps.slice(0, 4)).map((one) => one.at)).toEqual([0, 1, 2, 3]);
  });
});
