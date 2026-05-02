import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient } from '@memex/db';
import { semanticSearch } from '../services/note.ts';

type Embedder = (text: string) => Promise<number[]>;

export const registerSearchNotes = (
  server: McpServer,
  client: MemexClient,
  embedder: Embedder,
) => {
  server.tool(
    'search_notes',
    'Semantically search the second brain. Returns notes ranked by relevance to the query.',
    {
      query: z.string().describe('Search query in any language'),
      limit: z.number().int().min(1).max(20).optional().default(5),
    },
    async ({ query, limit }) => {
      const results = await semanticSearch(client, embedder, query, limit);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No notes found.' }] };
      }
      const text = results
        .map((r, i) => `## ${i + 1}. ${r.title} (id: ${r.id})\n\n${r.content}`)
        .join('\n\n---\n\n');
      return { content: [{ type: 'text', text }] };
    },
  );
};
