import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listSessions, type MemexClient, openDb, sessionTurns, setRegister } from '@memex/db';
import type { LlmProvider } from '@memex/llm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { route, type UiDeps } from './server.ts';

let dbDir: string;
let client: MemexClient;
let host: UiDeps;

const CHOICE = { provider: 'claude-code', model: 'sonnet' };

const answering =
  (text: string): LlmProvider =>
  async () => ({ text, durationMs: 1 });

const CHANGE = answering(
  '{"action":"set-register","subject":"opula","predicate":"trial.duration","value":"30일"}',
);

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

const call = (method: string, path: string, payload: unknown = null) =>
  route(host, method, new URL(path, 'http://localhost'), payload).then((reply) => ({
    status: reply.status,
    body: JSON.parse(String(reply.body)),
  }));

const say = (
  message: string,
  sessionId: number | null = null,
  operationId = 'turn',
  path = '/api/chat',
) => call('POST', path, { message, operationId, choice: CHOICE, sessionId });

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-session-'));
  client = openDb(dbDir);
  host = deps(CHANGE);
  setRegister(client, {
    subject: 'opula',
    predicate: 'trial.duration',
    scope: { kind: 'global' },
    value: '14일',
    author: 'agent',
  });
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('a conversation that outlives the panel', () => {
  it('opens a session on the first turn and keeps the same one after', async () => {
    const first = await say('opula 30일이야');
    const again = await say('또 뭔가', first.body.sessionId, 'turn-2');

    expect(first.body.sessionId).toBeGreaterThan(0);
    expect(again.body.sessionId).toBe(first.body.sessionId);
    expect(sessionTurns(client, first.body.sessionId)).toHaveLength(2);
  });

  it('names the conversation after the first thing said', async () => {
    await say('opula 트라이얼이 30일로 바뀌었어');

    expect(listSessions(client)[0]?.title).toBe('opula 트라이얼이 30일로 바뀌었어');
  });

  // The transcript is what the next prompt is built from, so it has to say what
  // settled — not that something was said.
  it('records what the turn settled', async () => {
    // Opened on the subject, so this one writes rather than proposing.
    const { body } = await say('30일이야', null, 'turn', '/api/chat?subject=opula');

    expect(sessionTurns(client, body.sessionId)[0]?.outcome).toContain(
      'trial.duration is now 30일',
    );
  });

  it('restates the turn when a proposal is finally pressed, rather than adding one', async () => {
    const { body } = await say('opula 30일이야');
    expect(body.kind).toBe('confirm');
    expect(sessionTurns(client, body.sessionId)[0]?.outcome).toContain('waiting');

    await call('POST', '/api/chat/apply', { ticket: body.ticket });

    const turns = sessionTurns(client, body.sessionId);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.outcome).toContain('is now 30일');
  });

  it('hands the earlier turns to the next prompt, whoever answers it', async () => {
    const prompts: string[] = [];
    host = deps(async ({ prompt }) => {
      prompts.push(prompt);
      return { text: '{"action":"none"}', durationMs: 1 };
    });

    const first = await say('opula 얘기야');
    await say('30일이야', first.body.sessionId, 'turn-2');

    expect(prompts[0]).not.toContain('EARLIER IN THIS CONVERSATION');
    expect(prompts[1]).toContain('opula 얘기야');
  });

  it('reads a session back, and forgets one when asked', async () => {
    const { body } = await say('opula 30일이야');

    expect((await call('GET', `/api/chat/session/${body.sessionId}`)).body).toHaveLength(1);
    expect((await call('GET', '/api/chat/sessions')).body).toHaveLength(1);

    await call('DELETE', `/api/chat/session/${body.sessionId}`);

    expect((await call('GET', '/api/chat/sessions')).body).toHaveLength(0);
    expect((await call('GET', `/api/chat/session/${body.sessionId}`)).status).toBe(404);
  });

  it('starts a new one rather than trusting a session id it does not have', async () => {
    const { body } = await say('opula 30일이야', 9999);

    expect(body.sessionId).not.toBe(9999);
    expect(sessionTurns(client, body.sessionId)).toHaveLength(1);
  });
});
