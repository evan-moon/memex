import type { ChatTarget } from './api.ts';

// A conversation opened from a value or a note carries what it was opened on,
// which is what lets the narrow immediate write exist at all: the same sentence
// is unambiguous here and a guess in an empty chat.
export const targetFrom = (params: URLSearchParams): ChatTarget | null => {
  const subject = params.get('subject');
  if (subject !== null && subject.trim().length > 0) return { kind: 'register', subject };
  const topic = params.get('topic');
  if (topic !== null && topic.trim().length > 0) return { kind: 'topic', tag: topic };
  const note = Number(params.get('note'));
  return Number.isInteger(note) && note > 0 ? { kind: 'note', id: note } : null;
};

const ROUTES: { at: RegExp; of: (found: string) => ChatTarget | null }[] = [
  { at: /^\/note\/(\d+)$/, of: (found) => ({ kind: 'note', id: Number(found) }) },
  { at: /^\/register\/(.+)$/, of: (found) => ({ kind: 'register', subject: decode(found) }) },
  { at: /^\/topic\/(.+)$/, of: (found) => ({ kind: 'topic', tag: decode(found) }) },
];

const decode = (raw: string) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

// What the reader is looking at, without every screen having to say so. The
// panel opens over a route, and the route already names the thing — asking each
// screen to pass it along again is a second place for the two to disagree.
export const targetOnScreen = (params: URLSearchParams, pathname: string): ChatTarget | null =>
  targetFrom(params) ??
  ROUTES.reduce<ChatTarget | null>((found, route) => {
    if (found) return found;
    const match = route.at.exec(pathname);
    return match ? route.of(match[1]) : null;
  }, null);
