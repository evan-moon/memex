import {
  getNote,
  listRegisterSubjects,
  type MemexClient,
  type RegisterAuthor,
  type RegisterScope,
  type RegisterSubject,
  readRegister,
  registerHistory,
} from '@memex/db';

export type RegisterValue = {
  id: number;
  value: string;
  author: RegisterAuthor;
  at: number;
  note: { id: number; title: string } | null;
};

export type RegisterEntry = {
  scope: RegisterScope;
  heads: RegisterValue[];
  changes: number;
};

export type RegisterKeyCard = { predicate: string; entries: RegisterEntry[] };

export type RegisterScreen = { subject: string; keys: RegisterKeyCard[] };

export type RegisterHistoryEntryView = RegisterValue & { superseded: boolean };

const evidence = (client: MemexClient, noteId: number | null) => {
  if (noteId === null) return null;
  const note = getNote(client, noteId);
  return note ? { id: note.id, title: note.title } : null;
};

export const buildRegisterSubjects = (client: MemexClient): RegisterSubject[] =>
  listRegisterSubjects(client);

const startOf = (scope: RegisterScope) => (scope.kind === 'period' ? scope.start : '');

// One heading per key, periods underneath it newest first. Rendered flat, a
// monthly figure reads as several keys that happen to share a name, which is
// the one thing scope exists to say is not true.
export const buildRegister = (client: MemexClient, subject: string): RegisterScreen => ({
  subject,
  keys: [
    ...readRegister(client, subject)
      .reduce((acc, tip) => {
        const entry: RegisterEntry = {
          scope: tip.scope,
          changes: Math.max(0, tip.events - 1),
          heads: tip.heads.map((head) => ({
            id: head.id,
            value: head.value,
            author: head.author,
            at: head.createdAt,
            note: evidence(client, head.noteId),
          })),
        };
        const card = acc.get(tip.predicate);
        return acc.set(
          tip.predicate,
          card
            ? { ...card, entries: [...card.entries, entry] }
            : { predicate: tip.predicate, entries: [entry] },
        );
      }, new Map<string, RegisterKeyCard>())
      .values(),
  ].map((card) => ({
    ...card,
    entries: [...card.entries].sort((a, b) => startOf(b.scope).localeCompare(startOf(a.scope))),
  })),
});

export const buildRegisterHistory = (
  client: MemexClient,
  subject: string,
  predicate: string,
  scope: RegisterScope,
): RegisterHistoryEntryView[] =>
  registerHistory(client, subject, predicate, scope).map((entry) => ({
    id: entry.id,
    value: entry.value,
    author: entry.author,
    at: entry.createdAt,
    superseded: entry.superseded,
    note: evidence(client, entry.noteId),
  }));

export const scopeFromParams = (
  scope: string | null,
  start: string | null,
  end: string | null,
): RegisterScope | null => {
  if (scope === 'global' || scope === null) return { kind: 'global' };
  if (scope !== 'period' || start === null || end === null) return null;
  return { kind: 'period', start, end };
};
