import type { MemexClient } from './client.ts';

const EMBEDDING_MODEL_KEY = 'embedding_model';
const NEEDS_REEMBED_KEY = 'needs_reembed';

const getMeta = (client: MemexClient, key: string): string | undefined =>
  (
    client.sqlite.prepare('SELECT value FROM index_meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined
  )?.value;

const setMeta = (client: MemexClient, key: string, value: string): void => {
  client.sqlite
    .prepare(
      'INSERT INTO index_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
};

export type EmbeddingModelStatus = 'initialized' | 'ok' | 'assumed' | 'model-changed';

/**
 * Reconcile the stored embedding-model identity with the model the app was started with.
 * Vectors from different models live in incompatible spaces, so on a mismatch the stale vectors
 * are cleared (hybrid search degrades to keyword-only) and `needs_reembed` is flagged until
 * `memex reembed` rebuilds them. A legacy index that has vectors but no stamp is assumed to belong
 * to the current model — dropping a whole index on upgrade would be worse than trusting it.
 */
export const ensureEmbeddingModel = (
  client: MemexClient,
  modelId: string,
): EmbeddingModelStatus => {
  const stored = getMeta(client, EMBEDDING_MODEL_KEY);

  if (stored === modelId) {
    return 'ok';
  }

  if (stored === undefined) {
    setMeta(client, EMBEDDING_MODEL_KEY, modelId);
    const { n } = client.sqlite.prepare('SELECT COUNT(*) AS n FROM note_embeddings').get() as {
      n: number;
    };
    return n > 0 ? 'assumed' : 'initialized';
  }

  client.sqlite.exec('DELETE FROM note_embeddings');
  client.sqlite.exec('DELETE FROM note_chunk_embeddings');
  client.sqlite.exec('DELETE FROM note_chunks');
  setMeta(client, EMBEDDING_MODEL_KEY, modelId);
  setMeta(client, NEEDS_REEMBED_KEY, '1');
  return 'model-changed';
};

export const needsReembed = (client: MemexClient): boolean =>
  getMeta(client, NEEDS_REEMBED_KEY) === '1';

/** Called by `memex reembed` after rebuilding every vector with the given model. */
export const markReembedded = (client: MemexClient, modelId: string): void => {
  setMeta(client, EMBEDDING_MODEL_KEY, modelId);
  setMeta(client, NEEDS_REEMBED_KEY, '0');
};
