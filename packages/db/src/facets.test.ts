import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { getNoteCard, getNoteTypeLabel, resyncNoteFacets, syncNoteFacets } from './facets.ts';
import { deleteNote, insertNote } from './repository.ts';

const VAULT = '/vault';

describe('note facets', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-facets-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  const add = (over: Partial<Parameters<typeof insertNote>[1]> = {}) =>
    insertNote(client, {
      title: 'a note',
      content: '평범한 첫 문단으로 시작하는 본문이라고 적어둔 줄이다.',
      filePath: `${VAULT}/${Math.random()}.md`,
      source: 'manual',
      layer: 'past',
      ...over,
    });

  it('derives a label and a card from the note itself', () => {
    const note = add({ title: 'memex 세션 인계 2026-08-31' });
    syncNoteFacets(client, note.id);

    expect(getNoteTypeLabel(client, note.id)).toEqual({
      type: '세션기록',
      area: '작업',
      method: 'title',
      confidence: '강',
    });
    expect(getNoteCard(client, note.id)).toEqual({
      line: '평범한 첫 문단으로 시작하는 본문이라고 적어둔 줄이다.',
      field: 'body',
      quality: 'good',
    });
  });

  it('lets a declared type win over what the rules would have said', () => {
    const note = add({ title: 'memex 세션 인계 2026-08-31', type: '제품작업' });
    syncNoteFacets(client, note.id);

    expect(getNoteTypeLabel(client, note.id)).toMatchObject({
      type: '제품작업',
      method: 'declared',
    });
  });

  it('rewrites a stale label when the note changes', () => {
    const note = add({ title: 'plain' });
    syncNoteFacets(client, note.id);
    expect(getNoteTypeLabel(client, note.id)?.type).toBe('미분류');

    client.sqlite.prepare("UPDATE notes SET layer = 'rule' WHERE id = ?").run(note.id);
    syncNoteFacets(client, note.id);
    expect(getNoteTypeLabel(client, note.id)?.type).toBe('규칙');
  });

  it('gives every note a row and no note two', () => {
    add();
    add();
    add();
    expect(resyncNoteFacets(client)).toEqual({ notes: 3 });
    expect(resyncNoteFacets(client)).toEqual({ notes: 3 });

    const { labels, cards, notes } = client.sqlite
      .prepare(
        `SELECT (SELECT COUNT(*) FROM note_type_labels) AS labels,
                (SELECT COUNT(*) FROM note_cards) AS cards,
                (SELECT COUNT(*) FROM notes) AS notes`,
      )
      .get() as { labels: number; cards: number; notes: number };
    expect([labels, cards]).toEqual([notes, notes]);
  });

  it('takes a deleted note rows with it', () => {
    const note = add();
    syncNoteFacets(client, note.id);
    deleteNote(client, note.id);

    expect(getNoteTypeLabel(client, note.id)).toBeNull();
    expect(getNoteCard(client, note.id)).toBeNull();
  });
});
