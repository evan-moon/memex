import {
  buildEvidenceBundle,
  getNote,
  getSignal,
  mintInference,
  openDb,
  parseTags,
  type Signal,
} from '@memex/db';
import { CONFIG_DIR, formatDate } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';

// Assemble the evidence bundle + a synthesis prompt for a signal. memex never
// calls an LLM itself (core principle): the agent reads this, synthesizes, then
// persists via `memex signals mint <id> --title ... --summary ...`.
const printBundle = (client: ReturnType<typeof openDb>, signal: Signal) => {
  console.log();
  console.log(pc.bold(`Signal #${signal.id} [${signal.type}]`));
  if (signal.reasoning) console.log(pc.dim(signal.reasoning));
  console.log();
  console.log(pc.bold('Evidence notes:'));
  for (const id of signal.evidenceIds) {
    const note = getNote(client, id);
    if (!note) continue;
    const date = formatDate(new Date(note.authoredAt ?? note.createdAt));
    const tags = parseTags(note.tags);
    console.log(`\n${pc.cyan(`#${note.id}`)} ${pc.bold(note.title)} ${pc.dim(date)}`);
    if (tags.length) console.log(pc.dim(`  tags: ${tags.join(', ')}`));
    console.log(note.content.trim());
  }
  console.log();
  console.log(pc.bold('— Synthesis task —'));
  console.log(
    'Read the evidence above and write ONE inference: a non-obvious claim that\n' +
      'holds across these notes but is stated in none of them. Then persist it:\n',
  );
  console.log(
    pc.green(
      `  memex signals mint ${signal.id} \\\n` +
        `    --title "<short title>" \\\n` +
        `    --summary "<the inference + why the evidence supports it>" \\\n` +
        `    --confidence 0.7 --model <model-id>`,
    ),
  );
  console.log();
};

export const registerMint = (signals: Command) => {
  signals
    .command('mint <signalId>')
    .description('Assemble a signal for synthesis, or persist a synthesized inference')
    .option('--title <title>', 'Inference title (persists the inference)')
    .option('--summary <summary>', 'The synthesized inference text')
    .option('--confidence <n>', 'Confidence 0..1')
    .option('--model <id>', 'Model id that produced the synthesis')
    .option('--prompt-version <v>', 'Prompt template version/hash')
    .action(
      (
        signalIdArg: string,
        opts: {
          title?: string;
          summary?: string;
          confidence?: string;
          model?: string;
          promptVersion?: string;
        },
      ) => {
        const client = openDb(CONFIG_DIR);
        const signalId = Number(signalIdArg);
        const signal = getSignal(client, signalId);
        if (!signal) {
          console.error(pc.red(`Signal #${signalIdArg} not found.`));
          process.exit(1);
        }

        // Read-only mode: assemble the bundle for the agent to synthesize.
        if (!opts.title || !opts.summary) {
          if (opts.title || opts.summary) {
            console.error(pc.red('Both --title and --summary are required to persist.'));
            process.exit(1);
          }
          printBundle(client, signal);
          return;
        }

        // Persist mode.
        const confidence = opts.confidence !== undefined ? Number(opts.confidence) : undefined;
        if (
          confidence !== undefined &&
          (Number.isNaN(confidence) || confidence < 0 || confidence > 1)
        ) {
          console.error(pc.red('--confidence must be a number in [0, 1].'));
          process.exit(1);
        }

        const inf = mintInference(client, {
          title: opts.title,
          summary: opts.summary,
          confidence,
          modelId: opts.model,
          promptVersion: opts.promptVersion,
          // Snapshot the exact bundle the agent synthesized from, so the
          // inference stays explainable after its source notes drift.
          promptText: buildEvidenceBundle(client, {
            evidenceIds: signal.evidenceIds,
            reasoning: signal.reasoning,
          }),
          evidence: signal.evidenceIds.map((noteId) => ({ noteId })),
          fromSignalId: signal.id,
        });

        console.log(
          `${pc.green('✓')} minted inference ${pc.bold(`#${inf.id}`)} "${inf.title}" ` +
            `from signal #${signal.id} (${signal.evidenceIds.length} sources)`,
        );
      },
    );
};
