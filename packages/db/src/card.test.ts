import { describe, expect, it } from 'vitest';
import { extractCard } from './card.ts';

const card = (
  content: string,
  title = 'a note',
  type: Parameters<typeof extractCard>[0]['type'] = '미분류',
) => extractCard({ title, content, type });

describe('extractCard', () => {
  it('prefers the line under a summary section to the opening paragraph', () => {
    const line = card(
      '# a note\n\n첫 문단은 배경 설명으로 시작하고 길게 이어진다.\n\n## 결론\n\n검색은 랭킹이 아니라 청킹에서 갈렸다.',
    );
    expect(line).toEqual({
      line: '검색은 랭킹이 아니라 청킹에서 갈렸다.',
      field: 'section',
      quality: 'good',
    });
  });

  it('falls back to the body when the section line is too short to be a card', () => {
    const line = card('## 요약\n\n짧다.\n\n본문은 여기서부터 제대로 설명을 시작한다.');
    expect(line).toEqual({
      line: '본문은 여기서부터 제대로 설명을 시작한다.',
      field: 'body',
      quality: 'good',
    });
  });

  it('skips frontmatter, headings, tables, quotes and images', () => {
    const line = card(
      '---\ntitle: a note\n---\n\n# a note\n\n| a | b |\n\n> quoted\n\n![](img.png)\n\n실제 문장은 바로 이 줄에서 시작한다고 적어둔다.',
    );
    expect(line.field).toBe('body');
    expect(line.line).toBe('실제 문장은 바로 이 줄에서 시작한다고 적어둔다.');
  });

  it('ignores prose inside a code fence', () => {
    const line = card(
      '```\n이건 코드 블록 안의 설명 문장이라서 카드가 될 수 없다\n```\n\n이 줄이 진짜 첫 문단이라고 적어두기로 한다.',
    );
    expect(line.line).toBe('이 줄이 진짜 첫 문단이라고 적어두기로 한다.');
  });

  it('strips list markers, wiki links and emphasis', () => {
    const line = card('- **[[Opula 대시보드]]** 재설계는 여기서 갈렸다고 적어둔다.');
    expect(line.line).toBe('Opula 대시보드 재설계는 여기서 갈렸다고 적어둔다.');
  });

  it('cuts a long line to 160 characters', () => {
    expect(card(`${'가'.repeat(400)}`).line).toHaveLength(160);
  });

  it('calls a note with nothing to quote bad', () => {
    expect(card('# a note\n')).toEqual({ line: null, field: 'none', quality: 'bad' });
  });

  it('flags a hedged opening as weak', () => {
    expect(card('이 노트는 무엇에 대한 것인지 설명하는 문장으로 시작한다.').quality).toBe('weak');
  });

  it('takes a manuscript card from its first h2, not its body', () => {
    const line = card(
      '# 웹 네트워크\n\n서문이 길게 이어진다 이것은 첫 문단이다.\n\n## HTTP/2는 무엇을 바꿨나',
      '웹 네트워크',
      '책',
    );
    expect(line).toEqual({ line: 'HTTP/2는 무엇을 바꿨나', field: 'heading', quality: 'good' });
  });

  it('leaves a manuscript with no h2 on its title, marked weak', () => {
    expect(card('---\ntitle: 웹 네트워크\nposts:\n  - /a/\n---\n', '웹 네트워크', '책')).toEqual({
      line: '웹 네트워크',
      field: 'title',
      quality: 'weak',
    });
  });
});
