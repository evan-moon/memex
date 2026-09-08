import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getDocumentMeta,
  getInference,
  getNote,
  insertNote,
  linkAmendment,
  type MemexClient,
  mintInference,
  openDb,
  putProposal,
  serializeTags,
  setNoteEvidence,
  syncLinks,
} from '@memex/db';
import { EMBEDDING_DIM } from '@memex/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { route, type UiDeps } from './server.ts';

let dbDir: string;
let vaultDir: string;
let mcpHome: string;
let client: MemexClient;
let deps: UiDeps;

const stubEmbedder = async () => new Array(EMBEDDING_DIM).fill(0.1);

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-route-db-'));
  vaultDir = mkdtempSync(join(tmpdir(), 'memex-route-vault-'));
  mcpHome = mkdtempSync(join(tmpdir(), 'memex-route-home-'));
  client = openDb(dbDir);
  deps = {
    client,
    embedder: stubEmbedder,
    vaultPath: vaultDir,
    mcp: { home: mcpHome, serverPath: '/repo/apps/mcp/dist/index.js' },
    pathEnv: '',
    openUrl: () => {},
    model: {
      read: () => ({ kind: 'ready' as const }),
      start: () => ({ kind: 'ready' as const }),
      embed: stubEmbedder,
    },
  };
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(vaultDir, { recursive: true, force: true });
  rmSync(mcpHome, { recursive: true, force: true });
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
    linkAmendment(client, fix.id, source.id, 'corrects');

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
    const raw = [
      '---',
      'title: a plan',
      'layer: state',
      '---',
      '',
      '# a plan',
      '',
      'the body',
      '',
    ].join('\n');
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

describe('POST /api/dangling/dismiss', () => {
  it('stops a note\u2019s unresolved links being counted at all', async () => {
    const note = addNote('a plan', 'past', 'points at [[nobody wrote this]]\n');

    const before = JSON.parse(
      (await route(deps, 'GET', new URL('/api/today', 'http://localhost'), null)).body,
    );
    expect(before.buried.forwardLinks).toBe(1);

    const reply = await route(deps, 'POST', new URL('/api/dangling/dismiss', 'http://localhost'), {
      noteId: note.id,
    });
    expect(reply.status).toBe(200);

    const after = JSON.parse(
      (await route(deps, 'GET', new URL('/api/today', 'http://localhost'), null)).body,
    );
    expect(after.buried.forwardLinks).toBe(0);
  });

  it('refuses a body with no note in it', async () => {
    const reply = await route(deps, 'POST', new URL('/api/dangling/dismiss', 'http://localhost'), {
      noteId: 'not a number',
    });

    expect(reply.status).toBe(400);
  });
});

