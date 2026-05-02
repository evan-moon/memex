import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient } from '@memex/db';
import { getNote } from '@memex/db';
import { removeNote } from '../services/note.ts';

export const registerDeleteNote = (server: McpServer, client: MemexClient) => {
  server.tool(
    'delete_note',
    'Delete a note by ID. Removes both the markdown file and the index entry.',
    { id: z.number().int().describe('Note ID') },
    async ({ id }) => {
      const note = getNote(client, id);
      if (!note) {
        return { content: [{ type: 'text', text: `Note #${id} not found.` }] };
      }
      removeNote(client, id, note.filePath);
      return { content: [{ type: 'text', text: `Deleted note #${id}: "${note.title}"` }] };
    },
  );
};
