import { isSaveRejection, SLOTS_BY_TYPE, saveNote } from '@memex/core';
import {
  findUnresolvedLinks,
  type MemexClient,
  NOTE_TYPES,
  type NoteSource,
  recordPresentation,
} from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type Embedder = (text: string) => Promise<number[]>;

// Without this the agent reports "saved your rule" and the user reasonably reads
// that as "in effect". It is stored; it is not doing anything yet, and only the
// agent is in a position to say so at the moment it happens.
export const proposalLine = (ruleStatus: string | null): string =>
  ruleStatus === 'provisional'
    ? '\n\n📋 Saved as a proposal — it is NOT in effect. It stays inert until the user approves ' +
      'it under Guidance in the memex app. Tell them it is waiting there.'
    : '';

const SLOT_HELP = Object.entries(SLOTS_BY_TYPE)
  .map(([type, slots]) => `- ${type}: ${slots.map((slot) => `## ${slot}`).join(' · ')}`)
  .join('\n');

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
        corrections go in a new [Amendment] note that passes \`amends\`.
- state: current state or plans (project progress, a person's current
         role, future roadmap). Freely updatable.
- rule: behaviour guidance for Claude (coding style, search policy, etc.).
        You may write one, but it is stored as a proposal and is NOT injected
        until the user approves it in the memex app. Say so when you write one.

Rules of thumb: past tense vs present/future tense, "fact vs intent" axis.
When in doubt, choose past.

\`type\` is REQUIRED — it is what the note is, not what it is about. Six of the types carry a fixed set of sections, and a save without them is rejected with the list of what to write:

${SLOT_HELP}

The other types — 발행물, 책, 초안, 에세이, 학습메모, 코드문서 — take no required sections.

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
      amends: z
        .number()
        .int()
        .optional()
        .describe(
          'Id of an earlier note this one is about. Pass it whenever you are writing about something already recorded, so the two are read together instead of separately.',
        ),
      amends_kind: z
        .enum(['corrects', 'continues'])
        .optional()
        .describe(
          'What this note does to the one in `amends`. "corrects" means something in the earlier note is no longer true. "continues" means it still holds and this adds to it. Defaults to "continues" — unless `invalidates` names something, which settles it as "corrects".',
        ),
      invalidates: z
        .array(z.string())
        .optional()
        .describe(
          'The claims in the note being amended that are no longer true, each written as the sentence it replaces — not a summary of this note. A correction almost never invalidates a whole note: name only the parts that stopped being true, and leave the rest to stand. Passing anything here makes this a correction.',
        ),
      type: z
        .enum(NOTE_TYPES)
        .describe(
          'What kind of document this is. Six types require fixed sections in `content` — see the tool description. Choosing the kind is what makes a note readable later; do not reach for 미분류 to skip the sections.',
        ),
      layer: z
        .enum(['past', 'state', 'rule'])
        .describe(
          'Mutability layer. past = immutable record of what happened. state = current state/plans, freely updatable. rule = Claude behavior guide — saved as a proposal that only takes effect once the user approves it in the app. When in doubt, choose past.',
        ),
    },
    async ({
      title,
      content,
      folder,
      tags,
      source,
      layer,
      type,
      amends,
      amends_kind,
      invalidates,
    }) => {
      const result = await saveNote(client, embedder, vaultPath, {
        title,
        content,
        folder,
        tags,
        source: source as NoteSource,
        layer,
        type,
        amends,
        amendKind: amends_kind,
        invalidates,
      });
      if (isSaveRejection(result)) {
        return { content: [{ type: 'text', text: result.message }], isError: true };
      }
      const {
        note,
        similar,
        flashbacks,
        signal,
        amended,
        amendsMissing,
        invalidates: invalidated,
      } = result;

      const invalidatedSection =
        invalidated && invalidated.length > 0
          ? `\n\nMarked as no longer true:\n${invalidated.map((claim) => `- ${claim}`).join('\n')}`
          : '';

      const amendSection = amended
        ? `\n\n🔗 Recorded as an amendment of #${amended.id} "${amended.title}" — searches that surface it will now carry the correction.${invalidatedSection}`
        : amendsMissing !== undefined
          ? `\n\n⚠️ amends #${amendsMissing} matches no note, so nothing links this correction to what it corrects. Search for the note and save again with the right id.`
          : '';

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

      // Recorded here rather than where the signal is chosen: saveNote hands one
      // back to every caller, and only the ones that render it have shown it.
      if (signal) recordPresentation(client, signal.id, 'mcp');
      const signalSection = signal
        ? `\n\n💡 Proactive Signal: Note joined an un-synthesized ${signal.type.replace('_', ' ')} (#${signal.id}: ${signal.reasoning})`
        : '';

      const unresolved = findUnresolvedLinks(client, content);
      const linkSection =
        unresolved.length > 0
          ? `\n\n🔗 These wiki links point at no note, so they render as plain text and join nothing to the link graph — use the exact title of an existing note (search first), or drop the brackets:\n${unresolved
              .map((t) => `- [[${t}]]`)
              .join('\n')}`
          : '';

      const text = `Saved note #${note.id}: "${note.title}"${proposalLine(note.ruleStatus)}${amendSection}${warning}${flashbackSection}${linkSection}${signalSection}`;

      return { content: [{ type: 'text', text }] };
    },
  );
};
