import type { MemexClient } from './client.ts';

// A file write and a database write are not one transaction. This is the note a
// write leaves before it touches the disk, so that a process which dies between
// the two can be told apart from one that never started.
export type MutationStage = 'prepared' | 'committed' | 'failed';

export type Mutation = {
  mutationId: string;
  documentId: number;
  expectedRevision: string | null;
  intendedHash: string;
  stage: MutationStage;
  resultRevision: string | null;
  error: string | null;
  at: number;
};

type Row = {
  mutation_id: string;
  document_id: number;
  expected_revision: string | null;
  intended_hash: string;
  stage: MutationStage;
  result_revision: string | null;
  error: string | null;
  at: number;
};

const asMutation = (row: Row): Mutation => ({
  mutationId: row.mutation_id,
  documentId: row.document_id,
  expectedRevision: row.expected_revision,
  intendedHash: row.intended_hash,
  stage: row.stage,
  resultRevision: row.result_revision,
  error: row.error,
  at: row.at,
});

export const findMutation = (client: MemexClient, mutationId: string): Mutation | undefined => {
  const row = client.sqlite
    .prepare('SELECT * FROM document_mutations WHERE mutation_id = ?')
    .get(mutationId) as Row | undefined;
  return row === undefined ? undefined : asMutation(row);
};

export type PreparedMutation = {
  mutationId: string;
  documentId: number;
  expectedRevision?: string | null;
  intendedHash: string;
};

// Written before the file is touched. A second call with the same id is a retry
// of a write already in flight and must not overwrite what the first one said it
// was going to do — that record is the only way to tell afterwards which of the
// two versions on disk was intended.
export const prepareMutation = (client: MemexClient, input: PreparedMutation): Mutation => {
  const already = findMutation(client, input.mutationId);
  if (already !== undefined) return already;

  const mutation: Mutation = {
    mutationId: input.mutationId,
    documentId: input.documentId,
    expectedRevision: input.expectedRevision ?? null,
    intendedHash: input.intendedHash,
    stage: 'prepared',
    resultRevision: null,
    error: null,
    at: Date.now(),
  };
  client.sqlite
    .prepare(
      `INSERT INTO document_mutations
         (mutation_id, document_id, expected_revision, intended_hash, stage, result_revision, error, at)
       VALUES (?, ?, ?, ?, 'prepared', NULL, NULL, ?)`,
    )
    .run(
      mutation.mutationId,
      mutation.documentId,
      mutation.expectedRevision,
      mutation.intendedHash,
      mutation.at,
    );
  return mutation;
};

export const commitMutation = (client: MemexClient, mutationId: string, resultRevision: string) => {
  client.sqlite
    .prepare(
      "UPDATE document_mutations SET stage = 'committed', result_revision = ? WHERE mutation_id = ?",
    )
    .run(resultRevision, mutationId);
};

export const failMutation = (client: MemexClient, mutationId: string, error: string) => {
  client.sqlite
    .prepare("UPDATE document_mutations SET stage = 'failed', error = ? WHERE mutation_id = ?")
    .run(error, mutationId);
};

// What startup reads. Each of these is a write that said what it would do and
// never said whether it did; the recovery pass compares the file on disk against
// the intended hash to find out which.
export const preparedMutations = (client: MemexClient): Mutation[] =>
  (
    client.sqlite
      .prepare("SELECT * FROM document_mutations WHERE stage = 'prepared' ORDER BY at")
      .all() as Row[]
  ).map(asMutation);
