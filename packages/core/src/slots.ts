import { headingsOf, type NoteLayer, type NoteType } from '@memex/db';

// A note's shape follows its lifetime, not its subject. What a record has to
// answer is decided by how long it stays true — a record of what happened, a
// projection of what is true now, and a standing instruction are three
// different questions — so the layer owns the skeleton and the type only varies
// the wording where a kind of note answers the same question differently.
export type StructuredLayer = Exclude<NoteLayer, 'external'>;

// `이것이 바꾼 것` is the whole reason past has a fixed shape: a conversation
// produces both what happened and what is now true, and they have different
// lifetimes. Naming the second one inside the first is what keeps a later
// correction from calling the whole episode out of date.
export const SLOTS_BY_LAYER: Record<StructuredLayer, readonly string[]> = {
  past: ['맥락', '무슨 일이 있었나', '결정과 이유', '이것이 바꾼 것'],
  // One claim per line under `지금 참인 것`, because that is the granularity
  // `invalidates` names. A claim buried in a paragraph cannot be retired
  // without retiring the paragraph around it.
  state: ['지금 참인 것', '아직 모르는 것', '남은 것'],
  // `어기면 보이는 것` is what makes a rule disposable. A person approving one
  // into effect is agreeing to something they cannot otherwise check, and a
  // rule nobody can catch failing is a rule nobody can retire.
  rule: ['규칙 한 줄', '적용 조건', '예외', '어기면 보이는 것', '근거 노트'],
};

// A type overrides the skeleton only where it genuinely asks a different
// question. Each one still carries its layer's wiring slot, which is the part
// the rest of the system reads.
export const SLOTS_BY_TYPE: Partial<Record<NoteType, readonly string[]>> = {
  세션기록: ['Resume', '오늘 한 작업', '왜', '이것이 바꾼 것', '다음 작업'],
  정정: ['무엇이 틀렸나', '왜 틀렸나', '지금 맞는 것', '영향 범위'],
  업무메모: ['언제', '누구와', '무슨 얘기', '이것이 바꾼 것', '액션 아이템'],
  작업지시서: ['배경', '작업 항목', '반증 조건', '완료 게이트'],
  제품작업: ['지금 참인 것', '아직 모르는 것', '남은 것', '관련 노트'],
};

// Documents, not memory records. They are read the way they were written and
// nothing folds them into a projection, so a skeleton would only be a form to
// fill in. `미분류` is deliberately not here: reaching for it is how an agent
// skips the sections, and the layer skeleton is what closes that door.
const FREE_FORM: readonly NoteType[] = ['발행물', '책', '코드문서', '초안', '학습메모', '에세이'];

export const slotsFor = (layer: NoteLayer, type: NoteType): readonly string[] => {
  if (layer === 'external') return [];
  if (FREE_FORM.includes(type)) return [];
  return SLOTS_BY_TYPE[type] ?? SLOTS_BY_LAYER[layer];
};

const normalize = (heading: string): string =>
  heading
    .replace(/^[\d\s.)\-*_#]+/, '')
    .replace(/[*_`]/g, '')
    .trim()
    .toLowerCase();

const hasSlot = (content: string, slot: string): boolean =>
  headingsOf(content)
    .map(normalize)
    .some((heading) => heading.startsWith(normalize(slot)));

export const missingSlots = (layer: NoteLayer, type: NoteType, content: string): string[] =>
  slotsFor(layer, type).filter((slot) => !hasSlot(content, slot));

// An edit is held to what the note already says, not to what a save would ask
// of it today. The contract this enforces is "sections the agent had to write
// are sections it must not write back out" — reading it any wider would make
// every note written before a slot existed uneditable.
export const slotsDropped = (
  layer: NoteLayer,
  type: NoteType,
  before: string,
  after: string,
): string[] =>
  slotsFor(layer, type).filter((slot) => hasSlot(before, slot) && !hasSlot(after, slot));

export const slotTemplate = (layer: NoteLayer, type: NoteType): string =>
  slotsFor(layer, type)
    .map((slot) => `## ${slot}`)
    .join('\n\n');
