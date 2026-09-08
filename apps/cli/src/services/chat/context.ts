import { currentRevision, getNote, type MemexClient, referencesFor } from '@memex/db';

// What the request is about, what it may read, and what it was told to follow.
// Three separate lists on purpose: the difference between a document memex is
// reading and a document memex is obeying cannot be left to the model to work
// out from the text.
export type ContextManifest = {
  target: { documentId: number; revision: string | null } | null;
  selection: { from: number; to: number; exactText: string } | null;
  referenceIds: number[];
  instructionIds: number[];
  searchScope: 'selected' | 'allowed-vault';
};

export type ContextPart = {
  documentId: number;
  title: string;
  revision: string | null;
  text: string;
  // `reference` is material. `instruction` is something the person chose to
  // apply to this request. A reference that contains the sentence "ignore every
  // rule" is a reference containing that sentence, and nothing more.
  role: 'target' | 'reference' | 'instruction';
};

export type BuiltContext = {
  manifest: ContextManifest;
  parts: ContextPart[];
  // Named separately from the parts so a caller cannot lose track of what was
  // dropped to fit. Silently leaving out something the person picked is the one
  // failure this design says not to have.
  omitted: number[];
};

export type ContextRequest = {
  targetId: number | null;
  selection?: { from: number; to: number; exactText: string } | null;
  referenceIds?: number[];
  instructionIds?: number[];
  searchScope?: 'selected' | 'allowed-vault';
  budget?: number;
};

const partFor = (
  client: MemexClient,
  documentId: number,
  role: ContextPart['role'],
): ContextPart | null => {
  const note = getNote(client, documentId);
  if (!note) return null;
  return {
    documentId,
    title: note.title,
    revision: currentRevision(client, documentId)?.revisionId ?? null,
    text: note.content,
    role,
  };
};

const CHARACTER_BUDGET = 60_000;

// Built at the moment the request is sent and not touched afterwards. The person
// may change tabs while it runs; what they asked about does not change with them.
export const buildContext = (client: MemexClient, request: ContextRequest): BuiltContext => {
  const chosen = request.referenceIds ?? [];
  // Whatever the document is being written from, plus whatever was picked for
  // this one request. The stored references are the ones with a version on them.
  const attached =
    request.targetId === null
      ? []
      : referencesFor(client, request.targetId).map((reference) => reference.sourceDocumentId);
  const referenceIds = [...new Set([...attached, ...chosen])].filter(
    (id) => id !== request.targetId,
  );
  const instructionIds = [...new Set(request.instructionIds ?? [])];

  const target = request.targetId === null ? null : partFor(client, request.targetId, 'target');

  // Instructions before references: if something has to be dropped to fit, what
  // the person chose to be followed is the last thing to go.
  const ordered = [
    ...(target === null ? [] : [target]),
    ...instructionIds.flatMap((id) => partFor(client, id, 'instruction') ?? []),
    ...referenceIds.flatMap((id) => partFor(client, id, 'reference') ?? []),
  ];

  const budget = request.budget ?? CHARACTER_BUDGET;
  const kept: ContextPart[] = [];
  const omitted: number[] = [];
  const spent = { at: 0 };
  for (const part of ordered) {
    if (spent.at + part.text.length > budget && kept.length > 0) {
      omitted.push(part.documentId);
      continue;
    }
    spent.at += part.text.length;
    kept.push(part);
  }

  return {
    manifest: {
      target: target === null ? null : { documentId: target.documentId, revision: target.revision },
      selection: request.selection ?? null,
      referenceIds,
      instructionIds,
      searchScope: request.searchScope ?? 'selected',
    },
    parts: kept,
    omitted,
  };
};
