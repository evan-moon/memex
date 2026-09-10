import { existsSync, readFileSync } from 'node:fs';
import {
  commitMutation,
  currentRevision,
  failMutation,
  getNote,
  hashOf,
  type MemexClient,
  type Mutation,
  preparedMutations,
  recordRevision,
} from '@memex/db';

// A write says what it is about to do before it touches the disk, and says
// whether it did afterwards. A process that died between the two leaves the
// first sentence without the second, and this is the pass that reads them on the
// way back in.
//
// The file on disk decides, not the journal. Three things it can say:
export type Recovered =
  | { mutationId: string; documentId: number; outcome: 'never-happened' }
  | { mutationId: string; documentId: number; outcome: 'landed'; revision: string }
  | { mutationId: string; documentId: number; outcome: 'overtaken'; revision: string };

const verdict = (client: MemexClient, mutation: Mutation): Recovered | null => {
  const note = getNote(client, mutation.documentId);
  if (!note || !existsSync(note.filePath)) {
    failMutation(client, mutation.mutationId, 'the document is gone');
    return {
      mutationId: mutation.mutationId,
      documentId: mutation.documentId,
      outcome: 'never-happened',
    };
  }

  const onDisk = hashOf(readFileSync(note.filePath, 'utf8'));

  // The file still says what it said before. The write never reached the disk,
  // so there is nothing to undo and nothing to record.
  const before =
    mutation.expectedRevision === null ? null : currentRevision(client, mutation.documentId);
  if (before !== null && before !== undefined && before.fileHash === onDisk) {
    failMutation(client, mutation.mutationId, 'the write never reached the disk');
    return {
      mutationId: mutation.mutationId,
      documentId: mutation.documentId,
      outcome: 'never-happened',
    };
  }

  // The file says exactly what the write meant it to say. The disk half
  // finished and the database half did not, so the database catches up.
  if (onDisk === mutation.intendedHash) {
    const revision = recordRevision(client, {
      documentId: mutation.documentId,
      rawContent: readFileSync(note.filePath, 'utf8'),
      actor: 'system',
      mutationId: mutation.mutationId,
      reason: 'recovered after an interrupted write',
    });
    commitMutation(client, mutation.mutationId, revision.revisionId);
    return {
      mutationId: mutation.mutationId,
      documentId: mutation.documentId,
      outcome: 'landed',
      revision: revision.revisionId,
    };
  }

  // Neither. Something else wrote the file while this was in flight, and what
  // is there now is somebody's — so it is kept as a version and the interrupted
  // write is not replayed over it. Guessing here is how an edit disappears.
  const found = recordRevision(client, {
    documentId: mutation.documentId,
    rawContent: readFileSync(note.filePath, 'utf8'),
    actor: 'external',
    reason: 'found after an interrupted write',
  });
  failMutation(client, mutation.mutationId, 'something else wrote the file first');
  return {
    mutationId: mutation.mutationId,
    documentId: mutation.documentId,
    outcome: 'overtaken',
    revision: found.revisionId,
  };
};

// Run on the way in. Nothing here rolls a file back: the disk is the document
// and this only ever adds what it finds to the history.
export const recoverInterruptedWrites = (client: MemexClient): Recovered[] =>
  preparedMutations(client).flatMap((mutation) => verdict(client, mutation) ?? []);
