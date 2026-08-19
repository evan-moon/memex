import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  insertNote,
  linkAmendment,
  type MemexClient,
  openDb,
  serializeTags,
  upsertSignal,
} from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildInbox, triageSignal } from './inbox.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-inbox-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string) =>
  insertNote(client, {
    title,
    content: 'body',
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer: 'state',
    tags: serializeTags([]),
  });

const addSignal = (type: 'hidden_arc' | 'dangling_link' | 'stale_state', evidenceIds: number[]) =>
  upsertSignal(client, { type, evidenceIds, reasoning: `${type} reason` });

describe('buildInbox', () => {
  it('keeps link fixes out of the default view but still counts them', () => {
    const note = addNote('a');
    addSignal('dangling_link', [note.id]);
    addSignal('hidden_arc', [note.id]);

    const inbox = buildInbox(client);
    expect(inbox.signals.map((s) => s.type)).toEqual(['hidden_arc']);
    expect(inbox.counts.dangling_link).toBe(1);
  });

  it('includes them when asked', () => {
    const note = addNote('a');
    addSignal('dangling_link', [note.id]);
    expect(buildInbox(client, true).signals).toHaveLength(1);
  });

  it('resolves evidence ids into notes worth reading', () => {
    const note = addNote('a note');
    addSignal('stale_state', [note.id]);

    const [signal] = buildInbox(client).signals;
    expect(signal.evidence[0]).toMatchObject({ id: note.id, title: 'a note', layer: 'state' });
  });

  it('marks evidence that a later note corrected', () => {
    const original = addNote('original');
    const fix = addNote('[Amendment] original');
    linkAmendment(client, fix.id, original.id);
    addSignal('stale_state', [original.id]);

    expect(buildInbox(client).signals[0].evidence[0].supersededBy).toMatchObject({ id: fix.id });
  });

  it('drops evidence whose note is gone rather than failing the page', () => {
    const note = addNote('a');
    addSignal('hidden_arc', [note.id, 9999]);
    expect(buildInbox(client).signals[0].evidence).toHaveLength(1);
  });

  it('shows only what still needs triage', () => {
    const note = addNote('a');
    const signal = addSignal('hidden_arc', [note.id]);
    triageSignal(client, signal.id, 'dismissed');
    expect(buildInbox(client).signals).toHaveLength(0);
  });
});
