import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient } from '@memex/db';
import { getNote, getBacklinks } from '@memex/db';

export const registerGetNote = (server: McpServer, client: MemexClient) => {
  server.tool(
    'get_note',
    'Get the full content of a note by ID.',
    { id: z.number().int().describe('Note ID') },
    async ({ id }) => {
      const note = getNote(client, id);
      if (!note) {
        return { content: [{ type: 'text', text: `Note #${id} not found.` }] };
      }

      const backlinks = getBacklinks(client, id);
      const backlinkSection =
        backlinks.length > 0
          ? `\n\n---\n**Referenced by:**\n${backlinks.map((b) => `- #${b.id} [[${b.title}]]`).join('\n')}`
          : '';

      const text = `# ${note.title}\n\n${note.content}${backlinkSection}\n\n---\nid: ${note.id} | source: ${note.source} | created: ${new Date(note.createdAt).toLocaleDateString()}`;
      return { content: [{ type: 'text', text }] };
    },
  );
};
