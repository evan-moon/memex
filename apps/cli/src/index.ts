#!/usr/bin/env node
import { Command } from 'commander';
import { registerAdd } from './commands/add.ts';
import { registerSearch } from './commands/search.ts';
import { registerList } from './commands/list.ts';
import { registerShow } from './commands/show.ts';
import { registerDelete } from './commands/delete.ts';
import { registerConfig } from './commands/config.ts';
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
registerConfig(program);
registerMcp(program);

program.parse();
