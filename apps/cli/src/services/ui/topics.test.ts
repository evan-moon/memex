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
import { buildTopic, buildTopics, listTopicTags } from './topics.ts';

const DAY = 86_400_000;
const base = Date.parse('2026-01-01');

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

const addNote = (title: string, tags: string[], authoredAt: number, layer: NoteLayer = 'past') =>
  insertNote(client, {
    title,
    content: 'body',
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer,
    tags: serializeTags(tags),
    authoredAt,
  });

describe('listTopicTags', () => {
  it('offers only tags used often enough to be a subject', () => {
    for (let i = 0; i < 25; i += 1) addNote(`big ${i}`, ['big'], base + i * DAY);
    addNote('small', ['once'], base);
    expect(listTopicTags(client)).toEqual(['big']);
  });
});

describe('buildTopic', () => {
  it('separates what still stands from what a later note corrected', () => {
    const plan = addNote('plan', ['t'], base, 'state');
    const stillGood = addNote('other plan', ['t'], base + DAY, 'state');
    const fix = addNote('[Amendment] plan', ['t'], base + 2 * DAY);
    linkAmendment(client, fix.id, plan.id);

    const topic = buildTopic(client, 't', base + 3 * DAY);
    expect(topic?.current.map((n) => n.id)).toEqual([stillGood.id]);
    expect(topic?.outdated[0]).toMatchObject({ id: plan.id });
    expect(topic?.outdated[0].reason).toContain('정정됨');
  });

  it('counts a current plan as out of date once records piled up behind it', () => {
    const plan = addNote('plan', ['t'], base, 'state');
    const later = addNote('what actually happened', ['t'], base + DAY);
    upsertSignal(client, {
      type: 'stale_state',
      evidenceIds: [plan.id, later.id],
      reasoning: 'stale',
    });

    const topic = buildTopic(client, 't', base + 2 * DAY);
    expect(topic?.outdated.map((n) => n.id)).toEqual([plan.id]);
    expect(topic?.outdated[0].reason).toContain('확인 필요');
  });

  it('falls back to recent entries for a topic that is only a record', () => {
    addNote('coffee chat a', ['t'], base);
    addNote('coffee chat b', ['t'], base + DAY);

    const topic = buildTopic(client, 't', base + 2 * DAY);
    expect(topic?.current).toHaveLength(2);
    expect(topic?.current[0].reason).toBe('최근 기록');
  });

  it('calls a topic dormant once it has been quiet for a season', () => {
    addNote('a', ['t'], base);
    expect(buildTopic(client, 't', base + 100 * DAY)?.dormant).toBe(true);
    expect(buildTopic(client, 't', base + 10 * DAY)?.dormant).toBe(false);
  });

  it('surfaces an arc only when the topic holds several of its notes', () => {
    const a = addNote('a', ['t'], base);
    const b = addNote('b', ['t'], base + DAY);
    const outside = addNote('elsewhere', ['other'], base);
    upsertSignal(client, { type: 'hidden_arc', evidenceIds: [a.id, b.id], reasoning: 'an arc' });
    upsertSignal(client, {
      type: 'hidden_arc',
      evidenceIds: [a.id, outside.id],
      reasoning: 'mostly elsewhere',
    });

    expect(buildTopic(client, 't', base + 2 * DAY)?.arcs.map((x) => x.reasoning)).toEqual([
      'an arc',
    ]);
  });

  it('returns nothing for a tag no note carries', () => {
    expect(buildTopic(client, 'ghost')).toBeNull();
  });
});

describe('buildTopics', () => {
  it('leads with the topics carrying the most out-of-date notes', () => {
    for (let i = 0; i < 20; i += 1) addNote(`clean ${i}`, ['clean'], base + i * DAY);
    for (let i = 0; i < 20; i += 1) {
      const n = addNote(`messy ${i}`, ['messy'], base + i * DAY, 'state');
      if (i < 3) linkAmendment(client, addNote(`fix ${i}`, ['messy'], base + 30 * DAY).id, n.id);
    }
    expect(buildTopics(client, base + 40 * DAY)[0].tag).toBe('messy');
  });
});
