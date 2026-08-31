import { describe, expect, it } from 'vitest';
import { parseInvalidates, writeInvalidates } from './invalidates.ts';

const FRONT = '---\ntitle: t\nlayer: past\n---\n\n# t\n\nbody';

describe('parseInvalidates', () => {
  it('finds nothing in a note that declares nothing', () => {
    expect(parseInvalidates(FRONT)).toEqual([]);
  });

  it('finds nothing in a file with no frontmatter', () => {
    expect(parseInvalidates('# t\n\nbody')).toEqual([]);
  });

  it('reads the sentences a note says are no longer true', () => {
    const content = writeInvalidates(FRONT, ['월 3~4건이 발견의 총량이다', '캐러셀은 4장이다']);
    expect(parseInvalidates(content)).toEqual(['월 3~4건이 발견의 총량이다', '캐러셀은 4장이다']);
  });

  it('survives a sentence carrying a colon, a quote, and a dollar sign', () => {
    const said = 'he said: "$1 is the cap", not \\more';
    expect(parseInvalidates(writeInvalidates(FRONT, [said]))).toEqual([said]);
  });
});

describe('writeInvalidates', () => {
  it('leaves a file without frontmatter untouched', () => {
    expect(writeInvalidates('# t\n\nbody', ['a'])).toBe('# t\n\nbody');
  });

  it('keeps the rest of the frontmatter and the body', () => {
    const written = writeInvalidates(FRONT, ['a']);
    expect(written).toContain('title: t');
    expect(written).toContain('layer: past');
    expect(written.endsWith('# t\n\nbody')).toBe(true);
  });

  it('replaces rather than appends a second block', () => {
    const once = writeInvalidates(FRONT, ['a', 'b']);
    const twice = writeInvalidates(once, ['c']);
    expect(parseInvalidates(twice)).toEqual(['c']);
    expect(twice.match(/invalidates:/g)).toHaveLength(1);
  });

  it('removes the block when nothing is invalidated any more', () => {
    const once = writeInvalidates(FRONT, ['a']);
    expect(writeInvalidates(once, [])).not.toContain('invalidates:');
  });
});
