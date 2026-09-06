import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BINGE_LIMIT,
  correctionsWanted,
  insertNote,
  listClaims,
  logRetrieval,
  type MemexClient,
  openDb,
  setNoteShape,
} from '@memex/db';
import { EMBEDDING_DIM } from '@memex/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SESSION } from './deck.ts';
import { route, type UiDeps } from './server.ts';

let dbDir: string;
let vaultDir: string;
let mcpHome: string;
let client: MemexClient;
let deps: UiDeps;
let made = 0;

const stubEmbedder = async () => new Array(EMBEDDING_DIM).fill(0.1);

beforeEach(() => {
  made = 0;
  dbDir = mkdtempSync(join(tmpdir(), 'memex-deckroute-db-'));
  vaultDir = mkdtempSync(join(tmpdir(), 'memex-deckroute-vault-'));
  mcpHome = mkdtempSync(join(tmpdir(), 'memex-deckroute-home-'));
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

const get = (path: string) => route(deps, 'GET', new URL(path, 'http://localhost'), null);
const post = (path: string, payload: unknown) =>
  route(deps, 'POST', new URL(path, 'http://localhost'), payload);
const body = (reply: { body: string }) => JSON.parse(reply.body) as Record<string, unknown>;

type Card = { key: string; kind: string; text: string };
const cardsOf = (reply: { body: string }) => body(reply).cards as Card[];

const claimNote = (claims: string[]) => {
  made += 1;
  const note = insertNote(client, {
    title: `source ${String(made)}`,
    content: `body ${String(made)}`,
    filePath: join(vaultDir, `source-${String(made)}.md`),
    source: 'manual',
    layer: 'state',
  });
  setNoteShape(client, { noteId: note.id, kind: 'position', claims });
  logRetrieval(client, {
    query: 'q',
    surface: 'mcp',
    noteIds: [note.id],
    injectedIds: [note.id],
  });
  return note;
};

describe('the deck routes', () => {
  it('hands out one session and does not open the next by itself', async () => {
    for (let n = 0; n < SESSION * 2 + 3; n += 1) claimNote([`주장 ${String(n)}`]);

    expect(cardsOf(await get('/api/deck'))).toHaveLength(SESSION);
    expect(cardsOf(await get('/api/deck?sessions=2'))).toHaveLength(SESSION * 2);
  });

  it('writes the confirmation and its depth in one go', async () => {
    claimNote(['트라이얼은 14일이다']);
    const [card] = cardsOf(await get('/api/deck'));
    expect(card).toBeDefined();
    if (!card) return;

    const reply = body(await post('/api/deck/confirm', { key: card.key, depth: 'evidence' }));
    expect(reply.depth).toBe('evidence');
    expect(reply.downgraded).toBe(false);

    const [claim] = listClaims(client);
    expect(claim?.status).toBe('confirmed');
    expect(claim?.confirmedAt).not.toBeNull();
    expect(claim?.confirmDepth).toBe('evidence');
  });

  it('takes the deep confirmation off the table past the third session of a day', async () => {
    for (let n = 0; n < BINGE_LIMIT + 2; n += 1) claimNote([`주장 ${String(n)}`]);

    for (let n = 0; n < BINGE_LIMIT; n += 1) {
      const [card] = cardsOf(await get('/api/deck'));
      if (!card) break;
      await post('/api/deck/confirm', { key: card.key, depth: 'card' });
    }

    const [card] = cardsOf(await get('/api/deck'));
    if (!card) return;
    const reply = body(await post('/api/deck/confirm', { key: card.key, depth: 'evidence' }));
    expect(reply.depth).toBe('card');
    expect(reply.downgraded).toBe(true);
  });

  it('takes a confirmation back', async () => {
    claimNote(['되돌릴 주장']);
    const [card] = cardsOf(await get('/api/deck'));
    if (!card) return;

    await post('/api/deck/confirm', { key: card.key, depth: 'card' });
    expect(cardsOf(await get('/api/deck'))).toHaveLength(0);

    await post('/api/deck/undo', {});
    const back = cardsOf(await get('/api/deck'));
    expect(back).toHaveLength(1);
    expect(listClaims(client)[0]?.status).toBe('unconfirmed');
    expect(listClaims(client)[0]?.confirmedAt).toBeNull();
  });

  it('takes a deferral back too', async () => {
    claimNote(['보류할 주장']);
    const [card] = cardsOf(await get('/api/deck'));
    if (!card) return;

    await post('/api/deck/defer', { key: card.key });
    expect(cardsOf(await get('/api/deck'))).toHaveLength(0);

    await post('/api/deck/undo', {});
    expect(cardsOf(await get('/api/deck'))).toHaveLength(1);
  });

  it('marks a card as wanting a correction, and counts it', async () => {
    claimNote(['틀린 주장']);
    const [card] = cardsOf(await get('/api/deck'));
    if (!card) return;

    await post('/api/deck/correct', { key: card.key });
    expect(cardsOf(await get('/api/deck'))).toHaveLength(0);
    expect(correctionsWanted(client)).toBe(1);

    await post('/api/deck/undo', {});
    expect(cardsOf(await get('/api/deck'))).toHaveLength(1);
    expect(correctionsWanted(client)).toBe(0);
  });

  it('refuses to undo when nothing has been judged', async () => {
    const reply = await post('/api/deck/undo', {});
    expect(reply.status).toBe(410);
  });

  it('lets a waiting rule in, and takes that back', async () => {
    const rule = insertNote(client, {
      title: '노트는 자기 레이어가 정한 섹션을 갖춰 쓴다',
      content: '## 규칙 한 줄\n갖춰 쓴다\n',
      filePath: join(vaultDir, 'rule.md'),
      source: 'manual',
      layer: 'rule',
    });
    client.sqlite.prepare("UPDATE notes SET rule_status = 'provisional' WHERE id = ?").run(rule.id);

    const [card] = cardsOf(await get('/api/deck'));
    expect(card?.kind).toBe('rule');
    if (!card) return;

    await post('/api/deck/confirm', { key: card.key, depth: 'card' });
    const approved = client.sqlite
      .prepare('SELECT rule_status AS status FROM notes WHERE id = ?')
      .get(rule.id) as { status: string };
    expect(approved.status).toBe('canonical');

    await post('/api/deck/undo', {});
    const back = client.sqlite
      .prepare('SELECT rule_status AS status FROM notes WHERE id = ?')
      .get(rule.id) as { status: string };
    expect(back.status).toBe('provisional');
  });

  it('carries no standing count of what is left', async () => {
    for (let n = 0; n < SESSION + 9; n += 1) claimNote([`주장 ${String(n)}`]);

    const deck = body(await get('/api/deck'));
    expect(Object.keys(deck).sort()).toEqual(['binge', 'cards', 'session']);
    expect(deck).not.toHaveProperty('total');
    expect(deck).not.toHaveProperty('remaining');
  });
});