describe('the apps that can reach memex', () => {
  const get = () => route(deps, 'GET', new URL('/api/apps', 'http://localhost'), null);

  // One list, so a row carries both what the app is and what memex can do for
  // it. Splitting these across two screens said the same thing twice.
  it('reports every app on one list, with what memex can offer each', async () => {
    const before = body(await get()) as {
      serverPath: string;
      apps: { id: string; methods: string[]; cli: unknown; registration: { kind: string } }[];
    };

    expect(before.serverPath).toBe('/repo/apps/mcp/dist/index.js');
    expect(before.apps.map((a) => a.id)).toEqual([
      'claude-desktop',
      'claude-code',
      'codex',
      'cursor',
    ]);

    // memex can install and sign these two in; for the others it can only write
    // the config file, and the row must not offer a button that lies.
    expect(before.apps.find((a) => a.id === 'claude-code')?.methods).toEqual([
      'subscription',
      'metered',
    ]);
    expect(before.apps.find((a) => a.id === 'codex')?.methods).toEqual(['subscription']);
    expect(before.apps.find((a) => a.id === 'cursor')?.methods).toEqual([]);
    expect(before.apps.find((a) => a.id === 'cursor')?.cli).toBeNull();
  });

  it('writes the registration and answers with the whole list again', async () => {
    const reply = await post('/api/app/connect', { app: 'cursor' });
    const after = body(reply) as { apps: { id: string; registration: { kind: string } }[] };

    expect(reply.status).toBe(200);
    expect(after.apps.find((a) => a.id === 'cursor')?.registration).toEqual({ kind: 'current' });
    expect(after.apps.find((a) => a.id === 'codex')?.registration).toEqual({ kind: 'absent' });
  });

  it('refuses an app it does not know', async () => {
    const reply = await post('/api/app/connect', { app: 'notepad' });

    expect(reply.status).toBe(400);
    expect(body(reply)).toMatchObject({ error: { code: 'unknown-client' } });
  });

  it('refuses to start a sign-in there is nothing to sign in to', async () => {
    const reply = await post('/api/app/login', { app: 'codex', method: 'subscription' });

    expect(reply.status).toBe(400);
    expect(body(reply)).toMatchObject({ error: { code: 'assistant-not-installed' } });
  });

  // The id decides which CLI gets run, so an app memex has no installer for has
  // to stop here rather than reach a spawn.
  it('refuses to install an app it has no installer for', async () => {
    const reply = await post('/api/app/install', { app: 'cursor' });

    expect(reply.status).toBe(400);
    expect(body(reply)).toMatchObject({ error: { code: 'unknown-assistant' } });
  });
});

describe('register', () => {
  const get = (path: string) => route(deps, 'GET', new URL(path, 'http://localhost'), null);

  it('records a value under a key and reads it back as the current one', async () => {
    const written = await post('/api/register/opula', {
      predicate: 'trial.duration',
      value: '14 days',
      scope: 'global',
    });

    expect(written.status).toBe(200);
    expect(body(written)).toMatchObject({
      subject: 'opula',
      keys: [
        {
          predicate: 'trial.duration',
          entries: [{ changes: 0, heads: [{ value: '14 days' }] }],
        },
      ],
    });

    const subjects = JSON.parse((await get('/api/register')).body);
    expect(subjects).toEqual([{ subject: 'opula', keys: 1, lastAt: expect.any(Number) }]);
  });

  it('marks a correction as the person’s, and keeps what it replaced in history', async () => {
    await post('/api/register/opula', {
      predicate: 'trial.duration',
      value: '14 days',
      scope: 'global',
    });
    await post('/api/register/opula', {
      predicate: 'trial.duration',
      value: '30 days',
      scope: 'global',
    });

    const history = JSON.parse(
      (await get('/api/register/opula?predicate=trial.duration&scope=global')).body,
    );

    expect(history).toMatchObject([
      { value: '30 days', superseded: false, author: 'person' },
      { value: '14 days', superseded: true, author: 'person' },
    ]);
  });

  it('refuses a period it cannot bound instead of storing an unfindable key', async () => {
    const reply = await post('/api/register/opula', {
      predicate: 'revenue',
      value: '1,200',
      scope: 'period',
      start: '2026-05-01',
    });

    expect(reply.status).toBe(400);
    expect(body(reply)).toMatchObject({ error: { code: 'invalid-scope' } });
  });

  it('says nothing about a subject it has never been given', async () => {
    expect(body(await get('/api/register/nobody'))).toEqual({ subject: 'nobody', keys: [] });
  });
});

describe('a key measured by period', () => {
  const monthly = (start: string, end: string, value: string) =>
    post('/api/register/opula', { predicate: 'revenue', value, scope: 'period', start, end });

  it('keeps every month under one key, newest first', async () => {
    await monthly('2026-05-01', '2026-05-31', '1,200');
    await monthly('2026-06-01', '2026-06-30', '1,800');

    const screen = body(
      await route(deps, 'GET', new URL('/api/register/opula', 'http://localhost'), null),
    ) as {
      keys: { predicate: string; entries: { scope: { start?: string }; changes: number }[] }[];
    };

    expect(screen.keys).toHaveLength(1);
    expect(screen.keys[0].entries.map((e) => e.scope.start)).toEqual(['2026-06-01', '2026-05-01']);
    expect(screen.keys[0].entries.every((e) => e.changes === 0)).toBe(true);
  });

  it('counts a correction as a change, not as the first write', async () => {
    await monthly('2026-05-01', '2026-05-31', '1,200');
    await monthly('2026-05-01', '2026-05-31', '1,250');

    const screen = body(
      await route(deps, 'GET', new URL('/api/register/opula', 'http://localhost'), null),
    ) as { keys: { entries: { changes: number; heads: { value: string }[] }[] }[] };

    expect(screen.keys[0].entries[0]).toMatchObject({
      changes: 1,
      heads: [{ value: '1,250' }],
    });
  });
});

