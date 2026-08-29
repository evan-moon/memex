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
import { route, type UiDeps } from './server.ts';
import { statusesFor } from './status.ts';

const host = (): UiDeps => ({
  client,
  embedder: async () => new Array(768).fill(0),
  vaultPath: dbDir,
  mcp: { home: dbDir, serverPath: '/repo/apps/mcp/dist/index.js' },
  pathEnv: '',
  openUrl: () => {},
  model: {
    read: () => ({ kind: 'ready' as const }),
    start: () => ({ kind: 'ready' as const }),
    embed: async () => new Array(768).fill(0),
  },
});

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
    linkAmendment(client, fix.id, plan.id, 'corrects');

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
    linkAmendment(client, fix.id, plan.id, 'corrects');
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

describe('what a later note did to an earlier one', () => {
  // 74 pairs were counted and 58% of them continued the earlier note rather than
  // correcting it. Both were the same edge, so 37 notes were shown as "no longer
  // true" while still being true.
  it('does not call a continuation a correction', () => {
    const older = addNote('what was recorded');
    const newer = addNote('more about it');
    linkAmendment(client, newer.id, older.id, 'continues');

    expect(statusesFor(client, [older.id]).get(older.id)).toEqual({
      kind: 'continued',
      by: { id: newer.id, title: 'more about it' },
    });
  });

  it('still says so when a note really was corrected', () => {
    const older = addNote('what was recorded');
    const newer = addNote('what it actually was');
    linkAmendment(client, newer.id, older.id, 'corrects');

    expect(statusesFor(client, [older.id]).get(older.id)).toMatchObject({ kind: 'amended' });
  });

  // Edges written before the split state nothing. Reading them as corrections is
  // what produced the false labels; reading them as the weaker claim is the only
  // thing that is true of all of them.
  it('reads an edge that never said which it was as the weaker claim', () => {
    const older = addNote('what was recorded');
    const newer = addNote('something later');
    client.sqlite
      .prepare("INSERT INTO note_links(source_id, target_id, source) VALUES (?, ?, 'amends')")
      .run(newer.id, older.id);

    expect(statusesFor(client, [older.id]).get(older.id)).toMatchObject({ kind: 'continued' });
  });

  it('leads with the correction when a note was both continued and corrected', () => {
    const older = addNote('what was recorded');
    const carried = addNote('more about it');
    const fixed = addNote('what it actually was');
    linkAmendment(client, carried.id, older.id, 'continues');
    linkAmendment(client, fixed.id, older.id, 'corrects');

    expect(statusesFor(client, [older.id]).get(older.id)).toMatchObject({ kind: 'amended' });
  });
});

describe('a correction written in the app', () => {
  // The person clicked the paragraph and said it was wrong. That is the one
  // caller allowed to write the stronger edge, and the endpoint is where it is
  // decided — an agent posting the same body gets `continues` like everyone else.
  it('is the one write that says corrects', async () => {
    const older = addNote('what was recorded');

    await route(host(), 'POST', new URL('http://x/api/notes'), {
      title: 'what it actually was',
      content: 'the trial is 30 days',
      layer: 'past',
      amends: older.id,
      amendsKind: 'corrects',
    });

    expect(statusesFor(client, [older.id]).get(older.id)).toMatchObject({ kind: 'amended' });
  });

  it('is a continuation when nobody said it was a correction', async () => {
    const older = addNote('what was recorded');

    await route(host(), 'POST', new URL('http://x/api/notes'), {
      title: 'more about it',
      content: 'and the plan is monthly',
      layer: 'past',
      amends: older.id,
    });

    expect(statusesFor(client, [older.id]).get(older.id)).toMatchObject({ kind: 'continued' });
  });
});
