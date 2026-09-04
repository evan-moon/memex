import { describe, expect, it } from 'vitest';
import { missingSlots, slotsDropped, slotsFor, slotTemplate } from './slots.ts';

describe('slotsFor', () => {
  it('gives a note the skeleton of its layer', () => {
    expect(slotsFor('past', '면접기록')).toEqual([
      '맥락',
      '무슨 일이 있었나',
      '결정과 이유',
      '이것이 바꾼 것',
    ]);
    expect(slotsFor('state', '미분류')).toEqual(['지금 참인 것', '아직 모르는 것', '남은 것']);
  });

  it('lets a type override the skeleton where it asks a different question', () => {
    expect(slotsFor('past', '정정')).toEqual([
      '무엇이 틀렸나',
      '왜 틀렸나',
      '지금 맞는 것',
      '영향 범위',
    ]);
  });

  it('reads the same type differently under a different layer', () => {
    expect(slotsFor('rule', '미분류')).toContain('어기면 보이는 것');
    expect(slotsFor('past', '미분류')).not.toContain('어기면 보이는 것');
  });

  it('asks nothing of a document', () => {
    expect(slotsFor('past', '에세이')).toEqual([]);
    expect(slotsFor('state', '책')).toEqual([]);
  });

  it('asks nothing of a file another tool owns', () => {
    expect(slotsFor('external', '미분류')).toEqual([]);
  });
});

describe('missingSlots', () => {
  it('names every section a session record is missing', () => {
    expect(missingSlots('past', '세션기록', '# x\n\n## Resume\n\n돌아오면 여기부터')).toEqual([
      '오늘 한 작업',
      '왜',
      '이것이 바꾼 것',
      '다음 작업',
    ]);
  });

  it('accepts a heading that carries more than the slot name', () => {
    const content =
      '## Resume\na\n## 오늘 한 작업\nb\n## 왜 이 순서였나\nc\n## 이것이 바꾼 것\nd\n## 다음 작업 (대기)\ne';
    expect(missingSlots('past', '세션기록', content)).toEqual([]);
  });

  it('ignores numbering and emphasis around a heading', () => {
    const content =
      '## 1. 무엇이 틀렸나\na\n## **왜 틀렸나**\nb\n## 지금 맞는 것\nc\n## 영향 범위\nd';
    expect(missingSlots('past', '정정', content)).toEqual([]);
  });

  it('does not read a slot name out of the body text', () => {
    expect(missingSlots('rule', '규칙', '규칙 한 줄은 본문에 적어봐야 슬롯이 아니다')).toEqual([
      '규칙 한 줄',
      '적용 조건',
      '예외',
      '어기면 보이는 것',
      '근거 노트',
    ]);
  });

  it('does not let 미분류 skip the sections', () => {
    expect(missingSlots('past', '미분류', '# x\n\n아무 구조 없는 본문')).toEqual([
      '맥락',
      '무슨 일이 있었나',
      '결정과 이유',
      '이것이 바꾼 것',
    ]);
  });

  it('asks nothing of a type that carries no sections', () => {
    expect(missingSlots('past', '발행물', '')).toEqual([]);
    expect(missingSlots('past', '책', '')).toEqual([]);
  });
});

describe('slotsDropped', () => {
  const before = '## 지금 참인 것\na\n## 아직 모르는 것\nb\n## 남은 것\nc';

  it('names a section the edit removed', () => {
    expect(slotsDropped('state', '미분류', before, '## 지금 참인 것\na\n## 남은 것\nc')).toEqual([
      '아직 모르는 것',
    ]);
  });

  it('says nothing when every section survives', () => {
    expect(slotsDropped('state', '미분류', before, `${before}\n## 관련 노트\nd`)).toEqual([]);
  });

  it('does not demand a section the note never had', () => {
    expect(slotsDropped('state', '미분류', '## 남은 것\nc', '## 남은 것\n고쳐 씀')).toEqual([]);
  });
});

describe('slotTemplate', () => {
  it('writes the headings a type expects', () => {
    expect(slotTemplate('state', '제품작업')).toBe(
      '## 지금 참인 것\n\n## 아직 모르는 것\n\n## 남은 것\n\n## 관련 노트',
    );
  });

  it('falls back to the layer skeleton', () => {
    expect(slotTemplate('state', '미분류')).toBe(
      '## 지금 참인 것\n\n## 아직 모르는 것\n\n## 남은 것',
    );
  });
});
