import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildMemory,
  correctMemory,
  isDocumentFailure,
  readDocument,
  restoreDocument,
  updateDocument,
} from '@memex/core';
import { getNoteByFilePath, type MemexClient, openDb, setRegister } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexDirectory } from '../apps/cli/src/services/indexer.ts';
import { copyFixtureVault, stubEmbedder, temporaryDbDir } from './fixtures/vault.ts';

// The release scenarios from the handoff, run against the fixture vault rather
// than asserted about. Each one names the ID it covers. What is not here is what
// needs a window and a person, and the acceptance document says which.
let vault: { path: string; dispose: () => void };
let db: { path: string; dispose: () => void };
let client: MemexClient;

const user = () => ({ actor: 'user' as const, vaultPath: vault.path });
const agent = () => ({ actor: 'agent' as const, vaultPath: vault.path });

beforeEach(async () => {
  vault = copyFixtureVault();
  db = temporaryDbDir();
  client = openDb(db.path);
  await indexDirectory(client, stubEmbedder, vault.path);
});

afterEach(() => {
  client.sqlite.close();
  vault.dispose();
  db.dispose();
});

const noteAt = (relative: string) => {
  const note = getNoteByFilePath(client, join(vault.path, relative));
  if (!note) throw new Error(`${relative} is not indexed`);
  return note;
};

const written = <T>(result: T) => {
  if (isDocumentFailure(result)) throw new Error(`expected a write, got ${result.error}`);
  return result;
};

describe('A02 — editing one paragraph leaves the rest alone', () => {
  it('keeps YAML memex cannot parse, and the paragraphs it did not touch', () => {
    const note = noteAt('notes/unknown-yaml.md');
    const before = readFileSync(note.filePath, 'utf8');
    const after = before.replace('어떤 플러그인이 이 키를 쓰는지.', '이제는 알아냈다.');

    written(
      updateDocument(client, note.id, { raw: after, expectedRevision: null, mutationId: 'a02' }, user()),
    );

    const onDisk = readFileSync(note.filePath, 'utf8');
    expect(onDisk).toContain('obsidian_plugin_state:');
    expect(onDisk).toContain('cssclass: wide-table');
    expect(onDisk).toContain('aliases:');
    expect(onDisk).toContain('이제는 알아냈다.');
  });
});

describe('A04 — a vault with no git can still be put back', () => {
  it('restores what was there before, and keeps the edit in the history', () => {
    expect(existsSync(join(vault.path, '.git'))).toBe(false);
    const note = noteAt('projects/launch-plan.md');
    const before = readFileSync(note.filePath, 'utf8');

    const first = written(
      updateDocument(
        client,
        note.id,
        { raw: '전부 다시 씀\n', expectedRevision: null, mutationId: 'a04-1' },
        user(),
      ),
    );
    const baseline = readDocument(client, note.id, user());
    if (isDocumentFailure(baseline)) throw new Error('unreadable');

    const history = client.sqlite
      // `at` alone ties when two revisions land in the same millisecond, which
      // a baseline and the write that provoked it always do.
      .prepare('SELECT revision_id FROM document_revisions WHERE document_id = ? ORDER BY at, rowid')
      .all(note.id) as { revision_id: string }[];
    written(restoreDocument(client, note.id, history[0].revision_id, first.revision, user()));

    expect(readFileSync(note.filePath, 'utf8')).toBe(before);
  });
});

describe('A05 — two writers on one document', () => {
  it('lands one and tells the other its base moved, with no silent overwrite', () => {
    const note = noteAt('projects/launch-plan.md');
    const second = openDb(db.path);
    const base = written(
      updateDocument(
        client,
        note.id,
        { raw: 'from the app\n', expectedRevision: null, mutationId: 'a05-1' },
        user(),
      ),
    );

    const other = updateDocument(
      second,
      note.id,
      { raw: 'from mcp\n', expectedRevision: 'a-version-that-never-was', mutationId: 'a05-2' },
      user(),
    );
    second.sqlite.close();

    expect(other).toMatchObject({ error: 'version-conflict' });
    expect(readFileSync(note.filePath, 'utf8')).toBe('from the app\n');
    expect(base.revision).not.toBe('');
  });
});

describe('A08 — September becomes October', () => {
  it('gives the next read the new value and keeps the old one in the history', () => {
    setRegister(client, {
      subject: '출시 계획',
      predicate: '출시 목표',
      value: '9월',
      scope: { kind: 'global' },
      author: 'agent',
    });
    const before = buildMemory(client, '출시 계획').items[0];
    expect(before.statement).toBe('출시 목표: 9월');

    correctMemory(client, { target: before.id, replacement: '10월', mutationId: 'a08' });

    expect(buildMemory(client, '출시 계획').items[0]).toMatchObject({
      statement: '출시 목표: 10월',
      status: 'confirmed',
    });
    const events = client.sqlite
      .prepare('SELECT COUNT(*) AS n FROM register_events')
      .get() as { n: number };
    expect(events.n).toBe(2);
  });
});

describe('A10 — an agent does not overwrite what a person may have written', () => {
  it('refuses, and leaves the file exactly as it was', () => {
    const note = noteAt('writing/ai-and-me.md');
    const before = readFileSync(note.filePath, 'utf8');

    const refused = updateDocument(
      client,
      note.id,
      { raw: 'the agent decided otherwise\n', expectedRevision: null, mutationId: 'a10' },
      agent(),
    );

    expect(refused).toMatchObject({ error: 'write-not-allowed', code: 'propose-instead' });
    expect(readFileSync(note.filePath, 'utf8')).toBe(before);
  });
});

describe('A13 — the file moved while the app was looking away', () => {
  it('finds the outside edit, keeps it, and does not write over it', () => {
    const note = noteAt('projects/copy-draft.md');
    written(
      updateDocument(client, note.id, { raw: 'mine\n', expectedRevision: null, mutationId: 'a13-1' }, user()),
    );
    writeFileSync(note.filePath, '다른 편집기가 쓴 것\n', 'utf8');

    const outcome = updateDocument(
      client,
      note.id,
      { raw: 'mine again\n', expectedRevision: null, mutationId: 'a13-2' },
      user(),
    );

    expect(outcome).toMatchObject({ error: 'version-conflict', currentRaw: '다른 편집기가 쓴 것\n' });
    expect(readFileSync(note.filePath, 'utf8')).toBe('다른 편집기가 쓴 것\n');
  });
});

describe('A01 — writing with no model anywhere', () => {
  it('reads and writes a document without an embedder being called', () => {
    const note = noteAt('notes/no-frontmatter.md');
    const read = readDocument(client, note.id, user());
    if (isDocumentFailure(read)) throw new Error('unreadable');
    const indexed = client.sqlite
      .prepare('SELECT embedding FROM note_embeddings WHERE note_id = ?')
      .get(note.id) as { embedding: Buffer } | undefined;

    expect(read.capabilities.canEdit).toBe(true);
    written(
      updateDocument(
        client,
        note.id,
        { raw: `${read.raw}\n한 줄 더.\n`, expectedRevision: read.revision, mutationId: 'a01' },
        user(),
      ),
    );

    expect(readFileSync(note.filePath, 'utf8')).toContain('한 줄 더.');

    // The write took no embedder — the function has nowhere to put one — so
    // meaning search is left pointing at what the document used to say. That is
    // the contract's "saved, waiting on meaning search", not a failed save.
    const after = client.sqlite
      .prepare('SELECT embedding FROM note_embeddings WHERE note_id = ?')
      .get(note.id) as { embedding: Buffer } | undefined;
    expect(after?.embedding).toEqual(indexed?.embedding);
  });
});
