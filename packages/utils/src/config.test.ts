import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandPath } from './config.ts';

describe('expandPath', () => {
  it('expands ~/ prefix to home directory', () => {
    expect(expandPath('~/notes')).toBe(join(homedir(), 'notes'));
  });

  it('expands nested ~/  path', () => {
    expect(expandPath('~/Documents/Second Brain')).toBe(
      join(homedir(), 'Documents/Second Brain'),
    );
  });

  it('returns absolute paths unchanged', () => {
    expect(expandPath('/absolute/path')).toBe('/absolute/path');
  });

  it('returns relative paths unchanged', () => {
    expect(expandPath('relative/path')).toBe('relative/path');
  });

  it('does not expand ~ without a trailing slash', () => {
    expect(expandPath('~nosep')).toBe('~nosep');
  });
});
