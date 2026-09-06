import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EMBEDDING_DIM } from '@memex/utils';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { snapshotBeforeSchemaChange } from './backup.ts';
import { applyMigrations, pendingMigrations } from './migrations.ts';
import { sqliteBinding } from './native.ts';
import * as schema from './schema.ts';

export { EMBEDDING_DIM };

export type MemexClient = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
};

const countsRows = (sqlite: Database.Database, table: string): number =>
  (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

export const openDb = (dbDir: string, embeddingDim = EMBEDDING_DIM): MemexClient => {
  mkdirSync(dbDir, { recursive: true });

  const sqlite = new Database(join(dbDir, 'memex.db'), { nativeBinding: sqliteBinding() });
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
  sqlite.exec('CREATE INDEX IF NOT EXISTS notes_title_length ON notes(LENGTH(title))');

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

  // What each write did, so a detector can ask what happened since it last ran
  // instead of re-reading the corpus. One global dirty flag made any edit
  // re-run every detector; a kind per row lets a tag change skip the sweeps
  // that only embeddings and links can disturb.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS note_changes (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      kind    TEXT    NOT NULL,
      at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS note_changes_kind ON note_changes (kind, id);
  `);

  // Each note's k nearest neighbours, kept rather than recomputed. The arc
  // detector's cost was never the graph walk — it was one vector query per note
  // to rebuild the same edges every run. Stored, only what moved is re-queried.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS note_neighbors (
      note_id     INTEGER NOT NULL,
      neighbor_id INTEGER NOT NULL,
      PRIMARY KEY (note_id, neighbor_id)
    );
    CREATE INDEX IF NOT EXISTS note_neighbors_reverse ON note_neighbors (neighbor_id);
  `);

  // The register: what is true right now about a subject, as an append-only
  // stream rather than a note somebody has to keep rewriting. A value is not
  // "the most recent row" but a head — an event nothing else follows — so a
  // vocabulary merge that joins two chains shows up as two heads instead of
  // silently picking one.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS register_subjects (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      key        TEXT    NOT NULL UNIQUE,
      label      TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS register_predicates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      label      TEXT    NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'provisional',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS register_predicate_aliases (
      key          TEXT    PRIMARY KEY,
      predicate_id INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS register_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id   INTEGER NOT NULL,
      predicate_id INTEGER NOT NULL,
      scope        TEXT    NOT NULL,
      scope_start  TEXT,
      scope_end    TEXT,
      value        TEXT    NOT NULL,
      note_id      INTEGER,
      author       TEXT    NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS register_events_key
      ON register_events (subject_id, predicate_id, scope, scope_start, scope_end);

    CREATE TABLE IF NOT EXISTS register_event_follows (
      event_id   INTEGER NOT NULL,
      follows_id INTEGER NOT NULL,
      PRIMARY KEY (event_id, follows_id)
    );
    CREATE INDEX IF NOT EXISTS register_event_follows_target
      ON register_event_follows (follows_id);
  `);

  // Small key/value store for engine bookkeeping (e.g. per-detector watermarks
  // into note_changes, so on-read detection is free when nothing it reads moved).
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

  // A review item put off until something moves, rather than until a date. The
  // fingerprint is the item's evidence state when it was set aside and `hits`
  // is how often the belief had been injected by then: either moving means the
  // deferral is over, so a memory nobody is using stays quiet and one the agent
  // starts leaning on comes back. A woken row is kept rather than deleted,
  // because it is the only record that the person has met this item before.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS review_deferrals (
      item_key    TEXT    PRIMARY KEY,
      note_id     INTEGER NOT NULL,
      fingerprint TEXT    NOT NULL,
      hits        INTEGER NOT NULL,
      at          INTEGER NOT NULL,
      woken_at    INTEGER
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
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id       INTEGER NOT NULL,
      idx           INTEGER NOT NULL,
      text          TEXT    NOT NULL,
      -- The body the claim was read out of. A claim is not re-extracted when
      -- its note moves; the drift is shown and the person decides, because an
      -- extractor cannot know whether the sentence still means what it meant.
      source_hash   TEXT    NOT NULL DEFAULT '',
      valid_from    INTEGER,
      valid_until   INTEGER,
      confirmed_at  INTEGER,
      confirm_depth TEXT,
      superseded_by INTEGER,
      status        TEXT    NOT NULL DEFAULT 'unconfirmed',
      -- Whether "is this still true?" is a question this sentence can answer.
      kind          TEXT    NOT NULL DEFAULT 'fact',
      UNIQUE (note_id, idx)
    );
  `);

  // One row per judgement, kept so the last one can be taken back. A card wrongly
  // waved through changes what the agent says next, so undo has to cost nothing.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS claim_actions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      item_key TEXT    NOT NULL,
      action   TEXT    NOT NULL,
      previous TEXT    NOT NULL,
      at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS claim_actions_at ON claim_actions (at);
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

  // A schema change is the one moment this database can be left worse than it
  // was found, and every backup taken by hand so far was taken right here. A
  // vault with nothing in it has nothing to lose, so a fresh install skips it.
  if (pendingMigrations(sqlite).length > 0 && countsRows(sqlite, 'notes') > 0) {
    snapshotBeforeSchemaChange(sqlite, dbDir);
  }
  applyMigrations(sqlite);

  return { db: drizzle(sqlite, { schema }), sqlite };
};
