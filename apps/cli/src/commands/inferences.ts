import {
  getInference,
  type InferenceStatus,
  listInferences,
  openDb,
  refreshInferenceStaleness,
  setInferenceStatus,
} from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';

export const registerInferences = (program: Command) => {
  const inferences = program
    .command('inferences')
    .description('List LLM-synthesized inferences (hypotheses derived from notes)')
    .option('-s, --status <status>', 'Filter by status (active|stale|archived)')
    .option('--no-refresh', 'Skip the staleness re-check')
    .action((opts: { status?: InferenceStatus; refresh: boolean }) => {
      const client = openDb(CONFIG_DIR);

      if (opts.refresh) refreshInferenceStaleness(client);

      const list = listInferences(client, { status: opts.status });
      if (list.length === 0) {
        console.log(pc.dim('No inferences yet. Mint one: memex signals → memex mint <id>'));
        return;
      }

      console.log();
      for (const inf of list) {
        const badge =
          inf.status === 'stale'
            ? pc.red('[!] STALE')
            : inf.status === 'archived'
              ? pc.dim('[archived]')
              : pc.green('[active]');
        const conf = inf.confidence !== null ? pc.dim(` ${Math.round(inf.confidence * 100)}%`) : '';
        console.log(`${pc.bold(`#${inf.id}`)} ${badge}${conf} ${inf.title}`);
        console.log(`  ${inf.summary}`);

        const found = getInference(client, inf.id);
        if (found) {
          const ev = found.evidence
            .map((e) => {
              const mark = e.missing ? pc.red('✗') : e.changed ? pc.yellow('~') : pc.dim('·');
              return `${mark}${pc.dim(`#${e.noteId}`)} ${e.title ?? pc.red('(deleted)')}`;
            })
            .join('\n    ');
          console.log(`    ${ev}`);
          if (inf.modelId) console.log(pc.dim(`    via ${inf.modelId}`));
          if (inf.promptText) {
            console.log(pc.dim(`    mint-time evidence snapshot: ${inf.promptText.length} chars`));
          }
        }
        console.log();
      }
    });

  inferences
    .command('archive <id>')
    .description('Archive an inference (kept for provenance, excluded from staleness)')
    .action((id: string) => {
      const client = openDb(CONFIG_DIR);
      const updated = setInferenceStatus(client, Number(id), 'archived');
      if (!updated) {
        console.error(pc.red(`Inference #${id} not found.`));
        process.exit(1);
      }
      console.log(`${pc.green('✓')} inference #${id} → archived`);
    });
};
