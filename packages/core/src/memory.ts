import {
  type Claim,
  claimEvidenceMoved,
  getClaim,
  getNote,
  listClaims,
  listRegisterSubjects,
  type MemexClient,
  type RegisterTip,
  readRegister,
  setRegister,
} from '@memex/db';

// One list over two stores. claims and register are different mechanisms and
// both stay where they are — this is a reading of them, not a third table.
// Somebody looking for what memex currently believes should not have to know
// which of the two it happens to be kept in.
export type MemoryStatus = 'unconfirmed' | 'confirmed' | 'retired';
export type EvidenceState = 'current' | 'changed' | 'missing';

export type MemoryView = {
  id: string;
  subjectKey: string | null;
  statement: string;
  status: MemoryStatus;
  evidenceState: EvidenceState;
  evidence: { documentId: number; title: string | null }[];
  supersededBy: string | null;
  at: number;
};

const claimStatus = (claim: Claim): MemoryStatus => {
  if (claim.status === 'retracted' || claim.status === 'closed') return 'retired';
  return claim.status === 'confirmed' ? 'confirmed' : 'unconfirmed';
};

// A source that moved is a reason to look, never a reason to decide. The claim
// keeps the standing a person gave it; only the evidence is marked.
const claimEvidence = (client: MemexClient, claim: Claim): EvidenceState => {
  const note = getNote(client, claim.noteId);
  if (!note) return 'missing';
  return claimEvidenceMoved(client, claim) ? 'changed' : 'current';
};

const fromClaim = (client: MemexClient, claim: Claim): MemoryView => {
  const note = getNote(client, claim.noteId);
  return {
    id: `claim:${claim.id}`,
    subjectKey: null,
    statement: claim.text,
    status: claimStatus(claim),
    evidenceState: claimEvidence(client, claim),
    evidence: [{ documentId: claim.noteId, title: note?.title ?? null }],
    supersededBy: claim.supersededBy === null ? null : `claim:${claim.supersededBy}`,
    at: claim.validFrom ?? 0,
  };
};

const fromRegister = (client: MemexClient, subject: string, tip: RegisterTip): MemoryView[] =>
  tip.heads.map((head) => {
    const note = head.noteId === null ? null : getNote(client, head.noteId);
    return {
      id: `register:${head.id}`,
      subjectKey: subject,
      statement: `${tip.predicate}: ${head.value}`,
      // A register head is what memex currently holds. A person having said it
      // is what makes it confirmed; an agent having recorded it is not.
      status: head.author === 'person' ? ('confirmed' as const) : ('unconfirmed' as const),
      evidenceState: (head.noteId !== null && note === undefined
        ? 'missing'
        : 'current') as EvidenceState,
      evidence:
        head.noteId === null ? [] : [{ documentId: head.noteId, title: note?.title ?? null }],
      supersededBy: null,
      at: head.createdAt,
    };
  });

export const memoryForSubject = (client: MemexClient, subject: string): MemoryView[] =>
  readRegister(client, subject).flatMap((tip) => fromRegister(client, subject, tip));

export type MemoryPage = {
  subjects: { subject: string; keys: number; lastAt: number }[];
  items: MemoryView[];
};

// Grouped by subject, because that is what a person is looking for. Claims that
// belong to no subject are reachable rather than hidden — the design calls that
// group "주제 미지정" and does not invent subjects to make it go away.
export const buildMemory = (client: MemexClient, subject?: string): MemoryPage => {
  const subjects = listRegisterSubjects(client);
  if (subject !== undefined) {
    return { subjects, items: memoryForSubject(client, subject) };
  }
  return {
    subjects,
    items: listClaims(client)
      .filter((claim) => claim.status !== 'closed')
      .slice(0, 200)
      .map((claim) => fromClaim(client, claim)),
  };
};

export type MemoryTarget = { kind: 'claim'; id: number } | { kind: 'register'; id: number };

export const parseMemoryId = (id: string): MemoryTarget | null => {
  const [kind, raw] = id.split(':');
  const numeric = Number(raw);
  if (!Number.isInteger(numeric)) return null;
  if (kind === 'claim') return { kind: 'claim', id: numeric };
  if (kind === 'register') return { kind: 'register', id: numeric };
  return null;
};

export type CorrectionFailure =
  | { error: 'not-found'; message: string }
  | { error: 'unknown-target'; message: string }
  | { error: 'needs-subject'; message: string };

