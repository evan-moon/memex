import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { getNote, insertNote } from './repository.ts';
import { approveRule, countProvisionalRules, declineRule, listRules } from './rules.ts';

describe('rule approval', () => {
  let dir: string;
  let client: MemexClient;

  const addRule = (title: string, ruleStatus: 'provisional' | 'canonical') =>
    insertNote(client, {
      title,
      content: `body of ${title}`,
      filePath: join(dir, `${title}.md`),
      category: null,
      tags: '[]',
      source: 'manual',
      layer: 'rule',
      author: 'person',
      authoredAt: null,
      ruleStatus,
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-rules-'));
    client = openDb(dir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists rules of one status, or all of them', () => {
    addRule('waiting', 'provisional');
    addRule('approved', 'canonical');

    expect(listRules(client, 'provisional').map((r) => r.title)).toEqual(['waiting']);
    expect(listRules(client, 'canonical').map((r) => r.title)).toEqual(['approved']);
    expect(listRules(client)).toHaveLength(2);
  });

  it('counts only what is still waiting', () => {
    addRule('waiting', 'provisional');
    addRule('approved', 'canonical');

    expect(countProvisionalRules(client)).toBe(1);
  });

  it('approves a proposal in place', () => {
    const rule = addRule('waiting', 'provisional');

    expect(approveRule(client, rule.id)?.ruleStatus).toBe('canonical');
    expect(countProvisionalRules(client)).toBe(0);
  });

  it('turning a proposal down moves the layer and keeps the content', () => {
    const rule = addRule('not really a rule', 'provisional');

    const declined = declineRule(client, rule.id, 'past');
    expect(declined?.layer).toBe('past');
    expect(declined?.ruleStatus).toBeNull();
    expect(getNote(client, rule.id)?.content).toBe('body of not really a rule');
  });

  it('leaves nothing behind in the rule layer after a decline', () => {
    const rule = addRule('waiting', 'provisional');
    declineRule(client, rule.id, 'state');

    expect(listRules(client)).toHaveLength(0);
  });
});
