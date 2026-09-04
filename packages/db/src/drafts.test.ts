import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { basisOf, draftedNotes, dropDraft, getDraft, putDraft } from './drafts.ts';
import { insertNote } from './repository.ts';

describe('a draft written before anyone asked', () => {
  let dir: string;
  let client: MemexClient;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-drafts-'));
    client = openDb(dir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const note = (content: string) =>
    insertNote(client, {
      title: 'a projection',
      content,
      filePath: join(dir, `${Math.random()}.md`),
      source: 'manual',
      layer: 'state',
    });

  const source = { id: 9, content: '근거 본문' };

  it('comes back while the note and its evidence stand where they were', () => {
    const target = note('지금 참인 것');
    putDraft(client, target.id, {
      body: '다시 쓴 본문',
      changes: [{ text: '트라이얼이 14일로 바뀜', from: [9] }],
      verdict: 'changed',
      noteContent: target.content,
      basis: basisOf([source]),
    });

    const found = getDraft(client, target.id, {
      noteContent: target.content,
      basis: basisOf([source]),
    });
    expect(found?.body).toBe('다시 쓴 본문');
    expect(found?.changes).toEqual([{ text: '트라이얼이 14일로 바뀜', from: [9] }]);
  });

  // A draft is about a note as it read when written. Handing back one written
  // for different text would put the person's approval on the wrong thing.
  it('is withheld once the note itself has been rewritten', () => {
    const target = note('지금 참인 것');
    putDraft(client, target.id, {
      body: '다시 쓴 본문',
      changes: [],
      verdict: 'changed',
      noteContent: target.content,
      basis: basisOf([source]),
    });

    expect(
      getDraft(client, target.id, { noteContent: '사람이 먼저 고쳤다', basis: basisOf([source]) }),
    ).toBeNull();
  });

  it('is withheld once the evidence that prompted it has moved', () => {
    const target = note('지금 참인 것');
    putDraft(client, target.id, {
      body: '다시 쓴 본문',
      changes: [],
      verdict: 'changed',
      noteContent: target.content,
      basis: basisOf([source]),
    });

    expect(
      getDraft(client, target.id, {
        noteContent: target.content,
        basis: basisOf([{ id: 9, content: '근거가 바뀌었다' }]),
      }),
    ).toBeNull();
  });

  it('does not care what order the evidence arrived in', () => {
    const a = { id: 1, content: 'a' };
    const b = { id: 2, content: 'b' };
    expect(basisOf([a, b])).toBe(basisOf([b, a]));
  });

  it('replaces the one it had rather than stacking a second', () => {
    const target = note('지금 참인 것');
    const write = (body: string) =>
      putDraft(client, target.id, {
        body,
        changes: [],
        verdict: 'changed',
        noteContent: target.content,
        basis: basisOf([source]),
      });
    write('첫 초안');
    write('둘째 초안');

    expect(draftedNotes(client)).toEqual([target.id]);
    expect(
      getDraft(client, target.id, { noteContent: target.content, basis: basisOf([source]) })?.body,
    ).toBe('둘째 초안');
  });

  it('goes when it is spent', () => {
    const target = note('지금 참인 것');
    putDraft(client, target.id, {
      body: 'x',
      changes: [],
      verdict: 'changed',
      noteContent: target.content,
      basis: basisOf([source]),
    });
    dropDraft(client, target.id);

    expect(draftedNotes(client)).toEqual([]);
  });
});
