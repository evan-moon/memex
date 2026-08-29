import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertNote, type MemexClient, openDb } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
      ruleStatus: 'canonical',
    });
    insertNote(client, {
      title: 'TS',
      content: 'No `as`.',
      filePath: join(dbDir, 't.md'),
      source: 'manual',
      layer: 'rule',
      ruleStatus: 'canonical',
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
      ruleStatus: 'canonical',
    });
    insertNote(client, {
      title: 'Second',
      content: 'two',
      filePath: join(dbDir, '2.md'),
      source: 'manual',
      layer: 'rule',
      ruleStatus: 'canonical',
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

  it('truncates a first rule note too large to fit at all, rather than dropping every rule', () => {
    const big = 'x'.repeat(10_000);
    insertNote(client, {
      title: 'Big',
      content: big,
      filePath: join(dbDir, 'b.md'),
      source: 'manual',
      layer: 'rule',
      ruleStatus: 'canonical',
    });
    const out = buildRuleInstructions(client, { maxChars: 2000 });
    expect(out.length).toBeLessThanOrEqual(2200);
    expect(out).toContain('[truncated]');
  });

  it('keeps whole rule notes rather than cutting one mid-sentence', () => {
    insertNote(client, {
      title: 'Small',
      content: 'Prefer const.',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'rule',
      ruleStatus: 'canonical',
    });
    insertNote(client, {
      title: 'Large',
      content: `Never do this. ${'y'.repeat(5_000)}`,
      filePath: join(dbDir, 'l.md'),
      source: 'manual',
      layer: 'rule',
      ruleStatus: 'canonical',
    });

    const out = buildRuleInstructions(client, { maxChars: 500 });
    expect(out).toContain('Prefer const.');
    expect(out).not.toContain('### Large');
    expect(out).not.toContain('Never do this.');
    expect(out).not.toContain('y'.repeat(20));
  });

  it('tells the agent how many rule notes it cannot see', () => {
    insertNote(client, {
      title: 'Small',
      content: 'Prefer const.',
      filePath: join(dbDir, 's.md'),
      source: 'manual',
      layer: 'rule',
      ruleStatus: 'canonical',
    });
    for (const n of [1, 2]) {
      insertNote(client, {
        title: `Large ${n}`,
        content: 'z'.repeat(5_000),
        filePath: join(dbDir, `l${n}.md`),
        source: 'manual',
        layer: 'rule',
        ruleStatus: 'canonical',
      });
    }

    const out = buildRuleInstructions(client, { maxChars: 500 });
    expect(out).toContain('2 further rule notes did not fit');
    expect(out).toContain('layer `rule`');
  });

  it('emits every rule note when they all fit', () => {
    for (const n of [1, 2, 3]) {
      insertNote(client, {
        title: `Rule ${n}`,
        content: `body ${n}`,
        filePath: join(dbDir, `r${n}.md`),
        source: 'manual',
        layer: 'rule',
        ruleStatus: 'canonical',
      });
    }

    const out = buildRuleInstructions(client, { maxChars: 8000 });
    expect(out).toContain('### Rule 1');
    expect(out).toContain('### Rule 3');
    expect(out).not.toContain('did not fit');
  });
});

describe('buildRuleInstructions — approval', () => {
  let dbDir: string;
  let client: MemexClient;

  const addRule = (title: string, ruleStatus: 'provisional' | 'canonical') =>
    insertNote(client, {
      title,
      content: `body of ${title}`,
      filePath: join(dbDir, `${title}.md`),
      source: 'manual',
      layer: 'rule',
      ruleStatus,
    });

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-rules-approval-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('injects a rule a person approved', () => {
    addRule('Approved', 'canonical');
    expect(buildRuleInstructions(client)).toContain('### Approved');
  });

  it('withholds a rule the agent proposed', () => {
    addRule('Proposed', 'provisional');
    expect(buildRuleInstructions(client)).toBe('');
  });

  it('does not let a proposal count against the budget of an approved one', () => {
    addRule('Approved', 'canonical');
    addRule('Proposed', 'provisional');

    const out = buildRuleInstructions(client);
    expect(out).toContain('### Approved');
    expect(out).not.toContain('### Proposed');
    expect(out).not.toContain('did not fit');
  });
});
