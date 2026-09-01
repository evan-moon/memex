import { describe, expect, it } from 'vitest';
import { isUnderRoot, orphanedPaths } from './sources.ts';

describe('isUnderRoot', () => {
  it('claims a file inside the directory', () => {
    expect(isUnderRoot('/repo/content/posts/a.md', '/repo')).toBe(true);
  });

  it('does not let a sibling name that merely shares a prefix pass', () => {
    expect(isUnderRoot('/repo-archive/a.md', '/repo')).toBe(false);
  });

  it('tolerates a trailing slash on the root', () => {
    expect(isUnderRoot('/repo/a.md', '/repo/')).toBe(true);
  });
});

describe('orphanedPaths', () => {
  const removed = [
    '/repo/README.md',
    '/repo/content/books/series/index.md',
    '/repo/content/posts/a.md',
  ];

  it('keeps what a narrower remaining source still covers', () => {
    expect(orphanedPaths(removed, ['/vault', '/repo/content/posts'])).toEqual([
      '/repo/README.md',
      '/repo/content/books/series/index.md',
    ]);
  });

  it('orphans everything when nothing else covers the path', () => {
    expect(orphanedPaths(removed, ['/vault'])).toEqual(removed);
  });
});
