import { describe, expect, it } from 'vitest';
import { parseSlashInput, slashCommandsFor } from './slash.ts';

describe('parseSlashInput', () => {
  it('opens only when slash starts the current block', () => {
    expect(parseSlashInput('/제')).toEqual({ from: 0, query: '제' });
    expect(parseSlashInput('  /table')).toEqual({ from: 2, query: 'table' });
    expect(parseSlashInput('문장 /제')).toBeNull();
    expect(parseSlashInput('https://memex.dev')).toBeNull();
  });
});

describe('slashCommandsFor', () => {
  it('finds commands with Korean and English words', () => {
    expect(slashCommandsFor('제목').map(({ id }) => id)).toEqual([
      'heading-1',
      'heading-2',
      'heading-3',
    ]);
    expect(slashCommandsFor('heading').map(({ id }) => id)).toEqual([
      'heading-1',
      'heading-2',
      'heading-3',
    ]);
    expect(slashCommandsFor('check').map(({ id }) => id)).toContain('check-list');
  });

  it('returns Markdown that survives source-mode round trips', () => {
    expect(slashCommandsFor('heading 2')[0]).toMatchObject({
      label: '제목 2',
      insert: '## ',
    });
    expect(slashCommandsFor('table')[0]?.insert).toBe('| 열 1 | 열 2 |\n| --- | --- |\n|  |  |');
  });
});
