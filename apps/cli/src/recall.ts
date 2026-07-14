#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { CONFIG_DIR, MODEL_CACHE_DIR } from '@memex/utils';
import {
  formatRecallBlock,
  isDaemonAlive,
  isRecallablePrompt,
  requestRecall,
  spawnRecallDaemon,
  toRecallQuery,
} from './services/recall/client.ts';
import { startRecallDaemon } from './services/recall/daemon.ts';
import { recallSocketPath } from './services/recall/socket.ts';

const BIN_PATH = fileURLToPath(import.meta.url);

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const readPrompt = async () => {
  try {
    const payload = JSON.parse(await readStdin()) as { prompt?: string };
    return payload.prompt ?? '';
  } catch {
    return '';
  }
};

const serve = () => startRecallDaemon(CONFIG_DIR, MODEL_CACHE_DIR);

const warm = async () => {
  const alive = await isDaemonAlive(recallSocketPath(CONFIG_DIR));
  if (!alive) spawnRecallDaemon(BIN_PATH);
};

const recall = async () => {
  const prompt = await readPrompt();
  if (!isRecallablePrompt(prompt)) return;

  const socketPath = recallSocketPath(CONFIG_DIR);
  const hits = await requestRecall(socketPath, toRecallQuery(prompt)).catch(() => {
    spawnRecallDaemon(BIN_PATH);
    return [];
  });

  if (hits.length > 0) console.log(formatRecallBlock(hits));
};

const runByMode: Record<string, () => Promise<void> | void> = {
  '--serve': serve,
  '--warm': warm,
};

await (runByMode[process.argv[2]] ?? recall)();
