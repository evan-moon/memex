import type { MemexClient } from './client.ts';

// The app, the MCP server and the CLI are three processes on one vault. A queue
// inside one of them serialises nothing that matters, so the lock lives in the
// database every one of them is already attached to.
//
// Held only across the coordination and the file swap. A model call never runs
// inside one — the write is short by construction, and a lock that could be held
// for the length of a generation is a lock that wedges the document.
const STALE_AFTER_MS = 30_000;

export type LockHeld = { documentId: number; holder: string; at: number };

export class DocumentBusy extends Error {
  readonly documentId: number;
  constructor(documentId: number) {
    super(`Document ${documentId} is being written by something else right now.`);
    this.name = 'DocumentBusy';
    this.documentId = documentId;
  }
}

// A process that died holding one would otherwise keep the document unwritable
// forever. Thirty seconds is far longer than a coordinated write takes and far
// shorter than a person's patience.
const takeLock = (client: MemexClient, documentId: number, holder: string): boolean => {
  const now = Date.now();
  const taken = client.sqlite
    .transaction(() => {
      const row = client.sqlite
        .prepare('SELECT holder, at FROM document_locks WHERE document_id = ?')
        .get(documentId) as { holder: string; at: number } | undefined;
      if (row !== undefined && now - row.at < STALE_AFTER_MS) return false;
      client.sqlite
        .prepare(
          `INSERT INTO document_locks (document_id, holder, at) VALUES (?, ?, ?)
           ON CONFLICT(document_id) DO UPDATE SET holder = excluded.holder, at = excluded.at`,
        )
        .run(documentId, holder, now);
      return true;
    })
    .immediate();
  return taken;
};

const releaseLock = (client: MemexClient, documentId: number, holder: string) => {
  client.sqlite
    .prepare('DELETE FROM document_locks WHERE document_id = ? AND holder = ?')
    .run(documentId, holder);
};

export const withDocumentLock = <T>(
  client: MemexClient,
  documentId: number,
  holder: string,
  write: () => T,
): T => {
  if (!takeLock(client, documentId, holder)) throw new DocumentBusy(documentId);
  try {
    return write();
  } finally {
    releaseLock(client, documentId, holder);
  }
};

export const lockOn = (client: MemexClient, documentId: number): LockHeld | undefined => {
  const row = client.sqlite
    .prepare('SELECT document_id, holder, at FROM document_locks WHERE document_id = ?')
    .get(documentId) as { document_id: number; holder: string; at: number } | undefined;
  if (row === undefined || Date.now() - row.at >= STALE_AFTER_MS) return undefined;
  return { documentId: row.document_id, holder: row.holder, at: row.at };
};
