import type { AmendKind, MemexClient } from '@memex/db';
import { claimScope, getAmendments, getBacklinks, getNote, locateClaims } from '@memex/db';
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

// A retired claim is quoted from the note it retires, so it should be findable
// there. One that is not means the correction paraphrased instead of quoting,
// and nothing downstream can tell which sentence went. Saying so is the only
// way that ever gets fixed.
const claimLines = (amendment: AmendmentRef, content: string): string =>
  locateClaims(amendment.invalidates ?? [], content)
    .map(
      (claim) =>
        `\n  - no longer true: ${claim.text}${
          claim.where === 'unlocated' ? '  ⚠️ this sentence is not in the note above' : ''
        }`,
    )
    .join('');

const restStands = (ofKind: AmendmentRef[], content: string): string =>
  ofKind.some((a) => (a.invalidates ?? []).length > 0) &&
  ofKind.every(
    (a) =>
      (a.invalidates ?? []).length === 0 ||
      claimScope(locateClaims(a.invalidates ?? [], content)) === 'partial',
  )
    ? '\n\nEverything they retire is named above. The rest of this note still stands.'
    : '';

export const amendmentSections = (amendments: AmendmentRef[], content = ''): string =>
  HEADING_ORDER.map((kind) => ({
    kind,
    ofKind: amendments.filter((amendment) => amendment.kind === kind),
  }))
    .filter(({ ofKind }) => ofKind.length > 0)
    .map(
      ({ kind, ofKind }) =>
        `\n\n---\n${HEADING[kind]}\n${ofKind
          .map((a) => `- #${a.id} [[${a.title}]]${claimLines(a, content)}`)
          .join('\n')}${kind === 'corrects' ? restStands(ofKind, content) : ''}`,
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

      const amendmentSection = amendmentSections(getAmendments(client, id), note.content);

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
