import { describe, expect, it } from 'vitest';
import type { DocumentBuffer } from './api.ts';
import { recoverableDraft, recoveryFor } from './draft-recovery.ts';
import { encodeNewDocument } from './new-document.ts';

const buffer = (over: Partial<DocumentBuffer> = {}): DocumentBuffer => ({
  draftKey: 'new:k-1',
  vaultId: '/vault',
  documentId: null,
  baseRevision: null,
  content: encodeNewDocument({ markdown: '# 원고\n\n첫 문단', layer: 'state', folder: 'writing' }),
  sequence: 3,
  at: 10,
  ...over,
});

describe('draft recovery', () => {
  it('reopens an unfinished document in its original folder', () => {
    expect(recoverableDraft(buffer())).toMatchObject({
      title: '원고',
      snippet: '첫 문단',
      path: '/new?draft=new%3Ak-1&folder=writing',
    });
  });

  it('opens the document when creation completed before the response was lost', () => {
    expect(recoverableDraft(buffer({ documentId: 42 })).path).toBe('/note/42');
  });
});

describe('recoveryFor', () => {
  const saved = { raw: '저장된 본문', revision: 'r-2' };

  it('has nothing to offer when nothing was left behind', () => {
    expect(recoveryFor(undefined, saved)).toEqual({ kind: 'nothing' });
  });

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
