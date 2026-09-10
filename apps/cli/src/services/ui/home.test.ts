import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MemexClient, openDb, setDocumentMeta } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHome } from './home.ts';

let dir: string;
let client: MemexClient;

const add = (title: string, source: string, at: number, content = 'body') => {
  const row = client.sqlite
    .prepare(
      `INSERT INTO notes (title, content, file_path, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?) RETURNING id`,
    )
    .get(title, content, join(dir, `${title}.md`), source, at) as { id: number };
  return row.id;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-home-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('buildHome', () => {
  it('has nothing to continue in an empty vault', () => {
    expect(buildHome(client)).toMatchObject({ continuing: null, recent: [] });
  });

  it('opens on what the person was in the middle of', () => {
    add('오래된 원고', 'manual', 100);
    add('쓰던 원고', 'manual', 200);

    expect(buildHome(client).continuing).toMatchObject({ title: '쓰던 원고' });
  });

  // An agent writing a memory does not put the person back in the middle of
  // anything, and a home screen that says otherwise sends them somewhere they
  // were not.
  it('is not moved by what an agent wrote a second ago', () => {
    add('쓰던 원고', 'manual', 100);
    add('AI가 방금 쓴 기억', 'claude-code', 999);

    expect(buildHome(client).continuing).toMatchObject({ title: '쓰던 원고' });
    expect(buildHome(client).recent.map((r) => r.title)).not.toContain('AI가 방금 쓴 기억');
  });

  it('takes the person’s word over the guess', () => {
    const claimed = add('AI가 쓴 것으로 보이는 글', 'claude-code', 999);
    setDocumentMeta(client, claimed, { origin: 'person' });
    add('내 원고', 'manual', 100);

    expect(buildHome(client).continuing).toMatchObject({ title: 'AI가 쓴 것으로 보이는 글' });
  });

  it('does not list the document it is already offering to continue', () => {
    add('쓰던 원고', 'manual', 200);
    add('다른 원고', 'manual', 100);

    const home = buildHome(client);
    expect(home.recent.map((r) => r.title)).toEqual(['다른 원고']);
  });

  it('shows at most eight recent documents', () => {
    for (let n = 0; n < 12; n += 1) add(`원고 ${n}`, 'manual', n);
    expect(buildHome(client).recent).toHaveLength(8);
  });

  // A home screen that shows the first line of every document shows the same
  // line every time — the frontmatter.
  it('shows what a document says, not its metadata', () => {
    add('원고', 'manual', 100, '---\ntitle: 원고\n---\n\n처음에는 대답을 얻으려고 AI를 썼다.\n');

    expect(buildHome(client).continuing?.snippet).toBe('처음에는 대답을 얻으려고 AI를 썼다.');
  });

  // The design says the section is left out when there is nothing in it, rather
  // than shown empty with a reassuring sentence.
  it('offers no changes rather than an empty list dressed up', () => {
    add('원고', 'manual', 100);
    expect(buildHome(client).changes).toEqual([]);
  });
});
