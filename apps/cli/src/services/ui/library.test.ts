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
const addWith = (title: string, source: string, layer = 'state') => {
  const row = client.sqlite
    .prepare(
      `INSERT INTO notes (title, content, file_path, layer, source, created_at, updated_at)
       VALUES (?, 'body', ?, ?, ?, 1, 1) RETURNING id`,
    )
    .get(title, join(dir, `${title}.md`), layer, source) as { id: number };
  return row.id;
};

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

  // Superseded 2026-09-09: this used to expect an imported file to be nobody's,
  // which is what made the sidebar and this screen disagree about the same
  // blog post. What is still true is the half that was never in doubt.
  it('does not offer what an agent wrote as the person’s writing', () => {
    addWith('AI가 쓴 것', 'claude-code');

    expect(buildLibrary(client, 'mine').rows).toHaveLength(0);
    expect(buildLibrary(client).counts.mine).toBe(0);
  });

  it('counts a file that came from another editor as the person’s', () => {
    add('다른 편집기에서 쓴 것');
    setDocumentMeta(client, add('직접 표시한 것'), { origin: 'person', kind: 'note' });

    expect(buildLibrary(client, 'mine').rows).toHaveLength(2);
  });

  it('counts a document marked as somebody else’s among the references', () => {
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

    expect(buildLibrary(client).counts).toMatchObject({ all: 2, mine: 2, instruction: 1 });
  });
});

// The real vault had 1,404 notes and zero of them in any filter, because the
// filters only read metadata that nothing outside a freshly created document
// ever had. `source` and `layer` were written down at import and can be read.
describe('what the library can work out about a note nobody has labelled', () => {
  it('does not offer what an agent wrote as the person’s writing', () => {
    addWith('AI가 쓴 노트', 'claude-code');
    expect(buildLibrary(client, 'mine').rows).toHaveLength(0);
  });

  it('counts what somebody typed here as theirs', () => {
    addWith('직접 쓴 노트', 'manual');
    expect(buildLibrary(client, 'mine').rows.map((r) => r.title)).toEqual(['직접 쓴 노트']);
  });

  // Where a file lives and who wrote it are separate questions, and a file can
  // answer both. This is the same rule the sidebar has always used.
  it('counts a borrowed file as a reference and as the person’s writing', () => {
    addWith('빌려온 글', 'index', 'external');

    expect(buildLibrary(client, 'reference').rows.map((r) => r.title)).toEqual(['빌려온 글']);
    expect(buildLibrary(client, 'mine').rows.map((r) => r.title)).toEqual(['빌려온 글']);
  });

  it('lets an explicit answer beat the guess', () => {
    const agentWrote = addWith('AI가 쓴 초안', 'claude-code');
    setDocumentMeta(client, agentWrote, { origin: 'person' });

    expect(buildLibrary(client, 'mine').rows.map((r) => r.title)).toEqual(['AI가 쓴 초안']);
  });
});

// The 216 blog posts in the real vault. A file that did not come through
// memex's own write path was written by the person in another editor, which is
// what the sidebar has always said — and what this screen disagreed with until
// the rule moved into one place.
describe('a connected folder', () => {
  const addAt = (title: string, filePath: string) => {
    const row = client.sqlite
      .prepare(
        `INSERT INTO notes (title, content, file_path, layer, source, created_at, updated_at)
         VALUES (?, 'body', ?, 'external', 'index', 1, 1) RETURNING id`,
      )
      .get(title, filePath) as { id: number };
    return row.id;
  };

  it('is the person’s writing by default, the way the sidebar reads it', () => {
    addAt('내 블로그 글', join(dir, 'blog/posts/one.md'));

    expect(buildLibrary(client, 'mine').rows.map((r) => r.title)).toEqual(['내 블로그 글']);
  });

  // Two axes. Where a file lives and who wrote it are different questions, so a
  // post somebody wrote in a folder memex only reads is in both answers.
  it('is still material memex only reads', () => {
    addAt('내 블로그 글', join(dir, 'blog/posts/one.md'));

    expect(buildLibrary(client, 'reference').rows).toHaveLength(1);
    expect(buildLibrary(client).counts).toMatchObject({ mine: 1, reference: 1 });
  });

  it('is somebody else’s once the folder says so', () => {
    addAt('남의 저장소 문서', join(dir, 'someone-else/readme.md'));

    const marked = buildLibrary(client, 'mine', 500, [join(dir, 'someone-else')]);

    expect(marked.rows).toHaveLength(0);
  });

  it('does not disown a folder that was not marked', () => {
    addAt('내 블로그 글', join(dir, 'blog/posts/one.md'));

    expect(buildLibrary(client, 'mine', 500, [join(dir, 'someone-else')]).rows).toHaveLength(1);
  });

  // Marking a folder is about who wrote it, not about who may change it.
  it('says nothing about being allowed to write there', () => {
    const id = addAt('내 블로그 글', join(dir, 'blog/posts/one.md'));

    expect(client.sqlite.prepare('SELECT layer FROM notes WHERE id = ?').get(id)).toMatchObject({
      layer: 'external',
    });
  });
});
