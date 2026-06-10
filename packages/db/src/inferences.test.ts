import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  buildEvidenceBundle,
  checkInferenceStale,
  getInference,
  listInferences,
  mintInference,
  refreshInferenceStaleness,
  setInferenceStatus,
} from './inferences.ts';
import { deleteNote, insertNote, updateNote } from './repository.ts';
import { listSignals, upsertSignal } from './signals.ts';

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-inf-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

const addNote = (title: string, content: string) =>
  insertNote(client, {
    title,
    content,
    filePath: join(dbDir, `${Math.random().toString(36).slice(2)}.md`),
    source: 'manual',
    layer: 'past',
  });

describe('mintInference', () => {
  it('persists an inference with evidence + content-hash provenance', () => {
    const a = addNote('A', 'alpha');
    const b = addNote('B', 'beta');

    const inf = mintInference(client, {
      title: 'Synthesis',
      summary: 'a + b imply x',
      confidence: 0.7,
      modelId: 'claude-opus-4-8',
      promptVersion: 'v1',
      evidence: [{ noteId: a.id }, { noteId: b.id, role: 'supports' }],
    });

    expect(inf.status).toBe('active');
    expect(inf.confidence).toBe(0.7);

    const found = getInference(client, inf.id)!;
    expect(found.evidence).toHaveLength(2);
    expect(found.evidence.every((e) => !e.changed && !e.missing)).toBe(true);
    expect(found.evidence.find((e) => e.noteId === b.id)?.role).toBe('supports');
  });

  it('stores the mint-time prompt snapshot and keeps it after sources drift', () => {
    const a = addNote('A', 'alpha');
    const bundle = buildEvidenceBundle(client, { evidenceIds: [a.id], reasoning: 'an arc' });
    expect(bundle).toContain('an arc');
    expect(bundle).toContain('#' + String(a.id) + ' A');
    expect(bundle).toContain('alpha');

    const inf = mintInference(client, {
      title: 'Synthesis',
      summary: 'a implies x',
      promptText: bundle,
      evidence: [{ noteId: a.id }],
    });

    updateNote(client, a.id, { content: 'alpha rewritten' });
    checkInferenceStale(client, inf.id);

    const found = getInference(client, inf.id)!;
    expect(found.inference.status).toBe('stale');
    expect(found.inference.promptText).toBe(bundle);
  });

  it('marks the originating signal as minted', () => {
    const a = addNote('A', 'alpha');
    const signal = upsertSignal(client, {
      type: 'hidden_arc',
      evidenceIds: [a.id],
      reasoning: 'arc',
      identity: 'arc:1',
    });

    mintInference(client, {
      title: 'T',
      summary: 'S',
      evidence: [{ noteId: a.id }],
      fromSignalId: signal.id,
    });

    expect(listSignals(client, { status: 'minted' }).map((s) => s.id)).toContain(signal.id);
  });
});

describe('checkInferenceStale', () => {
  it('goes stale when a source note changes', () => {
    const a = addNote('A', 'alpha');
    const inf = mintInference(client, {
      title: 'T',
      summary: 'S',
      evidence: [{ noteId: a.id }],
    });

    expect(checkInferenceStale(client, inf.id)?.stale).toBe(false);

    updateNote(client, a.id, { content: 'alpha EDITED' });

    const verdict = checkInferenceStale(client, inf.id);
    expect(verdict?.stale).toBe(true);
    expect(verdict?.changedNoteIds).toContain(a.id);
    expect(getInference(client, inf.id)?.inference.status).toBe('stale');
  });

  it('goes stale (orphaned) when a source note is deleted', () => {
    const a = addNote('A', 'alpha');
    const b = addNote('B', 'beta');
    const inf = mintInference(client, {
      title: 'T',
      summary: 'S',
      evidence: [{ noteId: a.id }, { noteId: b.id }],
    });

    deleteNote(client, b.id);

    const verdict = checkInferenceStale(client, inf.id);
    expect(verdict?.stale).toBe(true);
    expect(verdict?.changedNoteIds).toContain(b.id);
    expect(getInference(client, inf.id)?.evidence.find((e) => e.noteId === b.id)?.missing).toBe(
      true,
    );
  });

  it('stays active when nothing changed', () => {
    const a = addNote('A', 'alpha');
    const inf = mintInference(client, { title: 'T', summary: 'S', evidence: [{ noteId: a.id }] });
    expect(checkInferenceStale(client, inf.id)?.stale).toBe(false);
    expect(getInference(client, inf.id)?.inference.status).toBe('active');
  });

  it('does not flip an archived inference', () => {
    const a = addNote('A', 'alpha');
    const inf = mintInference(client, { title: 'T', summary: 'S', evidence: [{ noteId: a.id }] });
    setInferenceStatus(client, inf.id, 'archived');
    updateNote(client, a.id, { content: 'changed' });

    checkInferenceStale(client, inf.id);
    expect(getInference(client, inf.id)?.inference.status).toBe('archived');
  });
});

describe('refreshInferenceStaleness', () => {
  it('returns the ids that are now stale', () => {
    const a = addNote('A', 'alpha');
    const b = addNote('B', 'beta');
    const fresh = mintInference(client, {
      title: 'fresh',
      summary: 'S',
      evidence: [{ noteId: a.id }],
    });
    const rotten = mintInference(client, {
      title: 'rotten',
      summary: 'S',
      evidence: [{ noteId: b.id }],
    });

    updateNote(client, b.id, { content: 'beta EDITED' });

    const stale = refreshInferenceStaleness(client);
    expect(stale).toContain(rotten.id);
    expect(stale).not.toContain(fresh.id);
    expect(listInferences(client, { status: 'stale' }).map((i) => i.id)).toEqual([rotten.id]);
  });
});
