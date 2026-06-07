import type { MemexClient } from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { editNote, isEditRejection } from '../services/note.ts';

type Embedder = (text: string) => Promise<number[]>;

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
- state notes update freely.`,
    {
      id: z.number().int().describe('Note ID'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New content in markdown'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Replace tags entirely (omit to keep existing tags)'),
    },
    async ({ id, title, content, tags }) => {
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

      return {
        content: [
          { type: 'text', text: `Updated note #${result.id}: "${result.title}"${signalSection}` },
        ],
      };
    },
  );
};
