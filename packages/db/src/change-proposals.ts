import { randomUUID } from 'node:crypto';
import type { MemexClient } from './client.ts';

// Where a change lives between being offered and being decided. Not in the
// conversation that produced it: the person may close the panel, go read the
// source it cites, and come back an hour later, and the offer has to still be
// there — pointing at the version it was written against.
export type ProposalStatus = 'pending' | 'applied' | 'discarded' | 'conflicted';

// Offsets into the edit body, in UTF-16 code units, which is what CodeMirror
// counts. Never into the raw file: the frontmatter is not in the coordinate
// space the person selected in.
export type ProposalRange = { from: number; to: number; exactText: string };

export type ChangeProposal = {
  id: string;
  documentId: number;
  baseRevision: string | null;
  range: ProposalRange | null;
  replacement: string;
  usedEvidence: { documentId: number; revision: string | null; quote: string }[];
  status: ProposalStatus;
  originClient: string | null;
  at: number;
};

type Row = {
  id: string;
  document_id: number;
  base_revision: string | null;
  range_from: number | null;
  range_to: number | null;
  exact_text: string | null;
  replacement: string;
  used_evidence: string;
  status: ProposalStatus;
  origin_client: string | null;
  at: number;
};

const asProposal = (row: Row): ChangeProposal => ({
  id: row.id,
  documentId: row.document_id,
  baseRevision: row.base_revision,
  range:
    row.range_from === null || row.range_to === null
      ? null
      : { from: row.range_from, to: row.range_to, exactText: row.exact_text ?? '' },
  replacement: row.replacement,
  usedEvidence: JSON.parse(row.used_evidence),
  status: row.status,
  originClient: row.origin_client,
  at: row.at,
});

export type NewProposal = {
  documentId: number;
  baseRevision: string | null;
  range?: ProposalRange | null;
  replacement: string;
  usedEvidence?: { documentId: number; revision: string | null; quote: string }[];
  originClient?: string;
};

export const putProposal = (client: MemexClient, input: NewProposal): ChangeProposal => {
  const proposal: ChangeProposal = {
    id: randomUUID(),
    documentId: input.documentId,
    baseRevision: input.baseRevision,
    range: input.range ?? null,
    replacement: input.replacement,
    usedEvidence: input.usedEvidence ?? [],
    status: 'pending',
    originClient: input.originClient ?? null,
    at: Date.now(),
  };
  client.sqlite
    .prepare(
      `INSERT INTO change_proposals
         (id, document_id, base_revision, range_from, range_to, exact_text, replacement,
          used_evidence, status, origin_client, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      proposal.id,
      proposal.documentId,
      proposal.baseRevision,
      proposal.range?.from ?? null,
      proposal.range?.to ?? null,
      proposal.range?.exactText ?? null,
      proposal.replacement,
      JSON.stringify(proposal.usedEvidence),
      proposal.originClient,
      proposal.at,
    );
  return proposal;
};

export const getProposal = (client: MemexClient, id: string): ChangeProposal | undefined => {
  const row = client.sqlite.prepare('SELECT * FROM change_proposals WHERE id = ?').get(id) as
    | Row
    | undefined;
  return row === undefined ? undefined : asProposal(row);
};

export const proposalsFor = (client: MemexClient, documentId: number): ChangeProposal[] =>
  (
    client.sqlite
      .prepare(
        "SELECT * FROM change_proposals WHERE document_id = ? AND status = 'pending' ORDER BY at DESC",
      )
      .all(documentId) as Row[]
  ).map(asProposal);

export const setProposalStatus = (client: MemexClient, id: string, status: ProposalStatus) => {
  client.sqlite.prepare('UPDATE change_proposals SET status = ? WHERE id = ?').run(status, id);
};
