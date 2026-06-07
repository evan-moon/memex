import {
  getInference,
  getSignal,
  type InferenceStatus,
  listInferences,
  type MemexClient,
  mintInference,
  refreshInferenceStaleness,
} from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Inferences are HYPOTHESES, not facts. The attribution contract below is
// repeated in every tool description so the agent never presents a synthesized
// inference as ground truth.
const ATTRIBUTION =
  'IMPORTANT: an inference is a HYPOTHESIS the engine/agent synthesized, NOT a stored fact. ' +
  'When you use one in an answer, cite it as such with its confidence and evidence note ids ' +
  '(e.g. "[Inference #42, conf 0.78, from notes #1,#2] ..."). Never state it as something the user "knows" or "believes".';

export const registerInferences = (server: McpServer, client: MemexClient) => {
  server.tool(
    'list_inferences',
    `List inferences (LLM-synthesized hypotheses derived from notes). Staleness is re-checked first, so an inference whose source notes changed shows status "stale". ${ATTRIBUTION}`,
    {
      status: z.enum(['active', 'stale', 'archived']).optional().describe('Filter by status'),
    },
    async ({ status }) => {
      refreshInferenceStaleness(client);
      const list = listInferences(client, { status: status as InferenceStatus });
      if (list.length === 0) {
        return { content: [{ type: 'text', text: 'No inferences yet.' }] };
      }
      const text = list
        .map((i) => {
          const conf = i.confidence !== null ? ` (conf ${i.confidence})` : '';
          const flag = i.status === 'stale' ? ' [STALE]' : '';
          return `#${i.id}${flag}${conf} ${i.title}\n${i.summary}`;
        })
        .join('\n\n');
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'get_inference',
    `Get one inference with full provenance: its summary, confidence, and every evidence note (with a snapshot of the note at mint time and whether it has since changed or been deleted). ${ATTRIBUTION}`,
    {
      id: z.number().int().describe('Inference id'),
    },
    async ({ id }) => {
      const found = getInference(client, id);
      if (!found) {
        return { content: [{ type: 'text', text: `Inference #${id} not found.` }] };
      }
      const { inference, evidence } = found;
      const ev = evidence
        .map((e) => {
          const mark = e.missing ? '[deleted]' : e.changed ? '[changed since mint]' : '[unchanged]';
          return `  - #${e.noteId} ${e.title ?? '(deleted)'} ${mark}`;
        })
        .join('\n');
      const text =
        `#${inference.id} ${inference.title}\n` +
        `status: ${inference.status}` +
        (inference.confidence !== null ? ` | confidence: ${inference.confidence}` : '') +
        (inference.modelId ? ` | via ${inference.modelId}` : '') +
        `\n\n${inference.summary}\n\nEvidence:\n${ev}`;
      return { content: [{ type: 'text', text }] };
    },
  );

  server.tool(
    'mint_inference',
    `Persist a synthesized inference (a non-obvious claim that holds across several notes but is stated in none).

ONLY call this when the user EXPLICITLY asks to save/record/keep a discovery ("save that", "record this insight"). NEVER auto-mint in the background — unvalidated hypotheses pollute the brain. First present the hypothesis in chat; mint only after the user approves.

Provide either fromSignalId (sources are taken from that signal) or evidenceNoteIds, or both.`,
    {
      title: z.string().describe('Short title for the inference'),
      summary: z.string().describe('The inference: the claim + why the evidence supports it'),
      fromSignalId: z
        .number()
        .int()
        .optional()
        .describe(
          'Signal this was synthesized from (its notes become evidence; it is marked minted)',
        ),
      evidenceNoteIds: z
        .array(z.number().int())
        .optional()
        .describe("Explicit source note ids (merged with the signal's notes if both given)"),
      confidence: z.number().min(0).max(1).optional().describe('Confidence 0..1'),
      modelId: z.string().optional().describe('Model that produced the synthesis'),
    },
    async ({ title, summary, fromSignalId, evidenceNoteIds, confidence, modelId }) => {
      const ids = new Set<number>(evidenceNoteIds ?? []);
      if (fromSignalId !== undefined) {
        const signal = getSignal(client, fromSignalId);
        if (!signal) {
          return { content: [{ type: 'text', text: `Signal #${fromSignalId} not found.` }] };
        }
        for (const id of signal.evidenceIds) ids.add(id);
      }
      if (ids.size === 0) {
        return {
          content: [
            { type: 'text', text: 'No evidence: pass fromSignalId and/or evidenceNoteIds.' },
          ],
        };
      }

      const inf = mintInference(client, {
        title,
        summary,
        confidence,
        modelId,
        evidence: [...ids].map((noteId) => ({ noteId })),
        fromSignalId,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Minted inference #${inf.id} "${inf.title}" from ${ids.size} source note(s).`,
          },
        ],
      };
    },
  );
};
