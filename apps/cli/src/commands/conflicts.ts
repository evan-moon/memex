import {
  computeSignalHash,
  detectConflictPairs,
  getNote,
  getSignalByHash,
  mintInference,
  openDb,
  type SignalCandidate,
  setSignalStatus,
  upsertSignal,
} from '@memex/db';
import { CONFIG_DIR, formatDate } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { type ConflictSide, judgeConflict } from '../services/conflicts.ts';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';

const PROMPT_VERSION = 'conflict-v1';
const JUDGE_MODEL = 'sonnet';

const sideOf = (client: ReturnType<typeof openDb>, id: number): ConflictSide | null => {
  const note = getNote(client, id);
  if (!note) return null;
  return {
    id: note.id,
    title: note.title,
    body: note.content,
    at: formatDate(new Date(note.authoredAt ?? note.createdAt)),
  };
};

const num = (value: string | undefined) =>
  value !== undefined && !Number.isNaN(Number(value)) ? Number(value) : undefined;

export const registerConflicts = (signals: Command) => {
  signals
    .command('conflicts')
    .description('Ask whether two judgements that sit close together actually disagree')
    .option('--limit <n>', 'How many unjudged pairs to ask about', '10')
    .option('--distance <n>', 'How close two judgements must sit to be nominated')
    .option('--dry-run', 'List the pairs that would be judged, and stop')
    .action(async (opts: { limit: string; distance?: string; dryRun?: boolean }) => {
      const client = openDb(CONFIG_DIR);
      guardEmbeddingModel(client);

      const limit = Number(opts.limit);
      const pairs = detectConflictPairs(client, { maxDistance: num(opts.distance) });
      const fresh = pairs.filter(
        (pair: SignalCandidate) => getSignalByHash(client, computeSignalHash(pair)) === undefined,
      );

      console.log();
      console.log(
        `${pc.bold(`${pairs.length} pairs sit close enough to ask about`)}${pc.dim(
          ` · ${pairs.length - fresh.length} already judged`,
        )}`,
      );

      if (fresh.length === 0) {
        console.log(pc.dim('Nothing new to ask. Every nominated pair has an answer.'));
        console.log();
        return;
      }

      const asking = fresh.slice(0, limit);
      if (opts.dryRun) {
        for (const pair of asking) console.log(`  ${pc.dim(pair.reasoning)}`);
        console.log();
        console.log(pc.dim(`${fresh.length} unjudged · showing ${asking.length}`));
        console.log();
        return;
      }

      const found: { a: number; b: number; why: string }[] = [];

      for (const [index, pair] of asking.entries()) {
        const [leftId, rightId] = pair.evidenceIds;
        const left = sideOf(client, leftId);
        const right = sideOf(client, rightId);
        if (!left || !right) continue;

        process.stdout.write(
          `${pc.dim(`[${index + 1}/${asking.length}]`)} #${left.id} × #${right.id} … `,
        );
        const judgement = await judgeConflict(left, right);

        if ('error' in judgement) {
          console.log(pc.red('failed'));
          console.error(
            judgement.code === 'no-claude'
              ? pc.red('claude CLI not found — Claude Code must be on PATH to judge pairs.')
              : pc.red(judgement.error),
          );
          process.exit(1);
        }

        // Every answer closes the pair, including the innocent ones: a question
        // that stays open is a question that gets paid for again next run.
        const signal = upsertSignal(client, pair);
        if (judgement.verdict !== 'contradiction') {
          setSignalStatus(client, signal.id, 'dismissed');
          console.log(pc.dim(judgement.verdict));
          continue;
        }

        mintInference(client, {
          title: `충돌: "${left.title}" ↔ "${right.title}"`,
          summary: judgement.explanation,
          evidence: [{ noteId: left.id }, { noteId: right.id }],
          modelId: JUDGE_MODEL,
          promptVersion: PROMPT_VERSION,
          promptText: pair.reasoning,
          fromSignalId: signal.id,
        });
        setSignalStatus(client, signal.id, 'minted');
        found.push({ a: left.id, b: right.id, why: judgement.explanation });
        console.log(pc.red('contradiction'));
      }

      console.log();
      if (found.length === 0) {
        console.log(pc.green(`${asking.length} pairs asked, none of them disagree.`));
      } else {
        console.log(pc.bold(`${found.length} contradictions to settle`));
        for (const hit of found) {
          console.log(`  ${pc.bold(`#${hit.a} × #${hit.b}`)}`);
          console.log(pc.dim(`  ${hit.why}`));
        }
        console.log();
        console.log(pc.dim('Open them in `memex ui` to decide which one survives.'));
      }
      const left = fresh.length - asking.length;
      if (left > 0) console.log(pc.dim(`${left} pairs still unjudged — run again to continue.`));
      console.log();
    });
};
