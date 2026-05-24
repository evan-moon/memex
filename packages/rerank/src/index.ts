import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
} from '@huggingface/transformers';

const MODEL = 'onnx-community/bge-reranker-v2-m3-ONNX';

export type Reranker = (query: string, passages: string[]) => Promise<number[]>;

export const createReranker = async (modelCacheDir: string): Promise<Reranker> => {
  env.cacheDir = modelCacheDir;

  const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
  const model = await AutoModelForSequenceClassification.from_pretrained(MODEL, {
    dtype: 'q8',
  });

  return async (query: string, passages: string[]): Promise<number[]> => {
    if (passages.length === 0) return [];

    const queries = Array(passages.length).fill(query);
    const inputs = tokenizer(queries, {
      text_pair: passages,
      padding: true,
      truncation: true,
    });

    const { logits } = await model(inputs);
    const data = logits.data as Float32Array;
    return Array.from(data);
  };
};
