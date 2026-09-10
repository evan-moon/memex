import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findMutation,
  getDocumentMeta,
  listRevisions,
  lockOn,
  type MemexClient,
  openDb,
  setDocumentMeta,
  withDocumentLock,
} from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  type DocumentContext,
  isDocumentFailure,
  readDocument,
  restoreDocument,
  updateDocument,
} from './documents.ts';

let dbDir: string;
let vault: string;
let client: MemexClient;

const asUser: DocumentContext = { actor: 'user', vaultPath: '' };
const asAgent: DocumentContext = { actor: 'agent', vaultPath: '' };
const user = (): DocumentContext => ({ ...asUser, vaultPath: vault });
const agent = (): DocumentContext => ({ ...asAgent, vaultPath: vault });

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-documents-db-'));
  vault = mkdtempSync(join(tmpdir(), 'memex-documents-vault-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(vault, { recursive: true, force: true });
});

const written = (result: ReturnType<typeof createDocument>) => {
  if (isDocumentFailure(result)) throw new Error(`expected a write, got ${result.error}`);
  return result;
};

const make = (title: string, raw: string, folder?: string) =>
  written(createDocument(client, { title, raw, folder }, user()));

describe('createDocument', () => {
  // Nothing about writing a document needs an embedder, a provider, or a login.
  // This test passes no model of any kind, which is the whole point of it.
  it('writes a document with no model anywhere near it', () => {
    const made = make('첫 생각', '# 첫 생각\n\n여기서 시작한다.\n');

    expect(made.revision).toMatch(/[0-9a-f-]{36}/);
    expect(readFileSync(join(vault, '첫 생각.md'), 'utf8')).toContain('여기서 시작한다');
  });

  // A memory save refuses an empty body on purpose. A document being written is
  // empty for the first few seconds of its life.
  it('accepts a document with nothing in it yet', () => {
    const made = make('제목 없음', '');
    expect(isDocumentFailure(made)).toBe(false);
    expect(readDocument(client, made.id, user())).toMatchObject({ raw: '' });
  });

  it('asks for no layer and no sections', () => {
    const made = make('섹션 없는 글', '아무 형식도 없다.\n');
    expect(getDocumentMeta(client, made.id)).toMatchObject({ mode: 'document', origin: 'person' });
  });

  it('does not overwrite a file that is already there', () => {
    const first = make('같은 이름', 'one\n');
    const second = make('같은 이름', 'two\n');

    expect(first.id).not.toBe(second.id);
    expect(readFileSync(join(vault, '같은 이름.md'), 'utf8')).toBe('one\n');
    expect(readFileSync(join(vault, '같은 이름 2.md'), 'utf8')).toBe('two\n');
  });

  it('marks what an agent wrote as the agent’s', () => {
    const made = written(createDocument(client, { title: 'AI 초안', raw: 'draft\n' }, agent()));
    expect(getDocumentMeta(client, made.id)).toMatchObject({ origin: 'agent', kind: 'draft' });
  });
});

