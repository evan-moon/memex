import { describe, expect, it } from 'vitest';
import type { ChatReply } from './api.ts';
import { digest } from './chat-history.ts';

const said = (said: string, reply: ChatReply | null, discarded?: boolean) => ({
  said,
  reply,
  discarded,
});

const done: ChatReply = {
  kind: 'done',
  receipt: {
    kind: 'register',
    subject: 'opula',
    predicate: 'trial.duration',
    previous: ['14일'],
    value: '30일',
    newPredicate: false,
    similar: [],
  },
};

describe('what the next turn is told about this one', () => {
  it('says what was written, not that something was said', () => {
    expect(digest([said('30일이야', done)])).toEqual([
      { said: '30일이야', outcome: 'opula · trial.duration is now 30일' },
    ]);
  });

  // A turn that wrote nothing still matters: the next one should not be told
  // the change landed when the reader walked away from it.
  it('is explicit that nothing landed when nothing did', () => {
    const outcomes = digest([
      said('a', { kind: 'unmapped', reason: 'none', searchable: true }),
      said('b', { kind: 'failed', failure: 'cancelled', remedy: 'none', detail: '' }),
      said('c', {
        kind: 'confirm',
        ticket: 't',
        preview: {
          kind: 'register',
          subject: 's',
          predicate: 'p',
          from: [],
          to: 'v',
          newPredicate: false,
        },
      }),
      said('d', null, true),
    ]).map((turn) => turn.outcome);

    expect(outcomes[0]).toContain('nothing was written');
    expect(outcomes[1]).toContain('nothing was written');
    expect(outcomes[2]).toContain('waiting');
    expect(outcomes[3]).toContain('nothing was written');
  });

  it('carries the last few rather than the whole conversation', () => {
    const many = Array.from({ length: 20 }, (_, at) => said(`turn ${at}`, done));

    const carried = digest(many);

    expect(carried).toHaveLength(6);
    expect(carried.at(-1)?.said).toBe('turn 19');
  });
});
