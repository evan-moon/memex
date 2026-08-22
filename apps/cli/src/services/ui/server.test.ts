import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getInference,
  getNote,
  insertNote,
  linkAmendment,
  type MemexClient,
  mintInference,
  openDb,
  serializeTags,
  setNoteEvidence,
  syncLinks,
} from '@memex/db';
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
    const source = addNote(
      'source',
      'past',
      'see [[Round-2／3 통과]] and [[a note nobody wrote]]\n',
    );

    const reply = await route(
      deps,
      'GET',
      new URL(`/api/note/${source.id}`, 'http://localhost'),
      null,
    );
    expect(body(reply).deadLinks).toEqual(['a note nobody wrote']);
  });
});

describe('declared sources', () => {
  const detail = async (id: number) =>
    JSON.parse(
      (await route(deps, 'GET', new URL(`/api/note/${id}`, 'http://localhost'), null)).body,
    );

  it('writes the declaration into the file and the index together', async () => {
    const source = addNote(
      'what happened',
      'past',
      '---\ntitle: what happened\n---\n\nwe chose JWT\n',
    );
    const plan = addNote('plan', 'state', '---\ntitle: plan\n---\n\nwe use JWT\n');

    const reply = await post(`/api/note/${plan.id}`, { derivesFrom: [source.id] });
    expect(reply.status).toBe(200);

    expect(body(reply).evidence).toMatchObject([{ id: source.id, changed: false }]);
    expect(readFileSync(plan.filePath, 'utf8')).toContain(`derives_from: [${source.id}]`);
  });

  it('offers the notes it links to when it has declared nothing', async () => {
    const source = addNote('what happened', 'past');
    const plan = addNote('plan', 'state', `see [[what happened]]\n`);
    syncLinks(client, plan.id, plan.content);

    expect((await detail(plan.id)).candidateSources).toMatchObject([{ id: source.id }]);
  });

  it('stops offering candidates once something is declared', async () => {
    const source = addNote('what happened', 'past');
    const plan = addNote('plan', 'state', `see [[what happened]]\n`);
    syncLinks(client, plan.id, plan.content);
    setNoteEvidence(client, plan.id, [source.id]);

    expect((await detail(plan.id)).candidateSources).toEqual([]);
  });

  it('warns with the correction that undermined it, not with a guess', async () => {
    const source = addNote('what happened', 'past');
    const plan = addNote('plan', 'state');
    setNoteEvidence(client, plan.id, [source.id]);

    const fix = addNote('[Amendment] what happened', 'past');
    linkAmendment(client, fix.id, source.id);

    const note = await detail(plan.id);
    expect(note.stale.newer).toMatchObject([{ id: fix.id }]);
    expect(note.evidence[0].amendedBy).toMatchObject({ id: fix.id });
  });

  it('starts the comparison again when a person says it still holds', async () => {
    const source = addNote('a rule', 'past', 'FP first');
    const plan = addNote('plan', 'state');
    setNoteEvidence(client, plan.id, [source.id]);

    client.sqlite.prepare('UPDATE notes SET content = ? WHERE id = ?').run('OOP now', source.id);
    expect((await detail(plan.id)).evidence[0].changed).toBe(true);

    await post(`/api/still-true/${plan.id}`, {});
    expect((await detail(plan.id)).evidence[0].changed).toBe(false);
  });
});

describe('hypotheses', () => {
  const mint = (title: string, sources: number[]) =>
    mintInference(client, {
      title,
      summary: 'the reading',
      evidence: sources.map((noteId) => ({ noteId })),
      confidence: 0.8,
      modelId: 'test-model',
    });

  it('lets every note it was read out of point at it', async () => {
    const a = addNote('essay a', 'past');
    const b = addNote('essay b', 'past');
    const inference = mint('an engine', [a.id, b.id]);

    const detail = JSON.parse(
      (await route(deps, 'GET', new URL(`/api/note/${a.id}`, 'http://localhost'), null)).body,
    );
    expect(detail.hypotheses).toMatchObject([{ id: inference.id, title: 'an engine' }]);
  });

  it('turns a hypothesis into a judgement that declares the same records', async () => {
    const a = addNote('essay a', 'past');
    const b = addNote('essay b', 'past');
    const inference = mint('an engine', [a.id, b.id]);

    const reply = await post(`/api/inference/${inference.id}/promote`, {});
    expect(reply.status).toBe(200);

    const note = body(reply);
    expect(note.layer).toBe('state');
    expect(note.evidence).toMatchObject([{ id: a.id }, { id: b.id }]);
    expect(getInference(client, inference.id)?.inference.status).toBe('archived');
  });

  it('will not act on one that was already discarded', async () => {
    const a = addNote('essay a', 'past');
    const inference = mint('an engine', [a.id]);
    await post(`/api/inference/${inference.id}/archive`, {});

    const reply = await post(`/api/inference/${inference.id}/promote`, {});
    expect(reply.status).toBe(409);
    expect(body(reply).error).toMatchObject({ code: 'inference-archived' });
  });

  it('restarts the comparison when a person says it still holds', async () => {
    const a = addNote('essay a', 'past', 'first wording');
    const inference = mint('an engine', [a.id]);
    client.sqlite.prepare('UPDATE notes SET content = ? WHERE id = ?').run('rewritten', a.id);

    const before = JSON.parse(
      (
        await route(
          deps,
          'GET',
          new URL(`/api/inference/${inference.id}`, 'http://localhost'),
          null,
        )
      ).body,
    );
    expect(before.evidence[0].changed).toBe(true);

    const after = JSON.parse(
      (await post(`/api/inference/${inference.id}/still-true`, {})).body,
    ) as { evidence: { changed: boolean }[] };
    expect(after.evidence[0].changed).toBe(false);
  });
});

