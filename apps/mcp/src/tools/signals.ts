import {
  getNote,
  listSignals,
  type MemexClient,
  refreshSignals,
  type SignalStatus,
  type SignalType,
  setSignalStatus,
} from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const registerSignals = (server: McpServer, client: MemexClient) => {
  server.tool(
    'get_signals',
    `List deterministic "signals" — un-synthesized patterns the engine found in the notes (NO LLM involved, these are facts about the corpus structure):
- hidden_arc: notes that clearly belong together but were never linked, spread over a long time (an un-synthesized thread)
- stale_state: a "state" note that has newer related notes since it was last updated
- dangling_link: a [[link]] to a note that doesn't exist (an open question)
- tag_burst: a tag that went dormant and then resurfaced

Use this when the user asks "what patterns/threads/themes are in my notes", "what should I write about", "what have I not synthesized yet", or before offering to mint an inference. Surface signals to the user; offer to dismiss noise.`,
    {
      type: z
        .enum(['hidden_arc', 'stale_state', 'dangling_link', 'tag_burst'])
        .optional()
        .describe('Filter by signal type'),
      status: z
        .enum(['new', 'snoozed', 'dismissed', 'minted'])
        .optional()
        .default('new')
        .describe('Filter by triage status (default: new)'),
      refresh: z
        .boolean()
        .optional()
        .default(true)
        .describe('Re-run detection before listing (default: true)'),
    },
    async ({ type, status, refresh }) => {
      if (refresh) refreshSignals(client);
      const signals = listSignals(client, { type, status: status as SignalStatus });
      if (signals.length === 0) {
        return { content: [{ type: 'text', text: `No ${status} signals.` }] };
      }
      const text = signals
        .map((s) => {
          const evidence = s.evidenceIds
            .slice(0, 8)
            .map((id) => {
              const note = getNote(client, id);
              return note ? `  - #${id} ${note.title}` : `  - #${id}`;
            })
            .join('\n');
          return `#${s.id} [${s.type}]\n${s.reasoning ?? ''}\n${evidence}`;
        })
        .join('\n\n');
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'update_signal_status',
    'Triage a signal: dismiss noise so it never resurfaces, or snooze it for later. Use when a signal is clearly not worth synthesizing (e.g. a burst of boilerplate). Confirm with the user before dismissing.',
    {
      id: z.number().int().describe('Signal id'),
      status: z.enum(['new', 'snoozed', 'dismissed']).describe('New triage status'),
    },
    async ({ id, status }) => {
      const updated = setSignalStatus(client, id, status as SignalStatus);
      if (!updated) {
        return { content: [{ type: 'text', text: `Signal #${id} not found.` }] };
      }
      return { content: [{ type: 'text', text: `Signal #${id} → ${status}.` }] };
    },
  );
};

// Re-exported for callers that need the union without importing @memex/db.
export type { SignalType };
