import { AutoModelForSequenceClassification, AutoTokenizer, env } from '@huggingface/transformers';

const DEFAULT_MODEL = 'onnx-community/bge-reranker-v2-m3-ONNX';
const DEFAULT_DTYPE: RerankerDtype = 'q8';
const BATCH = 16;

export type RerankerDtype = 'auto' | 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4' | 'bnb4';

export type RerankerOptions = { model?: string; dtype?: RerankerDtype };

export const rerankModelId = (options: RerankerOptions = {}): string =>
  `${options.model ?? DEFAULT_MODEL}#${options.dtype ?? DEFAULT_DTYPE}`;

export type Reranker = (query: string, passages: string[]) => Promise<number[]>;

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

const chunked = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

export const createReranker = async (
  modelCacheDir: string,
  options: RerankerOptions = {},
): Promise<Reranker> => {
  env.cacheDir = modelCacheDir;

  const name = options.model ?? DEFAULT_MODEL;
  const tokenizer = await AutoTokenizer.from_pretrained(name);
  const model = await AutoModelForSequenceClassification.from_pretrained(name, {
    dtype: options.dtype ?? DEFAULT_DTYPE,
  });

  return async (query: string, passages: string[]): Promise<number[]> => {
    if (passages.length === 0) return [];

    return chunked(passages, BATCH).reduce(async (pending, batch) => {
      const done = await pending;
      const inputs = tokenizer(
        batch.map(() => query),
        { text_pair: batch, padding: true, truncation: true },
      );
      const { logits } = await model(inputs);
      return [...done, ...Array.from(logits.data, (value) => sigmoid(Number(value)))];
    }, Promise.resolve<number[]>([]));
  };
};

export const createLazyReranker = (
  modelCacheDir: string,
  options: RerankerOptions = {},
): Reranker => {
  const memo: { instance?: Promise<Reranker> } = {};
  return async (query, passages) => {
    memo.instance ??= createReranker(modelCacheDir, options);
    return (await memo.instance)(query, passages);
  };
};
