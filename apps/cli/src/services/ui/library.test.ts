import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MemexClient, openDb, setDocumentMeta } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildLibrary } from './library.ts';

let dir: string;
let client: MemexClient;

// `index` on purpose: a note that arrived by being imported is the shape of the
// 726 in the real vault that nobody has labelled. Leaving `source` to its column
// default would say `manual`, which means somebody typed it — a different thing
// entirely, and one these tests are not about.
const add = (title: string, layer = 'state') => {
  const row = client.sqlite
    .prepare(
      `INSERT INTO notes (title, content, file_path, layer, source, created_at, updated_at)
       VALUES (?, 'body', ?, ?, 'index', 1, 1) RETURNING id`,
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

// The real vault had 1,404 notes and zero of them in any filter, because the
// filters only read metadata that nothing outside a freshly created document
// ever had. `source` and `layer` were written down at import and can be read.
describe('what the library can work out about a note nobody has labelled', () => {
  const addWith = (title: string, source: string, layer = 'state') => {
    const row = client.sqlite
      .prepare(
        `INSERT INTO notes (title, content, file_path, layer, source, created_at, updated_at)
         VALUES (?, 'body', ?, ?, ?, 1, 1) RETURNING id`,
      )
      .get(title, join(dir, `${title}.md`), layer, source) as { id: number };
    return row.id;
  };

  it('does not offer what an agent wrote as the person’s writing', () => {
    addWith('AI가 쓴 노트', 'claude-code');
    expect(buildLibrary(client, 'mine').rows).toHaveLength(0);
  });

  it('counts what somebody typed here as theirs', () => {
    addWith('직접 쓴 노트', 'manual');
    expect(buildLibrary(client, 'mine').rows.map((r) => r.title)).toEqual(['직접 쓴 노트']);
  });

  // 726 of them. A borrowed folder is material memex reads, which is what the
  // reference filter is for — it was empty before this.
  it('counts a borrowed file as a reference', () => {
    addWith('빌려온 글', 'index', 'external');

    expect(buildLibrary(client, 'reference').rows.map((r) => r.title)).toEqual(['빌려온 글']);
    expect(buildLibrary(client, 'mine').rows).toHaveLength(0);
  });

  it('lets an explicit answer beat the guess', () => {
    const borrowed = addWith('내가 쓴 블로그 글', 'index', 'external');
    setDocumentMeta(client, borrowed, { origin: 'person' });

    expect(buildLibrary(client, 'mine').rows.map((r) => r.title)).toEqual(['내가 쓴 블로그 글']);
  });
});

// The 216 blog posts in the real vault. memex indexes that folder, which makes
// it borrowed; the person wrote every file in it, which makes it theirs. Both
// are true, and only one of them is written down anywhere.
describe('a connected folder the person wrote', () => {
  const addAt = (title: string, filePath: string) => {
    const row = client.sqlite
      .prepare(
        `INSERT INTO notes (title, content, file_path, layer, source, created_at, updated_at)
         VALUES (?, 'body', ?, 'external', 'index', 1, 1) RETURNING id`,
      )
      .get(title, filePath) as { id: number };
    return row.id;
  };

  it('is a reference until somebody says it is theirs', () => {
    addAt('내 블로그 글', join(dir, 'blog/posts/one.md'));

    expect(buildLibrary(client, 'mine').rows).toHaveLength(0);
    expect(buildLibrary(client, 'reference').rows).toHaveLength(1);
  });

  it('is the person’s writing once the folder is marked', () => {
    addAt('내 블로그 글', join(dir, 'blog/posts/one.md'));

    const mine = buildLibrary(client, 'mine', 500, [join(dir, 'blog')]);

    expect(mine.rows.map((r) => r.title)).toEqual(['내 블로그 글']);
  });

  it('does not claim a neighbouring folder that was not marked', () => {
    addAt('남의 저장소 문서', join(dir, 'someone-else/readme.md'));

    expect(buildLibrary(client, 'mine', 500, [join(dir, 'blog')]).rows).toHaveLength(0);
  });

  // Marking a folder is about who wrote it, not about who may change it. A
  // borrowed file stays read-only however it is labelled.
  it('says nothing about being allowed to write there', () => {
    const id = addAt('내 블로그 글', join(dir, 'blog/posts/one.md'));
    const note = client.sqlite.prepare('SELECT layer FROM notes WHERE id = ?').get(id);

    expect(note).toMatchObject({ layer: 'external' });
  });
});
