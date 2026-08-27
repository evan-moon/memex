import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EMBEDDING_DIM } from '@memex/utils';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { applyMigrations } from './migrations.ts';
import * as schema from './schema.ts';

export { EMBEDDING_DIM };

export type MemexClient = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
};

export const openDb = (dbDir: string, embeddingDim = EMBEDDING_DIM): MemexClient => {
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

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS index_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const embRow = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'note_embeddings'")
    .get() as { sql: string } | undefined;
  if (!embRow?.sql?.includes(`FLOAT[${embeddingDim}]`)) {
    sqlite.exec('DROP TABLE IF EXISTS note_embeddings');
  }
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS note_embeddings USING vec0(
      note_id   INTEGER PRIMARY KEY,
      embedding FLOAT[${embeddingDim}]
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS note_chunks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id    INTEGER NOT NULL,
      ord        INTEGER NOT NULL,
      heading    TEXT,
      excerpt    TEXT    NOT NULL,
      start_char INTEGER NOT NULL,
      end_char   INTEGER NOT NULL
    );
  `);
  sqlite.exec('CREATE INDEX IF NOT EXISTS note_chunks_note_id ON note_chunks(note_id)');

  const chunkEmbRow = sqlite
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'note_chunk_embeddings'",
    )
    .get() as { sql: string } | undefined;
  if (chunkEmbRow && !chunkEmbRow.sql.includes(`FLOAT[${embeddingDim}]`)) {
    sqlite.exec('DROP TABLE IF EXISTS note_chunk_embeddings');
    sqlite.exec('DELETE FROM note_chunks');
  }
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS note_chunk_embeddings USING vec0(
      chunk_id  INTEGER PRIMARY KEY,
      embedding FLOAT[${embeddingDim}]
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS note_links (
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      source    TEXT    NOT NULL DEFAULT 'wiki',
      PRIMARY KEY (source_id, target_id, source)
    );
  `);

  // What a `[[Title]]` can name a note by, one row per name. Resolving a link
  // used to load every title in the vault and build two Maps for it; here it is
  // an indexed point lookup that costs the same whether the vault holds a
  // thousand notes or a hundred thousand.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS note_title_keys (
      key     TEXT    NOT NULL,
      kind    TEXT    NOT NULL,
      note_id INTEGER NOT NULL,
      PRIMARY KEY (key, kind, note_id)
    );
    CREATE INDEX IF NOT EXISTS note_title_keys_note ON note_title_keys (note_id);
  `);

  // Every `[[X]]` a note was written with, and the keys that link could resolve
  // under. Asking which links are dead used to mean reading every body in the
  // vault; against this it is one join between two indexes.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS note_link_targets (
      note_id  INTEGER NOT NULL,
      ord      INTEGER NOT NULL,
      target   TEXT    NOT NULL,
      key_full TEXT    NOT NULL,
      key_stem TEXT,
      PRIMARY KEY (note_id, ord)
    );
    CREATE INDEX IF NOT EXISTS note_link_targets_full ON note_link_targets (key_full);
    CREATE INDEX IF NOT EXISTS note_link_targets_stem ON note_link_targets (key_stem);
  `);

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

  try {
    const { n } = sqlite.prepare('SELECT COUNT(*) as n FROM notes_fts_docsize').get() as {
      n: number;
    };
    if (n === 0) sqlite.exec("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')");
  } catch {
    /* FTS5 not available — search degrades gracefully */
  }

  // Inference engine — Lv1 deterministic signals triage queue.
  // Signals point at un-synthesized patterns; they are NOT inferences.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT    NOT NULL,
      evidence_ids TEXT    NOT NULL,
      reasoning    TEXT,
      signal_hash  TEXT    NOT NULL UNIQUE,
      status       TEXT    NOT NULL DEFAULT 'new',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
  `);

  // Small key/value store for engine bookkeeping (e.g. last signal refresh, for
  // the dirty-flag that makes on-read detection free when nothing changed).
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS engine_meta (
      key   TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
  `);

  // Inference engine — Lv2 inferences (hypotheses) and their evidence edges.
  // An inference is NOT a note: it is an LLM-synthesized hypothesis, kept in a
  // separate table so it can never be fed back into search/synthesis as if it
  // were a primary source (which would self-poison the brain). Each edge stores
  // the source note's content hash AT MINT TIME so drift can be detected
  // deterministically (see checkInferenceStale). Evidence rows intentionally
  // have NO foreign-key cascade: when a source note is deleted the row remains
  // so the inference can be flagged orphaned rather than silently shrinking.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS inferences (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      title          TEXT    NOT NULL,
      summary        TEXT    NOT NULL,
      confidence     REAL,
      status         TEXT    NOT NULL DEFAULT 'active',
      model_id       TEXT,
      prompt_version TEXT,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );
  `);
  // What a state note declares it was built from, with each source's body hash
  // at declaration time. The frontmatter is the record; this is the index.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS note_evidence (
      note_id     INTEGER NOT NULL,
      source_id   INTEGER NOT NULL,
      source_hash TEXT    NOT NULL,
      declared_at INTEGER NOT NULL,
      PRIMARY KEY (note_id, source_id)
    );
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS inference_evidence (
      inference_id   INTEGER NOT NULL,
      note_id        INTEGER NOT NULL,
      role           TEXT    NOT NULL DEFAULT 'source',
      source_hash    TEXT    NOT NULL,
      source_excerpt TEXT,
      PRIMARY KEY (inference_id, note_id)
    );
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS dangling_dismissed (
      note_id INTEGER PRIMARY KEY,
      at      INTEGER NOT NULL
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS note_shape (
      note_id     INTEGER PRIMARY KEY,
      kind        TEXT    NOT NULL,
      source_hash TEXT    NOT NULL,
      model_id    TEXT,
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_claims (
      note_id INTEGER NOT NULL,
      idx     INTEGER NOT NULL,
      text    TEXT    NOT NULL,
      PRIMARY KEY (note_id, idx)
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS retrieval_log (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      query   TEXT    NOT NULL,
      note_id INTEGER NOT NULL,
      rank    INTEGER NOT NULL,
      surface TEXT    NOT NULL,
      at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS retrieval_log_note ON retrieval_log (note_id);
    CREATE INDEX IF NOT EXISTS retrieval_log_at ON retrieval_log (at);
  `);

  // A signal's status says what became of it, never whether it was put in front
  // of anyone. Without that, silence and refusal are the same row — and a signal
  // nobody saw would be read as one the user turned down.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS signal_presentations (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id INTEGER NOT NULL,
      surface   TEXT    NOT NULL,
      at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS signal_presentations_signal
      ON signal_presentations (signal_id);
  `);

  applyMigrations(sqlite);

  return { db: drizzle(sqlite, { schema }), sqlite };
};
