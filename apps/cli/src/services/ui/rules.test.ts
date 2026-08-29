import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertNote, type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { route } from './server.ts';
import { buildRules } from './rules.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-ui-rules-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addRule = (title: string, ruleStatus: 'provisional' | 'canonical') =>
  insertNote(client, {
    title,
    content: `body of ${title}`,
    filePath: join(dbDir, `${title}.md`),
    source: 'claude-code',
    layer: 'rule',
    ruleStatus,
  });

const stubEmbedder = async () => new Array(768).fill(0);

const call = (method: string, path: string, payload: unknown = null) =>
  route(
    { client, embedder: stubEmbedder, vaultPath: dbDir },
    method,
    new URL(path, 'http://localhost'),
    payload,
  );

describe('buildRules', () => {
  it('separates what is waiting from what is in effect', () => {
    addRule('proposed', 'provisional');
    addRule('approved', 'canonical');

    const screen = buildRules(client);
    expect(screen.waiting.map((r) => r.title)).toEqual(['proposed']);
    expect(screen.active.map((r) => r.title)).toEqual(['approved']);
  });

  it('carries the body, so a proposal can be judged without leaving the screen', () => {
    addRule('proposed', 'provisional');
    expect(buildRules(client).waiting[0].content).toBe('body of proposed');
  });

  it('says nothing is waiting on a vault with no proposals', () => {
    addRule('approved', 'canonical');
    expect(buildRules(client).waiting).toEqual([]);
  });
});

describe('rule approval over the API', () => {
  it('approving moves a proposal into effect', async () => {
    const rule = addRule('proposed', 'provisional');

    const res = await call('POST', `/api/rule/${rule.id}/approve`);
    expect(res.status).toBe(200);
    expect(buildRules(client).active.map((r) => r.id)).toEqual([rule.id]);
  });

  it('declining keeps the note and takes it out of the rule layer', async () => {
    const rule = addRule('not a rule', 'provisional');

    const res = await call('POST', `/api/rule/${rule.id}/decline`, { layer: 'past' });
    expect(res.status).toBe(200);

    const screen = buildRules(client);
    expect(screen.waiting).toEqual([]);
    expect(screen.active).toEqual([]);
    const kept = client.sqlite.prepare('SELECT layer FROM notes WHERE id = ?').get(rule.id);
    expect(kept).toEqual({ layer: 'past' });
  });

  it('refuses a decline that names no layer a note can live on', async () => {
    const rule = addRule('proposed', 'provisional');

    const res = await call('POST', `/api/rule/${rule.id}/decline`, { layer: 'rule' });
    expect(res.status).toBe(400);
    expect(buildRules(client).waiting).toHaveLength(1);
  });

  it('reports a note that is not there', async () => {
    expect((await call('POST', '/api/rule/999/approve')).status).toBe(404);
  });

  it('counts what is waiting for the sidebar', async () => {
    addRule('one', 'provisional');
    addRule('two', 'provisional');
    addRule('done', 'canonical');

    const res = await call('GET', '/api/sidebar');
    expect(JSON.parse(res.body as string).rulesWaiting).toBe(2);
  });
});
