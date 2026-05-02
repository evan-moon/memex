#!/usr/bin/env node
import { Command } from 'commander';
import { registerAdd } from './commands/add.ts';
import { registerSearch } from './commands/search.ts';
import { registerList } from './commands/list.ts';
import { registerShow } from './commands/show.ts';
import { registerDelete } from './commands/delete.ts';
import { registerEdit } from './commands/edit.ts';
import { registerConfig } from './commands/config.ts';
import { registerSource } from './commands/source.ts';
import { registerIndex } from './commands/index.ts';
import { registerReembed } from './commands/reembed.ts';
import { registerTags } from './commands/tags.ts';
import { registerRelated } from './commands/related.ts';
import { registerMcp } from './commands/mcp.ts';

const program = new Command();

program
  .name('memex')
  .description('Local-first second brain with semantic search')
  .version('0.1.0');

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

program.parse();
