import { describe, expect, it } from 'vitest';
import { asShown, parseReply } from './chat-replay.ts';

describe('parseReply', () => {
  // Turns recorded before the reply was kept have nothing but the line written
  // for the next prompt, which is the one thing the screen must not show.
  it('has nothing to draw for a turn recorded before replies were kept', () => {
    expect(parseReply(null)).toBeNull();
  });

  it('gives back the answer the person saw, citations and all', () => {
    const stored = JSON.stringify({
      kind: 'answer',
      text: '두 건이에요',
      cites: [{ id: 2251, title: 'memex 노트앱 피벗 논의' }],
    });
    expect(parseReply(stored)).toEqual({
      kind: 'answer',
      text: '두 건이에요',
      cites: [{ id: 2251, title: 'memex 노트앱 피벗 논의' }],
    });
  });

  it('refuses a shape it does not recognise rather than drawing half of it', () => {
    expect(parseReply('{"kind":"whatever"}')).toBeNull();
    expect(parseReply('not json')).toBeNull();
    expect(parseReply('null')).toBeNull();
    expect(parseReply('[]')).toBeNull();
  });
});

describe('asShown', () => {
  // The prefix addresses the next turn's prompt, not the person reading it back.
  it('drops the address to a reader who is not the person', () => {
    expect(asShown('they were told: 두 건이에요')).toBe('두 건이에요');
  });

  it('leaves a line that was not written that way alone', () => {
    expect(asShown('saved “t”, correcting “u”')).toBe('saved “t”, correcting “u”');
  });
});
