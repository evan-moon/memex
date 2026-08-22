import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MemexClient, insertNote, openDb, setNoteEvidence } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evidenceBatch, undeclaredProjections } from './repair.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-repair-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (
  title: string,
  layer: 'past' | 'state' = 'past',
  author: 'person' | 'agent' = 'person',
) =>
  insertNote(client, {
    title,
    content: `body of ${title}`,
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer,
    author,
  });

const link = (from: number, to: number) => {
  client.sqlite
    .prepare("INSERT INTO note_links(source_id, target_id, source) VALUES (?, ?, 'wiki')")
    .run(from, to);
};

describe('undeclaredProjections', () => {
  it('only counts judgements a person wrote', () => {
    const mine = addNote('my judgement', 'state');
    addNote('what the agent thinks', 'state', 'agent');
    addNote('what happened', 'past');

    expect(undeclaredProjections(client).map((row) => row.id)).toEqual([mine.id]);
  });

  it('drops a judgement once it has declared what it stands on', () => {
    const source = addNote('what happened');
    const projection = addNote('my judgement', 'state');
    link(projection.id, source.id);
    expect(undeclaredProjections(client)).toHaveLength(1);

    setNoteEvidence(client, projection.id, [source.id]);

    expect(undeclaredProjections(client)).toHaveLength(0);
  });

  it('puts the judgements with the most candidates first', () => {
    const sources = [addNote('a'), addNote('b'), addNote('c')];
    const thin = addNote('thin judgement', 'state');
    const thick = addNote('thick judgement', 'state');
    link(thin.id, sources[0].id);
    for (const source of sources) link(thick.id, source.id);

    expect(undeclaredProjections(client).map((row) => row.id)).toEqual([thick.id, thin.id]);
  });
});

describe('evidenceBatch', () => {
  const undeclaredWithLinks = (count: number) => {
    const source = addNote('what happened');
    for (let i = 0; i < count; i++) {
      const projection = addNote(`judgement ${i}`, 'state');
      link(projection.id, source.id);
    }
  };

  it('counts what is left after this stack, not the whole backlog', () => {
    undeclaredWithLinks(5);

    const batch = evidenceBatch(client, 2);

    expect(batch.cards).toHaveLength(2);
    expect(batch.remaining).toBe(3);
  });

  it('skips a judgement with nothing to offer, since the card would be empty', () => {
    undeclaredWithLinks(1);
    addNote('judgement with no links', 'state');

    const batch = evidenceBatch(client, 20);

    expect(batch.cards).toHaveLength(1);
    expect(batch.remaining).toBe(0);
  });

  it('empties to zero after enough sessions, counting only servable cards', () => {
    undeclaredWithLinks(5);
    addNote('never servable', 'state');

    expect(evidenceBatch(client, 3).remaining).toBe(2);
    expect(evidenceBatch(client, 5).remaining).toBe(0);
    expect(evidenceBatch(client, 20).remaining).toBe(0);
  });

  it('carries both dates so a later edit does not read as a later note', () => {
    const source = addNote('what happened');
    const projection = addNote('my judgement', 'state');
    link(projection.id, source.id);

    const [card] = evidenceBatch(client, 20).cards;

    expect(card.layer).toBe('state');
    expect(card.at).toBeGreaterThan(0);
    expect(card.updatedAt).toBeGreaterThan(0);
  });

  it('carries the candidates so a card does not need a second round trip', () => {
    const source = addNote('what happened');
    const projection = addNote('my judgement', 'state');
    link(projection.id, source.id);

    const [card] = evidenceBatch(client, 20).cards;

    expect(card.id).toBe(projection.id);
    expect(card.candidates.map((ref) => ref.id)).toEqual([source.id]);
  });

  it('has nothing to hand over once every judgement is declared', () => {
    const source = addNote('what happened');
    const projection = addNote('my judgement', 'state');
    link(projection.id, source.id);
    setNoteEvidence(client, projection.id, [source.id]);

    expect(evidenceBatch(client, 20)).toEqual({ remaining: 0, cards: [] });
  });
});
