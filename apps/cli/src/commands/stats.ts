import { type CountByKey, getCorpusStats, type LabelEvidence, openDb } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { registerAudit } from './audit.ts';
import { registerEval } from './eval.ts';
import { registerFlashbackEval } from './flashback-eval.ts';

const printCounts = (label: string, counts: CountByKey[]) => {
  if (counts.length === 0) return;
  const line = counts.map((c) => `${c.key} ${pc.bold(String(c.count))}`).join(pc.dim(' · '));
  console.log(`${pc.dim(label.padEnd(12))} ${line}`);
};

const pct = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;

// Whether the rules lost evidence when they moved into code, read as a
// comparison rather than a number: an absolute percentage moves whenever the
// corpus does, and says nothing about the rules.
const printLabels = (labels: LabelEvidence) => {
  if (labels.labelled === 0) return;
  const declared = labels.declared > 0 ? pc.dim(` · ${labels.declared} declared at save time`) : '';
  console.log(
    `${pc.dim('types'.padEnd(12))} ${labels.labelled} labelled · strong evidence ${pc.bold(
      `${labels.strong}`,
    )} ${pc.dim(`(${pct(labels.strong, labels.labelled)})`)}${declared}`,
  );

  const against = labels.againstBaseline;
  if (!against) return;
  const held = against.nowStrong >= against.thenStrong;
  const verdict = held ? pc.green('holds') : pc.red('lost ground');
  console.log(
    `${pc.dim('vs baseline'.padEnd(12))} ${pct(against.nowStrong, against.shared)} now vs ${pct(
      against.thenStrong,
      against.shared,
    )} then ${verdict} ${pc.dim(`(${against.shared} notes both passes labelled)`)}`,
  );
};

export const registerStats = (program: Command) => {
  const stats = program
    .command('stats')
    .description('Corpus and flashback metrics — is cross-pollination being picked up?')
    .action(() => {
      const client = openDb(CONFIG_DIR);
      const stats = getCorpusStats(client);

      console.log();
      const unchunked =
        stats.notesWithoutChunks > 0
          ? pc.yellow(` · ${stats.notesWithoutChunks} unchunked (run \`memex reembed\`)`)
          : '';
      console.log(
        pc.bold(`Corpus — ${stats.notes} notes`) + pc.dim(` · ${stats.chunks} chunks`) + unchunked,
      );
      printCounts('layers', stats.notesByLayer);
      printCounts('sources', stats.notesBySource);
      printCounts('links', stats.linksBySource);
      printCounts('signals', stats.signalsByStatus);
      printCounts('inferences', stats.inferencesByStatus);
      printLabels(stats.labels);

      console.log();
      console.log(pc.bold('Flashback'));
      const fb = stats.flashback;
      if (fb.total === 0) {
        console.log(pc.dim('No flashback links yet — save or search to start cross-pollinating.'));
        console.log();
        return;
      }
      const rate = fb.adoptionRate === null ? '-' : `${Math.round(fb.adoptionRate * 100)}%`;
      console.log(
        `${pc.dim('adoption'.padEnd(12))} ${pc.bold(rate)} ${pc.dim(
          `(${fb.adopted}/${fb.total} resurfaced pairs later cited as a wiki link)`,
        )}`,
      );
      if (fb.topResurfaced.length > 0) {
        console.log(pc.dim('most resurfaced:'));
        for (const n of fb.topResurfaced) {
          console.log(`  ${pc.bold(`#${n.id}`)} ${n.title} ${pc.dim(`×${n.count}`)}`);
        }
      }
      console.log();
    });

  registerAudit(stats);
  registerEval(stats);
  registerFlashbackEval(stats);
};
