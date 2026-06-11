#!/usr/bin/env node
import { Command } from 'commander';
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
import { registerReembed } from './commands/reembed.ts';
import { registerRelated } from './commands/related.ts';
import { registerSchedule } from './commands/schedule.ts';
import { registerSearch } from './commands/search.ts';
import { registerShow } from './commands/show.ts';
import { registerSignals } from './commands/signals.ts';
import { registerSource } from './commands/source.ts';
import { registerStats } from './commands/stats.ts';
import { registerTags } from './commands/tags.ts';

const program = new Command();

program.name('memex').description('Local-first second brain with semantic search').version('0.1.0');

registerMcp(program);
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
registerSchedule(program);

program.parse();
