import { describe, expect, it } from 'vitest';
import { parseAuthoredAt } from './dates.ts';

describe('parseAuthoredAt', () => {
  it('reads a frontmatter date', () => {
    const ms = parseAuthoredAt('A note', '---\ntitle: A note\ndate: 2024-04-11\n---\nbody');
    expect(ms).toBe(Date.parse('2024-04-11'));
  });

  it('falls back to a (YYYY-MM-DD) in the title', () => {
    const ms = parseAuthoredAt('FIRE 전략 (2026-05-25)', 'no frontmatter here');
    expect(ms).toBe(Date.parse('2026-05-25'));
  });

  it('prefers frontmatter over the title date', () => {
    const ms = parseAuthoredAt('thing (2020-01-01)', 'date: 2024-04-11');
    expect(ms).toBe(Date.parse('2024-04-11'));
  });

  it('returns null when no date is present', () => {
    expect(parseAuthoredAt('plain title', 'plain body')).toBeNull();
  });
});
