import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import { ensureEmbeddingModel, markReembedded, needsReembed } from './index-meta.ts';
import { insertNote, saveEmbedding } from './repository.ts';

const MODEL_A = 'Xenova/multilingual-e5-base#q8#768';
const MODEL_B = 'Xenova/some-other-model#q8#768';

const embeddingCount = (client: MemexClient): number =>
  (client.sqlite.prepare('SELECT COUNT(*) AS n FROM note_embeddings').get() as { n: number }).n;

const seedEmbeddedNote = (client: MemexClient, dir: string): void => {
  const note = insertNote(client, {
    title: 'a note',
    content: 'hello',
    filePath: join(dir, 'a-note.md'),
    source: 'manual',
    layer: 'past',
  });
  saveEmbedding(client, note.id, new Array(768).fill(0.1));
};

describe('ensureEmbeddingModel', () => {
  let dbDir: string;
  let client: MemexClient;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'memex-index-meta-'));
    client = openDb(dbDir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('stamps the model on a fresh db and reports initialized', () => {
    expect(ensureEmbeddingModel(client, MODEL_A)).toBe('initialized');
    expect(needsReembed(client)).toBe(false);
    expect(ensureEmbeddingModel(client, MODEL_A)).toBe('ok');
  });

  it('assumes legacy embeddings belong to the current model instead of dropping them', () => {
    seedEmbeddedNote(client, dbDir);
    expect(ensureEmbeddingModel(client, MODEL_A)).toBe('assumed');
    expect(embeddingCount(client)).toBe(1);
    expect(needsReembed(client)).toBe(false);
    expect(ensureEmbeddingModel(client, MODEL_A)).toBe('ok');
  });

  it('clears stale vectors and flags reembed when the model changes', () => {
    seedEmbeddedNote(client, dbDir);
    ensureEmbeddingModel(client, MODEL_A);

    expect(ensureEmbeddingModel(client, MODEL_B)).toBe('model-changed');
    expect(embeddingCount(client)).toBe(0);
    expect(needsReembed(client)).toBe(true);
  });

  it('keeps the reembed flag across restarts until markReembedded clears it', () => {
    ensureEmbeddingModel(client, MODEL_A);
    ensureEmbeddingModel(client, MODEL_B);

    expect(ensureEmbeddingModel(client, MODEL_B)).toBe('ok');
    expect(needsReembed(client)).toBe(true);

    markReembedded(client, MODEL_B);
    expect(needsReembed(client)).toBe(false);
    expect(ensureEmbeddingModel(client, MODEL_B)).toBe('ok');
  });
});
