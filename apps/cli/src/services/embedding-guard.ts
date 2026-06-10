import { ensureEmbeddingModel, type MemexClient } from '@memex/db';
import { EMBEDDING_MODEL_ID } from '@memex/embed';
import pc from 'picocolors';

/** Run after openDb in any command that reads or writes vectors. */
export const guardEmbeddingModel = (client: MemexClient): void => {
  if (ensureEmbeddingModel(client, EMBEDDING_MODEL_ID) === 'model-changed') {
    console.warn(
      pc.yellow(
        'Embedding model changed — stale vectors cleared. Run `memex reembed` to restore semantic search.',
      ),
    );
  }
};
