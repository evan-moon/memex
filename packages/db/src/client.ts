import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema.ts';

export const EMBEDDING_DIM = 384;

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
      source     TEXT    NOT NULL DEFAULT 'manual',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS note_embeddings USING vec0(
      note_id   INTEGER PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIM}]
    );
  `);

  return { db: drizzle(sqlite, { schema }), sqlite };
};
