import { type MemexClient, type RegisterScope, readRegister, setRegister } from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerBlock, scopeLabel } from '../services/register.ts';

const REJECTIONS: Record<string, string> = {
  'empty-subject': 'subject cannot be empty.',
  'empty-predicate': 'predicate cannot be empty.',
  'empty-value': 'value cannot be empty.',
  'invalid-scope':
    'A period scope needs period_start and period_end as YYYY-MM or YYYY-MM-DD, with start no later than end.',
};

export const registerSetRegister = (server: McpServer, client: MemexClient) => {
  server.tool(
    'set_register',
    'Record what is currently true about a subject as one value under one key, instead of writing another note that says it. Use this for a fact that gets replaced rather than accumulated — a price, a deadline, a headcount, a monthly figure, a current status. The value is addressed by (subject, predicate, scope), so you never need to know which note held the previous value: writing a new one supersedes it and the old value stays readable as history. Keep writing notes for anything narrative; this is only for a value that has one current answer.',
    {
      subject: z
        .string()
        .describe(
          'What the value is about — a project, person, company, or thing (e.g. "opula"). Case, spacing and hyphens do not matter; "Toss" and "toss" are the same subject.',
        ),
      predicate: z
        .string()
        .describe(
          'Which fact about that subject (e.g. "trial.duration", "pricing", "headcount"). Reuse the exact wording an earlier value used — a different word for the same idea starts a separate key that memex cannot merge on its own.',
        ),
      value: z
        .string()
        .describe('The value as it stands now, said as briefly as it can be (e.g. "14 days").'),
      scope: z
        .enum(['global', 'period'])
        .optional()
        .default('global')
        .describe(
          'global for a value that just holds until it changes. period for a value that belongs to a stretch of time — a monthly figure, a quarterly target — so a later month cannot overwrite an earlier one.',
        ),
      period_start: z
        .string()
        .optional()
        .describe('Required when scope is period. YYYY-MM or YYYY-MM-DD.'),
      period_end: z
        .string()
        .optional()
        .describe(
          'Required when scope is period. YYYY-MM or YYYY-MM-DD, no earlier than the start.',
        ),
      note_id: z
        .number()
        .int()
        .optional()
        .describe('The note this value came from, when there is one, so the app can show why.'),
    },
    async ({ subject, predicate, value, scope, period_start, period_end, note_id }) => {
      const asked: RegisterScope =
        scope === 'period'
          ? { kind: 'period', start: period_start ?? '', end: period_end ?? '' }
          : { kind: 'global' };

      const result = setRegister(client, {
        subject,
        predicate,
        value,
        scope: asked,
        author: 'agent',
        noteId: note_id,
      });

      if (!result.ok) {
        return {
          content: [{ type: 'text' as const, text: `Not recorded — ${REJECTIONS[result.reason]}` }],
          isError: true,
        };
      }

      const replaced =
        result.superseded.length > 0
          ? ` It replaces the value that was there (#${result.superseded.join(', #')}), which stays readable as history.`
          : '';

      const newKey =
        result.predicate.created && result.predicate.similar.length > 0
          ? `\n\n⚠️ "${result.predicate.label}" is a key memex has not seen before, and "${result.predicate.similar[0]}" already exists. If they mean the same thing, use that wording instead — memex will not merge them on its own, and the subject will read as having two separate answers.`
          : '';

      const now = readRegister(client, subject);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Recorded: ${subject} · ${result.predicate.label} (${scopeLabel(asked)}) = ${value.trim()}.${replaced}${newKey}\n\n${registerBlock(subject, now)}`,
          },
        ],
      };
    },
  );
};
