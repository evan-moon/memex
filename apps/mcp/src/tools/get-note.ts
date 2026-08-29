import type { MemexClient } from '@memex/db';
import { getAmendments, getBacklinks, getNote } from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ownWorkHint, stamp } from './search-notes.ts';

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

      const amendments = getAmendments(client, id);
      const amendmentSection =
        amendments.length > 0
          ? `\n\n---\n⚠️ **Corrected by later notes** — read these before relying on anything above:\n${amendments
              .map((a) => `- #${a.id} [[${a.title}]]`)
              .join('\n')}`
          : '';

      const backlinks = getBacklinks(client, id);
      const backlinkSection =
        backlinks.length > 0
          ? `\n\n---\n**Referenced by:**\n${backlinks.map((b) => `- #${b.id} [[${b.title}]]`).join('\n')}`
          : '';

      const mirrorSection = note.author === 'agent' ? ownWorkHint : '';

      const text = `# ${note.title}\n\n${note.content}${amendmentSection}${backlinkSection}${mirrorSection}\n\n---\nid: ${note.id} | ${stamp(note)} | source: ${note.source} | created: ${new Date(note.createdAt).toLocaleDateString()}`;
      return { content: [{ type: 'text', text }] };
    },
  );
};
