import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const FIXTURE_VAULT = join(HERE, 'memex-v1');

// Every test gets its own copy. The checked-in fixture is read-only in practice
// — a test that edited it would change what the next test reads — and the whole
// point of these files is that saving rewrites them.
export const copyFixtureVault = (): { path: string; dispose: () => void } => {
  const path = mkdtempSync(join(tmpdir(), 'memex-fixture-vault-'));
  cpSync(FIXTURE_VAULT, path, { recursive: true });
  return { path, dispose: () => rmSync(path, { recursive: true, force: true }) };
};

export const temporaryDbDir = (): { path: string; dispose: () => void } => {
  const path = mkdtempSync(join(tmpdir(), 'memex-fixture-db-'));
  return { path, dispose: () => rmSync(path, { recursive: true, force: true }) };
};

// Deterministic and free. Nothing in these tests is measuring retrieval quality,
// so the weights would only buy a slower run.
export const stubEmbedder = async (): Promise<number[]> => new Array(768).fill(0.1);
