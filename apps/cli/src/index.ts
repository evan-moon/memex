#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('memex')
  .description('Local-first second brain with semantic search')
  .version('0.1.0');

program.parse();
