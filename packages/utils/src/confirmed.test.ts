import { describe, expect, it } from 'vitest';
import { parseConfirmedAt, writeConfirmedAt } from './confirmed.ts';

const FRONT = '---\ntitle: a note\nlayer: state\n---\n\n# a note\n\nbody';

describe('parseConfirmedAt', () => {
  it('reads back what was written', () => {
    const at = Date.UTC(2026, 8, 4, 5, 32, 11);
    expect(parseConfirmedAt(writeConfirmedAt(FRONT, at))).toBe(at);
  });

  it('takes a date on its own as the start of that day', () => {
    expect(parseConfirmedAt('---\ntitle: a\nconfirmed_at: 2026-09-04\n---\n\nbody')).toBe(
      Date.parse('2026-09-04'),
    );
  });

  it('says nothing when the note never declared one', () => {
    expect(parseConfirmedAt(FRONT)).toBeNull();
    expect(parseConfirmedAt('# no frontmatter at all')).toBeNull();
  });

  it('says nothing rather than guessing at an unreadable date', () => {
    expect(parseConfirmedAt('---\ntitle: a\nconfirmed_at: 어제\n---\n\nbody')).toBeNull();
  });
});

describe('writeConfirmedAt', () => {
  it('leaves a file with no frontmatter alone', () => {
    expect(writeConfirmedAt('# t\n\nbody', Date.now())).toBe('# t\n\nbody');
  });

  it('replaces the line rather than stacking a second one', () => {
    const once = writeConfirmedAt(FRONT, Date.UTC(2026, 0, 1));
    const twice = writeConfirmedAt(once, Date.UTC(2026, 5, 1));
    expect([...twice.matchAll(/confirmed_at:/g)]).toHaveLength(1);
    expect(parseConfirmedAt(twice)).toBe(Date.UTC(2026, 5, 1));
  });

  it('removes the line when nothing is confirmed', () => {
    const once = writeConfirmedAt(FRONT, Date.now());
    expect(writeConfirmedAt(once, null)).not.toContain('confirmed_at:');
  });

  it('keeps the rest of the frontmatter', () => {
    const written = writeConfirmedAt(FRONT, Date.now());
    expect(written).toContain('title: a note');
    expect(written).toContain('layer: state');
    expect(written).toContain('# a note');
  });
});
