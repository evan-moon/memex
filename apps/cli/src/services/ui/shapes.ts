import { type MemexClient, setNoteShape, shapedNoteIds } from '@memex/db';
import type { LlmChoice } from '@memex/llm';
import { CLAIM_MODEL, type ClaimSource, type Extraction, extractClaims } from '../claim-extract.ts';
import { undeclaredProjections } from './repair.ts';

export type ShapeFillerDeps = {
  client: MemexClient;
  sweep?: () => LlmChoice;
  extract?: (note: ClaimSource, choice?: LlmChoice) => Promise<Extraction>;
  perRun?: number;
};

const PER_RUN = 8;

// Only notes a stack can actually hand over. A judgement with nothing to offer
// is filtered out of every batch, so reading it buys a model call and nothing.
export const notesNeedingShape = (client: MemexClient, limit: number): ClaimSource[] => {
  const shaped = new Set(shapedNoteIds(client));
  return undeclaredProjections(client)
    .filter((row) => row.candidates > 0 && !shaped.has(row.id))
    .slice(0, limit)
    .flatMap((row) => {
      const note = client.sqlite.prepare('SELECT content FROM notes WHERE id = ?').get(row.id) as
        | { content: string }
        | undefined;
      return note ? [{ id: row.id, title: row.title, body: note.content }] : [];
    });
};

// One run at a time. The screen asks for a batch every time it is opened, and
// each note costs a model call, so a second run started on top of the first
// would pay twice to read the same notes.
export const createShapeFiller = ({
  client,
  sweep,
  extract = extractClaims,
  perRun = PER_RUN,
}: ShapeFillerDeps) => {
  const state = { running: false };

  const run = async () => {
    // Read per run, not per process: a model chosen in settings takes effect on
    // the next sweep rather than on the next launch.
    const choice = sweep?.();
    for (const note of notesNeedingShape(client, perRun)) {
      const result = await extract(note, choice);
      // A missing `claude` binary is not a fact about this note, so stop the
      // run instead of failing the same way for every note behind it.
      if ('error' in result) {
        if (result.code === 'no-claude') return;
        continue;
      }
      setNoteShape(client, {
        noteId: note.id,
        kind: result.kind,
        claims: result.claims,
        modelId: choice?.model ?? CLAIM_MODEL,
      });
    }
  };

  return {
    fill: async () => {
      if (state.running) return;
      state.running = true;
      try {
        await run();
      } finally {
        state.running = false;
      }
    },
    running: () => state.running,
  };
};
