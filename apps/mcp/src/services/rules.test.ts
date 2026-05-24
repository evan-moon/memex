import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertNote, openDb, type MemexClient } from '@memex/db';
import { buildRuleInstructions } from './rules.ts';

describe('buildRuleInstructions', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-rules-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('returns empty string when no rule notes exist', () => {
    insertNote(client, {
      title: 'a',
      content: 'x',
      filePath: join(dbDir, 'a.md'),
      source: 'manual',
      layer: 'past',
    });
    expect(buildRuleInstructions(client)).toBe('');
  });

  it('inlines rule note content under a House Rules header', () => {
    insertNote(client, {
      title: 'Style',
      content: 'Use FP.',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'rule',
    });
    insertNote(client, {
      title: 'TS',
      content: 'No `as`.',
      filePath: join(dbDir, 't.md'),
      source: 'manual',
      layer: 'rule',
    });

    const out = buildRuleInstructions(client);
    expect(out).toContain('## House Rules');
    expect(out).toContain('### Style');
    expect(out).toContain('Use FP.');
    expect(out).toContain('### TS');
    expect(out).toContain('No `as`.');
  });

  it('orders rule notes by id ascending', () => {
    insertNote(client, {
      title: 'First',
      content: 'one',
      filePath: join(dbDir, '1.md'),
      source: 'manual',
      layer: 'rule',
    });
    insertNote(client, {
      title: 'Second',
      content: 'two',
      filePath: join(dbDir, '2.md'),
      source: 'manual',
      layer: 'rule',
    });

    const out = buildRuleInstructions(client);
    expect(out.indexOf('### First')).toBeLessThan(out.indexOf('### Second'));
  });

  it('ignores non-rule notes', () => {
    insertNote(client, {
      title: 'PastNote',
      content: 'history',
      filePath: join(dbDir, 'p.md'),
      source: 'manual',
      layer: 'past',
    });
    insertNote(client, {
      title: 'StateNote',
      content: 'plan',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'state',
    });
    expect(buildRuleInstructions(client)).toBe('');
  });

  it('truncates content over the byte budget and marks it', () => {
    const big = 'x'.repeat(10_000);
    insertNote(client, {
      title: 'Big',
      content: big,
      filePath: join(dbDir, 'b.md'),
      source: 'manual',
      layer: 'rule',
    });
    const out = buildRuleInstructions(client, { maxChars: 2000 });
    expect(out.length).toBeLessThanOrEqual(2200);
    expect(out).toContain('[truncated]');
  });
});
