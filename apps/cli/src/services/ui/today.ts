import {
  danglingLinks,
  getNote,
  listInferences,
  listSignals,
  type MemexClient,
  refreshInferenceStaleness,
  refreshSignals,
} from '@memex/db';
import { listTags, mergeCandidates } from '../tidy.ts';
import { undeclaredProjections } from './repair.ts';

// A session has to be finishable to be worth starting. Nine is a size someone
// can see the end of; the rest is not hidden, it is just not today's.
export const DAILY = 9;

export type TodayItem =
  | { kind: 'evidence-moved'; id: number; title: string }
  | { kind: 'typo-link'; id: number; title: string; target: string; nearest: string }
  | { kind: 'undeclared'; id: number; title: string; candidates: number };

export type Buried = {
  undeclared: number;
  staleNotes: number;
  forwardLinks: number;
  placeholders: number;
  tagMerges: number;
  looseTags: number;
};

export type Today = { items: TodayItem[]; buried: Buried };

const evidenceMoved = (client: MemexClient): TodayItem[] => {
  refreshInferenceStaleness(client);
  return listInferences(client, { status: 'stale' }).map(({ id, title }) => ({
    kind: 'evidence-moved',
    id,
    title,
  }));
};

const typoLinks = (client: MemexClient, links: ReturnType<typeof danglingLinks>): TodayItem[] =>
  links.flatMap((link) => {
    if (link.kind !== 'typo' || !link.nearest) return [];
    const note = getNote(client, link.noteId);
    return note
      ? [
          {
            kind: 'typo-link' as const,
            id: note.id,
            title: note.title,
            target: link.target,
            nearest: link.nearest,
          },
        ]
      : [];
  });

const staleCount = (client: MemexClient) =>
  listSignals(client, { type: 'stale_state', status: 'new' }).length;

// Round-robin rather than strict priority: nine dead links would otherwise
// take the whole day and the judgements nobody has sourced would never appear.
const shareOut = (groups: TodayItem[][], limit: number): TodayItem[] =>
  Array.from({ length: limit }, (_, round) => round)
    .flatMap((round) => groups.map((group) => group[round]).filter(Boolean))
    .slice(0, limit);

export const buildToday = (client: MemexClient, vaultPath: string): Today => {
  refreshSignals(client);
  const links = danglingLinks(client);
  // No retrieval history worth reading yet, so the order is how many sources a
  // judgement offers -- un-evidencedness and reach, without the frequency term.
  const undeclared = undeclaredProjections(client).filter((row) => row.candidates > 0);

  const items = shareOut(
    [
      evidenceMoved(client),
      typoLinks(client, links),
      undeclared.map(({ id, title, candidates }) => ({
        kind: 'undeclared' as const,
        id,
        title,
        candidates,
      })),
    ],
    DAILY,
  );
  const picked = items.filter((item) => item.kind === 'undeclared');

  const loose = listTags(client, vaultPath).filter((row) => row.notes === 1 && row.mine > 0);

  return {
    items,
    buried: {
      undeclared: undeclared.length - picked.length,
      staleNotes: staleCount(client),
      forwardLinks: links.filter((l) => l.kind === 'forward').length,
      placeholders: links.filter((l) => l.kind === 'placeholder').length,
      tagMerges: mergeCandidates(client, vaultPath).length,
      looseTags: loose.length,
    },
  };
};
