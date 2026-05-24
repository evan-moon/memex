import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findFlashbacks, type FlashbackOptions, type MemexClient } from '@memex/db';
import type { Reranker } from '@memex/rerank';
import { semanticSearch } from '../services/note.ts';

type Embedder = (text: string) => Promise<number[]>;

const readFlashbackOptions = (): FlashbackOptions => ({
  minDaysGap: process.env.MEMEX_FLASHBACK_DAYS
    ? Number(process.env.MEMEX_FLASHBACK_DAYS)
    : undefined,
  maxDistance: process.env.MEMEX_FLASHBACK_DIST
    ? Number(process.env.MEMEX_FLASHBACK_DIST)
    : undefined,
  limit: process.env.MEMEX_FLASHBACK_LIMIT
    ? Number(process.env.MEMEX_FLASHBACK_LIMIT)
    : undefined,
});

export const registerSearchNotes = (
  server: McpServer,
  client: MemexClient,
  embedder: Embedder,
  reranker: Reranker | null,
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
      const parseDate = (s: string, label: string): number => {
        const ms = new Date(s).getTime();
        if (isNaN(ms)) throw new Error(`Invalid ${label}: "${s}". Use ISO 8601 format, e.g. "2026-04-01".`);
        return ms;
      };
      const dateFrom = date_from ? parseDate(date_from, 'date_from') : undefined;
      const dateTo = date_to
        ? parseDate(date_to.includes('T') ? date_to : date_to + 'T23:59:59.999Z', 'date_to')
        : undefined;
      const results = await semanticSearch(
        client,
        embedder,
        reranker,
        query,
        limit,
        category,
        tag,
        dateFrom,
        dateTo,
      );
      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No notes found.' }] };
      }

      const flashbacks = findFlashbacks(
        client,
        results[0].id,
        Date.now(),
        readFlashbackOptions(),
      );
      const flashbackHint =
        flashbacks.length > 0
          ? `\n\n---\n🔗 Flashback for top result — older notes from a different context:\n${flashbacks
              .map((f) => `- ${f.daysAgo} days ago: #${f.id} "${f.title}"`)
              .join('\n')}`
          : '';

      const text =
        results
          .map((r, i) => `## ${i + 1}. ${r.title} (id: ${r.id})\n\n${r.content}`)
          .join('\n\n---\n\n') + flashbackHint;
      return { content: [{ type: 'text', text }] };
    },
  );
};
