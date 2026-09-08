import { describe, expect, it } from 'vitest';
import { chooseOperation } from './update-note.ts';

describe('chooseOperation', () => {
  // Everything that spoke the older shape keeps speaking it.
  it('takes a call with no operation as the memory edit it always was', () => {
    expect(chooseOperation({ title: 'a better plan' })).toEqual({ kind: 'memory' });
    expect(chooseOperation({ content: 'more' })).toEqual({ kind: 'memory' });
    expect(chooseOperation({ tags: ['one'] })).toEqual({ kind: 'memory' });
  });

  it('writes a document when it is given one and told to', () => {
    expect(
      chooseOperation({ operation: 'edit-document', raw: '# x\n', expectedRevision: 'r-1' }),
    ).toEqual({ kind: 'document', raw: '# x\n', expectedRevision: 'r-1' });
  });

  // Deliberately stricter than the agent edits that came before, and the
  // contract says to announce it rather than pretend older clients are safe.
  it('refuses a document write that does not say which version it is built on', () => {
    expect(chooseOperation({ operation: 'edit-document', raw: '# x\n' })).toMatchObject({
      kind: 'refused',
      code: 'REVISION_REQUIRED',
    });
  });

  it('refuses a document write with no document in it', () => {
    expect(chooseOperation({ operation: 'edit-document', expectedRevision: 'r-1' })).toMatchObject({
      code: 'RAW_REQUIRED',
    });
  });

  // Both shapes at once is not a merge of them. It is a request whose meaning
  // nobody can state, and guessing which half was meant is how a document gets
  // half-written.
  it('refuses a call that is both things at once', () => {
    expect(
      chooseOperation({
        operation: 'edit-document',
        raw: '# x\n',
        expectedRevision: 'r-1',
        title: 'also this',
      }),
    ).toMatchObject({ code: 'MIXED_OPERATION' });

    expect(chooseOperation({ raw: '# x\n' })).toMatchObject({ code: 'MIXED_OPERATION' });
    expect(chooseOperation({ expectedRevision: 'r-1' })).toMatchObject({
      code: 'MIXED_OPERATION',
    });
  });

  it('is a memory edit when it says so out loud', () => {
    expect(chooseOperation({ operation: 'edit-memory', title: 'x' })).toEqual({ kind: 'memory' });
  });
});
