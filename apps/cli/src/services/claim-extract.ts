import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { NoteShapeKind } from '@memex/db';

const run = promisify(execFile);

export const CLAIM_MODEL = 'sonnet';
const MAX_NOTE_CHARS = 8000;

export type ClaimSource = { id: number; title: string; body: string };

export type Extraction =
  | { kind: NoteShapeKind; claims: string[]; durationMs: number }
  | { error: string; code?: 'no-claude' };

export const isExtractionError = (result: Extraction): result is { error: string } =>
  'error' in result;

const clip = (text: string) =>
  text.length <= MAX_NOTE_CHARS ? text : `${text.slice(0, MAX_NOTE_CHARS)}\n\n[...]`;

const buildPrompt = (note: ClaimSource) =>
  `Below is a "state" note from a personal second brain: a note recording positions its author currently holds, written mostly in Korean.

Some of these notes argue a position. Others are indexes — a roster of pointers to other notes, a changelog, a status board — which assert nothing of their own and cannot sensibly be asked "what is this built on?".

Decide which this note is, then, if it argues a position, list the distinct claims it makes that someone could ask for evidence for.

Rules:
- A claim is one assertion the author would have to defend. Not a heading, not a task, not a pointer to another note.
- Write each claim as one sentence in the note's own language.
- List the load-bearing claims only. If you find yourself past 5, this note is almost certainly an index.
- Output raw JSON only, no code fence:
  {"kind":"position","claims":["...","..."]}
  or
  {"kind":"index","claims":[]}

=== NOTE #${note.id}: ${note.title} ===
${clip(note.body)}`;

export const parseExtraction = (raw: string): { kind: NoteShapeKind; claims: string[] } | null => {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { kind?: unknown; claims?: unknown };
    if (parsed.kind !== 'position' && parsed.kind !== 'index') return null;
    if (!Array.isArray(parsed.claims)) return null;
    const claims = parsed.claims.filter((c): c is string => typeof c === 'string' && c.length > 0);
    return { kind: parsed.kind, claims };
  } catch {
    return null;
  }
};

// Headless, with its MCP servers stripped, so reading a note to describe it can
// never write back into the vault it is reading.
export const extractClaims = async (note: ClaimSource): Promise<Extraction> => {
  try {
    const { stdout } = await run(
      'claude',
      [
        '-p',
        buildPrompt(note),
        '--model',
        CLAIM_MODEL,
        '--output-format',
        'json',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const envelope = JSON.parse(stdout) as {
      is_error?: boolean;
      result?: string;
      duration_ms?: number;
    };
    if (envelope.is_error || !envelope.result) {
      return { error: envelope.result ?? 'Claude reported an error' };
    }
    const parsed = parseExtraction(envelope.result);
    return parsed
      ? { ...parsed, durationMs: envelope.duration_ms ?? 0 }
      : { error: 'Claude did not answer in the requested shape' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('ENOENT') ? { error: message, code: 'no-claude' } : { error: message };
  }
};
