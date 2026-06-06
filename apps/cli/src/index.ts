#!/usr/bin/env node
import { Command } from 'commander';
import { registerAdd } from './commands/add.ts';
import { registerClassify } from './commands/classify.ts';
import { registerConfig } from './commands/config.ts';
import { registerDelete } from './commands/delete.ts';
import { registerDigest } from './commands/digest.ts';
import { registerEdit } from './commands/edit.ts';
import { registerIndex } from './commands/index.ts';
import { registerInferences } from './commands/inferences.ts';
import { registerList } from './commands/list.ts';
import { registerMcp } from './commands/mcp.ts';
import { registerMint } from './commands/mint.ts';
import { registerReembed } from './commands/reembed.ts';
import { registerRelated } from './commands/related.ts';
import { registerRelayer } from './commands/relayer.ts';
import { registerSearch } from './commands/search.ts';
import { registerShow } from './commands/show.ts';
import { registerSignals } from './commands/signals.ts';
import { registerSource } from './commands/source.ts';
import { registerTags } from './commands/tags.ts';

const program = new Command();

program.name('memex').description('Local-first second brain with semantic search').version('0.1.0');

registerAdd(program);
registerSearch(program);
registerList(program);
registerShow(program);
registerDelete(program);
registerEdit(program);
registerConfig(program);
registerSource(program);
registerIndex(program);
registerReembed(program);
registerTags(program);
registerRelated(program);
registerMcp(program);
registerDigest(program);
registerClassify(program);
registerRelayer(program);
registerSignals(program);
registerMint(program);
registerInferences(program);

program.parse();
