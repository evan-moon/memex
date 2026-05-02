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
    'Save a note to the second brain. Stores as a markdown file and indexes for semantic search.',
    {
      title: z.string().describe('Title of the note'),
      content: z.string().describe('Content of the note in markdown'),
      source: z
        .enum(['manual', 'herald', 'claude-code'])
        .optional()
        .default('claude-code')
        .describe('Origin of the note'),
    },
    async ({ title, content, source }) => {
      const note = await saveNote(client, embedder, vaultPath, {
        title,
        content,
        source: source as NoteSource,
      });
      return {
        content: [{ type: 'text', text: `Saved note #${note.id}: "${note.title}"` }],
      };
    },
  );
};
