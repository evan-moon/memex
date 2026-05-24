import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReranker } from './index.ts';

describe('createReranker', () => {
  it(
    'scores relevant passage higher than irrelevant one',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'memex-rerank-'));
      try {
        const rerank = await createReranker(dir);
        const scores = await rerank(
          'how to set up sqlite-vec extension',
          [
            'sqlite-vec is loaded via sqliteVec.load(sqlite) and exposes vec0 virtual tables.',
            'The weather in Seoul was rainy on Wednesday.',
          ],
        );
        expect(scores).toHaveLength(2);
        expect(scores[0]).toBeGreaterThan(scores[1]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it(
    'returns empty array for empty passages',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'memex-rerank-'));
      try {
        const rerank = await createReranker(dir);
        const scores = await rerank('any query', []);
        expect(scores).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
