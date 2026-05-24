import type { Command } from 'commander';
import pc from 'picocolors';
import { openDb, getNote, type NoteLayer } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';

const LAYERS: ReadonlyArray<NoteLayer> = ['past', 'state', 'rule'];

export const registerRelayer = (program: Command) => {
  program
    .command('relayer <id> <layer>')
    .description('Re-classify a note into a different mutability layer (past|state|rule)')
    .action((idArg: string, layerArg: string) => {
      const id = Number(idArg);
      if (!Number.isInteger(id) || id <= 0) {
        console.error(pc.red(`Invalid id "${idArg}"`));
        process.exit(1);
      }

      const layer = layerArg as NoteLayer;
      if (!LAYERS.includes(layer)) {
        console.error(pc.red(`Invalid layer "${layerArg}". Expected one of: ${LAYERS.join(', ')}.`));
        process.exit(1);
      }

      const client = openDb(CONFIG_DIR);
      const note = getNote(client, id);
      if (!note) {
        console.error(pc.red(`Note #${id} not found.`));
        process.exit(1);
      }

      if (note.layer === layer) {
        console.log(pc.dim(`#${id} "${note.title}" already ${layer}`));
        return;
      }

      client.sqlite.prepare('UPDATE notes SET layer = ? WHERE id = ?').run(layer, id);
      console.log(`${pc.green('✓')} #${id} "${note.title}": ${pc.dim(note.layer)} → ${pc.bold(layer)}`);
    });
};
