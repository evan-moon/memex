import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient, NoteSource } from '@memex/db';
import { saveNote } from '../services/note.ts';

type Embedder = (text: string) => Promise<number[]>;

export const registerSaveNote = (
  server: McpServer,
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
) => {
  server.tool(
    'save_note',
    'Save a note to the second brain. Use proactively — without asking the user — at the end of any conversation that contains: technical decisions and their rationale, key points from meetings or 1-on-1s with specific people, newly learned concepts or insights, or project context worth recalling later. Prefer updating an existing note over creating a duplicate.',
    {
      title: z.string().describe('Title of the note'),
      content: z.string().describe('Content of the note in markdown'),
      folder: z
        .string()
        .optional()
        .describe('Subfolder within the vault (e.g. "projects/memex"). Created if it does not exist.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Semantic tags for cross-category relationship mapping (e.g. ["typescript", "architecture", "evan"]). Extract 3–7 tags covering technologies, people, topics, and concepts — independent of folder.'),
      source: z
        .enum(['manual', 'herald', 'claude-code'])
        .optional()
        .default('claude-code')
        .describe('Origin of the note'),
    },
    async ({ title, content, folder, tags, source }) => {
      const { note, similar } = await saveNote(client, embedder, vaultPath, {
        title,
        content,
        folder,
        tags,
        source: source as NoteSource,
      });

      let text = `Saved note #${note.id}: "${note.title}"`;

      if (similar.length > 0) {
        const list = similar
          .map((s) => `- #${s.id} "${s.title}" (distance: ${s.distance.toFixed(3)})`)
          .join('\n');
        text += `\n\n⚠️ Similar notes already exist — consider updating one instead:\n${list}`;
      }

      return { content: [{ type: 'text', text }] };
    },
  );
};