describe('updateDocument', () => {
  const raw = [
    '---',
    'title: 알 수 없는 메타데이터',
    'cssclass: wide-table',
    'obsidian_plugin_state: {"pinned": true}',
    '---',
    '',
    '# 알 수 없는 메타데이터',
    '',
    '첫 문단.',
    '',
    '두 번째 문단.',
    '',
  ].join('\n');

  // A02. The frontmatter memex cannot parse is somebody's plugin state, and an
  // edit to one paragraph has no business touching it.
  it('keeps the YAML it does not understand', () => {
    const made = make('알 수 없는 메타데이터', raw);
    const edited = raw.replace('첫 문단.', '고친 문단.');

    const result = updateDocument(
      client,
      made.id,
      { raw: edited, expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );

    expect(isDocumentFailure(result)).toBe(false);
    const onDisk = readFileSync(join(vault, '알 수 없는 메타데이터.md'), 'utf8');
    expect(onDisk).toContain('cssclass: wide-table');
    expect(onDisk).toContain('obsidian_plugin_state:');
    expect(onDisk).toContain('고친 문단.');
    expect(onDisk).toContain('두 번째 문단.');
  });

  it('refuses a write built on a version that has moved', () => {
    const made = make('출시 계획', 'one\n');
    updateDocument(
      client,
      made.id,
      { raw: 'two\n', expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );

    const stale = updateDocument(
      client,
      made.id,
      { raw: 'three\n', expectedRevision: made.revision, mutationId: 'm-2' },
      user(),
    );

    expect(stale).toMatchObject({ error: 'version-conflict' });
    expect(readFileSync(join(vault, '출시 계획.md'), 'utf8')).toBe('two\n');
  });

  it('gives a repeated mutation the answer the first one got', () => {
    const made = make('출시 계획', 'one\n');
    const first = updateDocument(
      client,
      made.id,
      { raw: 'two\n', expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );
    const again = updateDocument(
      client,
      made.id,
      { raw: 'three\n', expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );

    expect(again).toMatchObject({ revision: written(first).revision });
    expect(readFileSync(join(vault, '출시 계획.md'), 'utf8')).toBe('two\n');
  });

  // A13. Another editor does not take memex's lock, so its writing is found
  // here rather than replaced.
  it('finds an outside edit and keeps it instead of writing over it', () => {
    const made = make('바깥에서 고친 글', 'mine\n');
    writeFileSync(join(vault, '바깥에서 고친 글.md'), 'theirs\n', 'utf8');

    const result = updateDocument(
      client,
      made.id,
      { raw: 'mine again\n', expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );

    expect(result).toMatchObject({ error: 'version-conflict', currentRaw: 'theirs\n' });
    expect(readFileSync(join(vault, '바깥에서 고친 글.md'), 'utf8')).toBe('theirs\n');
    expect(listRevisions(client, made.id).some((r) => r.actor === 'external')).toBe(true);
  });

  it('does not report success when the file could not be written', () => {
    mkdirSync(join(vault, 'locked'));
    const made = make('잠긴 폴더의 글', 'one\n', 'locked');
    chmodSync(join(vault, 'locked'), 0o500);

    const result = updateDocument(
      client,
      made.id,
      { raw: 'two\n', expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );

    chmodSync(join(vault, 'locked'), 0o700);
    expect(result).toMatchObject({ error: 'write-failed' });
    // A11: the journal says what was meant to happen, and that it did not.
    expect(findMutation(client, 'm-1')).toMatchObject({ stage: 'failed' });
  });

  it('journals a write that worked, so a retry can be told from a first try', () => {
    const made = make('저널', 'one\n');
    updateDocument(
      client,
      made.id,
      { raw: 'two\n', expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );

    expect(findMutation(client, 'm-1')).toMatchObject({ stage: 'committed' });
  });

  // The first edit of a file memex has never saved. Its current text becomes the
  // baseline so the edit is a change from something.
  it('keeps what was there before the first edit it ever made', () => {
    const filePath = join(vault, 'imported.md');
    writeFileSync(filePath, 'as imported\n', 'utf8');
    const note = client.sqlite
      .prepare(
        `INSERT INTO notes (title, content, file_path, created_at, updated_at)
         VALUES ('imported', 'as imported', ?, 1, 1) RETURNING id`,
      )
      .get(filePath) as { id: number };

    updateDocument(
      client,
      note.id,
      { raw: 'edited\n', expectedRevision: null, mutationId: 'm-1' },
      user(),
    );

    const history = listRevisions(client, note.id);
    expect(history.map((r) => r.rawContent)).toEqual(['edited\n', 'as imported\n']);
  });
});

// The contract splits the save from the indexing: word search is current the
// moment the file lands, and meaning search catches up later. A save that waited
// on an embedder would be a save that cannot happen before the weights arrive.
describe('what a save updates and what it leaves for later', () => {
  const fts = (word: string) =>
    (
      client.sqlite.prepare('SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?').all(word) as {
        rowid: number;
      }[]
    ).map((row) => row.rowid);

  it('makes word search current without any model', () => {
    const made = make('색인', '처음 쓴 낱말 아르마딜로\n');
    expect(fts('아르마딜로')).toContain(made.id);

    updateDocument(
      client,
      made.id,
      { raw: '고쳐 쓴 낱말 오소리\n', expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );

    expect(fts('오소리')).toContain(made.id);
    expect(fts('아르마딜로')).not.toContain(made.id);
  });

  it('leaves the document with no embedding, and calls the save done anyway', () => {
    const made = make('임베딩 없음', '본문\n');
    const rows = client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM note_embeddings WHERE note_id = ?')
      .get(made.id) as { n: number };

    expect(rows.n).toBe(0);
    expect(readDocument(client, made.id, user())).toMatchObject({ revision: made.revision });
  });
});

describe('who may write', () => {
  it('lets a person edit their own document', () => {
    const made = make('내 글', 'one\n');
    expect(readDocument(client, made.id, user())).toMatchObject({
      capabilities: { canEdit: true },
    });
  });

  // A10. The document may be the person's, and an agent does not overwrite one
  // on its own say-so.
  it('makes an agent propose rather than overwrite a document that may be a person’s', () => {
    const made = make('내 글', 'one\n');

    const result = updateDocument(
      client,
      made.id,
      { raw: 'the agent’s version\n', expectedRevision: made.revision, mutationId: 'm-1' },
      agent(),
    );

    expect(result).toMatchObject({ error: 'write-not-allowed', code: 'propose-instead' });
    expect(readFileSync(join(vault, '내 글.md'), 'utf8')).toBe('one\n');
  });

  it('lets an agent edit the draft it wrote itself', () => {
    const made = written(createDocument(client, { title: 'AI 초안', raw: 'one\n' }, agent()));

    const result = updateDocument(
      client,
      made.id,
      { raw: 'two\n', expectedRevision: made.revision, mutationId: 'm-1' },
      agent(),
    );

    expect(isDocumentFailure(result)).toBe(false);
  });

  it('still sends an agent to a correction for a record of what happened', () => {
    const made = make('일어난 일', 'one\n');
    client.sqlite.prepare("UPDATE notes SET layer = 'past' WHERE id = ?").run(made.id);
    setDocumentMeta(client, made.id, { mode: 'legacy-memory' });

    const result = updateDocument(
      client,
      made.id,
      { raw: 'two\n', expectedRevision: made.revision, mutationId: 'm-1' },
      agent(),
    );

    expect(result).toMatchObject({ code: 'correct-instead' });
  });

  // The person may edit the text of a record. Correcting the claim inside it is
  // still a separate operation — this is about the file, not the fact.
  it('lets a person edit the text of a record all the same', () => {
    const made = make('일어난 일', 'one\n');
    client.sqlite.prepare("UPDATE notes SET layer = 'past' WHERE id = ?").run(made.id);

    const result = updateDocument(
      client,
      made.id,
      { raw: 'one, better said\n', expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );

    expect(isDocumentFailure(result)).toBe(false);
  });

  it('refuses to write a file that lives outside the vault', () => {
    const outside = mkdtempSync(join(tmpdir(), 'memex-outside-'));
    const filePath = join(outside, 'theirs.md');
    writeFileSync(filePath, 'not mine\n', 'utf8');
    const note = client.sqlite
      .prepare(
        `INSERT INTO notes (title, content, file_path, created_at, updated_at)
         VALUES ('theirs', 'not mine', ?, 1, 1) RETURNING id`,
      )
      .get(filePath) as { id: number };

    const result = updateDocument(
      client,
      note.id,
      { raw: 'mine now\n', expectedRevision: null, mutationId: 'm-1' },
      user(),
    );

    expect(result).toMatchObject({ code: 'read-only-source' });
    expect(readFileSync(filePath, 'utf8')).toBe('not mine\n');
    rmSync(outside, { recursive: true, force: true });
  });
});

describe('two writers on one document', () => {
  // A05. Two connections to the same database are two processes as far as the
  // lock is concerned — which is the point, because a queue inside one process
  // serialises nothing that matters here.
  it('lets one write land and tells the other its base has moved', () => {
    const made = make('경합', 'one\n');
    const second = openDb(dbDir);

    const first = updateDocument(
      client,
      made.id,
      { raw: 'from the app\n', expectedRevision: made.revision, mutationId: 'm-app' },
      user(),
    );
    const other = updateDocument(
      second,
      made.id,
      { raw: 'from mcp\n', expectedRevision: made.revision, mutationId: 'm-mcp' },
      user(),
    );
    second.sqlite.close();

    expect(isDocumentFailure(first)).toBe(false);
    expect(other).toMatchObject({ error: 'version-conflict' });
    expect(readFileSync(join(vault, '경합.md'), 'utf8')).toBe('from the app\n');
  });

  // The check above is the version, not the lock — the two writes are sequential
  // and the second loses on its base. This one is the lock itself: a second
  // connection holds it, and the write cannot even begin.
  it('will not begin a write while another process holds the document', () => {
    const made = make('잠금', 'one\n');
    const other = openDb(dbDir);

    const outcome = withDocumentLock(other, made.id, 'the-mcp-server', () =>
      updateDocument(
        client,
        made.id,
        { raw: 'from the app\n', expectedRevision: made.revision, mutationId: 'm-1' },
        user(),
      ),
    );

    expect(outcome).toMatchObject({ error: 'busy' });
    expect(readFileSync(join(vault, '잠금.md'), 'utf8')).toBe('one\n');
    expect(lockOn(other, made.id)).toBeUndefined();
    other.sqlite.close();
  });

  it('lets the next writer in once the lock is let go', () => {
    const made = make('잠금 해제', 'one\n');
    const other = openDb(dbDir);
    withDocumentLock(other, made.id, 'the-mcp-server', () => undefined);

    const result = updateDocument(
      client,
      made.id,
      { raw: 'two\n', expectedRevision: made.revision, mutationId: 'm-1' },
      user(),
    );
    other.sqlite.close();

    expect(isDocumentFailure(result)).toBe(false);
  });
});

describe('restoreDocument', () => {
  it('brings an old version back as a new one, keeping what it undid', () => {
    const made = make('되돌리기', 'one\n');
    const second = written(
      updateDocument(
        client,
        made.id,
        { raw: 'two\n', expectedRevision: made.revision, mutationId: 'm-1' },
        user(),
      ),
    );

    const back = restoreDocument(client, made.id, made.revision, second.revision, user());

    expect(isDocumentFailure(back)).toBe(false);
    expect(readFileSync(join(vault, '되돌리기.md'), 'utf8')).toBe('one\n');
    expect(listRevisions(client, made.id).map((r) => r.rawContent)).toEqual([
      'one\n',
      'two\n',
      'one\n',
    ]);
  });

  it('will not restore a version belonging to another document', () => {
    const one = make('하나', 'a\n');
    const two = make('둘', 'b\n');

    expect(restoreDocument(client, two.id, one.revision, two.revision, user())).toMatchObject({
      error: 'not-found',
    });
  });
});
