#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { registerAdd } from './commands/add.ts';
import { registerCaptureCommit } from './commands/capture-commit.ts';
import { registerConfig } from './commands/config.ts';
import { registerDelete } from './commands/delete.ts';
import { registerDigest } from './commands/digest.ts';
import { registerEdit } from './commands/edit.ts';
import { registerIndex } from './commands/index.ts';
import { registerInferences } from './commands/inferences.ts';
import { registerLayer } from './commands/layer.ts';
import { registerList } from './commands/list.ts';
import { registerMcp } from './commands/mcp.ts';
import { registerRecall } from './commands/recall.ts';
import { registerReembed } from './commands/reembed.ts';
import { registerRelated } from './commands/related.ts';
import { registerSchedule } from './commands/schedule.ts';
import { registerSearch } from './commands/search.ts';
import { registerShow } from './commands/show.ts';
import { registerSignals } from './commands/signals.ts';
import { registerSource } from './commands/source.ts';
import { registerStats } from './commands/stats.ts';
import { registerTags } from './commands/tags.ts';
import { registerUi } from './commands/ui.ts';

declare const __MEMEX_VERSION__: string;
const VERSION = (() => {
  try {
    return __MEMEX_VERSION__;
  } catch {
    return '0.0.0-dev';
  }
})();

const program = new Command();

program.name('memex').description('Local-first second brain with semantic search').version(VERSION);

registerMcp(program);
registerRecall(program);
registerConfig(program);
registerAdd(program);
registerEdit(program);
registerDelete(program);
registerCaptureCommit(program);
registerSource(program);
registerIndex(program);
registerReembed(program);
registerSearch(program);
registerList(program);
registerShow(program);
registerRelated(program);
registerTags(program);
registerSignals(program);
registerInferences(program);
registerDigest(program);
registerLayer(program);
registerStats(program);
registerUi(program);
registerSchedule(program);

// memex is MCP-first: Claude drives search/save through the MCP server, and
// the CLI is the safety net. Help mirrors that hierarchy instead of dumping a
// flat command list.
const COMMAND_GROUPS: ReadonlyArray<{ title: string; names: ReadonlyArray<string> }> = [
  { title: 'Setup', names: ['mcp', 'recall', 'config'] },
  { title: 'Capture', names: ['add', 'edit', 'delete', 'capture-commit'] },
  { title: 'Vault', names: ['source', 'index', 'reembed'] },
  { title: 'Verify (read-only)', names: ['search', 'list', 'show', 'related', 'tags'] },
  { title: 'Insight engine', names: ['signals', 'inferences', 'digest', 'layer'] },
  { title: 'Maintenance', names: ['stats', 'schedule'] },
];

program.configureHelp({
  formatHelp: (cmd, helper) => {
    const commands = helper.visibleCommands(cmd).filter((c) => c.name() !== 'help');
    const byName = new Map(commands.map((c) => [c.name(), c]));
    const width = Math.max(
      ...commands.map((c) => helper.subcommandTerm(c).length),
      ...helper.visibleOptions(cmd).map((o) => helper.optionTerm(o).length),
    );
    const row = (term: string, description: string) => `  ${term.padEnd(width)}  ${description}`;

    const grouped = new Set(COMMAND_GROUPS.flatMap((g) => g.names));
    const sections = COMMAND_GROUPS.map((g) => {
      const rows = g.names
        .map((n) => byName.get(n))
        .filter((c): c is Command => c !== undefined)
        .map((c) => row(helper.subcommandTerm(c), helper.subcommandDescription(c)));
      return `${pc.bold(g.title)}\n${rows.join('\n')}`;
    });
    const rest = commands
      .filter((c) => !grouped.has(c.name()))
      .map((c) => row(helper.subcommandTerm(c), helper.subcommandDescription(c)));
    if (rest.length > 0) sections.push(`${pc.bold('Other')}\n${rest.join('\n')}`);

    const options = helper
      .visibleOptions(cmd)
      .map((o) => row(helper.optionTerm(o), helper.optionDescription(o)));

    return [
      `Usage: ${helper.commandUsage(cmd)}`,
      '',
      helper.commandDescription(cmd),
      pc.dim('Claude drives memex through MCP — the CLI is the safety net.'),
      '',
      sections.join('\n\n'),
      '',
      `${pc.bold('Options')}\n${options.join('\n')}`,
      '',
    ].join('\n');
  },
});

program.parse();
