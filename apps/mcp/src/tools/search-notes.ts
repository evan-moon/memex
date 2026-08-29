import { type Reranker, searchPageMulti } from '@memex/core';
import {
  type FlashbackOptions,
  findFlashbacks,
  getAmendmentsFor,
  type MemexClient,
  matchRegisterSubjects,
  needsReembed,
  parseTags,
} from '@memex/db';
import { stripFrontmatter } from '@memex/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerHint } from '../services/register.ts';

type Embedder = (text: string) => Promise<number[]>;

const SNIPPET_MAX_CHARS = 300;

export const toSnippet = (content: string): string => {
  const flat = stripFrontmatter(content).replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET_MAX_CHARS ? `${flat.slice(0, SNIPPET_MAX_CHARS)}…` : flat;
};

// Without this the two look identical, and a summary an agent wrote in an
// earlier session reads as if the user had written it. That is the loop where
// a machine's paraphrase becomes the source for the next machine's paraphrase.
export const stamp = (note: { layer: string; author?: string | null }): string =>
  note.author === 'agent' ? `${note.layer} · agent` : note.layer;

export const ownWorkHint =
  '\n\n---\n\u26a0\ufe0f Results marked `agent` are notes an agent wrote in an earlier session, not the ' +
  "user's own words. They are a prior summary and can be stale or wrong. When one " +
  "disagrees with a note the user wrote, the user's note wins.";

export const supersededLine = (corrections: { id: number; title: string }[]): string => {
  const newest = corrections.at(-1);
  if (!newest) return '';
  const earlier = corrections.length - 1;
  const others = earlier > 0 ? ` (and ${earlier} earlier correction${earlier > 1 ? 's' : ''})` : '';
  return `\n   ⚠️ superseded — corrected by #${newest.id} "${newest.title}"${others}. Read that before using this note.`;
};

export const formatSize = (chars: number): string =>
  chars >= 1000 ? `${(chars / 1000).toFixed(1)}k chars` : `${chars} chars`;

const readFlashbackOptions = (): FlashbackOptions => ({
  minDaysGap: process.env.MEMEX_FLASHBACK_DAYS
    ? Number(process.env.MEMEX_FLASHBACK_DAYS)
    : undefined,
  maxDistance: process.env.MEMEX_FLASHBACK_DIST
    ? Number(process.env.MEMEX_FLASHBACK_DIST)
    : undefined,
  limit: process.env.MEMEX_FLASHBACK_LIMIT ? Number(process.env.MEMEX_FLASHBACK_LIMIT) : undefined,
});

export const registerSearchNotes = (
  server: McpServer,
  client: MemexClient,
  embedder: Embedder,
  reranker?: Reranker,
) => {
  server.tool(
    'search_notes',
    "Search the second brain for relevant context. Call this BEFORE answering any question that could relate to past conversations, people, projects, or decisions the user may have stored. Always search first, then answer — even if the connection seems loose. For important or vague questions, pass MULTIPLE phrasings in one call: once in the user's language and once in English, or once with their wording and once with the underlying concept — results are fused server-side. Short keyword queries work better than long sentences. Returns a compact index (id, title, snippet) where the snippet is the passage that actually matched, not the note's opening — call get_note with an id to read the full content of any result that looks relevant.",
    {
      queries: z
        .array(z.string())
        .min(1)
        .max(3)
        .describe(
          '1–3 query phrasings in any language (e.g. ["memex 검색 개선", "memex search improvements"]). One phrasing is fine for specific questions.',
        ),
      limit: z.number().int().min(1).max(20).optional().default(5),
      category: z
        .string()
        .optional()
        .describe('Filter by top-level folder (e.g. "projects", "work", "learning")'),
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
    async ({ queries, limit, category, tag, date_from, date_to }) => {
      const parseDate = (s: string, label: string): number => {
        const ms = new Date(s).getTime();
        if (Number.isNaN(ms))
          throw new Error(`Invalid ${label}: "${s}". Use ISO 8601 format, e.g. "2026-04-01".`);
        return ms;
      };
      const dateFrom = date_from ? parseDate(date_from, 'date_from') : undefined;
      const dateTo = date_to
        ? parseDate(date_to.includes('T') ? date_to : `${date_to}T23:59:59.999Z`, 'date_to')
        : undefined;
      const { results, collapsed } = await searchPageMulti(client, embedder, queries, limit, {
        category,
        tag,
        dateFrom,
        dateTo,
        reranker,
        surface: 'mcp',
      });
      const reembedWarning = needsReembed(client)
        ? '\n\n⚠️ The embedding model changed and vectors have not been rebuilt — these results are keyword-only. Tell the user to run `memex reembed` to restore semantic search.'
        : '';
      // The register answers a different question than the notes do — what is
      // true now, rather than what was written down — so it rides along even
      // when nothing matched. A query about a subject with no notes left can
      // still have a current value.
      const register = registerHint(client, matchRegisterSubjects(client, queries));

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `No notes found.${register}${reembedWarning}` }],
        };
      }

      const seriesHint =
        collapsed.length > 0
          ? `\n\n---\n📚 ${collapsed
              .map((c) => `${c.hidden} more in the "${c.label}" series`)
              .join(
                '; ',
              )} were held back so one repeating series would not fill the page. Search again with a narrower query if you need them.`
          : '';

      const flashbacks = findFlashbacks(client, results[0].id, Date.now(), readFlashbackOptions());
      const flashbackHint =
        flashbacks.length > 0
          ? `\n\n---\n🔗 Flashback for top result — older notes from a different context:\n${flashbacks
              .map((f) => `- ${f.daysAgo} days ago: #${f.id} "${f.title}"`)
              .join('\n')}`
          : '';

      const amendments = getAmendmentsFor(
        client,
        results.map((r) => r.id),
      );

      const mirrorHint = results.some((r) => r.author === 'agent') ? ownWorkHint : '';

      const text =
        `Compact index — call get_note(id) for full content of relevant results.\n\n${results
          .map((r, i) => {
            const tags = parseTags(r.tags);
            const date = new Date(r.authoredAt ?? r.createdAt).toISOString().slice(0, 10);
            const meta = [
              r.category,
              tags.length > 0 ? tags.join(', ') : undefined,
              date,
              formatSize(r.content.length),
            ]
              .filter(Boolean)
              .join(' | ');
            const snippet = r.matchSnippet ? toSnippet(r.matchSnippet) : toSnippet(r.content);
            const correctionLine = supersededLine(amendments.get(r.id) ?? []);
            return `${i + 1}. #${r.id} [${stamp(r)}] ${r.title}\n   ${meta}\n   ${snippet}${correctionLine}`;
          })
          .join('\n\n')}` +
        register +
        mirrorHint +
        seriesHint +
        flashbackHint +
        reembedWarning;
      return { content: [{ type: 'text', text }] };
    },
  );
};
