import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema.ts';

export const EMBEDDING_DIM = 768;

export type MemexClient = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
};

export const openDb = (dbDir: string): MemexClient => {
  mkdirSync(dbDir, { recursive: true });

  const sqlite = new Database(join(dbDir, 'memex.db'));
  sqliteVec.load(sqlite);

  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous  = NORMAL;
    PRAGMA cache_size   = -32000;
    PRAGMA temp_store   = MEMORY;
    PRAGMA mmap_size    = 134217728;
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      file_path  TEXT    NOT NULL UNIQUE,
      category   TEXT,
      tags       TEXT    NOT NULL DEFAULT '[]',
      source     TEXT    NOT NULL DEFAULT 'manual',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Recreate vec0 table if embedding dimension changed (e.g. model upgrade)
  const embRow = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'note_embeddings'")
    .get() as { sql: string } | undefined;
  if (!embRow?.sql?.includes(`FLOAT[${EMBEDDING_DIM}]`)) {
    sqlite.exec('DROP TABLE IF EXISTS note_embeddings');
  }
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS note_embeddings USING vec0(
      note_id   INTEGER PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIM}]
    );
  `);

  // Idempotent migrations for pre-existing DBs
  try { sqlite.exec('ALTER TABLE notes ADD COLUMN category TEXT'); } catch { /* already exists */ }
  try { sqlite.exec("ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'"); } catch { /* already exists */ }

  // FTS5 full-text index (BM25 over title + content)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      title,
      content,
      content='notes',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 1'
    );
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
    END;
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
  `);

  // One-time backfill: notes_fts_docsize has one row per indexed doc; 0 = index is empty
  try {
    const { n } = sqlite.prepare('SELECT COUNT(*) as n FROM notes_fts_docsize').get() as { n: number };
    if (n === 0) sqlite.exec("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')");
  } catch { /* FTS5 not available — search degrades gracefully */ }

  return { db: drizzle(sqlite, { schema }), sqlite };
};