describe('GET /api/chores', () => {
  const chores = async () =>
    JSON.parse((await route(deps, 'GET', new URL('/api/chores', 'http://localhost'), null)).body);

  it('reports nothing waiting on an empty vault', async () => {
    const c = await chores();
    expect(c.undeclared.total).toBe(0);
    expect(c.staleNotes.total).toBe(0);
    expect(c.deadLinks.total).toBe(0);
    expect(c.looseTags.total).toBe(0);
  });

  it('counts dead links as they are now, not as detection last remembered them', async () => {
    addNote('Round-2/3 통과', 'past');
    addNote('a', 'past', 'see [[Round-2／3 통과]] and [[nobody wrote this]]\n');

    const c = await chores();
    expect(c.deadLinks).toMatchObject({ total: 1, notes: 1 });
    expect(c.deadLinks.top[0].targets).toEqual(['nobody wrote this']);
  });

  it('counts a tag used once, and says how many it may not touch', async () => {
    const note = addNote('a', 'past');
    client.sqlite
      .prepare('UPDATE notes SET tags = ? WHERE id = ?')
      .run(JSON.stringify(['once']), note.id);

    const c = await chores();
    expect(c.looseTags).toMatchObject({ total: 1, all: 1 });
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

describe('tag maintenance', () => {
  const tagNotes = (id: number, tags: string[]) =>
    client.sqlite.prepare('UPDATE notes SET tags = ? WHERE id = ?').run(JSON.stringify(tags), id);

  it('lists every tag with what memex may rewrite', async () => {
    const a = addNote('a', 'past');
    tagNotes(a.id, ['keep', 'junk']);

    const reply = await route(deps, 'GET', new URL('/api/tags', 'http://localhost'), null);
    expect(JSON.parse(reply.body)).toEqual([
      { tag: 'junk', notes: 1, mine: 1 },
      { tag: 'keep', notes: 1, mine: 1 },
    ]);
  });

  it('takes a tag off the notes that carry it', async () => {
    const a = addNote('a', 'past');
    tagNotes(a.id, ['keep', 'junk']);

    const reply = await post('/api/tags/delete', { tags: ['junk'] });
    expect(reply.status).toBe(200);
    expect(
      JSON.parse(
        client.sqlite.prepare('SELECT tags FROM notes WHERE id = ?').pluck().get(a.id) as string,
      ),
    ).toEqual(['keep']);
  });

  it('turns down a delete that names no tag', async () => {
    expect(body(await post('/api/tags/delete', { tags: [] })).error).toMatchObject({
      code: 'invalid-rename',
    });
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

describe('GET /api/source/:id', () => {
  const getSource = (id: number) =>
    route(deps, 'GET', new URL(`/api/source/${id}`, 'http://localhost'), null);

  it('hands back the file as it sits on disk, frontmatter and all', async () => {
    const raw = ['---', 'title: a plan', 'layer: state', '---', '', '# a plan', '', 'the body', ''].join('\n');
    const note = addNote('a plan', 'state', raw);
    writeFileSync(note.filePath, raw);

    const reply = await getSource(note.id);

    expect(reply.status).toBe(200);
    expect(body(reply)).toEqual({ path: note.filePath, text: raw });
  });

  it('says the file is gone rather than pretending the index is the note', async () => {
    const note = addNote('a plan', 'state');
    writeFileSync(note.filePath, 'the body\n');
    unlinkSync(note.filePath);

    expect(body(await getSource(note.id))).toEqual({ path: note.filePath, text: null });
  });

  it('404s for an id no note carries', async () => {
    expect((await getSource(9999)).status).toBe(404);
  });
});

describe('the repair batch and the reading behind it', () => {
  const get = (path: string) => route(deps, 'GET', new URL(path, 'http://localhost'), undefined);

  it('hands the stack over without waiting for any note to be read', async () => {
    const pending = new Promise<void>(() => {});
    deps = { ...deps, fillShapes: () => pending };

    const reply = await get('/api/repair/evidence?limit=5');

    expect(reply.status).toBe(200);
    expect(body(reply)).toHaveProperty('cards');
  });

  it('asks for the next reading each time the stack is served', async () => {
    let asked = 0;
    deps = {
      ...deps,
      fillShapes: async () => {
        asked += 1;
      },
    };

    await get('/api/repair/evidence?limit=5');
    await get('/api/repair/evidence?limit=5');

    expect(asked).toBe(2);
  });

  it('still serves the stack when the reading cannot even start', async () => {
    deps = { ...deps, fillShapes: () => Promise.reject(new Error('no claude')) };

    const reply = await get('/api/repair/evidence?limit=5');

    expect(reply.status).toBe(200);
  });
});
