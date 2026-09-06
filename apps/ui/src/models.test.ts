import { describe, expect, it } from 'vitest';
import { groupModels } from './models.ts';

const claude = [
  { model: 'sonnet', label: 'Claude Sonnet' },
  { model: 'opus', label: 'Claude Opus' },
  { model: 'haiku', label: 'Claude Haiku' },
  { model: 'fable', label: 'Claude Fable' },
  { model: 'sonnet[1m]', label: 'Claude Sonnet (1M)' },
  { model: 'opus[1m]', label: 'Claude Opus (1M)' },
  { model: 'fable[1m]', label: 'Claude Fable (1M)' },
];

describe('groupModels', () => {
  it('says each name once and keeps the sizes beside it', () => {
    const tiers = groupModels(claude);

    expect(tiers.map((tier) => tier.label)).toEqual([
      'Claude Sonnet',
      'Claude Opus',
      'Claude Haiku',
      'Claude Fable',
    ]);
    expect(tiers[0]?.options.map((option) => option.tag)).toEqual([null, '1M']);
    expect(tiers[2]?.options.map((option) => option.tag)).toEqual([null]);
  });

  it('keeps the order the CLI answered in', () => {
    expect(groupModels(claude).map((tier) => tier.base)).toEqual([
      'sonnet',
      'opus',
      'haiku',
      'fable',
    ]);
  });

  it('leaves a catalogue with no variants exactly as it was', () => {
    const codex = [
      { model: 'gpt-5-codex', label: 'GPT-5 Codex' },
      { model: 'gpt-5', label: 'GPT-5' },
    ];
    const tiers = groupModels(codex);

    expect(tiers).toHaveLength(2);
    expect(tiers.every((tier) => tier.options.length === 1)).toBe(true);
    expect(tiers.map((tier) => tier.label)).toEqual(['GPT-5 Codex', 'GPT-5']);
  });

  // A tier the CLI only offers in one size still has to read as a model.
  it('names a tier that only ever comes as a variant', () => {
    const tiers = groupModels([{ model: 'nova[1m]', label: 'Claude Nova (1M)' }]);

    expect(tiers[0]?.label).toBe('Claude Nova');
    expect(tiers[0]?.options[0]?.tag).toBe('1M');
  });
});
