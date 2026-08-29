import { openDb } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';
import { evaluateFlashback } from '../services/flashback-eval.ts';

const POOLS = [15, 50, 100, 250, 500];
const CAPS = [0.4, 0.45, 0.5, 0.55, 0.6];
const SAMPLE = 60;

const pct = (part: number, whole: number): string =>
  whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;

const numbers = (value: string, width: number) => value.padStart(width);

export const registerFlashbackEval = (stats: Command) => {
  stats
    .command('flashback')
    .description('Tune rediscovery thresholds against the links you made by hand')
    .option('--gap <days>', 'Minimum days between two notes to count as a rediscovery', '90')
    .option('--sample <n>', 'Notes to measure candidate noise against', String(SAMPLE))
    .action((opts: { gap: string; sample: string }) => {
      const client = openDb(CONFIG_DIR);
      guardEmbeddingModel(client);

      const report = evaluateFlashback(client, {
        minDaysGap: Number(opts.gap),
        pools: POOLS,
        caps: CAPS,
        sample: Number(opts.sample),
      });

      console.log();
      console.log(pc.bold('Labels — wiki links you wrote by hand'));
      console.log(
        pc.dim(
          `  ${report.links.total} links · ${report.links.backward} point backwards in time · ` +
            `${report.links.shaped} are ${report.minDaysGap}+ days apart and cross-folder`,
        ),
      );

      console.log();
      console.log(pc.bold('Pool — does the vector neighbourhood even contain the linked note?'));
      console.log(pc.dim('   pool    recall'));
      for (const row of report.pools) {
        console.log(
          `  ${numbers(String(row.pool), 5)}    ${numbers(pct(row.found, row.total), 5)}  ` +
            pc.dim(`${row.found}/${row.total}`),
        );
      }

      console.log();
      console.log(pc.bold('Cap — recall against your links, and how much noise it lets through'));
      console.log(pc.dim('    cap   hit@3          notes with a candidate   median candidates'));
      for (const row of report.caps) {
        console.log(
          `  ${numbers(row.cap.toFixed(2), 5)}   ${numbers(pct(row.hits, row.total), 4)} ` +
            `${pc.dim(`(${row.hits}/${row.total})`)}        ` +
            `${numbers(pct(row.withCandidate, row.sampled), 4)}              ` +
            `${numbers(String(row.medianCandidates), 4)}`,
        );
      }
      console.log();
    });
};
