import { isSaveRejection, saveNote } from '@memex/core';
import { findUnresolvedLinks, type MemexClient, type NoteSource } from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type Embedder = (text: string) => Promise<number[]>;

export const registerSaveNote = (
  server: McpServer,
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
) => {
  server.tool(
    'save_note',
    `Save a note to the second brain. Use proactively — without asking the user — at the end of any conversation that contains: technical decisions and their rationale, key points from meetings or 1-on-1s with specific people, newly learned concepts or insights, or project context worth recalling later. Prefer updating an existing note over creating a duplicate.

\`layer\` is REQUIRED — classify as one of:

- past: record of what happened (retros, meetings, decision rationale,
        interviews, debugging sessions). Cannot be updated later —
        corrections go in a new [Amendment] note that wiki-links back.
- state: current state or plans (project progress, a person's current
         role, future roadmap). Freely updatable.
- rule: behaviour guidance for Claude (coding style, search policy, etc.).
        User-only — this tool always rejects rule writes. Show the proposed
        rule text in chat and suggest \`memex add --layer rule\` instead.

Rules of thumb: past tense vs present/future tense, "fact vs intent" axis.
When in doubt, choose past.

The response may include "Flashback" lines pointing to older notes from a different context that are semantically similar — surface these to the user when relevant.`,
    {
      title: z.string().describe('Title of the note'),
      content: z.string().describe('Content of the note in markdown'),
      folder: z
        .string()
        .optional()
        .describe(
          'Subfolder within the vault (e.g. "projects/memex"). Created if it does not exist.',
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe(
          'Semantic tags for cross-category relationship mapping (e.g. ["typescript", "architecture", "evan"]). Extract 3–7 tags covering technologies, people, topics, and concepts — independent of folder.',
        ),
      source: z
        .enum(['manual', 'herald', 'claude-code'])
        .optional()
        .default('claude-code')
        .describe('Origin of the note'),
      layer: z
        .enum(['past', 'state', 'rule'])
        .describe(
          'Mutability layer. past = immutable record of what happened. state = current state/plans, freely updatable. rule = Claude behavior guide — user-only; this tool rejects rule writes (suggest `memex add --layer rule`). When in doubt, choose past.',
        ),
    },
    async ({ title, content, folder, tags, source, layer }) => {
      const result = await saveNote(client, embedder, vaultPath, {
        title,
        content,
        folder,
        tags,
        source: source as NoteSource,
        layer,
      });
      if (isSaveRejection(result)) {
        return { content: [{ type: 'text', text: result.message }], isError: true };
      }
      const { note, similar, flashbacks, signal } = result;

      const warning =
        similar.length > 0
          ? `\n\n⚠️ Similar notes already exist — consider updating one instead:\n${similar
              .map((s) => `- #${s.id} "${s.title}" (distance: ${s.distance.toFixed(3)})`)
              .join('\n')}`
          : '';

      const flashbackSection =
        flashbacks.length > 0
          ? `\n\n🔗 Flashback — older notes from a different context:\n${flashbacks
              .map(
                (f) =>
                  `- ${f.daysAgo} days ago: #${f.id} "${f.title}" (${((1 - f.distance) * 100).toFixed(0)}% match)`,
              )
              .join('\n')}`
          : '';

      const signalSection = signal
        ? `\n\n💡 Proactive Signal: Note joined an un-synthesized ${signal.type.replace('_', ' ')} (#${signal.id}: ${signal.reasoning})`
        : '';

      const unresolved = findUnresolvedLinks(client, content);
      const linkSection =
        unresolved.length > 0
          ? `\n\n🔗 These wiki links point at no note and render as dead links in Obsidian — use the exact title of an existing note (search first), or drop the brackets:\n${unresolved
              .map((t) => `- [[${t}]]`)
              .join('\n')}`
          : '';

      const text = `Saved note #${note.id}: "${note.title}"${warning}${flashbackSection}${linkSection}${signalSection}`;

      return { content: [{ type: 'text', text }] };
    },
  );
};
