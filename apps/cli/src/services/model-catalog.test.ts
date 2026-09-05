import { describe, expect, it } from 'vitest';
import { claudeAliases, claudeLabel, codexModels, menuAliases } from './model-catalog.ts';

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

const ANSWERED = [
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
];

describe('menuAliases', () => {
  it('drops the routing policies, which the CLI’s own picker has no row for', () => {
    for (const policy of ['best', 'opusplan', 'default']) {
      expect(menuAliases(ANSWERED)).not.toContain(policy);
    }
  });

  it('keeps the tiers and the context variants, which are models', () => {
    expect(menuAliases(ANSWERED)).toEqual([
      'sonnet',
      'opus',
      'haiku',
      'fable',
      'sonnet[1m]',
      'opus[1m]',
      'fable[1m]',
    ]);
  });

  it('admits a tier it has never heard of, on the strength of its own variant', () => {
    expect(menuAliases(['mythos', 'mythos[1m]', 'best'])).toEqual(['mythos', 'mythos[1m]']);
  });

  it('does not admit a policy word just because it is new', () => {
    expect(menuAliases(['sonnet', 'cheapest'])).toEqual(['sonnet']);
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

  it('names a variant it has not met rather than calling everything 1M', () => {
    expect(claudeLabel('opus[500k]')).toBe('Claude Opus (500K)');
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
