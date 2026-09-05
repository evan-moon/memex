import { describe, expect, it } from 'vitest';
import { asChoice, DEFAULT_CHOICE, isProviderId } from './llm.ts';

describe('isProviderId', () => {
  it('knows the two memex can actually run', () => {
    expect(isProviderId('claude-code')).toBe(true);
    expect(isProviderId('codex')).toBe(true);
  });

  it('refuses a name nobody here can call', () => {
    expect(isProviderId('gemini')).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
  });
});

// The config file is text a person can open and edit, so what it names is not
// guaranteed to exist. A job that cannot be read falls back rather than failing
// the work it was asked to do.
describe('asChoice', () => {
  it('takes a job the config states plainly', () => {
    expect(asChoice({ provider: 'codex', model: 'gpt-5.6-sol' })).toEqual({
      provider: 'codex',
      model: 'gpt-5.6-sol',
    });
  });

  it('falls back on a provider memex cannot call', () => {
    expect(asChoice({ provider: 'gemini', model: 'pro' })).toEqual(DEFAULT_CHOICE);
  });

  it('falls back on an empty model, which would mean sending none', () => {
    expect(asChoice({ provider: 'codex', model: '' })).toEqual(DEFAULT_CHOICE);
  });
});
