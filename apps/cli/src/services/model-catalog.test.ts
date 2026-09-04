import { describe, expect, it } from 'vitest';
import { claudeAliases, claudeLabel, codexModels, tomlTopLevel } from './model-catalog.ts';

const CLAUDE_RESULT = [
  'Current model: `Opus 5 (1M context)` (effort: high)',
  'Usage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m],',
  'fable[1m], opusplan, default, or a full model ID.',
].join('\n');

describe('claudeAliases', () => {
  it('reads the names out of the sentence the CLI answers with', () => {
    expect(claudeAliases(CLAUDE_RESULT)).toEqual([
      'sonnet',
      'opus',
      'haiku',
      'fable',
      'best',
      'sonnet[1m]',
      'opus[1m]',
      'fable[1m]',
      'opusplan',
      'default',
    ]);
  });

  it('drops the trailing prose rather than offering it as a model', () => {
    expect(claudeAliases(CLAUDE_RESULT)).not.toContain('or a full model ID');
  });

  it('says nothing when the sentence is not there, so the caller can fall back', () => {
    expect(claudeAliases('Current model: `Opus 5`')).toEqual([]);
    expect(claudeAliases('')).toEqual([]);
  });
});

describe('claudeLabel', () => {
  it('names the ones a reader knows', () => {
    expect(claudeLabel('sonnet')).toBe('Claude Sonnet');
    expect(claudeLabel('fable')).toBe('Claude Fable');
  });

  it('keeps the long-context variant distinguishable from the plain one', () => {
    expect(claudeLabel('opus[1m]')).toBe('Claude Opus (1M)');
  });

  it('shows an alias it has no name for rather than hiding it', () => {
    expect(claudeLabel('opusplan')).toBe('Opusplan');
    expect(claudeLabel('claude-opus-4-5')).toBe('Claude-opus-4-5');
  });
});

const CODEX_JSON = JSON.stringify({
  models: [
    { slug: 'gpt-reserve', display_name: 'GPT-Reserve', visibility: 'hide', priority: 3 },
    { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', visibility: 'list', priority: 7 },
    {
      slug: 'gpt-5.6-sol',
      display_name: 'GPT-5.6-Sol',
      description: 'Fast and affordable.',
      visibility: 'list',
      priority: 6,
    },
    {
      slug: 'codex-auto-review',
      display_name: 'Codex Auto Review',
      visibility: 'hide',
      priority: 43,
    },
  ],
});

describe('codexModels', () => {
  it('leaves out the ones the CLI marks hidden, because they are not choices', () => {
    expect(codexModels(CODEX_JSON).map((m) => m.model)).toEqual(['gpt-5.6-sol', 'gpt-5.6-terra']);
  });

  it('keeps the order the CLI ranks them in, not the order they arrived', () => {
    expect(codexModels(CODEX_JSON)[0].model).toBe('gpt-5.6-sol');
  });

  it('carries the description when there is one and omits the key when there is not', () => {
    const [sol, terra] = codexModels(CODEX_JSON);
    expect(sol.description).toBe('Fast and affordable.');
    expect(terra).not.toHaveProperty('description');
  });

  it('lists a visibility nobody has seen yet rather than dropping it', () => {
    const json = JSON.stringify({ models: [{ slug: 'gpt-new', visibility: 'featured' }] });
    expect(codexModels(json).map((m) => m.model)).toEqual(['gpt-new']);
  });

  it('returns nothing when the shape is not what it expected', () => {
    expect(codexModels('{}')).toEqual([]);
    expect(codexModels('{"models":"soon"}')).toEqual([]);
  });
});

describe('tomlTopLevel', () => {
  const CONFIG = [
    'personality = "pragmatic"',
    'model = "gpt-5.6-terra"',
    'model_reasoning_effort = "medium"',
    '',
    '[projects."/Users/evan/dev"]',
    'model = "something else"',
    'trust_level = "trusted"',
  ].join('\n');

  it('reads the file’s own key', () => {
    expect(tomlTopLevel(CONFIG, 'model')).toBe('gpt-5.6-terra');
  });

  it('does not read the same key out of a table further down', () => {
    expect(tomlTopLevel('[projects.a]\nmodel = "nope"\n', 'model')).toBeNull();
  });

  it('does not mistake a longer key that starts the same way', () => {
    expect(tomlTopLevel('model_reasoning_effort = "medium"\n', 'model')).toBeNull();
  });

  it('says nothing when the key is absent', () => {
    expect(tomlTopLevel('personality = "pragmatic"\n', 'model')).toBeNull();
  });
});
