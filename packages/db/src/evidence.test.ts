import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  bodyHash,
  evidenceFor,
  evidenceStaleness,
  isStale,
  notesDeclaringEvidence,
  setNoteEvidence,
} from './evidence.ts';
import { insertNote, linkAmendment, updateNote } from './repository.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-evidence-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, content: string, layer: 'past' | 'state' = 'past') =>
  insertNote(client, {
    title,
    content,
    filePath: join(dbDir, `${title}.md`),
    source: 'manual',
    layer,
  });

describe('bodyHash', () => {
  it('ignores the frontmatter, so retagging a source is not a reason to doubt a projection', () => {
    const a = '---\ntags: [one]\n---\n\nthe claim\n';
    const b = '---\ntags: [one, two]\nlayer: past\n---\n\nthe claim\n';
    expect(bodyHash(a)).toBe(bodyHash(b));
  });

  it('changes when the claim changes', () => {
    expect(bodyHash('the claim')).not.toBe(bodyHash('a different claim'));
  });
});

describe('setNoteEvidence', () => {
  it('records what a projection stands on, and what it said at the time', () => {
    const source = addNote('what happened', 'we chose JWT');
    const plan = addNote('auth plan', 'we use JWT', 'state');

    const evidence = setNoteEvidence(client, plan.id, [source.id]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ sourceId: source.id, sourceHash: bodyHash('we chose JWT') });
  });

  it('is a set, so declaring again removes what is no longer a source', () => {
    const one = addNote('one', 'a');
    const two = addNote('two', 'b');
    const plan = addNote('plan', 'c', 'state');

    setNoteEvidence(client, plan.id, [one.id, two.id]);
    expect(setNoteEvidence(client, plan.id, [two.id]).map((e) => e.sourceId)).toEqual([two.id]);
  });

  it('refuses to let a note stand on itself, and ignores a source that is not there', () => {
    const plan = addNote('plan', 'c', 'state');
    expect(setNoteEvidence(client, plan.id, [plan.id, 9999])).toEqual([]);
  });
});

describe('evidenceStaleness', () => {
  it('says nothing about a note that declares nothing', () => {
    const plan = addNote('plan', 'c', 'state');
    expect(evidenceStaleness(client, plan.id)).toBeNull();
  });

  it('holds while its sources hold', () => {
    const source = addNote('what happened', 'we chose JWT');
    const plan = addNote('plan', 'we use JWT', 'state');
    setNoteEvidence(client, plan.id, [source.id]);

    expect(isStale(evidenceStaleness(client, plan.id))).toBe(false);
  });

  it('names the correction that undermined it', () => {
    const source = addNote('what happened', 'we chose JWT');
    const plan = addNote('plan', 'we use JWT', 'state');
    setNoteEvidence(client, plan.id, [source.id]);

    const fix = addNote('[Amendment] what happened', 'we moved to sessions');
    linkAmendment(client, fix.id, source.id);

    const staleness = evidenceStaleness(client, plan.id);
    expect(isStale(staleness)).toBe(true);
    expect(staleness?.amended[0].by).toMatchObject({ id: fix.id });
  });

  it('notices a source rewritten out of band', () => {
    const source = addNote('a rule', 'FP first');
    const plan = addNote('plan', 'we write FP', 'state');
    setNoteEvidence(client, plan.id, [source.id]);

    updateNote(client, source.id, { content: 'OOP now' });

    const staleness = evidenceStaleness(client, plan.id);
    expect(staleness?.changed.map((e) => e.sourceId)).toEqual([source.id]);
  });

  it('notices a source that is gone', () => {
    const source = addNote('what happened', 'we chose JWT');
    const plan = addNote('plan', 'we use JWT', 'state');
    setNoteEvidence(client, plan.id, [source.id]);
    client.sqlite.prepare('DELETE FROM notes WHERE id = ?').run(source.id);

    expect(evidenceStaleness(client, plan.id)?.missing).toHaveLength(1);
  });
});

describe('notesDeclaringEvidence', () => {
  it('names the notes the guessing detector no longer has to cover', () => {
    const source = addNote('s', 'a');
    const declared = addNote('declared', 'b', 'state');
    addNote('silent', 'c', 'state');
    setNoteEvidence(client, declared.id, [source.id]);

    expect(notesDeclaringEvidence(client)).toEqual([declared.id]);
  });
});

describe('evidenceFor', () => {
  it('reports a source that is fine as fine', () => {
    const source = addNote('s', 'a');
    const plan = addNote('plan', 'b', 'state');
    setNoteEvidence(client, plan.id, [source.id]);

    expect(evidenceFor(client, plan.id)[0]).toMatchObject({
      title: 's',
      changed: false,
      missing: false,
      amendedBy: null,
    });
  });
});
