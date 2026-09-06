import {
  evidenceStaleness,
  getInference,
  getNote,
  getNoteInvalidations,
  listInferences,
  type MemexClient,
  type NoteEvidenceEdge,
  notesDeclaringEvidence,
  refreshInferenceStaleness,
  retrievalCounts,
  wakeDeferrals,
} from '@memex/db';
import { stripFrontmatter } from '@memex/utils';

const SESSION = 5;
const INJECTION_WINDOW_DAYS = 30;
const EXCERPT_LINES = 2;
const EXCERPT_CHARS = 180;

export type SourceState = 'intact' | 'changed' | 'corrected' | 'missing';
export type ReviewGrade = 'observed' | 'inferred';
export type ReviewKind = 'evidence-corrected' | 'evidence-moved';

export type ReviewSource = {
  id: number;
  title: string | null;
  state: SourceState;
  correctedBy: { id: number; title: string } | null;
  correctedAt: number;
  retired: string[];
  before: string | null;
  now: string | null;
};

export type ReviewItem = {
  key: string;
  kind: ReviewKind;
  target: { id: number; kind: 'note' | 'inference'; title: string; at: number };
  grade: ReviewGrade;
  claim: string;
  moved: ReviewSource[];
  sources: ReviewSource[];
  injected: { hits: number; days: number };
  recurring: boolean;
  canApprove: boolean;
};

export type Review = { items: ReviewItem[] };