describe('the embedding model', () => {
  it('reports readiness through the same runner both shells share', async () => {
    const reply = await route(deps, 'GET', new URL('/api/model', 'http://localhost'), null);

    expect(reply.status).toBe(200);
    expect(body(reply)).toEqual({ kind: 'ready' });
  });

  it('answers a download request with the state rather than waiting for the bytes', async () => {
    const reply = await post('/api/model', {});

    expect(reply.status).toBe(200);
    expect(body(reply)).toEqual({ kind: 'ready' });
  });
});

describe('POST /api/draft/:id', () => {
  it('refuses a provider that does not exist rather than quietly drafting with the default', async () => {
    const note = addNote('a state note', 'state');

    const reply = await post(`/api/draft/${note.id}`, {
      choice: { provider: 'gemini', model: 'pro' },
    });

    expect(reply.status).toBe(400);
    expect(body(reply)).toMatchObject({ error: { code: 'unknown-provider' } });
  });

  it('treats saying nothing about the model as a request, not a malformed one', async () => {
    const note = addNote('a state note', 'state');

    const reply = await post(`/api/draft/${note.id}`, null);

    expect(body(reply)).toMatchObject({ error: { code: 'draft-no-evidence' } });
  });
});

describe('POST /api/folder/new and /api/folder/delete', () => {
  it('makes a folder that no note has been put in yet', async () => {
    const reply = await post('/api/folder/new', { root: vaultDir, folder: '', name: 'projects' });

    expect(reply.status).toBe(200);
    expect(existsSync(join(vaultDir, 'projects'))).toBe(true);
  });

  // The root arrives from the tree, where a borrowed source is a row like any
  // other. Whether memex may write there is decided here, not there.
  it('refuses a root that is not the vault', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'memex-borrowed-'));
    const reply = await post('/api/folder/new', { root: elsewhere, folder: '', name: 'projects' });

    expect(reply.status).toBe(400);
    expect(existsSync(join(elsewhere, 'projects'))).toBe(false);
    rmSync(elsewhere, { recursive: true, force: true });
  });

  it('deletes the folder and the notes that were in it', async () => {
    await post('/api/folder/new', { root: vaultDir, folder: '', name: 'projects' });
    const note = insertNote(client, {
      title: 'a plan',
      content: 'the body\n',
      filePath: join(vaultDir, 'projects', 'a plan.md'),
      source: 'manual',
      layer: 'state',
      category: 'projects',
    });
    writeFileSync(note.filePath, 'the body\n');

    const reply = await post('/api/folder/delete', { root: vaultDir, folder: 'projects' });

    expect(body(reply)).toMatchObject({ removed: 1 });
    expect(existsSync(join(vaultDir, 'projects'))).toBe(false);
    expect(getNote(client, note.id)).toBeUndefined();
  });

  it('refuses to delete the vault itself', async () => {
    const reply = await post('/api/folder/delete', { root: vaultDir, folder: '' });

    expect(reply.status).toBe(400);
    expect(existsSync(vaultDir)).toBe(true);
  });
});

