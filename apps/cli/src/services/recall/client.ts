import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { RECALL_PING, type RecallHit } from './socket.ts';

const REQUEST_TIMEOUT_MS = 10_000;
const MIN_PROMPT_LENGTH = 12;
const MAX_QUERY_LENGTH = 300;
const SKIPPED_PREFIXES = [
  '/',
  '!',
  '<task-notification>',
  '<system-reminder>',
  'Your claude.ai usage limit',
];
const MACHINE_PHRASES = ['a personal second brain', 'look after their second brain'];

export const toRecallQuery = (prompt: string) => prompt.slice(0, MAX_QUERY_LENGTH).trim();

export const isRecallablePrompt = (prompt: string) => {
  const query = toRecallQuery(prompt);
  if (query.length < MIN_PROMPT_LENGTH) return false;
  if (SKIPPED_PREFIXES.some((prefix) => query.startsWith(prefix))) return false;
  return !MACHINE_PHRASES.some((phrase) => query.includes(phrase));
};

export const formatRecallBlock = (hits: ReadonlyArray<RecallHit>) => {
  const lines = hits.map((hit) => `[${hit.id}] [${hit.layer}] ${hit.title}`).join('\n');
  return [
    '<memex-recall>',
    "Semantic hits from the user's second brain (memex) for this prompt. Titles only — call mcp__memex__get_note with the id for full content, or mcp__memex__search_notes to refine. Ignore if irrelevant.",
    lines,
    '</memex-recall>',
  ].join('\n');
};

export const isDaemonAlive = (socketPath: string) =>
  new Promise<boolean>((resolve) => {
    const probe = createConnection(socketPath)
      .on('connect', () => {
        probe.end(RECALL_PING);
        probe.unref();
        resolve(true);
      })
      .on('data', () => probe.destroy())
      .on('error', () => resolve(false));
  });

export const requestRecall = (socketPath: string, query: string) =>
  new Promise<RecallHit[]>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection(socketPath)
      .setTimeout(REQUEST_TIMEOUT_MS)
      .on('connect', () => socket.end(query))
      .on('data', (chunk) => chunks.push(chunk))
      .on('timeout', () => {
        socket.destroy();
        reject(new Error('recall timed out'));
      })
      .on('error', reject)
      .on('close', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as RecallHit[]);
        } catch {
          resolve([]);
        }
      });
  });

export const spawnRecallDaemon = (binPath: string) => {
  spawn(process.execPath, [binPath, '--serve'], {
    detached: true,
    stdio: 'ignore',
  }).unref();
};
