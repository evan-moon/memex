import type { MemexClient } from './client.ts';

// What a write did, in terms a detector can act on. A detector reads only some
// of these, so a tag rename should not cost an embedding sweep.
export type ChangeKind = 'content' | 'title' | 'tags' | 'links' | 'removed';

export const recordNoteChange = (
  client: MemexClient,
  noteId: number,
  kinds: ChangeKind[],
  at = Date.now(),
) => {
  const insert = client.sqlite.prepare(
    'INSERT INTO note_changes (note_id, kind, at) VALUES (?, ?, ?)',
  );
  client.sqlite.transaction(() => {
    for (const kind of kinds) insert.run(noteId, kind, at);
  })();
};

export const changeHead = (client: MemexClient): number =>
  (client.sqlite.prepare('SELECT MAX(id) AS head FROM note_changes').get() as { head: number | null })
    .head ?? 0;

// A watermark is the first change id a detector has not read yet, so an empty
// log and a fully-read log are both "nothing to do" without colliding with
// zero, which has to keep meaning "has never run".
export const hasChangeFrom = (client: MemexClient, from: number, kinds: ChangeKind[]): boolean => {
  const row = client.sqlite
    .prepare(
      `SELECT 1 AS present FROM note_changes
       WHERE id >= ? AND kind IN (${kinds.map(() => '?').join(',')})
       LIMIT 1`,
    )
    .get(from, ...kinds) as { present: number } | undefined;
  return row !== undefined;
};

// The log answers "has anything a detector cares about happened since it last
// ran", so once every detector has read past a row nobody will ask about it
// again. Kept generous rather than trimmed on every write.
const KEEP_ROWS = 10_000;

export const trimChangeLog = (client: MemexClient, floor: number) => {
  client.sqlite
    .prepare('DELETE FROM note_changes WHERE id <= ? AND id <= (SELECT MAX(id) - ? FROM note_changes)')
    .run(floor, KEEP_ROWS);
};
