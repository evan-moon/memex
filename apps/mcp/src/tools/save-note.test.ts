import { describe, expect, it } from 'vitest';
import { proposalLine } from './save-note.ts';

describe('proposalLine', () => {
  it('says a rule is waiting, and that it is not doing anything yet', () => {
    const line = proposalLine('provisional');
    expect(line).toContain('NOT in effect');
    expect(line).toContain('Guidance');
  });

  it('says nothing about a rule the user already approved', () => {
    expect(proposalLine('canonical')).toBe('');
  });

  it('says nothing about a note that is not a rule', () => {
    expect(proposalLine(null)).toBe('');
  });
});
