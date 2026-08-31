import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentRuntime, sqliteBinding } from './native.ts';

const releaseDirWith = (names: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'memex-abi-'));
  for (const name of names) writeFileSync(join(dir, name), '');
  return dir;
};

describe('picking the native binding', () => {
  it('asks for the build named after the runtime it is on', () => {
    const dir = releaseDirWith(['better_sqlite3-node.node', 'better_sqlite3-electron.node']);

    expect(sqliteBinding(dir, 'node')).toBe(join(dir, 'better_sqlite3-node.node'));
    expect(sqliteBinding(dir, 'electron')).toBe(join(dir, 'better_sqlite3-electron.node'));
  });

  // A packaged app has only the one file electron-builder rebuilt, and asking
  // for a path that is not there would break the app the swap was meant to fix.
  it('names nothing when only the default build is there, so bindings decides', () => {
    const dir = releaseDirWith(['better_sqlite3.node']);

    expect(sqliteBinding(dir, 'electron')).toBeUndefined();
  });

  it("does not hand one runtime the build made for the other", () => {
    const dir = releaseDirWith(['better_sqlite3-node.node']);

    expect(sqliteBinding(dir, 'electron')).toBeUndefined();
    expect(sqliteBinding(dir, 'node')).toBe(join(dir, 'better_sqlite3-node.node'));
  });

  it('reads the runtime off the process rather than being told', () => {
    expect(currentRuntime()).toBe(process.versions.electron ? 'electron' : 'node');
  });
});
