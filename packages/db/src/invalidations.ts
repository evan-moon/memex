import type { MemexClient } from './client.ts';

export const setNoteInvalidations = (
  client: MemexClient,
  noteId: number,
  texts: string[],
): string[] => {
  const wanted = texts.map((text) => text.trim()).filter((text) => text.length > 0);

  client.sqlite.transaction(() => {
    client.sqlite.prepare('DELETE FROM note_invalidations WHERE note_id = ?').run(noteId);
    const insert = client.sqlite.prepare(
      'INSERT INTO note_invalidations (note_id, idx, text) VALUES (?, ?, ?)',
    );
    wanted.forEach((text, idx) => {
      insert.run(noteId, idx, text);
    });
  })();

  return wanted;
};

export const getNoteInvalidations = (client: MemexClient, noteId: number): string[] =>
  (
    client.sqlite
      .prepare('SELECT text FROM note_invalidations WHERE note_id = ? ORDER BY idx')
      .all(noteId) as { text: string }[]
  ).map((row) => row.text);

export const invalidationsFor = (client: MemexClient, noteIds: number[]): Map<number, string[]> => {
  if (noteIds.length === 0) return new Map();
  const rows = client.sqlite
    .prepare(
      `SELECT note_id, text FROM note_invalidations
       WHERE note_id IN (SELECT value FROM json_each(?))
       ORDER BY note_id, idx`,
    )
    .all(JSON.stringify(noteIds)) as { note_id: number; text: string }[];
  return rows.reduce((acc, row) => {
    acc.set(row.note_id, [...(acc.get(row.note_id) ?? []), row.text]);
    return acc;
  }, new Map<number, string[]>());
};
