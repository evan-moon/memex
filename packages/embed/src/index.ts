import { env, pipeline } from '@huggingface/transformers';

export type EmbeddingModel = {
  model: string;
  dtype: 'auto' | 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4' | 'bnb4';
  dim: number;
};

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModel = {
  model: 'Xenova/multilingual-e5-base',
  dtype: 'q8',
  dim: 768,
};

/**
 * Identity of the vector space: model x quantization x dimensions. Stored next to the index
 * (index_meta) so a model swap is detected instead of silently mixing incompatible vectors.
 */
export const embeddingModelId = (spec: EmbeddingModel = DEFAULT_EMBEDDING_MODEL): string =>
  `${spec.model}#${spec.dtype}#${spec.dim}`;

export const EMBEDDING_MODEL_ID = embeddingModelId();

export type EmbedType = 'query' | 'passage';
export type Embedder = (text: string, type?: EmbedType) => Promise<number[]>;

export const createEmbedder = async (
  modelCacheDir: string,
  spec: EmbeddingModel = DEFAULT_EMBEDDING_MODEL,
): Promise<Embedder> => {
  env.cacheDir = modelCacheDir;

  const extractor = await pipeline('feature-extraction', spec.model, { dtype: spec.dtype });

  return async (text: string, type: EmbedType = 'passage'): Promise<number[]> => {
    const output = await extractor(`${type}: ${text}`, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  };
};
