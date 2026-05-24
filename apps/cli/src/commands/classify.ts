import type { Command } from 'commander';
import pc from 'picocolors';
import { openDb, type NoteLayer } from '@memex/db';
import { CONFIG_DIR } from '@memex/utils';
import { LAYER_ORDER, layerBadge, layerColor } from '../layer.ts';

export const registerClassify = (program: Command) => {
  program
    .command('classify')
    .description('Show note distribution across mutability layers')
    .action(() => {
      const client = openDb(CONFIG_DIR);
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
    });
};
