import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
} from '@huggingface/transformers';

const MODEL = 'onnx-community/bge-reranker-v2-m3-ONNX';
const BATCH_SIZE = 8;
const MAX_LENGTH = 512;

export type Reranker = (query: string, passages: string[]) => Promise<number[]>;

export const createReranker = async (modelCacheDir: string): Promise<Reranker> => {
  env.cacheDir = modelCacheDir;

  const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
  const model = await AutoModelForSequenceClassification.from_pretrained(MODEL, {
    dtype: 'q8',
  });

  const scoreBatch = async (query: string, batch: string[]): Promise<number[]> => {
    const queries = Array(batch.length).fill(query);
    const inputs = tokenizer(queries, {
      text_pair: batch,
      padding: true,
      truncation: true,
      max_length: MAX_LENGTH,
    });
    const { logits } = await model(inputs);
    return Array.from(logits.data as Float32Array);
  };

  return async (query: string, passages: string[]): Promise<number[]> => {
    if (passages.length === 0) return [];

    const scores: number[] = [];
    for (let i = 0; i < passages.length; i += BATCH_SIZE) {
      const batch = passages.slice(i, i + BATCH_SIZE);
      const batchScores = await scoreBatch(query, batch);
      scores.push(...batchScores);
    }
    return scores;
  };
};
