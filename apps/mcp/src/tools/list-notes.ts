import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient } from '@memex/db';
import { listNotes } from '@memex/db';

export const registerListNotes = (server: McpServer, client: MemexClient) => {
  server.tool(
    'list_notes',
    'List recent notes from the second brain.',
    { limit: z.number().int().min(1).max(50).optional().default(10) },
    async ({ limit }) => {
      const notes = listNotes(client, limit);
      if (notes.length === 0) {
        return { content: [{ type: 'text', text: 'No notes yet.' }] };
      }
      const text = notes
        .map((n) => `- [${n.id}] ${n.title} (${new Date(n.createdAt).toLocaleDateString()})`)
        .join('\n');
      return { content: [{ type: 'text', text }] };
    },
  );
};
