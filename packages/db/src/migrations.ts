import type Database from 'better-sqlite3';
import { classifyClaim } from './claim-kind.ts';
import { parseAuthoredAt } from './dates.ts';
import { bodyHash } from './evidence.ts';
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
  {
    // `outcome` is written for the next turn's prompt, and a transcript reopened
    // later was showing a person that sentence. What they saw is its own record:
    // the same reply, re-rendered by the screen that drew it the first time.
    version: 16,
    name: 'chat_turns.reply',
    up: (sqlite) => {
      addColumnIfMissing(sqlite, 'chat_turns', 'reply', 'reply TEXT');
    },
  },
  {
    version: 17,
    name: 'retrieval_log.injected',
    up: (sqlite) => {
      if (!addColumnIfMissing(sqlite, 'retrieval_log', 'injected', 'injected INTEGER')) return;
      sqlite.exec("UPDATE retrieval_log SET injected = 1 WHERE surface <> 'recall'");
    },
  },
  {
    version: 18,
    name: 'notes.type',
    up: (sqlite) => addColumnIfMissing(sqlite, 'notes', 'type', 'type TEXT'),
  },
  {
    version: 19,
    name: 'note facets',
    up: (sqlite) => {
      const declares = (table: string) =>
        (
          sqlite
            .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
            .get(table) as { sql: string } | undefined
        )?.sql;

      const labels = declares('note_type_labels');
      if (labels?.includes('REFERENCES notes') !== true) {
        sqlite.exec(`
          CREATE TABLE note_type_labels_rebuilt (
            note_id    INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
            type       TEXT    NOT NULL,
            area       TEXT    NOT NULL,
            method     TEXT    NOT NULL,
            confidence TEXT    NOT NULL,
            at         INTEGER NOT NULL
          );
        `);
        if (labels !== undefined) {
          sqlite.exec(`
            INSERT OR IGNORE INTO note_type_labels_rebuilt(note_id, type, area, method, confidence, at)
              SELECT l.note_id, l.type, l.area, l.method, l.confidence, l.at
              FROM note_type_labels l JOIN notes n ON n.id = l.note_id;
            DROP TABLE note_type_labels;
          `);
        }
        sqlite.exec('ALTER TABLE note_type_labels_rebuilt RENAME TO note_type_labels');
      }

      const cards = declares('note_cards');
      if (cards?.includes('REFERENCES notes') !== true) {
        sqlite.exec(`
          CREATE TABLE note_cards_rebuilt (
            note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
            line    TEXT,
            field   TEXT    NOT NULL,
            quality TEXT    NOT NULL,
            at      INTEGER NOT NULL
          );
        `);
        if (cards !== undefined) {
          sqlite
            .prepare(
              `INSERT OR IGNORE INTO note_cards_rebuilt(note_id, line, field, quality, at)
                 SELECT c.note_id, c.line, COALESCE(c.field, 'none'), COALESCE(c.quality, 'bad'),
                        COALESCE(c.at, ?)
                 FROM note_cards c JOIN notes n ON n.id = c.note_id`,
            )
            .run(Date.now());
          sqlite.exec('DROP TABLE note_cards');
        }
        sqlite.exec('ALTER TABLE note_cards_rebuilt RENAME TO note_cards');
      }
    },
  },
  {
    // The evidence strength the hand-run labelling pass gave each note, frozen
    // the day the rules moved into code. Gate 4 asks whether the port lost
    // evidence, so it needs both answers over the same notes — and the only
    // other copy of the first one is a backup file nobody is keeping.
    version: 20,
    name: 'note_type_baseline',
    up: (sqlite) => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS note_type_baseline (
          note_id    INTEGER PRIMARY KEY,
          type       TEXT    NOT NULL,
          confidence TEXT    NOT NULL
        );
      `);
    },
  },
  {
    // Where a rule applies. Nothing is backfilled: a rule that never said is
    // not thereby global, and guessing would put a folder-shaped rule into
    // every conversation.
    version: 21,
    name: 'notes.rule_scope',
    up: (sqlite) => addColumnIfMissing(sqlite, 'notes', 'rule_scope', 'rule_scope TEXT'),
  },
  {
    // When a projection was last stood behind. Deliberately not backfilled from
    // updated_at: that column is the reason this one exists, and seeding it
    // would declare every state note confirmed on the day its tags last moved.
    version: 22,
    name: 'notes.confirmed_at',
    up: (sqlite) => addColumnIfMissing(sqlite, 'notes', 'confirmed_at', 'confirmed_at INTEGER'),
  },
  {
    // A draft prepared before anyone asked for it. Drafting costs a minute or
    // two of model time, and a person who has to wait that long after pressing
    // a button has left the session. So it is written ahead and read instantly.
    //
    // `note_hash` and `basis` are what stop a stale draft from being shown as a
    // live one: the first is the note as it read when drafted, the second the
    // evidence that made it worth drafting. Either moving means the draft is
    // about a note that no longer exists in that form.
    version: 23,
    name: 'note_drafts',
    up: (sqlite) => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS note_drafts (
          note_id    INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
          body       TEXT    NOT NULL,
          -- The bullets the screen actually shows, as JSON. A draft's reason
          -- field is only ever filled when nothing changed, so storing that
          -- alone would keep the empty half and drop the explanation.
          changes    TEXT    NOT NULL,
          verdict    TEXT    NOT NULL,
          note_hash  TEXT    NOT NULL,
          basis      TEXT    NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
    },
  },
  {
    // A review item put off until something moves. The row outlives the waking:
    // clearing it would leave no record that a person had already set this item
    // aside once, which is the only evidence memex has that an item is coming
    // back rather than arriving.
    version: 24,
    name: 'review_deferrals',
    up: (sqlite) => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS review_deferrals (
          item_key    TEXT    PRIMARY KEY,
          note_id     INTEGER NOT NULL,
          fingerprint TEXT    NOT NULL,
          hits        INTEGER NOT NULL,
          at          INTEGER NOT NULL
        );
      `);
      addColumnIfMissing(sqlite, 'review_deferrals', 'woken_at', 'woken_at INTEGER');
    },
  },
  {
    // A claim is what a person can actually judge; a note is the raw material it
    // was read out of. The text was already here — what was missing is whether it
    // is true, since when, who last stood behind it, and what replaced it.
    //
    // The identifier is new too. `(note_id, idx)` cannot be referenced, so nothing
    // could point at the claim that superseded another one.
    //
    // `source_hash` is stamped with the body as it reads NOW rather than as it read
    // at extraction. Every shaped note's body was rewritten by the layer-template
    // refactor, so carrying the old hashes forward would mark all 269 claims as
    // moved on the first screen and make the signal mean nothing. Nobody has
    // confirmed anything yet, so this baseline costs no judgement — and it is the
    // last moment that is true.
    version: 25,
    name: 'note_claims.state',
    up: (sqlite) => {
      if (columnNames(sqlite, 'note_claims').has('status')) return;

      sqlite.exec(`
        CREATE TABLE note_claims_rebuilt (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          note_id       INTEGER NOT NULL,
          idx           INTEGER NOT NULL,
          text          TEXT    NOT NULL,
          source_hash   TEXT    NOT NULL DEFAULT '',
          valid_from    INTEGER,
          valid_until   INTEGER,
          confirmed_at  INTEGER,
          confirm_depth TEXT,
          superseded_by INTEGER,
          status        TEXT    NOT NULL DEFAULT 'unconfirmed',
          UNIQUE (note_id, idx)
        );
        INSERT INTO note_claims_rebuilt (note_id, idx, text, valid_from)
          SELECT c.note_id, c.idx, c.text, COALESCE(n.authored_at, n.created_at)
          FROM note_claims c JOIN notes n ON n.id = c.note_id
          ORDER BY c.note_id, c.idx;
        DROP TABLE note_claims;
        ALTER TABLE note_claims_rebuilt RENAME TO note_claims;
      `);

      const stamp = sqlite.prepare('UPDATE note_claims SET source_hash = ? WHERE note_id = ?');
      const reshape = sqlite.prepare('UPDATE note_shape SET source_hash = ? WHERE note_id = ?');
      const bodies = sqlite
        .prepare(
          `SELECT n.id, n.content FROM notes n
           WHERE n.id IN (SELECT note_id FROM note_shape)`,
        )
        .all() as { id: number; content: string }[];
      for (const body of bodies) {
        const hash = bodyHash(body.content);
        stamp.run(hash, body.id);
        reshape.run(hash, body.id);
      }
    },
  },
  {
    // Half the deck was unanswerable. A claim that says something should be done,
    // or that one option is better than another, has no truth value to check, so
    // "is this still true?" produced cards a person could only dismiss.
    //
    // Classified from the stored text, never by reading the note again: §2-1 of
    // the work order fixes the 269 claims, and this is a property of the sentence
    // rather than of the note it came out of.
    version: 26,
    name: 'note_claims.kind',
    up: (sqlite) => {
      if (!addColumnIfMissing(sqlite, 'note_claims', 'kind', "kind TEXT NOT NULL DEFAULT 'fact'")) {
        return;
      }
      const rows = sqlite.prepare('SELECT id, text FROM note_claims').all() as {
        id: number;
        text: string;
      }[];
      const set = sqlite.prepare('UPDATE note_claims SET kind = ? WHERE id = ?');
      for (const row of rows) set.run(classifyClaim(row.text), row.id);
    },
  },
  {
    // `fact` was two things wearing one name. A state goes out of date and is
    // worth asking about; an event happened and stays happened, so asking gets a
    // shrug or a tautology. The screenshots were re-captured in August — there is
    // nothing a person can add to that.
    //
    // Only what the previous pass called `fact` is re-read, so a claim a person
    // has since taken out of the deck by hand keeps the kind they gave it.
    version: 27,
    name: 'note_claims.kind.event',
    up: (sqlite) => {
      const rows = sqlite.prepare("SELECT id, text FROM note_claims WHERE kind = 'fact'").all() as {
        id: number;
        text: string;
      }[];
      const set = sqlite.prepare('UPDATE note_claims SET kind = ? WHERE id = ?');
      for (const row of rows) set.run(classifyClaim(row.text), row.id);
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

export const pendingMigrations = (sqlite: Database.Database): string[] => {
  const from = readVersion(sqlite);
  return MIGRATIONS.filter((m) => m.version > from).map((m) => m.name);
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
