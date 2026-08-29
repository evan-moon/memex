import { env } from '@huggingface/transformers';
import { describe, expect, it } from 'vitest';
import { createLazyEmbedder } from './index.ts';

describe('createLazyEmbedder', () => {
  it('loads nothing until something asks for an embedding', () => {
    const before = env.cacheDir;

    const embedder = createLazyEmbedder('/tmp/memex-a-cache-that-does-not-exist');

    expect(typeof embedder).toBe('function');
    expect(env.cacheDir).toBe(before);
  });
});
