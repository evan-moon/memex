import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { insertNote, linkAmendment } from './repository.ts';
import { detectConflictPairs } from './signals.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-conflicts-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, layer: 'past' | 'state' | 'rule') =>
  insertNote(client, {
    title,
    content: `body of ${title}`,
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer,
  });

const pairsOf = () =>
  detectConflictPairs(client).map((candidate) => candidate.evidenceIds.slice().sort((a, b) => a - b));

describe('detectConflictPairs', () => {
  it('compares every rule against every other, since they govern what happens', () => {
    const a = addNote('rule a', 'rule');
    const b = addNote('rule b', 'rule');
    const c = addNote('rule c', 'rule');

    expect(pairsOf()).toEqual([
      [a.id, b.id],
      [a.id, c.id],
      [b.id, c.id],
    ]);
  });

  it('leaves records alone: a past note says what happened, it cannot disagree', () => {
    addNote('what happened', 'past');
    addNote('what else happened', 'past');

    expect(pairsOf()).toEqual([]);
  });

  it('does not reopen a pair the author already reconciled with a correction', () => {
    const older = addNote('rule a', 'rule');
    const newer = addNote('rule b', 'rule');
    linkAmendment(client, newer.id, older.id);

    expect(pairsOf()).toEqual([]);
  });

  it('nominates a pair once, not once from each side', () => {
    addNote('rule a', 'rule');
    addNote('rule b', 'rule');

    expect(detectConflictPairs(client)).toHaveLength(1);
  });

  it('says which two notes it is asking about, by id and title', () => {
    const a = addNote('rule a', 'rule');
    const b = addNote('rule b', 'rule');

    const [candidate] = detectConflictPairs(client);

    expect(candidate.type).toBe('conflict_candidate');
    expect(candidate.reasoning).toContain(`#${a.id}`);
    expect(candidate.reasoning).toContain(`#${b.id}`);
    expect(candidate.identity).toBe(`${a.id},${b.id}`);
  });

  it('skips state notes that were never embedded rather than guessing at them', () => {
    addNote('state a', 'state');
    addNote('state b', 'state');

    expect(pairsOf()).toEqual([]);
  });
});
