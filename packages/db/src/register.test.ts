import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  listRegisterSubjects,
  matchRegisterSubjects,
  readRegister,
  registerHistory,
  type RegisterScope,
  setRegister,
} from './register.ts';

let dir: string;
let client: MemexClient;

const GLOBAL: RegisterScope = { kind: 'global' };
const MAY: RegisterScope = { kind: 'period', start: '2026-05-01', end: '2026-05-31' };
const JUNE: RegisterScope = { kind: 'period', start: '2026-06-01', end: '2026-06-30' };

const set = (
  subject: string,
  predicate: string,
  value: string,
  scope: RegisterScope = GLOBAL,
  at = Date.now(),
) => setRegister(client, { subject, predicate, value, scope, author: 'agent' }, at);

const tip = (subject: string, predicate: string, scope: RegisterScope = GLOBAL) =>
  readRegister(client, subject).find(
    (entry) =>
      entry.predicate.toLowerCase() === predicate.toLowerCase() &&
      entry.scope.kind === scope.kind &&
      (entry.scope.kind !== 'period' || scope.kind !== 'period' || entry.scope.start === scope.start),
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-register-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('setRegister', () => {
  it('reads back the value it was given as the only head', () => {
    const result = set('opula', 'trial.duration', '14 days');

    expect(result).toMatchObject({ ok: true, superseded: [] });
    expect(tip('opula', 'trial.duration')?.heads.map((h) => h.value)).toEqual(['14 days']);
  });

  it('replaces the value without losing what it replaced', () => {
    set('opula', 'trial.duration', '14 days', GLOBAL, 1000);
    const second = set('opula', 'trial.duration', '30 days', GLOBAL, 2000);

    expect(second).toMatchObject({ ok: true });
    expect(tip('opula', 'trial.duration')?.heads.map((h) => h.value)).toEqual(['30 days']);
    expect(tip('opula', 'trial.duration')?.events).toBe(2);
    expect(registerHistory(client, 'opula', 'trial.duration', GLOBAL)).toMatchObject([
      { value: '30 days', superseded: false },
      { value: '14 days', superseded: true },
    ]);
  });

  it('treats a respelling as the same key, and the same subject respelled as the same subject', () => {
    set('toss', 'Trial Duration', '14 days');
    set('Toss', 'trial-duration', '30 days');

    expect(listRegisterSubjects(client)).toHaveLength(1);
    expect(readRegister(client, 'toss')).toHaveLength(1);
    expect(tip('toss', 'Trial Duration')?.heads.map((h) => h.value)).toEqual(['30 days']);
  });

  it('gives a word it cannot decide its own key, and says what it looks like', () => {
    set('opula', 'trial.duration', '14 days');
    const other = set('opula', 'trial.duratino', '30 days');

    expect(other).toMatchObject({
      ok: true,
      predicate: { created: true, status: 'provisional', similar: ['trial.duration'] },
    });
    expect(readRegister(client, 'opula')).toHaveLength(2);
  });

  it('keeps two periods apart, so one month cannot supersede another', () => {
    set('opula', 'revenue', '1,200', MAY);
    set('opula', 'revenue', '1,800', JUNE);

    expect(tip('opula', 'revenue', MAY)?.heads.map((h) => h.value)).toEqual(['1,200']);
    expect(tip('opula', 'revenue', JUNE)?.heads.map((h) => h.value)).toEqual(['1,800']);
  });

  it('lets a correction inside one period replace only that period', () => {
    set('opula', 'revenue', '1,200', MAY);
    set('opula', 'revenue', '1,800', JUNE);
    set('opula', 'revenue', '1,250', MAY);

    expect(tip('opula', 'revenue', MAY)?.heads.map((h) => h.value)).toEqual(['1,250']);
    expect(tip('opula', 'revenue', JUNE)?.heads.map((h) => h.value)).toEqual(['1,800']);
  });

  it('refuses what it cannot address instead of storing a key it cannot find again', () => {
    expect(set('  ', 'trial.duration', '14 days')).toEqual({ ok: false, reason: 'empty-subject' });
    expect(set('opula', ' ', '14 days')).toEqual({ ok: false, reason: 'empty-predicate' });
    expect(set('opula', 'trial.duration', '')).toEqual({ ok: false, reason: 'empty-value' });
    expect(
      set('opula', 'revenue', '1,200', { kind: 'period', start: 'May', end: '2026-05-31' }),
    ).toEqual({ ok: false, reason: 'invalid-scope' });
    expect(
      set('opula', 'revenue', '1,200', { kind: 'period', start: '2026-06-01', end: '2026-05-31' }),
    ).toEqual({ ok: false, reason: 'invalid-scope' });
    expect(listRegisterSubjects(client)).toEqual([]);
  });
});

describe('a forked key', () => {
  const forkIt = () => {
    set('opula', 'trial.duration', '14 days', GLOBAL, 1000);
    const { subject_id, predicate_id } = client.sqlite
      .prepare('SELECT subject_id, predicate_id FROM register_events LIMIT 1')
      .get() as { subject_id: number; predicate_id: number };
    client.sqlite
      .prepare(
        `INSERT INTO register_events
           (subject_id, predicate_id, scope, scope_start, scope_end, value, note_id, author, created_at)
         VALUES (?, ?, 'global', NULL, NULL, '30 days', NULL, 'agent', 2000)`,
      )
      .run(subject_id, predicate_id);
  };

  it('shows both answers rather than picking the newer one', () => {
    forkIt();

    expect(tip('opula', 'trial.duration')?.heads.map((h) => h.value)).toEqual([
      '14 days',
      '30 days',
    ]);
  });

  it('collapses when someone writes the next value', () => {
    forkIt();
    const next = set('opula', 'trial.duration', '21 days', GLOBAL, 3000);

    expect(next).toMatchObject({ ok: true });
    expect((next as { superseded: number[] }).superseded).toHaveLength(2);
    expect(tip('opula', 'trial.duration')?.heads.map((h) => h.value)).toEqual(['21 days']);
  });
});

describe('listRegisterSubjects', () => {
  it('counts the keys a subject has, newest touched first', () => {
    set('opula', 'trial.duration', '14 days', GLOBAL, 1000);
    set('opula', 'pricing', '$29', GLOBAL, 2000);
    set('memex', 'schema', '13', GLOBAL, 3000);

    expect(listRegisterSubjects(client)).toEqual([
      { subject: 'memex', keys: 1, lastAt: 3000 },
      { subject: 'opula', keys: 2, lastAt: 2000 },
    ]);
  });
});

describe('matchRegisterSubjects', () => {
  it('finds a subject named anywhere in the query, whatever the spacing', () => {
    set('opula', 'trial.duration', '14 days');

    expect(matchRegisterSubjects(client, ['opula 트라이얼 며칠이었지'])).toEqual(['opula']);
    expect(matchRegisterSubjects(client, ['Op Ula pricing'])).toEqual(['opula']);
  });

  it('does not invent a subject the vault never wrote down', () => {
    set('opula', 'trial.duration', '14 days');

    expect(matchRegisterSubjects(client, ['trial duration'])).toEqual([]);
    expect(matchRegisterSubjects(client, [''])).toEqual([]);
  });
});
