import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  insertNote,
  linkAmendment,
  type MemexClient,
  type NoteLayer,
  openDb,
  serializeTags,
  upsertSignal,
} from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { statusesFor } from './status.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-status-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, layer: NoteLayer = 'past') =>
  insertNote(client, {
    title,
    content: 'body',
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer,
    tags: serializeTags(['t']),
    authoredAt: Date.now(),
  });

describe('statusesFor', () => {
  it('names the note that corrected this one', () => {
    const plan = addNote('plan', 'state');
    const fix = addNote('[Amendment] plan');
    linkAmendment(client, fix.id, plan.id);

    expect(statusesFor(client, [plan.id, fix.id]).get(plan.id)).toEqual({
      kind: 'amended',
      by: { id: fix.id, title: '[Amendment] plan' },
    });
  });

  it('counts what piled up behind a state note', () => {
    const plan = addNote('plan', 'state');
    const later = addNote('what happened');
    upsertSignal(client, {
      type: 'stale_state',
      evidenceIds: [plan.id, later.id],
      reasoning: 'stale',
    });

    expect(statusesFor(client, [plan.id]).get(plan.id)).toEqual({ kind: 'piled-up', count: 1 });
  });

  it('prefers a correction over a pile, since the pile is already answered', () => {
    const plan = addNote('plan', 'state');
    const fix = addNote('[Amendment] plan');
    linkAmendment(client, fix.id, plan.id);
    upsertSignal(client, {
      type: 'stale_state',
      evidenceIds: [plan.id, fix.id],
      reasoning: 'stale',
    });

    expect(statusesFor(client, [plan.id]).get(plan.id)?.kind).toBe('amended');
  });

  it('says nothing about a note that still holds', () => {
    const note = addNote('fine', 'state');
    expect(statusesFor(client, [note.id]).has(note.id)).toBe(false);
  });
});
