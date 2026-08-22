import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertNote, linkAmendment, type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildThread, listThreads } from './threads.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-threads-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, authoredAt: number) =>
  insertNote(client, {
    title,
    content: `body of ${title}`,
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer: 'past',
    authoredAt,
  });

const DAY = 86_400_000;

describe('buildThread', () => {
  it('walks from any step back to where the position started', () => {
    const first = addNote('a plan', DAY);
    const second = addNote('[Amendment] a better plan', 2 * DAY);
    const third = addNote('[Amendment 2] the plan that stuck', 3 * DAY);
    linkAmendment(client, second.id, first.id);
    linkAmendment(client, third.id, second.id);

    const fromTheEnd = buildThread(client, third.id);

    expect(fromTheEnd?.rootId).toBe(first.id);
    expect(fromTheEnd?.steps).toBe(3);
    expect(fromTheEnd?.root.children[0].children[0].id).toBe(third.id);
  });

  it('drops the amendment prefix the tree already says', () => {
    const first = addNote('a plan', DAY);
    const second = addNote('[Amendment 2] a better plan', 2 * DAY);
    linkAmendment(client, second.id, first.id);

    expect(buildThread(client, first.id)?.root.children[0].title).toBe('a better plan');
  });

  it('counts a step two notes corrected as a fork', () => {
    const first = addNote('a plan', DAY);
    const left = addNote('one way out', 2 * DAY);
    const right = addNote('another way out', 3 * DAY);
    linkAmendment(client, left.id, first.id);
    linkAmendment(client, right.id, first.id);

    const thread = buildThread(client, first.id);

    expect(thread?.branches).toBe(1);
    expect(thread?.root.children.map((c) => c.id)).toEqual([left.id, right.id]);
    expect(thread?.lastAt).toBe(3 * DAY);
  });

  it('is null for a note nothing corrected and that corrects nothing', () => {
    expect(buildThread(client, addNote('alone', DAY).id)).toBeNull();
  });
});

describe('listThreads', () => {
  it('puts the thread that moved most recently first', () => {
    const oldRoot = addNote('settled long ago', DAY);
    const oldTip = addNote('[Amendment] settled', 2 * DAY);
    linkAmendment(client, oldTip.id, oldRoot.id);

    const liveRoot = addNote('still being argued', 3 * DAY);
    const liveTip = addNote('[Amendment] argued again', 9 * DAY);
    linkAmendment(client, liveTip.id, liveRoot.id);

    expect(listThreads(client).map((t) => t.rootId)).toEqual([liveRoot.id, oldRoot.id]);
  });

  it('lists a thread once, from its root', () => {
    const first = addNote('a plan', DAY);
    const second = addNote('[Amendment] a better plan', 2 * DAY);
    const third = addNote('[Amendment 2] the plan that stuck', 3 * DAY);
    linkAmendment(client, second.id, first.id);
    linkAmendment(client, third.id, second.id);

    expect(listThreads(client)).toHaveLength(1);
    expect(listThreads(client)[0].rootId).toBe(first.id);
  });
});
