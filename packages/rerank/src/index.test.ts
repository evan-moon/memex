import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReranker } from './index.ts';

const CACHE = join(homedir(), '.memex', 'models');

describe('createReranker', () => {
  it('scores the passage that answers the query above one that does not', async () => {
    const rerank = await createReranker(CACHE);
    const [relevant, irrelevant] = await rerank('sqlite-vec 확장은 어떻게 로드하나', [
      'sqlite-vec은 sqliteVec.load(sqlite)로 로드하고 vec0 가상 테이블을 노출한다.',
      '수요일 서울 날씨는 비가 왔고 기온은 18도였다.',
    ]);
    expect(relevant).toBeGreaterThan(irrelevant);
  }, 300_000);

  it('returns one score per passage, batching past the batch size', async () => {
    const rerank = await createReranker(CACHE);
    const passages = Array.from({ length: 20 }, (_, i) => `문단 ${i}: 임의의 내용이다.`);
    expect(await rerank('질의', passages)).toHaveLength(20);
  }, 300_000);

  it('returns nothing for no passages', async () => {
    const rerank = await createReranker(CACHE);
    expect(await rerank('질의', [])).toEqual([]);
  }, 300_000);
});
