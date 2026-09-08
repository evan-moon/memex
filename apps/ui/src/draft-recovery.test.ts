import { describe, expect, it } from 'vitest';
import { recoveryFor } from './draft-recovery.ts';

const saved = { raw: '저장된 본문', revision: 'r-2' };

describe('recoveryFor', () => {
  it('has nothing to offer when nothing was left behind', () => {
    expect(recoveryFor(undefined, saved)).toEqual({ kind: 'nothing' });
  });

  // The common case after a clean close: the draft is what the file already
  // says, so there is nothing to ask about.
  it('says a draft that matches the file is already saved', () => {
    expect(recoveryFor({ content: '저장된 본문', baseRevision: 'r-2' }, saved)).toEqual({
      kind: 'already-saved',
    });
  });

  it('offers the unsaved text beside what is on disk', () => {
    expect(recoveryFor({ content: '더 쓴 문단', baseRevision: 'r-2' }, saved)).toEqual({
      kind: 'unsaved',
      draft: '더 쓴 문단',
      saved: '저장된 본문',
    });
  });

  // The document moved on while the draft was in the ground — somebody edited
  // it elsewhere, or an agent applied a change. Neither text descends from the
  // other, and restoring on top would lose one of them.
  it('calls it a conflict when the document moved under the draft', () => {
    expect(recoveryFor({ content: '더 쓴 문단', baseRevision: 'r-1' }, saved)).toMatchObject({
      kind: 'conflict',
    });
  });

  it('does not call it a conflict when the draft never knew a version', () => {
    expect(recoveryFor({ content: '더 쓴 문단', baseRevision: null }, saved)).toMatchObject({
      kind: 'unsaved',
    });
  });
});
