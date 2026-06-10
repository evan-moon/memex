import { env, pipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/multilingual-e5-base';
const DTYPE = 'q8';
const DIM = 768;

/**
 * Identity of the vector space: model x quantization x dimensions. Stored next to the index
 * (index_meta) so a model swap is detected instead of silently mixing incompatible vectors.
 */
export const EMBEDDING_MODEL_ID = `${MODEL}#${DTYPE}#${DIM}`;

export type EmbedType = 'query' | 'passage';
export type Embedder = (text: string, type?: EmbedType) => Promise<number[]>;

export const createEmbedder = async (modelCacheDir: string): Promise<Embedder> => {
  env.cacheDir = modelCacheDir;

  const extractor = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });

  return async (text: string, type: EmbedType = 'passage'): Promise<number[]> => {
    const output = await extractor(`${type}: ${text}`, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  };
};
