import { randomUUID } from 'node:crypto';
import {
  type ChangeProposal,
  currentRevision,
  getNote,
  getProposal,
  type MemexClient,
  setProposalStatus,
} from '@memex/db';
import { stripFrontmatter } from '@memex/utils';
import { type DocumentContext, type DocumentFailure, updateDocument } from './documents.ts';

export type ProposalFailure =
  | { error: 'not-found'; message: string }
  | { error: 'not-pending'; message: string; status: string }
  | { error: 'base-moved'; message: string; currentRevision: string | null }
  | { error: 'text-moved'; message: string; expected: string; found: string };

export const isProposalFailure = (value: unknown): value is ProposalFailure =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof value.error === 'string' &&
  ['not-found', 'not-pending', 'base-moved', 'text-moved'].includes(value.error);

// The body is what the person selected in, and the raw file is what gets
// written. Splitting the file here rather than counting offsets into the whole
// thing is what keeps a proposal from landing inside the frontmatter.
const splitRaw = (raw: string): { head: string; body: string } => {
  const body = stripFrontmatter(raw);
  return { head: raw.slice(0, raw.length - body.length), body };
};

// Applied to what the document says now, not to what it said when the proposal
// was written. Two things are re-checked first, because a proposal is a bet on
// a document that has been sitting still: the version it was built on, and the
// exact text it meant to replace. Either having moved means the offsets no
// longer point where the agent thought, and quietly writing anyway is how a
// paragraph ends up spliced into the middle of another one.
export const applyProposal = (
  client: MemexClient,
  proposalId: string,
  context: DocumentContext,
): { revision: string; raw: string } | ProposalFailure | DocumentFailure => {
  const proposal = getProposal(client, proposalId);
  if (proposal === undefined) {
    return { error: 'not-found', message: 'That change is not on offer any more.' };
  }
  if (proposal.status !== 'pending') {
    return {
      error: 'not-pending',
      message: 'That change was already decided.',
      status: proposal.status,
    };
  }

  const note = getNote(client, proposal.documentId);
  if (!note) return { error: 'not-found', message: 'The document is gone.' };

  const now = currentRevision(client, proposal.documentId);
  if (proposal.baseRevision !== null && now?.revisionId !== proposal.baseRevision) {
    setProposalStatus(client, proposalId, 'conflicted');
    return {
      error: 'base-moved',
      message:
        'The document changed after this was written. Ask for it again against what it says now.',
      currentRevision: now?.revisionId ?? null,
    };
  }

  const raw = now?.rawContent ?? note.content;
  const { head, body } = splitRaw(raw);

  const next = ((): string | ProposalFailure => {
    if (proposal.range === null) return head + proposal.replacement;
    const found = body.slice(proposal.range.from, proposal.range.to);
    if (found !== proposal.range.exactText) {
      return {
        error: 'text-moved',
        message: 'The passage this was about is not where it was. Ask for it again.',
        expected: proposal.range.exactText,
        found,
      };
    }
    return (
      head +
      body.slice(0, proposal.range.from) +
      proposal.replacement +
      body.slice(proposal.range.to)
    );
  })();

  if (isProposalFailure(next)) {
    setProposalStatus(client, proposalId, 'conflicted');
    return next;
  }

  const written = updateDocument(
    client,
    proposal.documentId,
    {
      raw: next,
      expectedRevision: proposal.baseRevision,
      mutationId: randomUUID(),
      reason: `applied proposal ${proposalId}`,
    },
    context,
  );
  if ('error' in written) return written;

  setProposalStatus(client, proposalId, 'applied');
  return { revision: written.revision, raw: written.raw };
};

// Discarding leaves the document exactly as it was. A cancelled generation may
// still leave what it produced on screen as an offer, but the original never
// moved and never will by this route.
export const discardProposal = (client: MemexClient, proposalId: string): ChangeProposal | null => {
  const proposal = getProposal(client, proposalId);
  if (proposal === undefined) return null;
  setProposalStatus(client, proposalId, 'discarded');
  return { ...proposal, status: 'discarded' };
};