const clamp = (text: string) =>
  text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS).trimEnd()}…` : text;

const withoutOpenFrontmatter = (text: string) => {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return text;
  const closes = lines.indexOf('---', 1);
  if (closes !== -1) return lines.slice(closes + 1).join('\n');
  return lines.filter((line) => !/^\s*[\w-]+:/.test(line) && line.trim() !== '---').join('\n');
};

const excerptOf = (content: string) =>
  clamp(
    withoutOpenFrontmatter(stripFrontmatter(content))
      .split('\n')
      .map((line) => line.trim().replace(/^(?:[-*+]|\d+\.)\s+/, ''))
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .slice(0, EXCERPT_LINES)
      .join(' '),
  );

const bodyOf = (client: MemexClient, id: number) => {
  const note = getNote(client, id);
  return note ? excerptOf(note.content) : null;
};

const stateOfNoteEdge = (edge: NoteEvidenceEdge): SourceState =>
  edge.missing ? 'missing' : edge.amendedBy ? 'corrected' : edge.changed ? 'changed' : 'intact';

const writtenAt = (client: MemexClient, id: number) => {
  const note = getNote(client, id);
  return note ? (note.authoredAt ?? note.createdAt) : 0;
};

const noteSource = (client: MemexClient, edge: NoteEvidenceEdge): ReviewSource => ({
  id: edge.sourceId,
  title: edge.title,
  state: stateOfNoteEdge(edge),
  correctedBy: edge.amendedBy,
  correctedAt: edge.amendedBy ? writtenAt(client, edge.amendedBy.id) : 0,
  retired: edge.amendedBy ? getNoteInvalidations(client, edge.amendedBy.id) : [],
  before: null,
  now: edge.missing ? null : bodyOf(client, edge.sourceId),
});

const isMoved = (source: ReviewSource) => source.state !== 'intact';

const unaccountedFor = (source: ReviewSource, confirmedAt: number) =>
  isMoved(source) && (source.state !== 'corrected' || source.correctedAt > confirmedAt);

const fingerprintOf = (sources: ReviewSource[]) =>
  sources
    .map((source) => `${String(source.id)}:${source.state}`)
    .sort()
    .join('|');

const injectionsFor = (client: MemexClient) => {
  const since = Date.now() - INJECTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const counts = retrievalCounts(client, { since, injectedOnly: true });
  return new Map(counts.map((row) => [row.noteId, row.hits]));
};

const correctedItems = (client: MemexClient, injected: Map<number, number>): ReviewItem[] =>
  notesDeclaringEvidence(client).flatMap((noteId) => {
    const note = getNote(client, noteId);
    if (!note || note.layer !== 'state') return [];

    const staleness = evidenceStaleness(client, noteId);
    if (!staleness) return [];

    const sources = (staleness.amended.map((entry) => entry.source) as NoteEvidenceEdge[])
      .concat(staleness.changed, staleness.missing)
      .reduce<NoteEvidenceEdge[]>(
        (acc, edge) => (acc.some((seen) => seen.sourceId === edge.sourceId) ? acc : [...acc, edge]),
        [],
      )
      .map((edge) => noteSource(client, edge));

    const moved = sources.filter((source) => unaccountedFor(source, note.confirmedAt ?? 0));
    if (moved.length === 0) return [];

    return [
      {
        key: `note:${String(noteId)}`,
        kind: 'evidence-corrected' as const,
        target: { id: noteId, kind: 'note' as const, title: note.title, at: note.updatedAt },
        grade: 'observed' as const,
        claim: excerptOf(note.content),
        moved,
        sources,
        injected: { hits: injected.get(noteId) ?? 0, days: INJECTION_WINDOW_DAYS },
        recurring: false,
        canApprove: moved.every((source) => source.state !== 'missing'),
      },
    ];
  });

const movedItems = (client: MemexClient, injected: Map<number, number>): ReviewItem[] => {
  refreshInferenceStaleness(client);
  return listInferences(client, { status: 'stale' }).flatMap((row) => {
    const found = getInference(client, row.id);
    if (!found) return [];

    const sources = found.evidence.map((edge) => ({
      id: edge.noteId,
      title: edge.title,
      state: (edge.missing ? 'missing' : edge.changed ? 'changed' : 'intact') as SourceState,
      correctedBy: null,
      correctedAt: 0,
      retired: [],
      before: edge.sourceExcerpt === null ? null : (excerptOf(edge.sourceExcerpt) || null),
      now: edge.missing ? null : bodyOf(client, edge.noteId),
    }));

    const moved = sources.filter(isMoved);
    if (moved.length === 0) return [];

    const hits = moved.reduce((total, source) => total + (injected.get(source.id) ?? 0), 0);

    return [
      {
        key: `inference:${String(row.id)}`,
        kind: 'evidence-moved' as const,
        target: {
          id: row.id,
          kind: 'inference' as const,
          title: found.inference.title,
          at: found.inference.updatedAt,
        },
        grade: 'inferred' as const,
        claim: found.inference.summary,
        moved,
        sources,
        injected: { hits, days: INJECTION_WINDOW_DAYS },
        recurring: false,
        canApprove: moved.every((source) => source.state !== 'missing'),
      },
    ];
  });
};

const byUrgency = (a: ReviewItem, b: ReviewItem) =>
  Number(b.recurring) - Number(a.recurring) ||
  b.injected.hits - a.injected.hits ||
  b.target.at - a.target.at;

const buildReviewAll = (client: MemexClient): ReviewItem[] => {
  const injected = injectionsFor(client);
  return [...correctedItems(client, injected), ...movedItems(client, injected)];
};

export const buildReview = (client: MemexClient): Review => {
  const found = buildReviewAll(client);

  const { asleep, met } = wakeDeferrals(
    client,
    found.map((item) => ({
      itemKey: item.key,
      fingerprint: fingerprintOf(item.sources),
      hits: item.injected.hits,
    })),
  );

  return {
    items: found
      .filter((item) => !asleep.has(item.key))
      .map((item) => ({ ...item, recurring: met.has(item.key) }))
      .sort(byUrgency)
      .slice(0, SESSION),
  };
};

export const reviewItemState = (client: MemexClient, key: string) => {
  const found = buildReviewAll(client).find((item) => item.key === key);
  if (!found) return null;
  return {
    itemKey: found.key,
    noteId: found.target.id,
    fingerprint: fingerprintOf(found.sources),
    hits: found.injected.hits,
  };
};
