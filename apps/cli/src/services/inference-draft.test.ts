import { describe, expect, it } from 'vitest';
import { parseRedraft } from './inference-draft.ts';

describe('parseRedraft', () => {
  it('splits the title from the hypothesis', () => {
    expect(parseRedraft('a new title\n<<<SUMMARY>>>\nthe reading changed')).toEqual({
      title: 'a new title',
      summary: 'the reading changed',
    });
  });

  it('drops a heading marker the model put on the title anyway', () => {
    expect(parseRedraft('# a new title\n<<<SUMMARY>>>\nbody')?.title).toBe('a new title');
  });

  it('refuses an answer that never split', () => {
    expect(parseRedraft('just some prose')).toBeNull();
  });

  it('refuses an answer with a side missing', () => {
    expect(parseRedraft('<<<SUMMARY>>>\nbody')).toBeNull();
    expect(parseRedraft('title\n<<<SUMMARY>>>\n  ')).toBeNull();
  });
});
