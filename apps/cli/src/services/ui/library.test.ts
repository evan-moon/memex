import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MemexClient, openDb, setDocumentMeta } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildLibrary } from './library.ts';

let dir: string;
let client: MemexClient;

const add = (title: string, layer = 'state') => {
  const row = client.sqlite
    .prepare(
      `INSERT INTO notes (title, content, file_path, layer, created_at, updated_at)
       VALUES (?, 'body', ?, ?, 1, 1) RETURNING id`,
    )
    .get(title, join(dir, `${title}.md`), layer) as { id: number };
  return row.id;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-library-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('buildLibrary', () => {
  it('shows everything when nothing is filtered', () => {
    add('하나');
    add('둘');

    expect(buildLibrary(client).rows).toHaveLength(2);
  });

  // The design is explicit that `notes.author` defaulting to person is not
  // evidence of authorship. A vault full of the agent's notes must not come back
  // as the person's writing.
  it('does not call an unclaimed document the person’s writing', () => {
    add('AI가 쓴 것');

    expect(buildLibrary(client, 'mine').rows).toHaveLength(0);
    expect(buildLibrary(client).counts.mine).toBe(0);
  });

  it('shows what the person actually wrote here', () => {
    const mine = add('내 원고');
    setDocumentMeta(client, mine, { origin: 'person', kind: 'note' });
    add('출처를 모르는 것');

    expect(buildLibrary(client, 'mine').rows.map((r) => r.title)).toEqual(['내 원고']);
  });

  it('counts an imported file as reference', () => {
    const borrowed = add('빌려온 자료');
    setDocumentMeta(client, borrowed, { origin: 'external' });

    expect(buildLibrary(client, 'reference').rows.map((r) => r.title)).toEqual(['빌려온 자료']);
  });

  // A rule is guidance, and guidance is what the library calls an instruction.
  // Nobody outside this repository should have to know the column is `layer`.
  it('shows a rule under instructions', () => {
    add('담백하게 쓰기', 'rule');

    expect(buildLibrary(client, 'instruction').rows.map((r) => r.title)).toEqual(['담백하게 쓰기']);
  });

  it('puts what changed most recently first', () => {
    const older = add('오래된 것');
    const newer = add('최근 것');
    client.sqlite.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(100, older);
    client.sqlite.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(200, newer);

    expect(buildLibrary(client).rows.map((r) => r.title)).toEqual(['최근 것', '오래된 것']);
  });

  it('counts every filter so a tab can say how many it holds', () => {
    const mine = add('내 글');
    setDocumentMeta(client, mine, { origin: 'person' });
    add('규칙', 'rule');

    expect(buildLibrary(client).counts).toMatchObject({ all: 2, mine: 1, instruction: 1 });
  });
});
