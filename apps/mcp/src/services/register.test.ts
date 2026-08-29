import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MemexClient, openDb, setRegister } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerHint, tipLine } from './register.ts';

describe('tipLine', () => {
  const head = (value: string, id: number) => ({
    id,
    value,
    author: 'agent' as const,
    noteId: null,
    createdAt: 0,
  });

  it('states a settled value plainly', () => {
    expect(
      tipLine({
        predicate: 'trial.duration',
        predicateStatus: 'provisional',
        scope: { kind: 'global' },
        heads: [head('14 days', 1)],
        events: 1,
      }),
    ).toBe('- trial.duration = 14 days');
  });

  it('names the period a value belongs to, so a later month cannot read as this one', () => {
    expect(
      tipLine({
        predicate: 'revenue',
        predicateStatus: 'provisional',
        scope: { kind: 'period', start: '2026-05-01', end: '2026-05-31' },
        heads: [head('1,200', 1)],
        events: 1,
      }),
    ).toBe('- revenue (2026-05-01 → 2026-05-31) = 1,200');
  });

  it('asks rather than answers when the key has two heads', () => {
    const line = tipLine({
      predicate: 'pricing',
      predicateStatus: 'provisional',
      scope: { kind: 'global' },
      heads: [head('$29', 1), head('$39', 2)],
      events: 2,
    });

    expect(line).toContain('"$29" / "$39"');
    expect(line).toContain('ask the user');
  });
});

describe('registerHint', () => {
  let dir: string;
  let client: MemexClient;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-mcp-register-'));
    client = openDb(dir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('says nothing when no subject was asked about', () => {
    expect(registerHint(client, [])).toBe('');
  });

  it('carries the current values of every subject the query named', () => {
    setRegister(client, {
      subject: 'opula',
      predicate: 'trial.duration',
      value: '14 days',
      scope: { kind: 'global' },
      author: 'agent',
    });

    const hint = registerHint(client, ['opula']);

    expect(hint).toContain('What is true now about opula');
    expect(hint).toContain('- trial.duration = 14 days');
  });

  it('skips a subject that has no values left rather than printing an empty heading', () => {
    expect(registerHint(client, ['opula'])).toBe('');
  });
});