// The app is the only surface with a trash under it, so this is where a delete
// stops being final. Both doors have to reach it — a note deleted one at a time
// and a folder deleted whole.
describe('deleting through a desktop that has a trash', () => {
  const withTrash = () => {
    const handed: string[] = [];
    deps = {
      ...deps,
      trashFile: async (path: string) => {
        handed.push(path);
      },
    };
    return handed;
  };

  it('hands a deleted note to the trash rather than unlinking it', async () => {
    const note = addNote('a plan', 'state');
    writeFileSync(note.filePath, 'the body\n');
    const handed = withTrash();

    const reply = await post(`/api/note/${note.id}/delete`, null);

    expect(reply.status).toBe(200);
    expect(handed).toEqual([note.filePath]);
    expect(existsSync(note.filePath)).toBe(true);
    expect(getNote(client, note.id)).toBeUndefined();
  });

  it('hands a deleted folder to the trash whole', async () => {
    await post('/api/folder/new', { root: vaultDir, folder: '', name: 'projects' });
    const note = insertNote(client, {
      title: 'a plan',
      content: 'the body\n',
      filePath: join(vaultDir, 'projects', 'a plan.md'),
      source: 'manual',
      layer: 'state',
      category: 'projects',
    });
    writeFileSync(note.filePath, 'the body\n');
    const handed = withTrash();

    await post('/api/folder/delete', { root: vaultDir, folder: 'projects' });

    expect(handed).toEqual([join(vaultDir, 'projects')]);
    expect(getNote(client, note.id)).toBeUndefined();
  });
});

describe('POST /api/notes — what a person can be told', () => {
  // `# 테스트` under the title `테스트1` was called an empty body, and the reply
  // said so in English in the middle of a Korean screen.
  it('saves a body that is a heading the title does not repeat', async () => {
    const reply = await post('/api/notes', {
      title: '테스트1',
      content: '# 테스트',
      layer: 'state',
    });

    expect(reply.status).toBe(200);
    expect(body(reply)).toMatchObject({ title: '테스트1' });
  });

  it('names an empty body with a code the screen can say in its own language', async () => {
    const reply = await post('/api/notes', {
      title: '테스트1',
      content: '# 테스트1',
      layer: 'state',
    });

    expect(reply.status).toBe(400);
    expect(body(reply).error).toMatchObject({ code: 'empty-body' });
  });
});

describe('GET /api/templates', () => {
  // The screen offers these as a starting point, and the same list decides
  // whether a save is accepted. One copy, served.
  it('gives the sections each kind of note is written in', async () => {
    const reply = await route(deps, 'GET', new URL('/api/templates', 'http://localhost'), null);

    expect(reply.status).toBe(200);
    expect(body(reply)).toMatchObject({
      state: '## 지금 참인 것\n\n## 아직 모르는 것\n\n## 남은 것',
    });
    expect(String(body(reply).past)).toContain('## 이것이 바꾼 것');
    expect(String(body(reply).rule)).toContain('## 어기면 보이는 것');
  });
});

describe('the editor’s buffer, kept where a crash cannot reach it', () => {
  const get = (path: string) => route(deps, 'GET', new URL(path, 'http://localhost'), null);

  it('keeps and returns what was typed', async () => {
    await post('/api/buffer/k-1', { content: '반쯤 쓴 문단', sequence: 1, documentId: 7 });

    expect(body(await get('/api/buffer/k-1'))).toMatchObject({
      content: '반쯤 쓴 문단',
      documentId: 7,
    });
  });

  it('has nothing for a key nobody wrote', async () => {
    expect(body(await get('/api/buffer/never'))).toBeNull();
  });

  // These arrive from the tab still being typed in and nothing under them
  // promises order.
  it('refuses a sequence older than the one it holds', async () => {
    await post('/api/buffer/k-1', { content: 'two', sequence: 2 });
    await post('/api/buffer/k-1', { content: 'one', sequence: 1 });

    expect(body(await get('/api/buffer/k-1'))).toMatchObject({ content: 'two' });
  });

  it('lists what a crash left behind', async () => {
    await post('/api/buffer/k-1', { content: 'unsaved', sequence: 1 });

    expect(body(await get('/api/buffers'))).toMatchObject([{ content: 'unsaved' }]);
  });

  it('is gone once the edit really landed', async () => {
    await post('/api/buffer/k-1', { content: 'unsaved', sequence: 1 });
    await route(deps, 'DELETE', new URL('/api/buffer/k-1', 'http://localhost'), null);

    expect(body(await get('/api/buffer/k-1'))).toBeNull();
  });
});

