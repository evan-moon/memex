import { describe, expect, it } from 'vitest';
import { parseDerivesFrom, writeDerivesFrom } from './evidence.ts';

const note = (front: string) => `---\ntitle: a plan\n${front}---\n\nbody\n`;

describe('parseDerivesFrom', () => {
  it('reads the ids a note declares', () => {
    expect(parseDerivesFrom(note('derives_from: [1234, 1456]\n'))).toEqual([1234, 1456]);
  });

  it('reads nothing from a note that declares nothing', () => {
    expect(parseDerivesFrom(note(''))).toEqual([]);
    expect(parseDerivesFrom('# no frontmatter\n\nbody')).toEqual([]);
  });

  it('does not mistake a mention in the body for a declaration', () => {
    expect(parseDerivesFrom(`${note('')}\nderives_from: [99]\n`)).toEqual([]);
  });
});

describe('writeDerivesFrom', () => {
  it('adds the line to a note that had none', () => {
    const out = writeDerivesFrom(note(''), [7, 9]);
    expect(out).toContain('derives_from: [7, 9]');
    expect(parseDerivesFrom(out)).toEqual([7, 9]);
  });

  it('replaces what was there rather than appending a second line', () => {
    const out = writeDerivesFrom(note('derives_from: [1]\n'), [2, 3]);
    expect(parseDerivesFrom(out)).toEqual([2, 3]);
    expect(out.match(/derives_from/g)).toHaveLength(1);
  });

  it('takes the line away when nothing is declared any more', () => {
    const out = writeDerivesFrom(note('derives_from: [1]\n'), []);
    expect(out).not.toContain('derives_from');
    expect(out).toContain('title: a plan');
  });

  it('leaves the body and the other keys alone', () => {
    const out = writeDerivesFrom(note('tags: [a, b]\nlayer: state\n'), [5]);
    expect(out).toContain('tags: [a, b]');
    expect(out).toContain('layer: state');
    expect(out).toContain('body');
  });

  it('leaves a file with no frontmatter untouched', () => {
    expect(writeDerivesFrom('# plain\n\nbody', [1])).toBe('# plain\n\nbody');
  });
});
