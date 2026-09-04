import type { Note } from '@memex/db';
import { describe, expect, it } from 'vitest';
import { type ApplyFailure, type ChatFailure, failureOf, remedyFor } from './errors.ts';
import type { Plan } from './plan.ts';
import { previewOf, receiptOf } from './render.ts';
import type { Candidates, Wrote } from './turn.ts';

const note = (id: number, title: string): Note => ({
  id,
  title,
  content: `# ${title}\n\nbody`,
  filePath: `/vault/${title}.md`,
  category: null,
  tags: '',
  source: 'manual',
  layer: 'past',
  author: 'person',
  authoredAt: null,
  ruleStatus: null,
  ruleScope: null,
  confirmedAt: null,
  type: null,
  createdAt: 0,
  updatedAt: 0,
});

const candidates: Candidates = {
  notes: [{ id: 12, title: 'the note that got it wrong', layer: 'past', snippet: '…' }],
  register: [
    {
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'global' },
      value: '14일',
    },
  ],
  rules: [{ id: 90, title: 'a rule awaiting approval', snippet: '…' }],
  skills: [],
  searchable: true,
};

describe('showing a plan before it happens', () => {
  it('puts the value that is there now beside the one that would replace it', () => {
    const plan: Plan = {
      kind: 'set-register',
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'global' },
      value: '30일',
      newPredicate: false,
    };

    expect(previewOf(plan, candidates)).toEqual({
      kind: 'register',
      subject: 'opula',
      predicate: 'trial.duration',
      from: ['14일'],
      to: '30일',
      newPredicate: false,
    });
  });

  it('names the note a correction is aimed at, rather than its id', () => {
    const plan: Plan = { kind: 'amend-note', amends: 12, title: 'what it was', content: 'body' };

    expect(previewOf(plan, candidates)).toMatchObject({
      kind: 'amend',
      target: { id: 12, title: 'the note that got it wrong' },
    });
  });

  it('says it cannot name a target it was not shown, instead of inventing one', () => {
    const plan: Plan = { kind: 'amend-note', amends: 999, title: 't', content: 'c' };

    expect(previewOf(plan, candidates)).toMatchObject({ kind: 'amend', target: null });
  });

  it('clips a body long enough to fill the screen it is previewed on', () => {
    const plan: Plan = {
      kind: 'new-note',
      title: 't',
      content: 'x'.repeat(900),
      folder: null,
      layer: 'past',
      tags: [],
    };

    const preview = previewOf(plan, candidates);
    if (preview.kind !== 'new-note') throw new Error('wrong preview');
    expect(preview.body.length).toBeLessThan(450);
    expect(preview.body.endsWith('…')).toBe(true);
  });
});

describe('saying what happened', () => {
  it('keeps the value it replaced, because writing it back would be a new event', () => {
    const wrote: Wrote = {
      kind: 'register',
      subject: 'opula',
      predicate: 'trial.duration',
      value: '30일',
      previous: ['14일'],
      newPredicate: false,
      similar: ['trial_length'],
    };

    expect(receiptOf(wrote)).toMatchObject({ previous: ['14일'], similar: ['trial_length'] });
  });

  it('reports a note that saved while its correction did not attach', () => {
    const wrote: Wrote = {
      kind: 'note',
      note: note(31, 'what it actually was'),
      amended: null,
      amendsMissing: 12,
    };

    expect(receiptOf(wrote)).toEqual({
      kind: 'note',
      id: 31,
      title: 'what it actually was',
      corrected: null,
      unlinked: 12,
    });
  });

  // The screen only ever shows an id and a title. Handing it the row invites it
  // to show the file path and the body it was never meant to.
  it('hands over what is shown, not the row it came from', () => {
    const wrote: Wrote = {
      kind: 'note',
      note: note(31, 'a correction'),
      amended: note(12, 'the note that got it wrong'),
      amendsMissing: null,
    };

    expect(JSON.stringify(receiptOf(wrote))).not.toContain('/vault/');
    expect(receiptOf(wrote)).toMatchObject({
      corrected: { id: 12, title: 'the note that got it wrong' },
      unlinked: null,
    });
  });
});

describe('what a failure asks of the reader', () => {
  it('sends each failure somewhere it can actually be fixed', () => {
    const expected: Record<ChatFailure | ApplyFailure, string> = {
      'not-installed': 'install',
      'logged-out': 'sign-in',
      quota: 'billing',
      'model-refused': 'retry',
      refused: 'retry',
      timeout: 'retry',
      cancelled: 'none',
      'unreadable-plan': 'rephrase',
      'register-rejected': 'rephrase',
      'save-rejected': 'none',
      'target-missing': 'rephrase',
    };

    for (const [failure, remedy] of Object.entries(expected)) {
      expect(remedyFor(failure as ChatFailure)).toBe(remedy);
    }
  });

  it('calls a refusal it cannot place a refusal, not a missing CLI', () => {
    expect(failureOf({ error: 'something went wrong' })).toBe('refused');
    expect(failureOf({ error: 'gone', code: 'timeout' })).toBe('timeout');
  });
});
