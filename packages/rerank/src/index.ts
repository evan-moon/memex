export type Reranker = (query: string, passages: string[]) => Promise<number[]>;

export const createReranker = async (_cacheDir: string): Promise<Reranker> => {
  throw new Error('not implemented');
};
