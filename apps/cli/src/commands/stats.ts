import { type CountByKey, getCorpusStats, openDb } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';

const printCounts = (label: string, counts: CountByKey[]) => {
  if (counts.length === 0) return;
  const line = counts.map((c) => `${c.key} ${pc.bold(String(c.count))}`).join(pc.dim(' · '));
  console.log(`${pc.dim(label.padEnd(12))} ${line}`);
};

export const registerStats = (program: Command) => {
  program
    .command('stats')
    .description('Corpus and flashback metrics — is cross-pollination being picked up?')
    .action(() => {
      const client = openDb(CONFIG_DIR);
      const stats = getCorpusStats(client);

      console.log();
      console.log(pc.bold(`Corpus — ${stats.notes} notes`));
      printCounts('layers', stats.notesByLayer);
      printCounts('sources', stats.notesBySource);
      printCounts('links', stats.linksBySource);
      printCounts('signals', stats.signalsByStatus);
      printCounts('inferences', stats.inferencesByStatus);

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
};
