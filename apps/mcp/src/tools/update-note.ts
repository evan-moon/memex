import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient } from '@memex/db';
import { editNote } from '../services/note.ts';

type Embedder = (text: string) => Promise<number[]>;

export const registerUpdateNote = (
  server: McpServer,
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
) => {
  server.tool(
    'update_note',
    'Extend or correct an existing note. Use when new information belongs with an existing note rather than standing alone. Search first to find related notes, then update rather than creating a duplicate.',
    {
      id: z.number().int().describe('Note ID'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New content in markdown'),
      tags: z.array(z.string()).optional().describe('Replace tags entirely (omit to keep existing tags)'),
    },
    async ({ id, title, content, tags }) => {
      const updated = await editNote(client, embedder, vaultPath, id, { title, content, tags });
      if (!updated) {
        return { content: [{ type: 'text', text: `Note #${id} not found.` }] };
      }
      return { content: [{ type: 'text', text: `Updated note #${updated.id}: "${updated.title}"` }] };
    },
  );
};
