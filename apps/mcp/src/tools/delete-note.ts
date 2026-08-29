import { removeNote } from '@memex/core';
import type { MemexClient } from '@memex/db';
import { getNote } from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const registerDeleteNote = (server: McpServer, client: MemexClient, vaultPath: string) => {
  server.tool(
    'delete_note',
    'Delete a note by ID. Removes both the markdown file and the index entry. Rule-layer notes are user-only and always rejected — suggest `memex delete <id>` instead.',
    { id: z.number().int().describe('Note ID') },
    async ({ id }) => {
      const note = getNote(client, id);
      if (!note) {
        return { content: [{ type: 'text', text: `Note #${id} not found.` }] };
      }
      const rejection = removeNote(client, id, note.filePath, { vaultPath });
      if (rejection) {
        return { content: [{ type: 'text', text: rejection.message }], isError: true };
      }
      return { content: [{ type: 'text', text: `Deleted note #${id}: "${note.title}"` }] };
    },
  );
};
