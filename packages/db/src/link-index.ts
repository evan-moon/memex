import { filenameKey, titleKey } from '@memex/utils';
import type { MemexClient } from './client.ts';

// The two names a wiki link can call a note by, kept as rows so resolving one
// is a point lookup. Held apart by kind because they do not rank the same: a
// title collision goes to the newest note, a filename collision to the oldest,
// which is what a Map built over every row used to decide by insertion order.
export const titleLookupKeys = (title: string) => {
  const asTitle = titleKey(title);
  const asFilename = filenameKey(title);
  return asFilename === asTitle
    ? [{ key: asTitle, kind: 'title' as const }]
    : [
        { key: asTitle, kind: 'title' as const },
        { key: asFilename, kind: 'filename' as const },
      ];
};

export const syncTitleKeys = (client: MemexClient, noteId: number, title: string) => {
  const remove = client.sqlite.prepare('DELETE FROM note_title_keys WHERE note_id = ?');
  const insert = client.sqlite.prepare(
    'INSERT OR IGNORE INTO note_title_keys (key, kind, note_id) VALUES (?, ?, ?)',
  );
  client.sqlite.transaction(() => {
    remove.run(noteId);
    for (const { key, kind } of titleLookupKeys(title)) insert.run(key, kind, noteId);
  })();
};

export const dropTitleKeys = (client: MemexClient, noteId: number) => {
  client.sqlite.prepare('DELETE FROM note_title_keys WHERE note_id = ?').run(noteId);
};

const TITLE_HIT = `SELECT note_id AS noteId FROM note_title_keys
   WHERE key = ? AND kind = 'title' ORDER BY note_id DESC LIMIT 1`;

const FILENAME_HIT = `SELECT note_id AS noteId FROM note_title_keys
   WHERE key = ? AND kind = 'filename' ORDER BY note_id ASC LIMIT 1`;

export type KeyLookup = (key: string) => number | undefined;

export const keyLookup = (client: MemexClient): KeyLookup => {
  const asTitle = client.sqlite.prepare(TITLE_HIT);
  const asFilename = client.sqlite.prepare(FILENAME_HIT);

  return (key) => {
    const titled = asTitle.get(key) as { noteId: number } | undefined;
    if (titled) return titled.noteId;
    const named = asFilename.get(key) as { noteId: number } | undefined;
    return named?.noteId;
  };
};
