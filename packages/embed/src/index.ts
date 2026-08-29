import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import { EMBEDDING_DIM } from '@memex/utils';

export type EmbeddingModel = {
  model: string;
  dtype: 'auto' | 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4' | 'bnb4';
  dim: number;
  /** Roughly what the weights weigh, so a half-finished file can be told apart from a whole one. */
  weightsBytes: number;
};

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModel = {
  model: 'Xenova/multilingual-e5-base',
  dtype: 'q8',
  dim: EMBEDDING_DIM,
  weightsBytes: 279_000_000,
};

/**
 * Identity of the vector space: model x quantization x dimensions. Stored next to the index
 * (index_meta) so a model swap is detected instead of silently mixing incompatible vectors.
 */
export const embeddingModelId = (spec: EmbeddingModel = DEFAULT_EMBEDDING_MODEL): string =>
  `${spec.model}#${spec.dtype}#${spec.dim}`;

export const EMBEDDING_MODEL_ID = embeddingModelId();

const WEIGHTS_TOLERANCE = 0.95;

export type ModelProgress = { file: string; loaded: number; total: number };

export type ModelProgressListener = (progress: ModelProgress) => void;

const modelDir = (modelCacheDir: string, spec: EmbeddingModel) =>
  join(modelCacheDir, ...spec.model.split('/'));

// Readiness is asked of the files rather than of a marker someone has to
// remember to write: weights of about the right weight next to a tokenizer.
// The size has to be checked against what the weights actually weigh — the
// download writes straight to the final name, so any threshold well under the
// real figure calls a half-finished file ready.
export const isModelCached = (
  modelCacheDir: string,
  spec: EmbeddingModel = DEFAULT_EMBEDDING_MODEL,
): boolean => {
  const dir = modelDir(modelCacheDir, spec);
  const onnx = join(dir, 'onnx');
  if (!existsSync(join(dir, 'tokenizer.json')) || !existsSync(onnx)) return false;

  return readdirSync(onnx)
    .filter((name) => name.endsWith('.onnx'))
    .some((name) => statSync(join(onnx, name)).size >= spec.weightsBytes * WEIGHTS_TOLERANCE);
};

type ProgressEvent = { file?: string; loaded?: number; total?: number; status?: string };

export type EmbedType = 'query' | 'passage';
export type Embedder = (text: string, type?: EmbedType) => Promise<number[]>;

export const createEmbedder = async (
  modelCacheDir: string,
  spec: EmbeddingModel = DEFAULT_EMBEDDING_MODEL,
  onProgress?: ModelProgressListener,
): Promise<Embedder> => {
  env.cacheDir = modelCacheDir;

  const extractor = await pipeline('feature-extraction', spec.model, {
    dtype: spec.dtype,
    progress_callback: onProgress
      ? (event: ProgressEvent) => {
          if (event.file === undefined || event.total === undefined) return;
          onProgress({ file: event.file, loaded: event.loaded ?? 0, total: event.total });
        }
      : undefined,
  });

  return async (text: string, type: EmbedType = 'passage'): Promise<number[]> => {
    const output = await extractor(`${type}: ${text}`, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  };
};

// Loading the model costs seconds and a pool of native threads. A caller that
// may never embed anything — a server that only does so once someone searches —
// should not pay for it up front, and should not have those threads alive if it
// has to exit before it is ready.
export const createLazyEmbedder = (
  modelCacheDir: string,
  spec: EmbeddingModel = DEFAULT_EMBEDDING_MODEL,
  onProgress?: ModelProgressListener,
): Embedder => {
  const memo: { instance?: Promise<Embedder> } = {};
  return async (text, type) => {
    memo.instance ??= createEmbedder(modelCacheDir, spec, onProgress);
    return (await memo.instance)(text, type);
  };
};
