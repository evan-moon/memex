import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findClaudeBinary } from './claude-binary.ts';

let home: string;

const putBinary = (path: string, script: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `#!/bin/sh\n${script}\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'memex-cc-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('finding the binary', () => {
  it('finds what the installer put under home, with no PATH at all', () => {
    const path = putBinary(join(home, '.local/bin/claude'), 'exit 0');

    expect(findClaudeBinary(home, '')).toBe(path);
  });

  it('still falls back to PATH when it is there', () => {
    const dir = join(home, 'elsewhere');
    const path = putBinary(join(dir, 'claude'), 'exit 0');

    expect(findClaudeBinary(home, `/nowhere:${dir}`)).toBe(path);
  });

  it('reports nothing rather than a name that cannot be resolved', () => {
    expect(findClaudeBinary(home, '/usr/bin:/bin')).toBeNull();
  });
});