// The document write, reached through the routes that already existed rather
// than a second parallel set of them.
describe('POST /api/note/:id as a document write', () => {
  const get = (path: string) => route(deps, 'GET', new URL(path, 'http://localhost'), null);

  const makeFile = (title: string, raw: string) => {
    const note = addNote(title, 'state');
    writeFileSync(note.filePath, raw, 'utf8');
    client.sqlite.prepare('UPDATE notes SET content = ? WHERE id = ?').run(raw, note.id);
    return note;
  };

  it('tells the screen which version it is editing and whether it may', async () => {
    const note = addNote('a document', 'state');

    const detail = body(await get(`/api/note/${note.id}`));

    expect(detail).toMatchObject({ revision: null, capabilities: { canEdit: true } });
    expect(detail.meta).toMatchObject({ origin: 'unknown' });
  });

  it('writes the raw file and hands back the new version', async () => {
    const note = makeFile('a document', 'one\n');

    const reply = await post(`/api/note/${note.id}`, {
      raw: 'two\n',
      expectedRevision: null,
      mutationId: 'm-1',
    });

    expect(reply.status).toBe(200);
    expect(readFileSync(note.filePath, 'utf8')).toBe('two\n');
    expect(body(reply).revision).not.toBeNull();
  });

  it('refuses a write built on a version that moved, and says what is current', async () => {
    const note = makeFile('a document', 'one\n');
    const first = body(
      await post(`/api/note/${note.id}`, {
        raw: 'two\n',
        expectedRevision: null,
        mutationId: 'm-1',
      }),
    );

    const stale = await post(`/api/note/${note.id}`, {
      raw: 'three\n',
      expectedRevision: 'a-version-that-never-was',
      mutationId: 'm-2',
    });

    expect(stale.status).toBe(409);
    expect(body(stale)).toMatchObject({
      error: { code: 'version-conflict' },
      currentRevision: first.revision,
      currentRaw: 'two\n',
    });
  });

  it('leaves the memory edit shape alone', async () => {
    const note = addNote('a plan', 'state');

    const reply = await post(`/api/note/${note.id}`, { title: 'a better plan' });

    expect(reply.status).toBe(200);
    expect(getNote(client, note.id)?.title).toBe('a better plan');
  });

  it('lists the versions without shipping every copy of the document', async () => {
    const note = makeFile('a document', 'one\n');
    await post(`/api/note/${note.id}`, { raw: 'two\n', expectedRevision: null, mutationId: 'm-1' });

    const revisions = body(await get(`/api/note/${note.id}/revisions`));

    expect(Array.isArray(revisions)).toBe(true);
    expect(revisions).toHaveLength(2);
    expect(revisions[0]).not.toHaveProperty('rawContent');
  });

  it('brings an old version back as a new one', async () => {
    const note = makeFile('a document', 'one\n');
    const second = body(
      await post(`/api/note/${note.id}`, {
        raw: 'two\n',
        expectedRevision: null,
        mutationId: 'm-1',
      }),
    );
    const listed = await get(`/api/note/${note.id}/revisions`);
    const revisions: { revisionId: string }[] = JSON.parse(listed.body);
    const first = revisions[revisions.length - 1];

    const reply = await post(`/api/note/${note.id}/restore`, {
      revision: first.revisionId,
      expectedRevision: second.revision,
    });

    expect(reply.status).toBe(200);
    expect(readFileSync(note.filePath, 'utf8')).toBe('one\n');
  });
});

