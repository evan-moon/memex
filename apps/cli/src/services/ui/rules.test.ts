import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertNote, type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildRules } from './rules.ts';
import { route } from './server.ts';

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
    {
      client,
      embedder: stubEmbedder,
      vaultPath: dbDir,
      mcp: { home: dbDir, serverPath: '/repo/apps/mcp/dist/index.js' },
    },
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

  it('carries a short body whole, so a real rule can be judged on the card', () => {
    addRule('proposed', 'provisional');

    const card = buildRules(client).waiting[0];
    expect(card.content).toBe('body of proposed');
    expect(card.truncated).toBe(false);
  });

  it('drops a heading that only repeats the title the card already shows', () => {
    insertNote(client, {
      title: 'short rule',
      content: '---\ntitle: short rule\n---\n\n# short rule\n\nthe rule itself.',
      filePath: join(dbDir, 'short.md'),
      source: 'claude-code',
      layer: 'rule',
      ruleStatus: 'provisional',
    });

    const card = buildRules(client).waiting.find((r) => r.title === 'short rule');
    expect(card?.content).toBe('the rule itself.');
  });

  it('drops the title even when the body carries it twice', () => {
    insertNote(client, {
      title: 'doubled',
      content: '---\ntitle: doubled\n---\n\n# doubled\n\n# doubled\n\nthe rule itself.',
      filePath: join(dbDir, 'doubled.md'),
      source: 'claude-code',
      layer: 'rule',
      ruleStatus: 'provisional',
    });

    expect(buildRules(client).waiting.find((r) => r.title === 'doubled')?.content).toBe(
      'the rule itself.',
    );
  });

  it('keeps a heading that is not the title', () => {
    insertNote(client, {
      title: 'kept',
      content: '---\ntitle: kept\n---\n\n# kept\n\n## Core Values\n\nbody.',
      filePath: join(dbDir, 'kept.md'),
      source: 'claude-code',
      layer: 'rule',
      ruleStatus: 'provisional',
    });

    expect(buildRules(client).waiting.find((r) => r.title === 'kept')?.content).toBe(
      '## Core Values\n\nbody.',
    );
  });

  it('cuts a long body down and says so, rather than making the card unscrollable', () => {
    insertNote(client, {
      title: 'a work order',
      content: `---\ntitle: a work order\n---\n\n# a work order\n\n${'가'.repeat(2000)}`,
      filePath: join(dbDir, 'long.md'),
      source: 'claude-code',
      layer: 'rule',
      ruleStatus: 'provisional',
    });

    const card = buildRules(client).waiting.find((r) => r.title === 'a work order');
    expect(card?.truncated).toBe(true);
    expect(card?.content.length).toBeLessThan(600);
    // The frontmatter and the repeated heading are both gone.
    expect(card?.content.startsWith('가')).toBe(true);
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
