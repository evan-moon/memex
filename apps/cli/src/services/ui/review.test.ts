import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deferReviewItem,
  insertNote,
  listDeferrals,
  logRetrieval,
  type MemexClient,
  mintInference,
  openDb,
  setNoteEvidence,
  setNoteInvalidations,
  updateNote,
} from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildReview, reviewItemState } from './review.ts';

let dbDir: string;
let vaultDir: string;
let client: MemexClient;
let made = 0;

beforeEach(() => {
  made = 0;
  dbDir = mkdtempSync(join(tmpdir(), 'memex-review-db-'));
  vaultDir = mkdtempSync(join(tmpdir(), 'memex-review-vault-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(vaultDir, { recursive: true, force: true });
});

const addNote = (title: string, layer: 'past' | 'state' = 'past', content = 'the body') =>
  insertNote(client, {
    title,
    content,
    filePath: join(vaultDir, `${title}.md`),
    source: 'manual',
    layer,
  });

const corrects = (from: number, to: number) =>
  client.sqlite
    .prepare(
      `INSERT INTO note_links (source_id, target_id, source) VALUES (?, ?, 'corrects')
       ON CONFLICT DO NOTHING`,
    )
    .run(from, to);

const projectionOnCorrectedSource = () => {
  made += 1;
  const tag = String(made);
  const source = addNote(`trial length ${tag}`, 'past', 'the trial is 14 days');
  const projection = addNote(`pricing now ${tag}`, 'state', 'the trial is 14 days');
  setNoteEvidence(client, projection.id, [source.id]);

  const correction = addNote(`trial cut ${tag}`, 'past', 'the trial is 7 days');
  setNoteInvalidations(client, correction.id, ['the trial is 14 days']);
  corrects(correction.id, source.id);

  return { projection, source, correction };
};

describe('buildReview', () => {
  it('is empty when nothing declares evidence', () => {
    addNote('a note');
    expect(buildReview(client).items).toEqual([]);
  });

  it('leaves a projection alone while its sources stand', () => {
    const source = addNote('a source');
    const projection = addNote('a projection', 'state');
    setNoteEvidence(client, projection.id, [source.id]);

    expect(buildReview(client).items).toEqual([]);
  });

  it('raises a projection whose source was corrected, and names the retired sentence', () => {
    const { projection, source, correction } = projectionOnCorrectedSource();

    const [item] = buildReview(client).items;
    expect(item?.kind).toBe('evidence-corrected');
    expect(item?.key).toBe(`note:${String(projection.id)}`);
    expect(item?.grade).toBe('observed');
    expect(item?.canApprove).toBe(true);

    const [moved] = item?.moved ?? [];
    expect(moved?.id).toBe(source.id);
    expect(moved?.state).toBe('corrected');
    expect(moved?.correctedBy?.id).toBe(correction.id);
    expect(moved?.retired).toEqual(['the trial is 14 days']);
  });

  it('withholds approval when a source is gone', () => {
    const source = addNote('a source');
    const projection = addNote('a projection', 'state');
    setNoteEvidence(client, projection.id, [source.id]);
    client.sqlite.prepare('DELETE FROM notes WHERE id = ?').run(source.id);

    const [item] = buildReview(client).items;
    expect(item?.canApprove).toBe(false);
    expect(item?.moved[0]?.state).toBe('missing');
  });

  it('drops a correction the person already accounted for', () => {
    const { projection, correction } = projectionOnCorrectedSource();
    updateNote(client, correction.id, { authoredAt: 1000 });
    updateNote(client, projection.id, { confirmedAt: 2000 });

    expect(buildReview(client).items).toEqual([]);
  });

  it('keeps a correction written after the person last confirmed', () => {
    const { projection, correction } = projectionOnCorrectedSource();
    updateNote(client, correction.id, { authoredAt: 3000 });
    updateNote(client, projection.id, { confirmedAt: 2000 });

    expect(buildReview(client).items).toHaveLength(1);
  });

  it('marks an item the person set aside once and met again as recurring', () => {
    const { projection } = projectionOnCorrectedSource();
    const key = `note:${String(projection.id)}`;
    const state = reviewItemState(client, key);
    if (state) deferReviewItem(client, state);

    logRetrieval(client, {
      query: 'trial',
      surface: 'mcp',
      noteIds: [projection.id],
      injectedIds: [projection.id],
    });

    const [item] = buildReview(client).items;
    expect(item?.key).toBe(key);
    expect(item?.recurring).toBe(true);
  });

  it('does not call a first sighting a recurrence', () => {
    projectionOnCorrectedSource();
    expect(buildReview(client).items[0]?.recurring).toBe(false);
  });

  it('counts only injected retrievals inside the window', () => {
    const { projection } = projectionOnCorrectedSource();
    logRetrieval(client, {
      query: 'trial',
      surface: 'mcp',
      noteIds: [projection.id],
      injectedIds: [projection.id],
    });
    logRetrieval(client, {
      query: 'trial',
      surface: 'mcp',
      noteIds: [projection.id],
      injectedIds: [],
    });

    expect(buildReview(client).items[0]?.injected.hits).toBe(1);
  });

  it('raises an inference whose source body moved, graded as inference', () => {
    const source = addNote(
      'a source',
      'past',
      '---\ntitle: a source\ntags: [x]\n---\n# a heading\nthe first body',
    );
    const inference = mintInference(client, {
      title: 'a hypothesis',
      summary: 'the summary',
      evidence: [{ noteId: source.id }],
    });
    updateNote(client, source.id, { content: 'a different body' });

    const [item] = buildReview(client).items;
    expect(item?.kind).toBe('evidence-moved');
    expect(item?.key).toBe(`inference:${String(inference.id)}`);
    expect(item?.grade).toBe('inferred');
    expect(item?.moved[0]?.state).toBe('changed');
    expect(item?.moved[0]?.before).toBe('the first body');
  });

  it('puts what recurs and what is used ahead of the rest', () => {
    const quiet = projectionOnCorrectedSource();
    const used = projectionOnCorrectedSource();
    const again = projectionOnCorrectedSource();

    logRetrieval(client, {
      query: 'q',
      surface: 'mcp',
      noteIds: [used.projection.id],
      injectedIds: [used.projection.id],
    });
    const seen = reviewItemState(client, `note:${String(again.projection.id)}`);
    if (seen) deferReviewItem(client, seen);
    logRetrieval(client, {
      query: 'q',
      surface: 'mcp',
      noteIds: [again.projection.id],
      injectedIds: [again.projection.id],
    });

    const keys = buildReview(client).items.map((item) => item.key);
    expect(keys[0]).toBe(`note:${String(again.projection.id)}`);
    expect(keys[1]).toBe(`note:${String(used.projection.id)}`);
    expect(keys).toContain(`note:${String(quiet.projection.id)}`);
  });

  it('holds a deferred item back until its evidence moves again', () => {
    const { projection, source } = projectionOnCorrectedSource();
    const state = reviewItemState(client, `note:${String(projection.id)}`);
    expect(state).not.toBeNull();
    if (state) deferReviewItem(client, state);

    expect(buildReview(client).items).toEqual([]);

    const second = addNote('another source', 'past', 'more');
    setNoteEvidence(client, projection.id, [source.id, second.id]);
    updateNote(client, second.id, { content: 'moved on' });

    expect(buildReview(client).items.map((item) => item.key)).toContain(
      `note:${String(projection.id)}`,
    );
  });

  it('brings a deferred item back once the belief is injected again', () => {
    const { projection } = projectionOnCorrectedSource();
    const state = reviewItemState(client, `note:${String(projection.id)}`);
    if (state) deferReviewItem(client, state);
    expect(buildReview(client).items).toEqual([]);

    logRetrieval(client, {
      query: 'trial',
      surface: 'mcp',
      noteIds: [projection.id],
      injectedIds: [projection.id],
    });

    expect(buildReview(client).items.map((item) => item.key)).toContain(
      `note:${String(projection.id)}`,
    );
  });

  it('drops a deferral once its item stops existing', () => {
    const { projection, source } = projectionOnCorrectedSource();
    const state = reviewItemState(client, `note:${String(projection.id)}`);
    if (state) deferReviewItem(client, state);
    expect(listDeferrals(client)).toHaveLength(1);

    client.sqlite.prepare('DELETE FROM note_links WHERE target_id = ?').run(source.id);
    buildReview(client);

    expect(listDeferrals(client)).toEqual([]);
  });

  it('caps a session at five', () => {
    for (let n = 0; n < 8; n += 1) projectionOnCorrectedSource();
    expect(buildReview(client).items).toHaveLength(5);
  });
});
