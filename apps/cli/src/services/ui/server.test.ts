import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNote, insertNote, type MemexClient, openDb, serializeTags } from '@memex/db';
import { EMBEDDING_DIM } from '@memex/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { route, type UiDeps } from './server.ts';

let dbDir: string;
let vaultDir: string;
let client: MemexClient;
let deps: UiDeps;

const stubEmbedder = async () => new Array(EMBEDDING_DIM).fill(0.1);

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-route-db-'));
  vaultDir = mkdtempSync(join(tmpdir(), 'memex-route-vault-'));
  client = openDb(dbDir);
  deps = { client, embedder: stubEmbedder, vaultPath: vaultDir };
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(vaultDir, { recursive: true, force: true });
});

const post = (path: string, payload: unknown) =>
  route(deps, 'POST', new URL(path, 'http://localhost'), payload);

const body = (reply: { body: string }): Record<string, unknown> => JSON.parse(reply.body);

const addNote = (title: string, layer: 'past' | 'state' | 'rule', content = 'the body\n') =>
  insertNote(client, {
    title,
    content,
    filePath: join(vaultDir, `${title}.md`),
    source: 'manual',
    layer,
    tags: serializeTags(['one']),
  });

describe('POST /api/note/:id', () => {
  it('renames, retags and moves a layer in one patch', async () => {
    const note = addNote('a plan', 'state');

    const reply = await post(`/api/note/${note.id}`, {
      title: 'a better plan',
      tags: ['one', 'two'],
      layer: 'rule',
    });

    expect(reply.status).toBe(200);
    const saved = getNote(client, note.id);
    expect(saved?.title).toBe('a better plan');
    expect(saved?.layer).toBe('rule');
    expect(saved?.tags).toContain('two');
    expect(readFileSync(note.filePath, 'utf8')).toContain('layer: rule');
  });

  it('refuses a patch that changes nothing', async () => {
    const note = addNote('a plan', 'state');
    const reply = await post(`/api/note/${note.id}`, {});
    expect(reply.status).toBe(400);
    expect(body(reply).error).toMatchObject({ code: 'nothing-to-change' });
  });

  it('refuses to blank a title or a body', async () => {
    const note = addNote('a plan', 'state');
    expect(body(await post(`/api/note/${note.id}`, { title: '  ' })).error).toMatchObject({
      code: 'empty-title',
    });
    expect(body(await post(`/api/note/${note.id}`, { body: '' })).error).toMatchObject({
      code: 'empty-body',
    });
  });

  it('refuses a layer that is not one', async () => {
    const note = addNote('a plan', 'state');
    const reply = await post(`/api/note/${note.id}`, { layer: 'archive' });
    expect(body(reply).error).toMatchObject({ code: 'invalid-layer' });
  });

  it('still refuses to rewrite what happened', async () => {
    const note = addNote('what happened', 'past');
    const reply = await post(`/api/note/${note.id}`, { body: 'it did not' });
    expect(reply.status).toBe(409);
    expect(body(reply).error).toMatchObject({ code: 'edit-rejected' });
  });
});

describe('GET /api/note/:id', () => {
  it('names the links that open nothing, and leaves out the ones that do', async () => {
    addNote('Round-2/3 통과', 'past');
    const source = addNote('source', 'past', 'see [[Round-2／3 통과]] and [[a note nobody wrote]]\n');

    const reply = await route(
      deps,
      'GET',
      new URL(`/api/note/${source.id}`, 'http://localhost'),
      null,
    );
    expect(body(reply).deadLinks).toEqual(['a note nobody wrote']);
  });
});

describe('POST /api/tags/rename', () => {
  const tagsOf = (id: number) =>
    JSON.parse(
      client.sqlite.prepare('SELECT tags FROM notes WHERE id = ?').pluck().get(id) as string,
    ) as string[];

  it('folds one tag into another across every note that carries it', async () => {
    const a = addNote('a', 'past');
    const b = addNote('b', 'past');
    client.sqlite
      .prepare('UPDATE notes SET tags = ? WHERE id IN (?, ?)')
      .run(JSON.stringify(['커피챗']), a.id, b.id);

    const reply = await post('/api/tags/rename', { from: ['커피챗'], to: 'coffee-chat' });

    expect(reply.status).toBe(200);
    expect(body(reply)).toMatchObject({ notes: 2 });
    expect(tagsOf(a.id)).toEqual(['coffee-chat']);
    expect(tagsOf(b.id)).toEqual(['coffee-chat']);
  });

  it('turns down a rename with no source or no destination', async () => {
    expect(body(await post('/api/tags/rename', { from: [], to: 'x' })).error).toMatchObject({
      code: 'invalid-rename',
    });
    expect(body(await post('/api/tags/rename', { from: ['a'], to: ' ' })).error).toMatchObject({
      code: 'invalid-rename',
    });
  });

  it('turns down a rename onto itself, which would change nothing', async () => {
    const reply = await post('/api/tags/rename', { from: ['same'], to: 'same' });
    expect(body(reply).error).toMatchObject({ code: 'invalid-rename' });
  });
});

describe('POST /api/notes', () => {
  it('writes a correction that points back at what it corrects', async () => {
    const original = addNote('what happened', 'past');

    const reply = await post('/api/notes', {
      title: '[Amendment] what happened',
      content: '[[what happened]]\n\nit went the other way',
      layer: 'past',
      amends: original.id,
    });

    expect(reply.status).toBe(200);
    const created = body(reply);
    expect(created.title).toBe('[Amendment] what happened');

    const detail = await route(
      deps,
      'GET',
      new URL(`/api/note/${original.id}`, 'http://localhost'),
      null,
    );
    expect(body(detail).supersededBy).toHaveLength(1);
  });

  it('offers the amendment a past note needs, and nothing for one that can just be edited', async () => {
    const past = addNote('what happened', 'past');
    const state = addNote('a plan', 'state');
    const url = (id: number) => new URL(`/api/note/${id}`, 'http://localhost');

    expect(body(await route(deps, 'GET', url(past.id), null)).amendment).toMatchObject({
      title: '[Amendment] what happened',
      amends: past.id,
    });
    expect(body(await route(deps, 'GET', url(state.id), null)).amendment).toBeNull();
  });

  it('turns down a note with no title or no body', async () => {
    expect(body(await post('/api/notes', { content: 'x', layer: 'past' })).error).toMatchObject({
      code: 'empty-title',
    });
    expect(body(await post('/api/notes', { title: 'x', layer: 'past' })).error).toMatchObject({
      code: 'empty-body',
    });
  });
});
