import {
  getNote,
  listSignals,
  openDb,
  refreshSignals,
  type Signal,
  type SignalStatus,
  type SignalType,
  setSignalStatus,
} from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { guardEmbeddingModel } from '../services/embedding-guard.ts';
import { registerMint } from './mint.ts';

const TYPE_LABEL: Record<SignalType, (s: string) => string> = {
  hidden_arc: pc.magenta,
  stale_state: pc.yellow,
  dangling_link: pc.cyan,
  tag_burst: pc.green,
};

const num = (v: string | undefined): number | undefined =>
  v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined;

// Detector thresholds are tunable via env (mirrors MEMEX_FLASHBACK_*).
const detectorOptions = () => ({
  arc: {
    knnDistance: num(process.env.MEMEX_ARC_DIST),
    minMembers: num(process.env.MEMEX_ARC_MIN_MEMBERS),
    maxMembers: num(process.env.MEMEX_ARC_MAX_MEMBERS),
    minSpanDays: num(process.env.MEMEX_ARC_MIN_SPAN_DAYS),
  },
  stale: {
    maxDistance: num(process.env.MEMEX_STALE_DIST),
    minNewer: num(process.env.MEMEX_STALE_MIN_NEWER),
  },
  burst: {
    dormantDays: num(process.env.MEMEX_BURST_DORMANT_DAYS),
    minBurst: num(process.env.MEMEX_BURST_MIN),
  },
});

const TYPE_ORDER: SignalType[] = ['hidden_arc', 'stale_state', 'tag_burst', 'dangling_link'];

const printSignal = (client: ReturnType<typeof openDb>, s: Signal) => {
  const label = TYPE_LABEL[s.type](`[${s.type}]`);
  console.log(`${pc.bold(`#${s.id}`)} ${label}`);
  if (s.reasoning) console.log(`  ${s.reasoning}`);
  const evidence = s.evidenceIds
    .slice(0, 8)
    .map((id) => {
      const note = getNote(client, id);
      return note ? `${pc.dim(`#${id}`)} ${note.title}` : pc.dim(`#${id}`);
    })
    .join('\n    ');
  if (evidence) console.log(`    ${evidence}`);
  if (s.evidenceIds.length > 8) console.log(pc.dim(`    … +${s.evidenceIds.length - 8} more`));
  console.log();
};

export const registerSignals = (program: Command) => {
  const signals = program
    .command('signals')
    .description('Surface un-synthesized patterns in the corpus (deterministic, no LLM)')
    .option('-s, --status <status>', 'Filter by status (new|snoozed|dismissed|minted)', 'new')
    .option('-t, --type <type>', 'Filter by type (hidden_arc|stale_state|tag_burst|dangling_link)')
    .option('--no-refresh', 'Skip detection; just list stored signals')
    .option('--rescan', 'Re-run detection even if no note changed since last time')
    .action((opts: { status: string; type?: SignalType; refresh: boolean; rescan?: boolean }) => {
      const client = openDb(CONFIG_DIR);
      guardEmbeddingModel(client);

      if (opts.refresh) refreshSignals(client, { ...detectorOptions(), force: opts.rescan });

      const found = listSignals(client, {
        status: opts.status as SignalStatus,
        type: opts.type,
      });

      if (found.length === 0) {
        console.log(pc.dim(`No ${opts.status} signals.`));
        return;
      }

      const byType = new Map<SignalType, Signal[]>();
      for (const s of found) byType.set(s.type, [...(byType.get(s.type) ?? []), s]);

      console.log();
      console.log(pc.bold(`Signals — ${found.length} ${opts.status}`));
      console.log(pc.dim('triage: memex signals dismiss <id> | snooze <id>'));
      console.log();

      for (const type of TYPE_ORDER) {
        const list = byType.get(type);
        if (!list || list.length === 0) continue;
        for (const s of list) printSignal(client, s);
      }
    });

  const triage = (id: string, status: SignalStatus) => {
    const client = openDb(CONFIG_DIR);
    const updated = setSignalStatus(client, Number(id), status);
    if (!updated) {
      console.error(pc.red(`Signal #${id} not found.`));
      process.exit(1);
    }
    console.log(`${pc.green('✓')} signal #${id} → ${pc.bold(status)}`);
  };

  signals
    .command('dismiss <id>')
    .description('Dismiss a signal (will not resurface)')
    .action((id: string) => triage(id, 'dismissed'));

  signals
    .command('snooze <id>')
    .description('Snooze a signal')
    .action((id: string) => triage(id, 'snoozed'));

  registerMint(signals);
};
