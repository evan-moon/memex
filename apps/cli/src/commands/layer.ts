import { getNote, type NoteLayer, openDb } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import type { Command } from 'commander';
import pc from 'picocolors';
import { LAYER_ORDER, layerBadge, layerColor } from '../layer.ts';

const LAYERS: ReadonlyArray<NoteLayer> = ['past', 'state', 'rule'];

const printDistribution = (client: ReturnType<typeof openDb>) => {
  const rows = client.sqlite
    .prepare('SELECT layer, COUNT(*) as count FROM notes GROUP BY layer')
    .all() as { layer: NoteLayer; count: number }[];

  const counts = new Map<NoteLayer, number>(rows.map((r) => [r.layer, r.count]));
  const widest = String(Math.max(0, ...counts.values())).length;

  for (const layer of LAYER_ORDER) {
    const count = counts.get(layer) ?? 0;
    const num = String(count).padStart(widest);
    const word = layerColor(layer)(layer.padEnd(6));
    console.log(`${word} ${pc.dim(num)}  ${layerBadge(layer)}`);
  }
};

const moveLayer = (client: ReturnType<typeof openDb>, idArg: string, layerArg: string) => {
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

  const note = getNote(client, id);
  if (!note) {
    console.error(pc.red(`Note #${id} not found.`));
    process.exit(1);
  }

  if (note.layer === layer) {
    console.log(pc.dim(`#${id} "${note.title}" already ${layer}`));
    return;
  }

  // Reaching this command means a person decided. A rule they named is approved
  // by the act of naming it; anything leaving `rule` stops having a status.
  client.sqlite
    .prepare('UPDATE notes SET layer = ?, rule_status = ? WHERE id = ?')
    .run(layer, layer === 'rule' ? 'canonical' : null, id);
  console.log(`${pc.green('✓')} #${id} "${note.title}": ${pc.dim(note.layer)} → ${pc.bold(layer)}`);
};

export const registerLayer = (program: Command) => {
  program
    .command('layer [id] [layer]')
    .description('Show the layer distribution, or move a note: memex layer <id> <past|state|rule>')
    .action((idArg?: string, layerArg?: string) => {
      const client = openDb(CONFIG_DIR);

      if (idArg === undefined) {
        printDistribution(client);
        return;
      }
      if (layerArg === undefined) {
        console.error(pc.red('Usage: memex layer <id> <past|state|rule>'));
        process.exit(1);
      }
      moveLayer(client, idArg, layerArg);
    });
};
