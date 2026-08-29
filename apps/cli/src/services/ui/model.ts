import { createEmbedder, type Embedder, isModelCached, type ModelProgress } from '@memex/embed';

export type ModelState =
  | { kind: 'ready' }
  | { kind: 'absent' }
  | { kind: 'downloading'; loaded: number; total: number }
  | { kind: 'failed'; error: string };

export type ModelRunner = {
  read: () => ModelState;
  start: () => ModelState;
  embed: Embedder;
};

// Progress arrives per file, and the same file reports many times. Keeping the
// latest figure per file and summing gives a total that only ever moves
// forward; adding each event would count the same bytes over and over.
const totals = (files: Map<string, ModelProgress>) =>
  [...files.values()].reduce(
    (acc, file) => ({ loaded: acc.loaded + file.loaded, total: acc.total + file.total }),
    { loaded: 0, total: 0 },
  );

// One loader for the whole process. Two of them race on the same cache file:
// the second reads what the first has written so far, fails with a protobuf
// error, and leaves the weights on disk unusable. That is not hypothetical —
// a search issued while the download screen was still counting did exactly it.
export const createModelRunner = (modelCacheDir: string): ModelRunner => {
  const files = new Map<string, ModelProgress>();
  const session = {
    loading: null as Promise<Embedder> | null,
    done: false,
    error: null as string | null,
  };

  const load = () => {
    session.loading ??= createEmbedder(modelCacheDir, undefined, (progress) => {
      files.set(progress.file, progress);
    })
      .then((embedder) => {
        session.done = true;
        session.error = null;
        files.clear();
        return embedder;
      })
      .catch((error: unknown) => {
        session.loading = null;
        session.error = error instanceof Error ? error.message : String(error);
        throw error;
      });
    return session.loading;
  };

  const read = (): ModelState => {
    if (session.error !== null) return { kind: 'failed', error: session.error };
    if (session.loading !== null) {
      return session.done ? { kind: 'ready' } : { kind: 'downloading', ...totals(files) };
    }
    return isModelCached(modelCacheDir) ? { kind: 'ready' } : { kind: 'absent' };
  };

  const start = (): ModelState => {
    // Weights already here: answer the question without pulling them into
    // memory. The first search does that, and it is the one that needs them.
    if (session.loading === null && isModelCached(modelCacheDir)) return read();
    // Nothing awaits this: the download outlives the request that asked for it,
    // and the screen learns how it went by asking again.
    load().catch(() => {});
    return read();
  };

  return {
    read,
    start,
    embed: async (text, type) => (await load())(text, type),
  };
};
