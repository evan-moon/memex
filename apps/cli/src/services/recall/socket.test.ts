import { describe, expect, it } from 'vitest';
import { isProbeQuery, RECALL_PING } from './socket.ts';

describe('isProbeQuery', () => {
  it('answers a liveness probe without searching', () => {
    expect(isProbeQuery(RECALL_PING)).toBe(true);
  });

  it('treats a caller that sent nothing as a probe too', () => {
    expect(isProbeQuery('')).toBe(true);
  });

  it('leaves a real question alone', () => {
    expect(isProbeQuery('memex 검색 품질')).toBe(false);
    expect(isProbeQuery('ping')).toBe(false);
  });
});
