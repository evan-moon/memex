import { headingsOf, type NoteType } from '@memex/db';

export const SLOTS_BY_TYPE: Partial<Record<NoteType, readonly string[]>> = {
  세션기록: ['Resume', '오늘 한 작업', '왜', '다음 작업'],
  정정: ['무엇이 틀렸나', '왜 틀렸나', '지금 맞는 것', '영향 범위'],
  작업지시서: ['배경', '작업 항목', '반증 조건', '완료 게이트'],
  규칙: ['규칙 한 줄', '적용 조건', '예외', '근거 노트'],
  업무메모: ['언제', '누구와', '무슨 얘기', '액션 아이템'],
  제품작업: ['상태', '결정', '남은 것', '관련 노트'],
};

const normalize = (heading: string): string =>
  heading
    .replace(/^[\d\s.)\-*_#]+/, '')
    .replace(/[*_`]/g, '')
    .trim()
    .toLowerCase();

export const missingSlots = (type: NoteType, content: string): string[] => {
  const required = SLOTS_BY_TYPE[type];
  if (required === undefined) return [];

  const headings = headingsOf(content).map(normalize);
  return required.filter((slot) => !headings.some((h) => h.startsWith(normalize(slot))));
};

export const slotTemplate = (type: NoteType): string =>
  (SLOTS_BY_TYPE[type] ?? []).map((slot) => `## ${slot}`).join('\n\n');