describe('references on a document', () => {
  const get = (path: string) => route(deps, 'GET', new URL(path, 'http://localhost'), null);

  it('points at a source rather than copying it into the body', async () => {
    const owner = addNote('원고', 'state');
    const source = addNote('인터뷰 메모', 'past');

    const reply = await post(`/api/note/${owner.id}/references`, { sourceId: source.id });

    expect(reply.status).toBe(200);
    expect(body(reply)).toMatchObject([{ sourceDocumentId: source.id, title: '인터뷰 메모' }]);
    expect(getNote(client, owner.id)?.content).not.toContain('인터뷰');
  });

  it('is one reference however many times the same source is added', async () => {
    const owner = addNote('원고', 'state');
    const source = addNote('인터뷰 메모', 'past');

    await post(`/api/note/${owner.id}/references`, { sourceId: source.id });
    const twice = await post(`/api/note/${owner.id}/references`, { sourceId: source.id });

    expect(body(twice)).toHaveLength(1);
  });

  it('refuses a source that is not a note', async () => {
    const owner = addNote('원고', 'state');
    expect((await post(`/api/note/${owner.id}/references`, { sourceId: 9999 })).status).toBe(404);
  });

  it('lets one go', async () => {
    const owner = addNote('원고', 'state');
    const source = addNote('인터뷰 메모', 'past');
    await post(`/api/note/${owner.id}/references`, { sourceId: source.id });

    const gone = await route(
      deps,
      'DELETE',
      new URL(`/api/note/${owner.id}/references`, 'http://localhost'),
      { sourceId: source.id },
    );

    expect(body(gone)).toEqual([]);
    expect(body(await get(`/api/note/${owner.id}/references`))).toEqual([]);
  });
});

// Plan B: the editor keeps sending what it always sent, and the boundary around
// that write is what gained a version, a lock, and a look at the disk.
describe('the older edit shape, now versioned', () => {
  const get = (path: string) => route(deps, 'GET', new URL(path, 'http://localhost'), null);

  const onDisk = (title: string, raw: string) => {
    const note = addNote(title, 'state');
    writeFileSync(note.filePath, raw, 'utf8');
    client.sqlite.prepare('UPDATE notes SET content = ? WHERE id = ?').run(raw, note.id);
    return note;
  };

  it('records a version for an edit sent the old way', async () => {
    const note = onDisk('a plan', '---\ntitle: a plan\n---\n\none\n');

    await post(`/api/note/${note.id}`, { body: 'two\n' });

    const listed = await get(`/api/note/${note.id}/revisions`);
    const revisions: unknown[] = JSON.parse(listed.body);
    expect(revisions).toHaveLength(2);
    expect(readFileSync(note.filePath, 'utf8')).toContain('two');
  });

  it('keeps what was there before that first edit', async () => {
    const note = onDisk('a plan', '---\ntitle: a plan\n---\n\none\n');
    await post(`/api/note/${note.id}`, { body: 'two\n' });

    const listed = await get(`/api/note/${note.id}/revisions`);
    const revisions: { revisionId: string }[] = JSON.parse(listed.body);
    const restored = await post(`/api/note/${note.id}/restore`, {
      revision: revisions[revisions.length - 1].revisionId,
      expectedRevision: revisions[0].revisionId,
    });

    expect(restored.status).toBe(200);
    expect(readFileSync(note.filePath, 'utf8')).toContain('one');
  });

  // The thing this buys that the old path never had: somebody edited the file
  // in another editor, and the app does not write over it without saying so.
  it('refuses when the file moved under it, and does not write', async () => {
    const note = onDisk('a plan', '---\ntitle: a plan\n---\n\none\n');
    await post(`/api/note/${note.id}`, { body: 'two\n' });
    writeFileSync(note.filePath, 'somebody else wrote this\n', 'utf8');

    const reply = await post(`/api/note/${note.id}`, { body: 'three\n' });

    expect(reply.status).toBe(409);
    expect(body(reply).error).toMatchObject({ code: 'version-conflict' });
    expect(readFileSync(note.filePath, 'utf8')).toBe('somebody else wrote this\n');
  });

  it('does not record a version for an edit that changed no file', async () => {
    const note = onDisk('a plan', '---\ntitle: a plan\n---\n\none\n');
    await post(`/api/note/${note.id}`, { tags: ['one'] });
    await post(`/api/note/${note.id}`, { tags: ['one'] });

    const listed = await get(`/api/note/${note.id}/revisions`);
    const revisions: unknown[] = JSON.parse(listed.body);
    expect(revisions.length).toBeLessThanOrEqual(2);
  });
});

