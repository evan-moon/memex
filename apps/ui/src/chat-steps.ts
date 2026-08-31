import type { ChatStep } from './api.ts';
import type { Strings } from './i18n.ts';

const STEPS_SHOWN = 6;

// The word the model committed to before it wrote what goes under it. Waiting
// for an answer and waiting for a note are the same blank pause otherwise.
const acting = (action: string, t: Strings) => {
  const byAction: Record<string, string> = {
    answer: t.chat.steps.answering,
    'new-note': t.chat.steps.writing,
    'amend-note': t.chat.steps.writing,
    'set-register': t.chat.steps.writing,
    search: t.chat.steps.searching,
    read: t.chat.steps.opening,
    'use-skill': t.chat.steps.loadingSkill,
  };
  return byAction[action] ?? t.chat.thinking;
};

export const stepLine = (step: ChatStep, t: Strings): string => {
  if (step.kind === 'searched') return t.chat.steps.searched(step.query, step.found);
  if (step.kind === 'skill') return t.chat.steps.skill(step.title);
  if (step.kind === 'read') return t.chat.steps.read(step.count);
  if (step.kind === 'acting') return acting(step.action, t);
  return t.chat.thinking;
};

// A turn that looked six times has six things to say, and the oldest of them
// stopped being news the moment the next one arrived. The tail is what a person
// reads; the head is what they scroll past.
//
// Each keeps its place in the whole trail, because that is the one number that
// does not move under a line as the turn goes on: a position within the tail
// shifts by one every time a seventh step arrives.
export const shownSteps = (steps: ChatStep[]) =>
  steps.map((step, at) => ({ at, step })).slice(-STEPS_SHOWN);
