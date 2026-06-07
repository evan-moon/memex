import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { checkInferenceStale, getInference, mintInference } from './inferences.ts';
import { insertNote, saveEmbedding, serializeTags, updateNote } from './repository.ts';
import { findBestProactiveSignal, listSignals, refreshSignals } from './signals.ts';

const DAY = 86_400_000;

const unit = (i: number): number[] => {
  const v = new Array(768).fill(0);
  v[i] = 1;
  return v;
};

let dbDir: string;
let client: MemexClient;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-int-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

// End-to-end: the loop a user actually drives via the CLI/MCP —
// detect signals -> mint an inference from one -> a source changes -> stale.
describe('signal → mint → invalidate loop', () => {
  it('runs the whole closed loop', () => {
    const now = Date.now();
    // An un-synthesized arc: 4 close-embedding notes spread over ~600 days,
    // never linked. (created_at carries the time; authored_at falls back to it.)
    const arc = [600, 400, 200, 10].map((daysAgo, idx) => {
      const note = insertNote(client, {
        title: `arc note ${idx}`,
        content: `body ${idx}`,
        filePath: join(dbDir, `a${idx}.md`),
        source: 'manual',
        layer: 'past',
        tags: serializeTags(['theme']),
      });
      client.sqlite
        .prepare('UPDATE notes SET created_at = ? WHERE id = ?')
        .run(now - daysAgo * DAY, note.id);
      saveEmbedding(client, note.id, unit(3));
      return note;
    });

    // 1. Detect — a hidden_arc signal should appear over the 4 notes.
    refreshSignals(client);
    const arcSignals = listSignals(client, { type: 'hidden_arc', status: 'new' });
    expect(arcSignals).toHaveLength(1);
    const signal = arcSignals[0];
    expect(signal.evidenceIds.sort((a, b) => a - b)).toEqual(
      arc.map((n) => n.id).sort((a, b) => a - b),
    );

    // 2. Mint — synthesize (agent's job; here we just persist) from the signal.
    const inf = mintInference(client, {
      title: 'a synthesized theme',
      summary: 'these four notes share an unstated through-line',
      confidence: 0.7,
      evidence: signal.evidenceIds.map((noteId) => ({ noteId })),
      fromSignalId: signal.id,
    });
    expect(inf.status).toBe('active');
    expect(listSignals(client, { status: 'minted' }).map((s) => s.id)).toContain(signal.id);
    // provenance snapshot captured
    expect(getInference(client, inf.id)?.evidence.every((e) => e.sourceExcerpt !== null)).toBe(
      true,
    );

    // 3. Invalidate — edit one source note, the inference goes stale.
    updateNote(client, arc[0].id, { content: 'body 0 — rewritten' });
    const verdict = checkInferenceStale(client, inf.id);
    expect(verdict?.stale).toBe(true);
    expect(verdict?.changedNoteIds).toContain(arc[0].id);
    expect(getInference(client, inf.id)?.inference.status).toBe('stale');
  });

  it('proactively surfaces the arc a freshly-saved note joins', () => {
    const now = Date.now();
    // An existing arc of 3 notes spread over time...
    [600, 400, 200].forEach((daysAgo, idx) => {
      const n = insertNote(client, {
        title: `existing ${idx}`,
        content: `body ${idx}`,
        filePath: join(dbDir, `e${idx}.md`),
        source: 'manual',
        layer: 'past',
      });
      client.sqlite
        .prepare('UPDATE notes SET created_at = ? WHERE id = ?')
        .run(now - daysAgo * DAY, n.id);
      saveEmbedding(client, n.id, unit(4));
    });

    // ...the user just saves a 4th note in the same vein (this is what saveNote
    // does, minus the embedder). It should complete the arc.
    const fresh = insertNote(client, {
      title: 'fresh thought',
      content: 'same theme, new day',
      filePath: join(dbDir, 'fresh.md'),
      source: 'manual',
      layer: 'past',
    });
    saveEmbedding(client, fresh.id, unit(4));

    const hint = findBestProactiveSignal(refreshSignals(client), fresh.id);
    expect(hint?.type).toBe('hidden_arc');
    expect(hint?.evidenceIds).toContain(fresh.id);
  });
});
