import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './client.ts';
import { LATEST_SCHEMA_VERSION } from './migrations.ts';

const readVersion = (client: ReturnType<typeof openDb>) => {
  const row = client.sqlite
    .prepare("SELECT value FROM index_meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;
  return row === undefined ? 0 : Number(row.value);
};

describe('schema migrations', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-migrations-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('stamps a fresh database at the latest version', () => {
    const client = openDb(dir);
    expect(readVersion(client)).toBe(LATEST_SCHEMA_VERSION);
    client.sqlite.close();
  });

  it('brings a database migrated before the counter existed up to the stamp', () => {
    const first = openDb(dir);
    first.sqlite.prepare("DELETE FROM index_meta WHERE key = 'schema_version'").run();
    first.sqlite.close();

    const second = openDb(dir);
    expect(readVersion(second)).toBe(LATEST_SCHEMA_VERSION);
    second.sqlite.close();
  });

  it('leaves a stamped database untouched on reopen', () => {
    const first = openDb(dir);
    first.sqlite
      .prepare(
        `INSERT INTO notes (title, content, file_path, created_at, updated_at)
         VALUES ('t', 'c', ?, 1, 1)`,
      )
      .run(join(dir, 't.md'));
    first.sqlite.prepare('UPDATE notes SET authored_at = 999').run();
    first.sqlite.close();

    const second = openDb(dir);
    const { authored_at } = second.sqlite.prepare('SELECT authored_at FROM notes').get() as {
      authored_at: number | null;
    };
    second.sqlite.close();

    expect(authored_at).toBe(999);
  });

  it('promotes hand-made sidecar tables without losing what they hold', () => {
    const first = openDb(dir);
    first.sqlite.exec(`
      DROP TABLE note_type_labels;
      DROP TABLE note_cards;
      CREATE TABLE note_type_labels(note_id integer primary key, type text not null,
        area text not null, method text not null, confidence text not null, at integer not null);
      CREATE TABLE note_cards(note_id integer primary key, line text, field text, quality text, at integer);
      INSERT INTO notes(title, content, file_path, source, created_at, updated_at)
        VALUES ('a', 'b', '/v/a.md', 'manual', 1, 1);
      INSERT INTO note_type_labels VALUES (1, '제품작업', '내 제품', 'tag', '약', 5);
      INSERT INTO note_cards VALUES (1, 'a card line', NULL, NULL, NULL);
      DELETE FROM index_meta WHERE key = 'schema_version';
      INSERT INTO index_meta(key, value) VALUES ('schema_version', '18');
    `);
    first.sqlite.close();

    const second = openDb(dir);
    expect(readVersion(second)).toBe(LATEST_SCHEMA_VERSION);
    expect(
      second.sqlite.prepare('SELECT * FROM note_type_labels').get() as Record<string, unknown>,
    ).toMatchObject({ note_id: 1, type: '제품작업', confidence: '약' });
    expect(
      second.sqlite.prepare('SELECT * FROM note_cards').get() as Record<string, unknown>,
    ).toMatchObject({ note_id: 1, line: 'a card line', field: 'none', quality: 'bad' });

    const ddl = second.sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'note_cards'")
      .get() as { sql: string };
    expect(ddl.sql).toContain('REFERENCES notes(id) ON DELETE CASCADE');
    second.sqlite.close();
  });

  it('drops a sidecar row whose note never made it across', () => {
    const first = openDb(dir);
    first.sqlite.exec(`
      DROP TABLE note_type_labels;
      CREATE TABLE note_type_labels(note_id integer primary key, type text not null,
        area text not null, method text not null, confidence text not null, at integer not null);
      INSERT INTO note_type_labels VALUES (404, '제품작업', '내 제품', 'tag', '약', 5);
      DELETE FROM index_meta WHERE key = 'schema_version';
      INSERT INTO index_meta(key, value) VALUES ('schema_version', '18');
    `);
    first.sqlite.close();

    const second = openDb(dir);
    expect(second.sqlite.prepare('SELECT COUNT(*) AS n FROM note_type_labels').get()).toEqual({
      n: 0,
    });
    second.sqlite.close();
  });

  it('backfills authored_at across more notes than one batch holds', () => {
    const first = openDb(dir);
    const insert = first.sqlite.prepare(
      `INSERT INTO notes (title, content, file_path, created_at, updated_at)
       VALUES (?, '', ?, 1, 1)`,
    );
    first.sqlite.transaction(() => {
      for (const i of Array.from({ length: 1200 }, (_, n) => n)) {
        insert.run(`note ${i} (2024-03-0${(i % 9) + 1})`, join(dir, `n${i}.md`));
      }
    })();
    first.sqlite.exec('UPDATE notes SET authored_at = NULL');
    first.sqlite.prepare("DELETE FROM index_meta WHERE key = 'schema_version'").run();
    first.sqlite.exec(`
      CREATE TABLE notes_rebuilt AS SELECT id, title, content, file_path, category, tags, source,
        layer, author, created_at, updated_at FROM notes;
      DROP TABLE notes;
      ALTER TABLE notes_rebuilt RENAME TO notes;
    `);
    first.sqlite.close();

    const second = openDb(dir);
    const { filled } = second.sqlite
      .prepare('SELECT COUNT(*) AS filled FROM notes WHERE authored_at IS NOT NULL')
      .get() as { filled: number };
    second.sqlite.close();

    expect(filled).toBe(1200);
  });
});
