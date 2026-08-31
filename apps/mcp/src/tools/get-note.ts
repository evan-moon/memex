import type { AmendKind, MemexClient } from '@memex/db';
import { getAmendments, getBacklinks, getNote } from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type AmendmentRef, ownWorkHint, stamp } from './search-notes.ts';

const HEADING: Record<AmendKind, string> = {
  corrects: '⚠️ **Corrected by later notes** — read these before relying on anything above:',
  unknown:
    '↔ **Amended by later notes**, which did not say whether they correct or continue — read them before relying on anything above:',
  continues: '→ **Continued by later notes** — this note still holds:',
};

const HEADING_ORDER: AmendKind[] = ['corrects', 'unknown', 'continues'];

export const amendmentSections = (amendments: AmendmentRef[]): string =>
  HEADING_ORDER.map((kind) => ({
    kind,
    ofKind: amendments.filter((amendment) => amendment.kind === kind),
  }))
    .filter(({ ofKind }) => ofKind.length > 0)
    .map(
      ({ kind, ofKind }) =>
        `\n\n---\n${HEADING[kind]}\n${ofKind
          .map(
            (a) =>
              `- #${a.id} [[${a.title}]]${(a.invalidates ?? [])
                .map((claim) => `\n  - no longer true: ${claim}`)
                .join('')}`,
          )
          .join('\n')}`,
    )
    .join('');

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

      const amendmentSection = amendmentSections(getAmendments(client, id));

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
