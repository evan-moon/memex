import { inVault } from '@memex/utils';
import type { MemexClient } from './client.ts';

export const syncExternalLayer = (client: MemexClient, vaultPath: string): { external: number } => {
  const rows = client.sqlite
    .prepare("SELECT id, file_path FROM notes WHERE layer <> 'external'")
    .all() as { id: number; file_path: string }[];

  const borrowed = rows.filter((row) => !inVault(row.file_path, vaultPath));
  const mark = client.sqlite.prepare("UPDATE notes SET layer = 'external' WHERE id = ?");
  client.sqlite.transaction(() => {
    for (const row of borrowed) mark.run(row.id);
  })();

  return { external: borrowed.length };
};
