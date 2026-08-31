import type Database from 'better-sqlite3';
import { parseAuthoredAt } from './dates.ts';
import { linkTargets, targetLookupKeys, titleLookupKeys } from './link-index.ts';

type Migration = {
  version: number;
  name: string;
  up: (sqlite: Database.Database) => void;
};

const VERSION_KEY = 'schema_version';

const BACKFILL_BATCH = 500;

const columnNames = (sqlite: Database.Database, table: string) =>
  new Set(
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
  );

const addColumnIfMissing = (
  sqlite: Database.Database,
  table: string,
  column: string,
  ddl: string,
) => {
  if (columnNames(sqlite, table).has(column)) return false;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  return true;
};

// Walked by id rather than loaded whole: a backfill that reads every body at
// once holds the entire corpus in memory, which is the one thing a migration
// on an imported vault cannot afford.
const forEachNoteBatch = <Row extends { id: number }>(
  sqlite: Database.Database,
  columns: string,
  onBatch: (rows: Row[]) => void,
) => {
  const page = sqlite.prepare(
    `SELECT id, ${columns} FROM notes WHERE id > ? ORDER BY id LIMIT ${BACKFILL_BATCH}`,
  );

  const step = (afterId: number) => {
    const rows = page.all(afterId) as Row[];
    if (rows.length === 0) return;
    sqlite.transaction(() => {
      onBatch(rows);
    })();
    step(rows[rows.length - 1].id);
  };

  step(0);
};

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'notes.category',
    up: (sqlite) => addColumnIfMissing(sqlite, 'notes', 'category', 'category TEXT'),
  },
  {
    version: 2,
    name: 'notes.tags',
    up: (sqlite) => addColumnIfMissing(sqlite, 'notes', 'tags', "tags TEXT NOT NULL DEFAULT '[]'"),
  },
  {
    version: 3,
    name: 'notes.layer',
    up: (sqlite) => {
      if (!addColumnIfMissing(sqlite, 'notes', 'layer', "layer TEXT NOT NULL DEFAULT 'past'"))
        return;

      const STATE_FOLDERS = ['projects', 'dev', 'herald'];
      const RULE_FOLDERS = ['coding'];

      const setLayer = sqlite.prepare(
        "UPDATE notes SET layer = ? WHERE category = ? OR category LIKE ? || '/%'",
      );

      for (const f of STATE_FOLDERS) setLayer.run('state', f, f);
      for (const f of RULE_FOLDERS) setLayer.run('rule', f, f);
    },
  },
  {
    // author: whose memory a note is. Backfilled from the path, which is where
    // the distinction already lived — an agent keeps its working notes in a
    // `memory/` directory beside the project they belong to.
    version: 4,
    name: 'notes.author',
    up: (sqlite) => {
      if (!addColumnIfMissing(sqlite, 'notes', 'author', "author TEXT NOT NULL DEFAULT 'person'"))
        return;
      sqlite.exec("UPDATE notes SET author = 'agent' WHERE file_path LIKE '%/memory/%'");
    },
  },
  {
    // authored_at: the note's real authored date (frontmatter `date:` or a
    // (YYYY-MM-DD) in the title), distinct from created_at (import time). Without
    // it, temporal signals are meaningless on an imported vault where every
    // created_at lands in the import window.
    version: 5,
    name: 'notes.authored_at',
    up: (sqlite) => {
      if (!addColumnIfMissing(sqlite, 'notes', 'authored_at', 'authored_at INTEGER')) return;

      const update = sqlite.prepare('UPDATE notes SET authored_at = ? WHERE id = ?');
      forEachNoteBatch<{ id: number; title: string; content: string }>(
        sqlite,
        'title, content',
        (rows) => {
          for (const row of rows) {
            const ms = parseAuthoredAt(row.title, row.content);
            if (ms !== null) update.run(ms, row.id);
          }
        },
      );
    },
  },
  {
    version: 6,
    name: 'note_links.source',
    up: (sqlite) =>
      addColumnIfMissing(sqlite, 'note_links', 'source', "source TEXT NOT NULL DEFAULT 'wiki'"),
  },
  {
    // `source` was added by ALTER on older DBs, which cannot widen a primary key —
    // so a pair already joined by a wiki link silently rejected every other edge
    // type between the same two notes, amendments included. Rebuild the table so
    // one note can both cite and correct another.
    version: 7,
    name: 'note_links.pk',
    up: (sqlite) => {
      const pk = sqlite.prepare('PRAGMA table_info(note_links)').all() as {
        name: string;
        pk: number;
      }[];
      if (pk.some((c) => c.name === 'source' && c.pk > 0)) return;

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
    },
  },
  {
    // Who asked. The recall daemon fires on every prompt, so it wrote 97.6% of the
    // rows here and drowns the handful a person actually typed — a frequency read
    // off this table without the distinction measures the daemon, not the user.
    // Stored rather than derived from surface at read time: what a surface meant
    // can change, and a row should keep saying what was true when it was written.
    version: 8,
    name: 'retrieval_log.initiator',
    up: (sqlite) => {
      if (
        !addColumnIfMissing(
          sqlite,
          'retrieval_log',
          'initiator',
          "initiator TEXT NOT NULL DEFAULT 'agent_assisted'",
        )
      )
        return;
      sqlite.exec("UPDATE retrieval_log SET initiator = 'daemon' WHERE surface = 'recall'");
      sqlite.exec(
        "UPDATE retrieval_log SET initiator = 'user_explicit' WHERE surface IN ('cli','ui')",
      );
    },
  },
  {
    version: 9,
    name: 'inference_evidence.source_excerpt',
    up: (sqlite) =>
      addColumnIfMissing(sqlite, 'inference_evidence', 'source_excerpt', 'source_excerpt TEXT'),
  },
  {
    // prompt_text: the exact evidence bundle the agent synthesized from at mint
    // time, kept verbatim so "why did the AI think that?" stays answerable even
    // after the source notes change.
    version: 10,
    name: 'inferences.prompt_text',
    up: (sqlite) => addColumnIfMissing(sqlite, 'inferences', 'prompt_text', 'prompt_text TEXT'),
  },
  {
    // Every name the vault's existing titles can be linked by. Built once here
    // so resolution never has to read the titles table whole again.
    version: 11,
    name: 'note_title_keys.backfill',
    up: (sqlite) => {
      const { n } = sqlite.prepare('SELECT COUNT(*) AS n FROM note_title_keys').get() as {
        n: number;
      };
      if (n > 0) return;

      const insert = sqlite.prepare(
        'INSERT OR IGNORE INTO note_title_keys (key, kind, note_id) VALUES (?, ?, ?)',
      );
      forEachNoteBatch<{ id: number; title: string }>(sqlite, 'title', (rows) => {
        for (const row of rows) {
          for (const { key, kind } of titleLookupKeys(row.title)) insert.run(key, kind, row.id);
        }
      });
    },
  },
  {
    // Every `[[X]]` already written into the vault, extracted once. Until this
    // runs the join has nothing to read and every link looks alive.
    version: 12,
    name: 'note_link_targets.backfill',
    up: (sqlite) => {
      const { n } = sqlite.prepare('SELECT COUNT(*) AS n FROM note_link_targets').get() as {
        n: number;
      };
      if (n > 0) return;

      const insert = sqlite.prepare(
        `INSERT OR IGNORE INTO note_link_targets (note_id, ord, target, key_full, key_stem)
         VALUES (?, ?, ?, ?, ?)`,
      );
      forEachNoteBatch<{ id: number; content: string }>(sqlite, 'content', (rows) => {
        for (const row of rows) {
          linkTargets(row.content).forEach((target, ord) => {
            const { keyFull, keyStem } = targetLookupKeys(target);
            insert.run(row.id, ord, target, keyFull, keyStem);
          });
        }
      });
    },
  },
  {
    // Every rule that exists today was written through the CLI, which only a
    // person can reach, so they are approved by construction. What arrives
    // after this lands provisional unless a person put it there.
    version: 13,
    name: 'notes.rule_status',
    up: (sqlite) => {
      if (!addColumnIfMissing(sqlite, 'notes', 'rule_status', 'rule_status TEXT')) return;
      sqlite.exec("UPDATE notes SET rule_status = 'canonical' WHERE layer = 'rule'");
    },
  },
  {
    // What a turn settled, not what the model said back. The change itself is
    // already durable — a register event with a person's name on it, a note with
    // `amends` — so this is the record of what was asked and what came of it,
    // which is what the next turn reads and what a reader reopens.
    version: 14,
    name: 'chat sessions',
    up: (sqlite) => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chat_turns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
          said TEXT NOT NULL,
          outcome TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS chat_turns_session ON chat_turns(session_id, id);
      `);
    },
  },
  {
    version: 15,
    name: 'note_invalidations',
    up: (sqlite) => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS note_invalidations (
          note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          idx     INTEGER NOT NULL,
          text    TEXT    NOT NULL,
          PRIMARY KEY (note_id, idx)
        );
      `);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

const readVersion = (sqlite: Database.Database) => {
  const row = sqlite.prepare('SELECT value FROM index_meta WHERE key = ?').get(VERSION_KEY) as
    | { value: string }
    | undefined;
  return row === undefined ? 0 : Number(row.value);
};

const writeVersion = (sqlite: Database.Database, version: number) => {
  sqlite
    .prepare(
      `INSERT INTO index_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(VERSION_KEY, String(version));
};

// A schema step that already ran is skipped by version, not re-proved by
// interrogating the table it touched. Every step still guards itself, so a DB
// migrated before this counter existed passes through each one once and is
// stamped — after that startup reads a single row instead of walking the corpus.
export const applyMigrations = (sqlite: Database.Database) => {
  const from = readVersion(sqlite);
  const pending = MIGRATIONS.filter((m) => m.version > from);

  for (const migration of pending) {
    migration.up(sqlite);
    writeVersion(sqlite, migration.version);
  }

  return { from, to: LATEST_SCHEMA_VERSION, applied: pending.map((m) => m.name) };
};
