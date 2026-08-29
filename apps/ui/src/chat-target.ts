import type { ChatTarget } from './api.ts';

// A conversation opened from a value or a note carries what it was opened on,
// which is what lets the narrow immediate write exist at all: the same sentence
// is unambiguous here and a guess in an empty chat.
export const targetFrom = (params: URLSearchParams): ChatTarget | null => {
  const subject = params.get('subject');
  if (subject !== null && subject.trim().length > 0) return { kind: 'register', subject };
  const note = Number(params.get('note'));
  return Number.isInteger(note) && note > 0 ? { kind: 'note', id: note } : null;
};
