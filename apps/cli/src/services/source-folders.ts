import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deleteNote,
  listNotesByPathPrefix,
  type MemexClient,
  resyncNoteFacets,
  syncExternalLayer,
} from '@memex/db';
import { expandPath, loadConfig, type MemexConfig, saveConfig } from '@memex/utils';
import { type IndexStats, indexDirectory } from './indexer.ts';
import { isCoveredByAny } from './sources.ts';

type Embedder = (text: string) => Promise<number[]>;

export type SourceFolderRow = {
  path: string;
  reference: boolean;
  role: 'primary' | 'source';
};

export type SourceFolderRemoval = {
  rows: SourceFolderRow[];
  forgotten: number;
};

export type SourceIndexResult = IndexStats & { path: string };

export type SourceFolderService = {
  list: () => SourceFolderRow[];
  add: (path: string) => Promise<SourceFolderRow[]>;
  remove: (path: string) => Promise<SourceFolderRemoval>;
  mark: (path: string, reference: boolean) => Promise<SourceFolderRow[]>;
  reindex: (path: string) => Promise<SourceIndexResult>;
};

type SourceFolderDependencies = {
  client: MemexClient;
  embedder: Embedder;
  vaultPath: () => string;
  readConfig?: () => MemexConfig;
  writeConfig?: (config: MemexConfig) => void;
};

const connectedRows = (vaultPath: string, config: MemexConfig): SourceFolderRow[] => {
  return [
    { path: vaultPath, reference: false, role: 'primary' },
    ...config.sources.map((source) => ({
      path: resolve(expandPath(source.path)),
      reference: source.reference === true,
      role: 'source' as const,
    })),
  ];
};

const folderPath = (input: string) => resolve(expandPath(input));

const assertReadableFolder = (path: string) => {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error('folder-not-found');
};

export const createSourceFolderService = ({
  client,
  embedder,
  vaultPath,
  readConfig = loadConfig,
  writeConfig = saveConfig,
}: SourceFolderDependencies): SourceFolderService => {
  const rows = () => connectedRows(vaultPath(), readConfig());
  return {
    list: rows,
    add: async (input) => {
      const path = folderPath(input);
      assertReadableFolder(path);
      const config = readConfig();
      const all = [vaultPath(), ...config.sources.map((source) => folderPath(source.path))];
      if (all.includes(path)) return rows();
      writeConfig({ ...config, sources: [...config.sources, { path }] });
      return rows();
    },
    remove: async (input) => {
      const path = folderPath(input);
      if (path === folderPath(vaultPath())) throw new Error('primary-vault');
      const config = readConfig();
      const sources = config.sources.filter((source) => folderPath(source.path) !== path);
      if (sources.length === config.sources.length) throw new Error('source-not-found');
      writeConfig({ ...config, sources });
      const remaining = [vaultPath(), ...sources.map((source) => folderPath(source.path))];
      const orphaned = listNotesByPathPrefix(client, path).filter(
        (note) => !isCoveredByAny(note.filePath, remaining),
      );
      orphaned.forEach((note) => {
        deleteNote(client, note.id);
      });
      return { rows: rows(), forgotten: orphaned.length };
    },
    mark: async (input, reference) => {
      const path = folderPath(input);
      const config = readConfig();
      const sources = config.sources.map((source) =>
        folderPath(source.path) === path ? { ...source, reference } : source,
      );
      if (!sources.some((source) => folderPath(source.path) === path)) {
        throw new Error('source-not-found');
      }
      writeConfig({ ...config, sources });
      return rows();
    },
    reindex: async (input) => {
      const path = folderPath(input);
      const connected = rows();
      if (!connected.some((source) => source.path === path)) throw new Error('source-not-found');
      assertReadableFolder(path);
      const stats = await indexDirectory(client, embedder, path, undefined, true);
      syncExternalLayer(client, vaultPath());
      resyncNoteFacets(client);
      return { path, ...stats };
    },
  };
};
