import { describe, expect, it } from 'vitest';
import {
  type ClaudeSettings,
  hasRecallHooks,
  withoutRecallHooks,
  withRecallHooks,
} from './hooks.ts';

const BIN = '/opt/memex/dist/recall.js';

const foreign: ClaudeSettings = {
  model: 'opus',
  hooks: {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: '/usr/local/bin/lint-prompt' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh' }] }],
  },
};

describe('withRecallHooks', () => {
  it('adds both hooks to empty settings', () => {
    const settings = withRecallHooks({}, BIN);
    expect(settings.hooks?.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks?.SessionStart?.[0].hooks[0].command).toContain('--warm');
  });

  it('keeps foreign hooks and unrelated settings', () => {
    const settings = withRecallHooks(foreign, BIN);
    expect(settings.model).toBe('opus');
    expect(settings.hooks?.PreToolUse).toEqual(foreign.hooks?.PreToolUse);
    expect(settings.hooks?.UserPromptSubmit?.[0].hooks[0].command).toBe(
      '/usr/local/bin/lint-prompt',
    );
    expect(settings.hooks?.UserPromptSubmit).toHaveLength(2);
  });

  it('is idempotent', () => {
    const once = withRecallHooks(foreign, BIN);
    expect(withRecallHooks(once, BIN)).toEqual(once);
  });

  it('quotes paths containing spaces', () => {
    const settings = withRecallHooks({}, '/Users/a b/dist/recall.js');
    expect(settings.hooks?.UserPromptSubmit?.[0].hooks[0].command).toContain(
      '"/Users/a b/dist/recall.js"',
    );
  });
});

describe('withoutRecallHooks', () => {
  it('removes only recall hooks', () => {
    const settings = withoutRecallHooks(withRecallHooks(foreign, BIN));
    expect(settings.hooks?.UserPromptSubmit).toEqual(foreign.hooks?.UserPromptSubmit);
    expect(settings.hooks?.PreToolUse).toEqual(foreign.hooks?.PreToolUse);
    expect(settings.hooks?.SessionStart).toBeUndefined();
    expect(hasRecallHooks(settings)).toBe(false);
  });

  it('drops the hooks key when nothing else remains', () => {
    const settings = withoutRecallHooks(withRecallHooks({ model: 'opus' }, BIN));
    expect(settings).toEqual({ model: 'opus' });
  });
});
