import { randomUUID } from 'node:crypto';
import { editNote, isDocumentFailure, isEditRejection, updateDocument } from '@memex/core';
import { findUnresolvedLinks, type MemexClient } from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type Embedder = (text: string) => Promise<number[]>;

const refuse = (code: string, message: string) => ({
  content: [{ type: 'text' as const, text: JSON.stringify({ error: code, message }, null, 2) }],
  isError: true,
});

export type UpdateRequest = {
  operation?: 'edit-memory' | 'edit-document';
  title?: string;
  content?: string;
  tags?: string[];
  raw?: string;
  expectedRevision?: string;
};

export type UpdateChoice =
  | { kind: 'memory' }
  | { kind: 'document'; raw: string; expectedRevision: string }
  | { kind: 'refused'; code: string; message: string };

// Which of the two things this call is, decided before anything is written.
// Sending both shapes at once is not a merge of them — it is a request whose
// meaning nobody can state — and an older client that sends a document write
// without a version gets a refusal rather than a silent overwrite.
export const chooseOperation = (request: UpdateRequest): UpdateChoice => {
  const documentFields = request.raw !== undefined || request.expectedRevision !== undefined;
  const memoryFields =
    request.title !== undefined || request.content !== undefined || request.tags !== undefined;

  if (request.operation === 'edit-document') {
    if (memoryFields) {
      return {
        kind: 'refused',
        code: 'MIXED_OPERATION',
        message: 'edit-document takes raw, not title/content/tags.',
      };
    }
    if (request.raw === undefined) {
      return {
        kind: 'refused',
        code: 'RAW_REQUIRED',
        message: 'edit-document needs the whole file.',
      };
    }
    if (request.expectedRevision === undefined) {
      return {
        kind: 'refused',
        code: 'REVISION_REQUIRED',
        message: 'Pass expected_revision, the value get_note returned for this document.',
      };
    }
    return { kind: 'document', raw: request.raw, expectedRevision: request.expectedRevision };
  }

  if (documentFields) {
    return {
      kind: 'refused',
      code: 'MIXED_OPERATION',
      message: 'raw and expected_revision belong to operation: "edit-document".',
    };
  }
  return { kind: 'memory' };
};

export const registerUpdateNote = (
  server: McpServer,
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
) => {
  server.tool(
    'update_note',
    `Extend or correct an existing note. Use when new information belongs with an existing note rather than standing alone. Search first to find related notes, then update rather than creating a duplicate.

Layer rules:
- past notes are immutable — this tool will reject with PAST_IMMUTABLE. Create an [Amendment] save_note with a [[backlink]] instead.
- rule notes are user-only — this tool will reject with RULE_USER_ONLY. Surface your proposed change in chat for the user to apply.
- state notes update freely.

Documents (\`operation: "edit-document"\`) are a different thing from memory notes. They carry the whole raw file and require \`expected_revision\` — the value \`get_note\` returned — so that two writers cannot silently overwrite one another. A document that may have been written by a person is not overwritten; the write is refused and you should offer the change in conversation instead.`,
    {
      id: z.number().int().describe('Note ID'),
      operation: z
        .enum(['edit-memory', 'edit-document'])
        .optional()
        .describe(
          'edit-memory (default) is the older shape: title/content/tags on a memory note. edit-document writes the whole raw file and needs raw + expected_revision.',
        ),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New content in markdown'),
      raw: z
        .string()
        .optional()
        .describe('edit-document only: the entire file, frontmatter included'),
      expected_revision: z
        .string()
        .optional()
        .describe('edit-document only: the revision get_note returned. Required.'),
      mutation_id: z
        .string()
        .optional()
        .describe('edit-document only: a unique id, so a retry applies once'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Replace tags entirely (omit to keep existing tags)'),
    },
    async ({ id, operation, title, content, raw, expected_revision, mutation_id, tags }) => {
      const choice = chooseOperation({
        operation,
        title,
        content,
        tags,
        raw,
        expectedRevision: expected_revision,
      });
      if (choice.kind === 'refused') return refuse(choice.code, choice.message);

      if (choice.kind === 'document') {
        // The actor is decided here, by the surface the call arrived on. A
        // request cannot name itself the user.
        const written = updateDocument(
          client,
          id,
          {
            raw: choice.raw,
            expectedRevision: choice.expectedRevision,
            mutationId: mutation_id ?? randomUUID(),
          },
          { actor: 'agent', vaultPath, holder: 'mcp' },
        );
        if (isDocumentFailure(written)) {
          return refuse(written.error.toUpperCase().replace(/-/g, '_'), written.message);
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `Wrote document #${id}. New revision: ${written.revision}`,
            },
          ],
        };
      }

      const result = await editNote(client, embedder, vaultPath, id, { title, content, tags });
      if (!result) {
        return { content: [{ type: 'text', text: `Note #${id} not found.` }] };
      }
      if (isEditRejection(result)) {
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: true,
        };
      }

      const signalSection = result.signal
        ? `\n\n💡 Proactive Signal: Note joined/extended an un-synthesized ${result.signal.type.replace('_', ' ')} (#${result.signal.id}: ${result.signal.reasoning})`
        : '';

      const unresolved = content ? findUnresolvedLinks(client, content) : [];
      const linkSection =
        unresolved.length > 0
          ? `\n\n🔗 These wiki links point at no note, so they render as plain text and join nothing to the link graph — use the exact title of an existing note (search first), or drop the brackets:\n${unresolved
              .map((t) => `- [[${t}]]`)
              .join('\n')}`
          : '';

      return {
        content: [
          {
            type: 'text',
            text: `Updated note #${result.id}: "${result.title}"${linkSection}${signalSection}`,
          },
        ],
      };
    },
  );
};