describe('what an agent offered to change', () => {
  const get = (path: string) => route(deps, 'GET', new URL(path, 'http://localhost'), null);

  const document = (raw: string) => {
    const note = addNote('원고', 'state');
    writeFileSync(note.filePath, raw, 'utf8');
    client.sqlite.prepare('UPDATE notes SET content = ? WHERE id = ?').run(raw, note.id);
    return note;
  };

  it('lists what is still on offer for a document', async () => {
    const note = document('첫 문단.\n');
    putProposal(client, {
      documentId: note.id,
      baseRevision: null,
      replacement: '고쳐 쓴 문단.\n',
    });

    expect(body(await get(`/api/note/${note.id}/proposals`))).toHaveLength(1);
  });

  it('applies one and writes the document', async () => {
    const note = document('첫 문단.\n');
    const proposal = putProposal(client, {
      documentId: note.id,
      baseRevision: null,
      replacement: '고쳐 쓴 문단.\n',
    });

    const reply = await post(`/api/proposal/${proposal.id}/apply`, null);

    expect(reply.status).toBe(200);
    expect(readFileSync(note.filePath, 'utf8')).toBe('고쳐 쓴 문단.\n');
  });

  // The original never moves by this route, whatever was shown on screen.
  it('leaves the document alone when the offer is thrown away', async () => {
    const note = document('첫 문단.\n');
    const proposal = putProposal(client, {
      documentId: note.id,
      baseRevision: null,
      replacement: '고쳐 쓴 문단.\n',
    });

    const reply = await post(`/api/proposal/${proposal.id}/discard`, null);

    expect(body(reply)).toMatchObject({ status: 'discarded' });
    expect(readFileSync(note.filePath, 'utf8')).toBe('첫 문단.\n');
    expect(body(await get(`/api/note/${note.id}/proposals`))).toHaveLength(0);
  });

  it('has nothing to apply for an offer that never existed', async () => {
    expect((await post('/api/proposal/never/apply', null)).status).toBe(404);
  });
});

// A folder is a bulk answer and a file may disagree with it, which is the only
// honest arrangement when somebody's own writing and somebody else's are in the
// same directory.
describe('who wrote this one', () => {
  const get = (path: string) => route(deps, 'GET', new URL(path, 'http://localhost'), null);

  it('takes the person’s word for a single document', async () => {
    const note = addNote('내가 쓴 글', 'state');

    const reply = await post(`/api/note/${note.id}/origin`, { origin: 'person' });

    expect(body(reply)).toMatchObject({ origin: 'person' });
    expect(getDocumentMeta(client, note.id).origin).toBe('person');
  });

  // Taking it back is not a third answer. The file goes back to being read from
  // how it arrived.
  it('lets the answer be taken back', async () => {
    const note = addNote('잘못 표시한 글', 'state');
    await post(`/api/note/${note.id}/origin`, { origin: 'person' });

    await post(`/api/note/${note.id}/origin`, { origin: 'unknown' });

    expect(getDocumentMeta(client, note.id).origin).toBe('unknown');
  });

  it('refuses a word it does not know', async () => {
    const note = addNote('글', 'state');
    expect((await post(`/api/note/${note.id}/origin`, { origin: '내꺼' })).status).toBe(400);
  });

  it('lists the folders memex reads and which are the person’s', async () => {
    const listed = body(await get('/api/sources'));
    expect(Array.isArray(listed)).toBe(true);
  });

  it('will not mark a folder memex does not read', async () => {
    expect((await post('/api/sources', { path: '/nowhere', mine: true })).status).toBe(404);
  });
});
