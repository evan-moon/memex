// What kind of sentence a claim is, and therefore whether "is this still true?"
// is a question it can answer.
//
// A state has a truth value that can change: it was true in August and false in
// September. An event happened, and stays happened. A judgement never had a
// truth value — it was a view someone held. A rule is an instruction, and
// instructions are approved, not verified. Asking the deck's question of the
// last three produces a card nobody can answer, which is how a review queue
// teaches people to dismiss it.
// `state` is the only one the deck can ask about. An `event` is history and
// history does not become false — asking "is this still true?" of it gets either
// a shrug or a tautology, never information.
export type ClaimKind = 'state' | 'event' | 'judgement' | 'rule';

const SYLLABLE_START = 0xac00;
const SYLLABLE_END = 0xd7a3;
const JUNGSEONG_COUNT = 21;
const JONGSEONG_COUNT = 28;

// The vowels a verb stem ends on once `-아/어` has been fused onto it:
// 하+아 → 해, 보+아 → 봐, 두+어 → 둬, 되+어 → 되어. Korean's obligation form is
// `-아/어야 하다`, so this is what sits immediately before 야 in every one of
// them. Matching the shape rather than a list of verbs is what makes
// 검색해야 한다, 잡아야 한다 and 되어야 한다 one rule instead of three.
const FUSED_VOWELS = new Set([0, 1, 4, 5, 6, 9, 11, 14, 16]);

const takesObligation = (syllable: string): boolean => {
  const code = syllable.codePointAt(0);
  if (code === undefined || code < SYLLABLE_START || code > SYLLABLE_END) return false;
  const offset = code - SYLLABLE_START;
  if (offset % JONGSEONG_COUNT !== 0) return false;
  return FUSED_VOWELS.has(Math.floor(offset / JONGSEONG_COUNT) % JUNGSEONG_COUNT);
};

const OBLIGATION_TAIL = /^\s*(한다|하며|하고|하는|하지|할|해|했|된다|되며|되고|되는|맞다)/;

// `-아/어야 하다`. Walks every 야 rather than pattern-matching a verb list.
const isObligation = (text: string): boolean =>
  [...text].some((char, at) => {
    if (char !== '야' || at === 0) return false;
    const stem = text[at - 1];
    return stem !== undefined && takesObligation(stem) && OBLIGATION_TAIL.test(text.slice(at + 1));
  });

const PROHIBITION = /(서는 안 |하지 말|금지한다|말아야)/;
const PRESCRIPTION = /(권장한다|추천한다|해서는 안)/;

// Comparative and evaluative words. A sentence carrying one of these is stating
// a preference, and a preference cannot go out of date the way a fact does.
const EVALUATIVE =
  /(최고|최적|최선|최우선|가장 |더 나은|더 낫|낫다|안티패턴|바람직|무의미|의미가 없|핵심이다|핵심 |관건|본질적|우위|유리하|불리하|ROI|저비용|고비용|우선이다|충분|불충분|무리|비현실적|효율적|비효율|가치가 있|부적합|적합하|진짜 레버|진짜 병목|리스크가 있|필요하다|필수적|불필요)/;

const JONGSEONG_SSANGSIOT = 20;

// Korean marks the past with 았/었/였 fused onto the stem, and every one of them
// carries ㅆ as its final consonant: 했다, 됐다, 갔다, 있었다. `있` carries it too
// but is present tense, so it is the one syllable this excludes — which still
// leaves 있었다, whose 었 is what the test lands on.
const isPastSyllable = (syllable: string | undefined): boolean => {
  if (syllable === undefined || syllable === '있') return false;
  const code = syllable.codePointAt(0);
  if (code === undefined || code < SYLLABLE_START || code > SYLLABLE_END) return false;
  return (code - SYLLABLE_START) % JONGSEONG_COUNT === JONGSEONG_SSANGSIOT;
};

const isEvent = (text: string): boolean => text.endsWith('다') && isPastSyllable(text.at(-2));

export const classifyClaim = (text: string): ClaimKind => {
  const trimmed = text.trim().replace(/[.\s]+$/, '');
  if (isObligation(trimmed) || PROHIBITION.test(trimmed) || PRESCRIPTION.test(trimmed)) {
    return 'rule';
  }
  if (EVALUATIVE.test(trimmed)) return 'judgement';
  return isEvent(trimmed) ? 'event' : 'state';
};
