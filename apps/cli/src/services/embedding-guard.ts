import { ensureEmbeddingModel, type MemexClient, needsReembed } from '@memex/db';
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
    return;
  }
  // The transition above happens once; the degraded state persists until
  // `memex reembed`, so keep saying so on every vector-touching command.
  if (needsReembed(client)) {
    console.warn(
      pc.yellow(
        'Vectors have not been rebuilt since the embedding model changed — results are keyword-only. Run `memex reembed`.',
      ),
    );
  }
};
