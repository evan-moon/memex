import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EMBEDDING_DIM } from '@memex/utils';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { parseAuthoredAt } from './dates.ts';
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

  try {
    sqlite.exec('ALTER TABLE notes ADD COLUMN category TEXT');
  } catch {
    /* already exists */
  }
  try {
    sqlite.exec("ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  } catch {
    /* already exists */
  }

  const cols = sqlite.prepare('PRAGMA table_info(notes)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'layer')) {
    sqlite.exec("ALTER TABLE notes ADD COLUMN layer TEXT NOT NULL DEFAULT 'past'");

    const STATE_FOLDERS = ['projects', 'dev', 'herald'];
    const RULE_FOLDERS = ['coding'];

    const setLayer = sqlite.prepare(
      "UPDATE notes SET layer = ? WHERE category = ? OR category LIKE ? || '/%'",
    );

    for (const f of STATE_FOLDERS) setLayer.run('state', f, f);
    for (const f of RULE_FOLDERS) setLayer.run('rule', f, f);
  }

  // author: whose memory a note is. Backfilled from the path, which is where
  // the distinction already lived — an agent keeps its working notes in a
  // `memory/` directory beside the project they belong to.
  if (!cols.some((c) => c.name === 'author')) {
    sqlite.exec("ALTER TABLE notes ADD COLUMN author TEXT NOT NULL DEFAULT 'person'");
    sqlite.exec("UPDATE notes SET author = 'agent' WHERE file_path LIKE '%/memory/%'");
  }

  // authored_at: the note's real authored date (frontmatter `date:` or a
  // (YYYY-MM-DD) in the title), distinct from created_at (import time). Without
  // it, temporal signals are meaningless on an imported vault where every
  // created_at lands in the import window.
  if (!cols.some((c) => c.name === 'authored_at')) {
    sqlite.exec('ALTER TABLE notes ADD COLUMN authored_at INTEGER');

    const rows = sqlite.prepare('SELECT id, title, content FROM notes').all() as {
      id: number;
      title: string;
      content: string;
    }[];
    const upd = sqlite.prepare('UPDATE notes SET authored_at = ? WHERE id = ?');
    const backfill = sqlite.transaction(() => {
      for (const r of rows) {
        const ms = parseAuthoredAt(r.title, r.content);
        if (ms !== null) upd.run(ms, r.id);
      }
    });
    backfill();
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS note_links (
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      source    TEXT    NOT NULL DEFAULT 'wiki',
      PRIMARY KEY (source_id, target_id, source)
    );
  `);

  const linkCols = sqlite.prepare('PRAGMA table_info(note_links)').all() as { name: string }[];
  if (!linkCols.some((c) => c.name === 'source')) {
    sqlite.exec("ALTER TABLE note_links ADD COLUMN source TEXT NOT NULL DEFAULT 'wiki'");
  }

  // `source` was added by ALTER on older DBs, which cannot widen a primary key —
  // so a pair already joined by a wiki link silently rejected every other edge
  // type between the same two notes, amendments included. Rebuild the table so
  // one note can both cite and correct another.
  const linkPk = sqlite.prepare('PRAGMA table_info(note_links)').all() as {
    name: string;
    pk: number;
  }[];
  if (!linkPk.some((c) => c.name === 'source' && c.pk > 0)) {
    sqlite.exec(`
      CREATE TABLE note_links_rebuilt (
        source_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        source    TEXT    NOT NULL DEFAULT 'wiki',
        PRIMARY KEY (source_id, target_id, source)
      );
      INSERT OR IGNORE INTO note_links_rebuilt(source_id, target_id, source)
        SELECT source_id, target_id, source FROM note_links;
      DROP TABLE note_links;
      ALTER TABLE note_links_rebuilt RENAME TO note_links;
    `);
  }

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

  const evCols = sqlite.prepare('PRAGMA table_info(inference_evidence)').all() as {
    name: string;
  }[];
  if (!evCols.some((c) => c.name === 'source_excerpt')) {
    sqlite.exec('ALTER TABLE inference_evidence ADD COLUMN source_excerpt TEXT');
  }

  // prompt_text: the exact evidence bundle the agent synthesized from at mint
  // time, kept verbatim so "why did the AI think that?" stays answerable even
  // after the source notes change.
  const infCols = sqlite.prepare('PRAGMA table_info(inferences)').all() as { name: string }[];
  if (!infCols.some((c) => c.name === 'prompt_text')) {
    sqlite.exec('ALTER TABLE inferences ADD COLUMN prompt_text TEXT');
  }

  return { db: drizzle(sqlite, { schema }), sqlite };
};
