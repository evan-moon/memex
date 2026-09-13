import { describe, expect, it } from 'vitest';
import { generatedDraft } from './ai-authoring.ts';

describe('AI authoring', () => {
  it('puts a proposed new note into the editor without applying it', () => {
    expect(generatedDraft({ title: 'AI와 함께 쓰기', body: '첫 문단', layer: 'state' })).toEqual({
      markdown: '# AI와 함께 쓰기\n\n첫 문단',
      layer: 'state',
    });
  });
});
