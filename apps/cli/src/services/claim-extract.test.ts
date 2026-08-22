import { describe, expect, it } from 'vitest';
import { parseExtraction } from './claim-extract.ts';

describe('parseExtraction', () => {
  it('reads a position and its claims', () => {
    expect(parseExtraction('{"kind":"position","claims":["하나","둘"]}')).toEqual({
      kind: 'position',
      claims: ['하나', '둘'],
    });
  });

  it('reads an index as asserting nothing', () => {
    expect(parseExtraction('{"kind":"index","claims":[]}')).toEqual({ kind: 'index', claims: [] });
  });

  it('finds the object even when the model wrapped it in prose', () => {
    const raw = 'Here is the result:\n```json\n{"kind":"index","claims":[]}\n```\n';
    expect(parseExtraction(raw)).toEqual({ kind: 'index', claims: [] });
  });

  it('refuses a shape it cannot trust rather than guessing one', () => {
    expect(parseExtraction('not json at all')).toBeNull();
    expect(parseExtraction('{"kind":"essay","claims":[]}')).toBeNull();
    expect(parseExtraction('{"kind":"position"}')).toBeNull();
  });

  it('drops claim entries that are not sentences', () => {
    expect(parseExtraction('{"kind":"position","claims":["하나",null,"",7]}')).toEqual({
      kind: 'position',
      claims: ['하나'],
    });
  });
});
