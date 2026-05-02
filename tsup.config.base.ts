import type { Options } from 'tsup';

export const baseConfig: Partial<Options> = {
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  splitting: false,
  external: ['better-sqlite3', /^drizzle-orm/, 'sqlite-vec', '@huggingface/transformers'],
};
