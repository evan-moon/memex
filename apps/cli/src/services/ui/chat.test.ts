import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MemexClient, openDb, readRegister, setRegister } from '@memex/db';
import type { LlmProvider } from '@memex/llm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { carriedFrom } from './chat.ts';
import { route, type UiDeps } from './server.ts';

let dbDir: string;
let client: MemexClient;

const answering =
  (text: string): LlmProvider =>
  async () => ({ text, durationMs: 1 });

const deps = (ask: LlmProvider): UiDeps => ({
  client,
  embedder: async () => new Array(768).fill(0),
  vaultPath: dbDir,
  mcp: { home: dbDir, serverPath: '/repo/apps/mcp/dist/index.js' },
  pathEnv: '',
  openUrl: () => {},
  ask,
  model: {
    read: () => ({ kind: 'ready' as const }),
    start: () => ({ kind: 'ready' as const }),
    embed: async () => new Array(768).fill(0),
  },
});

// One deps object for the life of a test: the pending plans hang off its
// identity, the way the login runner already does, and a server has exactly one.
let host: UiDeps;

const call = (path: string, payload: unknown) =>
  route(host, 'POST', new URL(path, 'http://localhost'), payload).then((reply) => ({
    status: reply.status,
    body: JSON.parse(String(reply.body)),
  }));

const setValue = (value: string) =>
  setRegister(client, {
    subject: 'opula',
    predicate: 'trial.duration',
    scope: { kind: 'global' },
    value,
    author: 'agent',
  });

const valueNow = () => readRegister(client, 'opula')[0]?.heads.map((h) => h.value);

const CHANGE = answering(
  '{"action":"set-register","subject":"opula","predicate":"trial.duration","value":"30일"}',
);

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-ui-chat-'));
  client = openDb(dbDir);
  host = deps(CHANGE);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('reading what a conversation was opened on', () => {
  it('takes a subject or a note, and nothing else', () => {
    expect(carriedFrom(new URLSearchParams('subject=opula'))).toEqual({
      kind: 'register',
      subject: 'opula',
    });
    expect(carriedFrom(new URLSearchParams('note=42'))).toEqual({ kind: 'note', id: 42 });
    expect(carriedFrom(new URLSearchParams('note=nonsense'))).toBeNull();
    expect(carriedFrom(new URLSearchParams(''))).toBeNull();
  });
});

describe('a turn through the API', () => {
  it('writes and says so when the value was already on screen', async () => {
    setValue('14일');

    const { body } = await call('/api/chat?subject=opula', { message: '30일이야' });

    expect(body).toMatchObject({
      kind: 'done',
      receipt: { kind: 'register', previous: ['14일'], value: '30일' },
    });
    expect(valueNow()).toEqual(['30일']);
  });

  it('asks first when the model picked the subject, and writes nothing yet', async () => {
    setValue('14일');

    const { body } = await call('/api/chat', { message: 'opula 30일이야' });

    expect(body.kind).toBe('confirm');
    expect(body.preview).toMatchObject({ from: ['14일'], to: '30일' });
    expect(valueNow()).toEqual(['14일']);
  });

  it('refuses a message with nothing in it', async () => {
    const { status } = await call('/api/chat', { message: '   ' });

    expect(status).toBe(400);
  });
});

describe('pressing the button', () => {
  // Only a plan the server itself handed out can be applied, so what lands is
  // what was previewed — the window between reading and pressing cannot be used
  // to change it.
  it('applies the plan the ticket stands for', async () => {
    setValue('14일');
    const { body: shown } = await call('/api/chat', { message: 'opula 30일이야' });

    const { body: applied } = await call('/api/chat/apply', { ticket: shown.ticket });

    expect(applied).toMatchObject({ kind: 'done', receipt: { value: '30일' } });
    expect(valueNow()).toEqual(['30일']);
  });

  it('refuses a ticket it never handed out', async () => {
    const { status, body } = await call('/api/chat/apply', { ticket: 'made-up' });

    expect(status).toBe(410);
    expect(body.error.code).toBe('unknown-plan');
  });

  it('refuses the same ticket twice, so a double press writes once', async () => {
    setValue('14일');
    const { body: shown } = await call('/api/chat', { message: 'opula 30일이야' });

    await call('/api/chat/apply', { ticket: shown.ticket });
    const { status } = await call('/api/chat/apply', { ticket: shown.ticket });

    expect(status).toBe(410);
    expect(readRegister(client, 'opula')[0]?.events).toBe(2);
  });
});
