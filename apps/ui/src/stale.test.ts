import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.ts';
import { isStaleServer } from './stale.ts';

afterEach(() => vi.restoreAllMocks());

describe('isStaleServer', () => {
  it('is not stale when the build knows the route', async () => {
    vi.spyOn(api, 'routes').mockResolvedValue({ routes: ['/api/memory'] });
    expect(await isStaleServer('/api/memory')).toBe(false);
  });

  it('is stale when the build has never heard of it', async () => {
    vi.spyOn(api, 'routes').mockResolvedValue({ routes: ['/api/library'] });
    expect(await isStaleServer('/api/memory')).toBe(true);
  });

  // A server too old to answer this question is too old for the route that just
  // failed, which is the whole thing being asked.
  it('is stale when the build cannot even answer the question', async () => {
    vi.spyOn(api, 'routes').mockRejectedValue(new Error('not found'));
    expect(await isStaleServer('/api/memory')).toBe(true);
  });
});
