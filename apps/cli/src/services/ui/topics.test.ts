import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertNote, linkAmendment, type MemexClient, openDb, serializeTags } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTopic, listTopicTags } from './topics.ts';

const DAY = 86_400_000;
let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-topics-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, tags: string[], authoredAt: number) => {
  const note = insertNote(client, {
    title,
    content: 'body',
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer: 'past',
    tags: serializeTags(tags),
    authoredAt,
  });
  return note;
};

const base = Date.parse('2026-01-01');

describe('listTopicTags', () => {
  it('offers only tags used often enough to be a subject', () => {
    for (let i = 0; i < 25; i += 1) addNote(`big ${i}`, ['big'], base + i * DAY);
    addNote('small', ['once'], base);
    expect(listTopicTags(client)).toEqual(['big']);
  });
});

describe('buildTopic', () => {
  it('spreads activity across buckets covering first to last note', () => {
    addNote('a', ['t'], base);
    addNote('b', ['t'], base + 100 * DAY);
    const topic = buildTopic(client, 't', base + 101 * DAY);
    expect(topic?.buckets[0]).toBe(1);
    expect(topic?.buckets.at(-1)).toBe(1);
    expect(topic?.buckets.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('marks a correction where the amending note lands', () => {
    const original = addNote('plan', ['t'], base);
    const fix = addNote('[Amendment] plan', ['t'], base + 10 * DAY);
    linkAmendment(client, fix.id, original.id);

    const [marker] = buildTopic(client, 't', base + 11 * DAY)?.markers ?? [];
    expect(marker).toMatchObject({ kind: 'correction', noteId: fix.id });
    expect(marker.detail).toContain('plan');
  });

  it('marks a return after a long silence, not a busy stretch', () => {
    addNote('a', ['t'], base);
    addNote('b', ['t'], base + DAY);
    addNote('c', ['t'], base + 200 * DAY);

    const markers = buildTopic(client, 't', base + 201 * DAY)?.markers ?? [];
    expect(markers.filter((m) => m.kind === 'return')).toHaveLength(1);
  });

  it('calls a topic dormant once it has been quiet for a season', () => {
    addNote('a', ['t'], base);
    expect(buildTopic(client, 't', base + 100 * DAY)?.dormant).toBe(true);
    expect(buildTopic(client, 't', base + 10 * DAY)?.dormant).toBe(false);
  });

  it('leaves a topic with nothing to report free of markers rather than inventing them', () => {
    addNote('a', ['t'], base);
    addNote('b', ['t'], base + DAY);
    expect(buildTopic(client, 't', base + 2 * DAY)?.markers).toEqual([]);
  });

  it('returns nothing for a tag no note carries', () => {
    expect(buildTopic(client, 'ghost')).toBeNull();
  });
});
