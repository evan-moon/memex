import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  deleteNote,
  getAmendments,
  getAmendmentsFor,
  insertNote,
  linkAmendment,
  serializeTags,
  syncLinks,
} from './repository.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-amend-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, content = 'body') =>
  insertNote(client, {
    title,
    content,
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer: 'past',
    tags: serializeTags([]),
  });

describe('amendment edges', () => {
  it('reports the correction on the note it corrects', () => {
    const original = addNote('original');
    const fix = addNote('[Amendment] original');
    linkAmendment(client, fix.id, original.id);

    expect(getAmendments(client, original.id).map((a) => a.id)).toEqual([fix.id]);
  });

  it('does not report the corrected note as an amendment of its correction', () => {
    const original = addNote('original');
    const fix = addNote('[Amendment] original');
    linkAmendment(client, fix.id, original.id);

    expect(getAmendments(client, fix.id)).toEqual([]);
  });

  it('orders several corrections oldest first', () => {
    const original = addNote('original');
    const first = addNote('[Amendment] original');
    const second = addNote('[Amendment 2] original');
    linkAmendment(client, second.id, original.id);
    linkAmendment(client, first.id, original.id);

    expect(getAmendments(client, original.id).map((a) => a.id)).toEqual([first.id, second.id]);
  });

  it('survives a content edit that rewrites the wiki links', () => {
    const original = addNote('original');
    const fix = addNote('[Amendment] original', 'links to [[original]]');
    linkAmendment(client, fix.id, original.id);
    syncLinks(client, fix.id, 'no links at all any more');

    expect(getAmendments(client, original.id)).toHaveLength(1);
  });

  it('follows a chain so the original warns about the newest correction too', () => {
    const original = addNote('original');
    const first = addNote('[Amendment] original');
    const second = addNote('[Amendment 2] original');
    linkAmendment(client, first.id, original.id);
    linkAmendment(client, second.id, first.id);

    expect(getAmendments(client, original.id).map((a) => a.id)).toEqual([first.id, second.id]);
  });

  it('does not loop forever if two notes amend each other', () => {
    const a = addNote('a');
    const b = addNote('b');
    linkAmendment(client, a.id, b.id);
    linkAmendment(client, b.id, a.id);

    expect(
      getAmendments(client, a.id)
        .map((n) => n.id)
        .sort(),
    ).toEqual([a.id, b.id]);
  });

  it('goes away with the amendment note', () => {
    const original = addNote('original');
    const fix = addNote('[Amendment] original');
    linkAmendment(client, fix.id, original.id);
    deleteNote(client, fix.id);

    expect(getAmendments(client, original.id)).toEqual([]);
  });

  it('does not confuse a plain wiki backlink for a correction', () => {
    const original = addNote('original');
    const mention = addNote('mentions it', 'see [[original]]');
    syncLinks(client, mention.id, 'see [[original]]');

    expect(getAmendments(client, original.id)).toEqual([]);
  });

  it('looks up corrections for a page of search results in one query', () => {
    const a = addNote('a');
    const b = addNote('b');
    addNote('c');
    const fixA = addNote('[Amendment] a');
    const fixB = addNote('[Amendment] b');
    linkAmendment(client, fixA.id, a.id);
    linkAmendment(client, fixB.id, b.id);

    const map = getAmendmentsFor(client, [a.id, b.id]);
    expect(map.get(a.id)?.[0].id).toBe(fixA.id);
    expect(map.get(b.id)?.[0].id).toBe(fixB.id);
  });

  it('returns nothing for an empty result page', () => {
    expect(getAmendmentsFor(client, []).size).toBe(0);
  });
});

describe('note_links migration', () => {
  it('lets one note both cite and correct another after a legacy two-column key', () => {
    const legacyDir = mkdtempSync(join(tmpdir(), 'memex-legacy-'));
    const legacy = openDb(legacyDir);
    legacy.sqlite.exec('DROP TABLE note_links');
    legacy.sqlite.exec(`
      CREATE TABLE note_links (
        source_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        source    TEXT    NOT NULL DEFAULT 'wiki',
        PRIMARY KEY (source_id, target_id)
      );
    `);
    legacy.sqlite
      .prepare("INSERT INTO note_links(source_id, target_id, source) VALUES (1, 2, 'wiki')")
      .run();
    legacy.sqlite.close();

    const migrated = openDb(legacyDir);
    migrated.sqlite
      .prepare(
        "INSERT OR IGNORE INTO note_links(source_id, target_id, source) VALUES (1, 2, 'amends')",
      )
      .run();
    const { n } = migrated.sqlite
      .prepare('SELECT COUNT(*) AS n FROM note_links WHERE source_id = 1 AND target_id = 2')
      .get() as { n: number };
    migrated.sqlite.close();
    rmSync(legacyDir, { recursive: true, force: true });

    expect(n).toBe(2);
  });
});
