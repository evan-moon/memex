import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandPath, readModels } from './config.ts';

describe('expandPath', () => {
  it('expands ~/ prefix to home directory', () => {
    expect(expandPath('~/notes')).toBe(join(homedir(), 'notes'));
  });

  it('expands nested ~/  path', () => {
    expect(expandPath('~/Documents/Second Brain')).toBe(join(homedir(), 'Documents/Second Brain'));
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

describe('readModels', () => {
  const sonnet = { provider: 'claude-code', model: 'sonnet' };

  it('gives every job the model each one used before there was a setting', () => {
    expect(readModels(undefined)).toEqual({ chat: sonnet, draft: sonnet, sweep: sonnet });
  });

  it('leaves the jobs a config does not mention alone', () => {
    expect(readModels({ sweep: { provider: 'codex', model: 'gpt-5.4-mini' } })).toEqual({
      chat: sonnet,
      draft: sonnet,
      sweep: { provider: 'codex', model: 'gpt-5.4-mini' },
    });
  });

  it('does not let a half-written entry become a call with no model', () => {
    expect(readModels({ chat: { provider: 'codex' }, draft: { model: 'opus' } })).toEqual({
      chat: sonnet,
      draft: sonnet,
      sweep: sonnet,
    });
  });

  it('ignores a key that is not a job', () => {
    expect(readModels({ visual: { provider: 'codex', model: 'x' } })).toEqual({
      chat: sonnet,
      draft: sonnet,
      sweep: sonnet,
    });
  });
});
