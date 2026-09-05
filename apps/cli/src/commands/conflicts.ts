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
import { CONFIG_DIR, formatDate, loadConfig } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { type ConflictSide, judgeConflict, type Verdict } from '../services/conflicts.ts';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';
import { asChoice } from '../services/llm.ts';

const PROMPT_VERSION = 'conflict-v1';
const JUDGE_MODEL = 'sonnet';

// The two answers that leave something to do, and what to call it.
const KEEP: Partial<Record<Verdict, { label: string; paint: (s: string) => string }>> = {
  contradiction: { label: '충돌', paint: pc.red },
  same: { label: '중복', paint: pc.yellow },
};

const forgetSignal = (client: ReturnType<typeof openDb>, hash: string) => {
  client.sqlite.prepare('DELETE FROM signals WHERE signal_hash = ?').run(hash);
};

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
    .option('--redo', 'Ask again about pairs that already have an answer')
    .action(
      async (opts: { limit: string; distance?: string; dryRun?: boolean; redo?: boolean }) => {
        const client = openDb(CONFIG_DIR);
        guardEmbeddingModel(client);

        const sweep = asChoice(loadConfig().models.sweep);

        const limit = Number(opts.limit);
        const pairs = detectConflictPairs(client, { maxDistance: num(opts.distance) });
        const fresh = opts.redo
          ? pairs
          : pairs.filter(
              (pair: SignalCandidate) =>
                getSignalByHash(client, computeSignalHash(pair)) === undefined,
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

        const found: { a: number; b: number; verdict: Verdict; why: string }[] = [];
        const tally = new Map<Verdict, number>();

        for (const [index, pair] of asking.entries()) {
          const [leftId, rightId] = pair.evidenceIds;
          const left = sideOf(client, leftId);
          const right = sideOf(client, rightId);
          if (!left || !right) continue;

          process.stdout.write(
            `${pc.dim(`[${index + 1}/${asking.length}]`)} #${left.id} × #${right.id} … `,
          );
          const judgement = await judgeConflict(left, right, sweep);

          if ('error' in judgement) {
            console.log(pc.red('failed'));
            console.error(
              judgement.code === 'no-claude'
                ? pc.red('claude CLI not found — Claude Code must be on PATH to judge pairs.')
                : pc.red(judgement.error),
            );
            process.exit(1);
          }

          tally.set(judgement.verdict, (tally.get(judgement.verdict) ?? 0) + 1);

          // Every answer closes the pair, including the innocent ones: a question
          // that stays open is a question that gets paid for again next run.
          if (opts.redo) forgetSignal(client, computeSignalHash(pair));
          const signal = upsertSignal(client, pair);

          // Two judgements that say the same thing are not a contradiction, but
          // they are not harmless either: whichever one is read first wins, and
          // nothing says the other exists. Only complement and unrelated are
          // answers with nothing left to do.
          const keep = KEEP[judgement.verdict];
          if (!keep) {
            setSignalStatus(client, signal.id, 'dismissed');
            console.log(pc.dim(judgement.verdict));
            continue;
          }

          mintInference(client, {
            title: `${keep.label}: "${left.title}" ↔ "${right.title}"`,
            summary: judgement.explanation,
            evidence: [{ noteId: left.id }, { noteId: right.id }],
            modelId: JUDGE_MODEL,
            promptVersion: PROMPT_VERSION,
            promptText: pair.reasoning,
            fromSignalId: signal.id,
          });
          setSignalStatus(client, signal.id, 'minted');
          found.push({
            a: left.id,
            b: right.id,
            verdict: judgement.verdict,
            why: judgement.explanation,
          });
          console.log(keep.paint(judgement.verdict));
        }

        console.log();
        const spread = [...tally.entries()]
          .map(([verdict, count]) => `${verdict} ${count}`)
          .join(' · ');
        console.log(pc.dim(spread));

        if (found.length === 0) {
          console.log(
            pc.green(`${asking.length} pairs asked, every one of them can stand as it is.`),
          );
        } else {
          console.log(pc.bold(`${found.length} to settle`));
          for (const hit of found) {
            console.log(
              `  ${KEEP[hit.verdict]?.paint(hit.verdict) ?? ''} ${pc.bold(`#${hit.a} × #${hit.b}`)}`,
            );
            console.log(pc.dim(`  ${hit.why}`));
          }
          console.log();
          console.log(pc.dim('Open them in `memex ui` to decide which one survives.'));
        }
        const left = fresh.length - asking.length;
        if (left > 0) console.log(pc.dim(`${left} pairs still unjudged — run again to continue.`));
        console.log();
      },
    );
};
