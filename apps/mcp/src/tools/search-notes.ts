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
      date_from: z
        .string()
        .optional()
        .describe('Filter notes created on or after this date (ISO 8601, e.g. "2026-04-01")'),
      date_to: z
        .string()
        .optional()
        .describe('Filter notes created on or before this date (ISO 8601, e.g. "2026-05-01")'),
    },
    async ({ query, limit, category, tag, date_from, date_to }) => {
      const dateFrom = date_from ? new Date(date_from).getTime() : undefined;
      const dateTo = date_to ? new Date(date_to).getTime() : undefined;
      const results = await semanticSearch(client, embedder, query, limit, category, tag, dateFrom, dateTo);
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
