import { describe, expect, it } from 'vitest';
import type { Catalog } from './api.ts';
import { searchModels } from './models.ts';

const catalog: Catalog = {
  providers: [
    {
      provider: 'claude-code',
      label: 'Claude Code',
      source: 'cli',
      models: [
        { model: 'opus', label: 'Claude Opus' },
        { model: 'opus[1m]', label: 'Claude Opus (1M)' },
        { model: 'haiku', label: 'Claude Haiku' },
      ],
    },
    {
      provider: 'codex',
      label: 'Codex (ChatGPT)',
      source: 'cli',
      models: [
        { model: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { model: 'gpt-5.5', label: 'GPT-5.5' },
      ],
    },
  ],
};

describe('searchModels', () => {
  it('reaches across providers, because typing is the way past the two levels', () => {
    expect(searchModels(catalog, 'op').map((m) => m.model)).toEqual(['opus', 'opus[1m]']);
  });

  it('forgives the punctuation nobody remembers', () => {
    expect(searchModels(catalog, 'gpt56').map((m) => m.model)).toEqual(['gpt-5.6-sol']);
    expect(searchModels(catalog, 'opus1m').map((m) => m.model)).toEqual(['opus[1m]']);
  });

  it('says which provider a result came from, since the grouping is gone', () => {
    expect(searchModels(catalog, 'gpt55')[0].providerLabel).toBe('Codex (ChatGPT)');
  });

  it('matches the id as well as the name', () => {
    expect(searchModels(catalog, 'haiku').map((m) => m.model)).toEqual(['haiku']);
  });

  it('returns nothing for an empty query rather than everything', () => {
    expect(searchModels(catalog, '   ')).toEqual([]);
  });
});
