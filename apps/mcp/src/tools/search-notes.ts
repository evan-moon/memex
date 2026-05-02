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
    'Search the second brain for relevant context. Call this BEFORE answering any question that could relate to past conversations, people, projects, or decisions the user may have stored. Always search first, then answer — even if the connection seems loose.',
    {
      query: z.string().describe('Search query in any language'),
      limit: z.number().int().min(1).max(20).optional().default(5),
      category: z
        .string()
        .optional()
        .describe('Filter by top-level folder (e.g. "conversations", "decisions", "learning")'),
      tag: z.string().optional().describe('Filter by a single tag (e.g. "typescript")'),
    },
    async ({ query, limit, category, tag }) => {
      const results = await semanticSearch(client, embedder, query, limit, category, tag);
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
