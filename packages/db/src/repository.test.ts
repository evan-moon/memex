import { describe, expect, it } from 'vitest';
import { parseTags, serializeTags } from './repository.ts';

describe('parseTags', () => {
  it('parses a valid JSON tag array', () => {
    expect(parseTags('["typescript","monorepo"]')).toEqual(['typescript', 'monorepo']);
  });

  it('returns an empty array for an empty JSON array', () => {
    expect(parseTags('[]')).toEqual([]);
  });

  it('returns an empty array for invalid JSON', () => {
    expect(parseTags('not-json')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseTags('')).toEqual([]);
  });
});

describe('serializeTags', () => {
  it('serializes a tag array to JSON', () => {
    expect(serializeTags(['typescript', 'monorepo'])).toBe('["typescript","monorepo"]');
  });

  it('serializes an empty array', () => {
    expect(serializeTags([])).toBe('[]');
  });

  it('round-trips through parseTags', () => {
    const tags = ['a', 'b', 'c'];
    expect(parseTags(serializeTags(tags))).toEqual(tags);
  });
});
