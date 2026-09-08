// What to do with a draft that outlived the window it was typed in. The answer
// is never "put it back": a buffer restored without being shown is the same
// silent overwrite this whole design exists to prevent.
export type Recovery =
  | { kind: 'nothing' }
  | { kind: 'already-saved' }
  | { kind: 'unsaved'; draft: string; saved: string }
  | { kind: 'conflict'; draft: string; saved: string };

export type DraftAt = {
  content: string;
  baseRevision: string | null;
};

export type SavedAt = {
  raw: string;
  revision: string | null;
};

export const recoveryFor = (draft: DraftAt | undefined, saved: SavedAt): Recovery => {
  if (draft === undefined) return { kind: 'nothing' };
  if (draft.content === saved.raw) return { kind: 'already-saved' };

  // The document moved while the draft was in the ground. Both texts are real
  // and neither is the other's ancestor, so the person picks.
  if (draft.baseRevision !== null && draft.baseRevision !== saved.revision) {
    return { kind: 'conflict', draft: draft.content, saved: saved.raw };
  }

  return { kind: 'unsaved', draft: draft.content, saved: saved.raw };
};
