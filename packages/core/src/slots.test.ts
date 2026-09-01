import { describe, expect, it } from 'vitest';
import { missingSlots, slotTemplate } from './slots.ts';

describe('missingSlots', () => {
  it('names every section a session record is missing', () => {
    expect(missingSlots('세션기록', '# x\n\n## Resume\n\n돌아오면 여기부터')).toEqual([
      '오늘 한 작업',
      '왜',
      '다음 작업',
    ]);
  });

  it('accepts a heading that carries more than the slot name', () => {
    const content =
      '## Resume\na\n## 오늘 한 작업\nb\n## 왜 이 순서였나\nc\n## 다음 작업 (대기)\nd';
    expect(missingSlots('세션기록', content)).toEqual([]);
  });

  it('ignores numbering and emphasis around a heading', () => {
    const content =
      '## 1. 무엇이 틀렸나\na\n## **왜 틀렸나**\nb\n## 지금 맞는 것\nc\n## 영향 범위\nd';
    expect(missingSlots('정정', content)).toEqual([]);
  });

  it('does not read a slot name out of the body text', () => {
    expect(missingSlots('규칙', '규칙 한 줄은 본문에 적어봐야 슬롯이 아니다')).toEqual([
      '규칙 한 줄',
      '적용 조건',
      '예외',
      '근거 노트',
    ]);
  });

  it('asks nothing of a type that carries no sections', () => {
    expect(missingSlots('발행물', '')).toEqual([]);
    expect(missingSlots('책', '')).toEqual([]);
  });
});

describe('slotTemplate', () => {
  it('writes the headings a type expects', () => {
    expect(slotTemplate('제품작업')).toBe('## 상태\n\n## 결정\n\n## 남은 것\n\n## 관련 노트');
  });
});
