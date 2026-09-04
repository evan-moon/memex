import { describe, expect, it } from 'vitest';
import {
  describeRuleScope,
  formatRuleScope,
  parseRuleScope,
  parseScopeLine,
  writeScopeLine,
} from './scope.ts';

describe('parseRuleScope', () => {
  it('reads the three shapes it accepts', () => {
    expect(parseRuleScope('global')).toEqual({ kind: 'global' });
    expect(parseRuleScope('folder: projects/memex')).toEqual({
      kind: 'folder',
      path: 'projects/memex',
    });
    expect(parseRuleScope('tag:typescript')).toEqual({ kind: 'tag', name: 'typescript' });
  });

  it('trims the slashes a folder path does not need', () => {
    expect(parseRuleScope('folder:/projects/memex/')).toEqual({
      kind: 'folder',
      path: 'projects/memex',
    });
  });

  it('refuses free text rather than storing a label nobody can check', () => {
    expect(parseRuleScope('when writing typescript')).toBeNull();
    expect(parseRuleScope('folder:')).toBeNull();
    expect(parseRuleScope('')).toBeNull();
  });

  it('says nothing when a rule never declared one', () => {
    expect(parseRuleScope(null)).toBeNull();
    expect(parseRuleScope(undefined)).toBeNull();
  });

  it('round-trips through its written form', () => {
    for (const text of ['global', 'folder:projects/memex', 'tag:typescript']) {
      const scope = parseRuleScope(text);
      expect(scope).not.toBeNull();
      if (scope) expect(formatRuleScope(scope)).toBe(text);
    }
  });
});

describe('describeRuleScope', () => {
  it('says where a rule applies in words', () => {
    expect(describeRuleScope({ kind: 'global' })).toBe('every conversation');
    expect(describeRuleScope({ kind: 'folder', path: 'coding' })).toBe('notes under coding');
    expect(describeRuleScope({ kind: 'tag', name: 'rag' })).toBe('notes tagged rag');
  });
});

const FRONT = '---\ntitle: a rule\nlayer: rule\n---\n\n# a rule\n\nbody';

describe('scope frontmatter', () => {
  it('reads back what was written', () => {
    expect(parseScopeLine(writeScopeLine(FRONT, 'folder:coding'))).toBe('folder:coding');
  });

  it('replaces the line rather than stacking a second one', () => {
    const twice = writeScopeLine(writeScopeLine(FRONT, 'global'), 'tag:rag');
    expect([...twice.matchAll(/^rule_scope:/gm)]).toHaveLength(1);
    expect(parseScopeLine(twice)).toBe('tag:rag');
  });

  it('removes the line when a note declares nothing', () => {
    expect(writeScopeLine(writeScopeLine(FRONT, 'global'), null)).not.toContain('rule_scope:');
  });

  it('leaves a file with no frontmatter alone', () => {
    expect(writeScopeLine('# t\n\nbody', 'global')).toBe('# t\n\nbody');
  });
});
