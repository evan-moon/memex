import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient } from '@memex/db';
import { editNote } from '../services/note.ts';

type Embedder = (text: string) => Promise<number[]>;

export const registerUpdateNote = (server: McpServer, client: MemexClient, embedder: Embedder) => {
  server.tool(
    'update_note',
    'Update the title or content of an existing note. Re-indexes the embedding automatically.',
    {
      id: z.number().int().describe('Note ID'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New content in markdown'),
    },
    async ({ id, title, content }) => {
      const updated = await editNote(client, embedder, id, { title, content });
      if (!updated) {
        return { content: [{ type: 'text', text: `Note #${id} not found.` }] };
      }
      return { content: [{ type: 'text', text: `Updated note #${updated.id}: "${updated.title}"` }] };
    },
  );
};
