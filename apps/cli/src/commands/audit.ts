import { openDb } from '@memex/db';
import { CONFIG_DIR, expandPath, loadConfig } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { type Audit, type AxisKey, buildAudit } from '../services/audit.ts';

const LABELS: Record<AxisKey, { name: string; sentence: (have: number, total: number) => string }> =
  {
    grounded: {
      name: 'grounded',
      sentence: (have, total) => `${have}/${total} judgements say where they came from`,
    },
    fresh: {
      name: 'fresh',
      sentence: (have, total) => `${have}/${total} judgements are still fresh`,
    },
    connected: {
      name: 'connected',
      sentence: (have, total) => `${have}/${total} links arrive somewhere`,
    },
    tidy: {
      name: 'tidy',
      sentence: (have, total) => `${have}/${total} tags earn their keep`,
    },
  };

const paint = (score: number) => {
  if (score >= 80) return pc.green;
  if (score >= 50) return pc.yellow;
  return pc.red;
};

const printAudit = (audit: Audit) => {
  console.log();
  console.log(
    `${pc.bold('Memory health')}  ${paint(audit.score)(pc.bold(String(audit.score)))}${pc.dim(' / 100')}`,
  );
  console.log();

  for (const axis of audit.axes) {
    const label = LABELS[axis.key];
    const lost = Math.round(axis.lost);
    const penalty = lost === 0 ? pc.green('  0') : pc.red(`-${lost}`.padStart(3));
    console.log(
      `${pc.dim(label.name.padEnd(11))} ${label.sentence(axis.have, axis.total).padEnd(46)} ${penalty}`,
    );
  }

  if (!audit.weakest || !audit.hint) {
    console.log();
    console.log(pc.dim('Nothing to repair. Your memory is saying where it came from.'));
    console.log();
    return;
  }

  const { hint } = audit;
  console.log();
  console.log(`${pc.bold('Weakest')} ${pc.dim('·')} ${LABELS[audit.weakest.key].name}`);
  const id = hint.id === null ? '' : `${pc.bold(`#${hint.id}`)} `;
  console.log(`  ${id}${hint.label}`);
  console.log(pc.dim(`  ${hint.detail}`));
  console.log();
};

export const registerAudit = (stats: Command) => {
  stats
    .command('audit')
    .description('Score how trustworthy the memory is right now — grounded, fresh, connected, tidy')
    .option('--json', 'Print the raw measurement instead of the card')
    .action(({ json }: { json?: boolean }) => {
      const client = openDb(CONFIG_DIR);
      const vaultPath = expandPath(loadConfig().vault_path);
      const audit = buildAudit(client, vaultPath);

      if (json) {
        console.log(JSON.stringify(audit, null, 2));
        return;
      }
      printAudit(audit);
    });
};
