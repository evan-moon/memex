import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNoteShape, insertNote, type MemexClient, openDb, setNoteShape } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClaimSource, Extraction } from '../claim-extract.ts';
import { createShapeFiller, notesNeedingShape } from './shapes.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-shapes-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, layer: 'past' | 'state' = 'past') =>
  insertNote(client, {
    title,
    content: `${title} body`,
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer,
  });

const link = (from: number, to: number) =>
  client.sqlite
    .prepare(
      `INSERT INTO note_links (source_id, target_id, source) VALUES (?, ?, 'wiki')
       ON CONFLICT DO NOTHING`,
    )
    .run(from, to);

const judgement = (title: string) => {
  const source = addNote(`${title} source`);
  const note = addNote(title, 'state');
  link(note.id, source.id);
  return note;
};

const stub = (result: Extraction) => {
  const seen: number[] = [];
  return {
    seen,
    extract: async (note: ClaimSource) => {
      seen.push(note.id);
      return result;
    },
  };
};

const position: Extraction = { kind: 'position', claims: ['하나'], durationMs: 1 };

describe('notesNeedingShape', () => {
  it('offers the queue notes nobody has read yet', () => {
    const a = judgement('a');
    expect(notesNeedingShape(client, 10).map((n) => n.id)).toEqual([a.id]);
  });

  it('skips a note whose reading is still good', () => {
    const a = judgement('a');
    setNoteShape(client, { noteId: a.id, kind: 'position', claims: ['하나'] });
    expect(notesNeedingShape(client, 10)).toEqual([]);
  });

  it('offers an index note again once its body moves under the reading', () => {
    const a = judgement('a');
    setNoteShape(client, { noteId: a.id, kind: 'index', claims: [] });
    expect(notesNeedingShape(client, 10)).toEqual([]);

    client.sqlite.prepare('UPDATE notes SET content = ? WHERE id = ?').run('rewritten', a.id);
    expect(notesNeedingShape(client, 10).map((n) => n.id)).toEqual([a.id]);
  });

  it('hands over no more than the run is allowed to read', () => {
    judgement('a');
    judgement('b');
    judgement('c');
    expect(notesNeedingShape(client, 2)).toHaveLength(2);
  });
});

describe('createShapeFiller', () => {
  it('writes what it read so the queue can leave an index out', async () => {
    const note = judgement('a');
    const filler = createShapeFiller({
      client,
      extract: async () => ({ kind: 'index', claims: [], durationMs: 1 }),
    });

    await filler.fill();

    expect(getNoteShape(client, note.id)?.kind).toBe('index');
  });

  it('reads each note once, not once per time the screen was opened', async () => {
    judgement('a');
    const { seen, extract } = stub(position);
    const filler = createShapeFiller({ client, extract });

    await filler.fill();
    await filler.fill();

    expect(seen).toHaveLength(1);
  });

  it('does not start a second run on top of one already going', async () => {
    judgement('a');
    judgement('b');
    const seen: number[] = [];
    const filler = createShapeFiller({
      client,
      perRun: 2,
      extract: async (note) => {
        seen.push(note.id);
        await new Promise((r) => setTimeout(r, 5));
        return position;
      },
    });

    await Promise.all([filler.fill(), filler.fill(), filler.fill()]);

    expect(seen).toHaveLength(2);
  });

  it('gives up the whole run when there is no claude to call', async () => {
    judgement('a');
    judgement('b');
    const { seen, extract } = stub({ error: 'spawn claude ENOENT', code: 'no-claude' });
    const filler = createShapeFiller({ client, perRun: 5, extract });

    await filler.fill();

    expect(seen).toHaveLength(1);
  });

  it('steps over a note it could not read and keeps going', async () => {
    judgement('a');
    judgement('b');
    const seen: number[] = [];
    const filler = createShapeFiller({
      client,
      perRun: 5,
      extract: async (note) => {
        seen.push(note.id);
        return seen.length === 1 ? { error: 'bad shape' } : position;
      },
    });

    await filler.fill();

    expect(seen).toHaveLength(2);
  });

  it('reports itself idle again once a run finishes', async () => {
    judgement('a');
    const filler = createShapeFiller({ client, extract: async () => position });

    await filler.fill();

    expect(filler.running()).toBe(false);
  });
});
