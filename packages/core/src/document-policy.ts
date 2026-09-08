import type { DocumentMeta } from '@memex/db';

// Who is asking. The host decides this from the surface the request arrived on;
// it is never read off the request body, because a caller that can name itself
// `user` is a caller with no policy at all.
export type Actor = 'user' | 'agent';

export type WriteRefusal = {
  code: 'read-only-source' | 'propose-instead' | 'rule-user-only' | 'correct-instead';
  message: string;
};

export type WriteVerdict = { allowed: true } | ({ allowed: false } & WriteRefusal);

const allow: WriteVerdict = { allowed: true };

export type WriteRequest = {
  actor: Actor;
  meta: DocumentMeta;
  // The memory layer the note still carries. `external` means the file belongs
  // to another tool and memex only reads it.
  layer: string;
  inVault: boolean;
};

// The one thing v1 is strict about, and deliberately stricter than the agent
// edits that used to be allowed: a document a person may have written is not
// overwritten by an agent on its own say-so. It proposes instead.
export const canWriteDocument = ({ actor, meta, layer, inVault }: WriteRequest): WriteVerdict => {
  if (!inVault) {
    return {
      allowed: false,
      code: 'read-only-source',
      message:
        'That file lives outside the vault, in a folder memex only reads. Edit it where it lives, or give that folder write access in settings.',
    };
  }

  if (actor === 'user') return allow;

  if (layer === 'rule') {
    return {
      allowed: false,
      code: 'rule-user-only',
      message: 'A rule takes effect on the agent that wrote it, so only a person may change one.',
    };
  }

  // A record of what happened keeps its claims. An agent that thinks one is
  // wrong writes a correction; it does not go back and change the sentence.
  if (layer === 'past' && meta.mode === 'legacy-memory') {
    return {
      allowed: false,
      code: 'correct-instead',
      message:
        'That is a record of what happened. Write a correction that names what it retires, rather than editing the record.',
    };
  }

  if (meta.origin === 'agent') return allow;

  return {
    allowed: false,
    code: 'propose-instead',
    message:
      'That document may have been written by a person, so an agent proposes a change to it rather than applying one.',
  };
};

export type Capabilities = {
  canEdit: boolean;
  canPropose: boolean;
  refusal: WriteRefusal | null;
};

// What a surface shows before anybody tries. A refusal that only arrives after a
// person has typed a paragraph is a worse refusal than the same one on the
// button they never pressed.
export const capabilitiesFor = (request: WriteRequest): Capabilities => {
  const verdict = canWriteDocument(request);
  if (verdict.allowed) return { canEdit: true, canPropose: true, refusal: null };
  return {
    canEdit: false,
    canPropose: verdict.code === 'propose-instead' || verdict.code === 'correct-instead',
    refusal: { code: verdict.code, message: verdict.message },
  };
};
