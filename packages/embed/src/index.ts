import { pipeline, env } from '@huggingface/transformers';

const MODEL = 'Xenova/multilingual-e5-base';

export type EmbedType = 'query' | 'passage';
export type Embedder = (text: string, type?: EmbedType) => Promise<number[]>;

export const createEmbedder = async (modelCacheDir: string): Promise<Embedder> => {
  env.cacheDir = modelCacheDir;

  const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });

  return async (text: string, type: EmbedType = 'passage'): Promise<number[]> => {
    const output = await extractor(`${type}: ${text}`, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  };
};