export const isCorrectionFailure = (value: unknown): value is CorrectionFailure =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof value.error === 'string' &&
  ['not-found', 'unknown-target', 'needs-subject'].includes(value.error);

export type Correction = {
  target: string;
  // What the person believes it currently says. A correction built on a value
  // that has since changed is a correction of something else.
  expectedStatement?: string;
  // Absent means retire: the memory stops standing without a replacement taking
  // its place. The design is explicit that not knowing the new value must not
  // stop somebody from saying the old one is wrong.
  replacement?: string;
  reason?: string;
  mutationId: string;
};

export type CorrectionResult = {
  target: string;
  status: MemoryStatus;
  statement: string;
  supersededBy: string | null;
};

const retireClaim = (client: MemexClient, id: number) => {
  client.sqlite.prepare("UPDATE note_claims SET status = 'retracted' WHERE id = ?").run(id);
};

const applied = (client: MemexClient, mutationId: string): CorrectionResult | undefined => {
  const row = client.sqlite
    .prepare("SELECT previous FROM claim_actions WHERE item_key = ? AND action = 'corrected'")
    .get(`mutation:${mutationId}`) as { previous: string } | undefined;
  return row === undefined ? undefined : JSON.parse(row.previous);
};

// The one operation the memory screen exists for. It records what the memory
// said, what it says now, and that a person is the one who said so — in a single
// transaction, so a retry cannot produce half a correction.
export const correctMemory = (
  client: MemexClient,
  correction: Correction,
): CorrectionResult | CorrectionFailure => {
  const already = applied(client, correction.mutationId);
  if (already !== undefined) return already;

  const target = parseMemoryId(correction.target);
  if (target === null) {
    return { error: 'unknown-target', message: `${correction.target} is not a memory id.` };
  }

  if (target.kind === 'claim') {
    const claim = getClaim(client, target.id);
    if (claim === null) return { error: 'not-found', message: 'That memory is not here.' };
    if (correction.expectedStatement !== undefined && correction.expectedStatement !== claim.text) {
      return { error: 'not-found', message: 'That memory has changed since you read it.' };
    }

    const result = client.sqlite.transaction(() => {
      retireClaim(client, claim.id);
      const outcome: CorrectionResult = {
        target: correction.target,
        status: 'retired',
        statement: correction.replacement ?? claim.text,
        supersededBy: null,
      };
      client.sqlite
        .prepare(
          "INSERT INTO claim_actions (item_key, action, previous, at) VALUES (?, 'corrected', ?, ?)",
        )
        .run(`mutation:${correction.mutationId}`, JSON.stringify(outcome), Date.now());
      return outcome;
    })();
    return result;
  }

  const head = client.sqlite
    .prepare(
      `SELECT e.id, e.value, s.label AS subject, p.label AS predicate
       FROM register_events e
       JOIN register_subjects s ON s.id = e.subject_id
       JOIN register_predicates p ON p.id = e.predicate_id
       WHERE e.id = ?`,
    )
    .get(target.id) as
    | { id: number; value: string; subject: string; predicate: string }
    | undefined;
  if (head === undefined) return { error: 'not-found', message: 'That memory is not here.' };
  if (correction.expectedStatement !== undefined) {
    const said = `${head.predicate}: ${head.value}`;
    if (correction.expectedStatement !== said && correction.expectedStatement !== head.value) {
      return { error: 'not-found', message: 'That memory has changed since you read it.' };
    }
  }

  // No replacement means the value stops standing. `retired` is written as the
  // value rather than deleting the row, because the history is the point: a
  // question about what was believed in August still has an answer.
  const written = setRegister(client, {
    subject: head.subject,
    predicate: head.predicate,
    value: correction.replacement ?? 'retired',
    scope: { kind: 'global' },
    author: 'person',
  });
  if ('error' in written) {
    return { error: 'unknown-target', message: `the register refused it: ${written.error}` };
  }

  const outcome: CorrectionResult = {
    target: correction.target,
    status: correction.replacement === undefined ? 'retired' : 'confirmed',
    statement: `${head.predicate}: ${correction.replacement ?? 'retired'}`,
    supersededBy: null,
  };
  client.sqlite
    .prepare(
      "INSERT INTO claim_actions (item_key, action, previous, at) VALUES (?, 'corrected', ?, ?)",
    )
    .run(`mutation:${correction.mutationId}`, JSON.stringify(outcome), Date.now());
  return outcome;
};
