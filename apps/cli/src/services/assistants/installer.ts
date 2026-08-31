import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_SCRIPT_BYTES = 512 * 1024;

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

export type ScriptFetch = { ok: true; script: string } | { ok: false; error: string };

// The app runs this on the reader's behalf, so the checks that a person would
// make by eye are made here instead: first-party origin over TLS, a size a
// shell script could plausibly be, and a shebang. `curl | bash` can make none
// of them, because nothing has read the bytes before they execute.
export const fetchInstaller = async (url: string): Promise<ScriptFetch> => {
  const parsed = ((): URL | null => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();

  if (parsed === null) return { ok: false, error: `Not a URL: ${url}` };
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: `Refusing to run a script fetched over ${parsed.protocol}` };
  }

  const response = await fetch(url).catch((error: unknown) => {
    return error instanceof Error ? error : new Error(String(error));
  });
  if (response instanceof Error) return { ok: false, error: response.message };
  if (!response.ok) return { ok: false, error: `${url} answered ${response.status}` };

  const script = await response.text();
  if (script.length > MAX_SCRIPT_BYTES) {
    return { ok: false, error: `Installer is ${script.length} bytes, which is not a script` };
  }
  if (!script.startsWith('#!')) {
    return { ok: false, error: 'Installer does not begin with a shebang' };
  }

  return { ok: true, script };
};

export type InstallRun = { ok: true; output: string } | { ok: false; error: string };

// The script is executed, never handed to a named shell: one installer declares
// `#!/bin/bash` and uses `[[ ]]`, the other declares `#!/bin/sh`, and picking
// either one for both breaks the other wherever /bin/sh is not bash. It is still
// a file rather than a command string, so no argument can become code.
export const runInstaller = (script: string, args: string[] = []): Promise<InstallRun> =>
  new Promise((resolve) => {
    const dir = mkdtempSync(join(tmpdir(), 'memex-install-'));
    const path = join(dir, 'install.sh');
    writeFileSync(path, script, { encoding: 'utf8', mode: 0o700 });

    const child = spawn(path, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill(), INSTALL_TIMEOUT_MS);

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });

    const finish = (result: InstallRun) => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      resolve(result);
    };

    child.on('error', (error) => finish({ ok: false, error: error.message }));
    child.on('close', (code) =>
      finish(
        code === 0
          ? { ok: true, output }
          : { ok: false, error: output.trim().slice(-600) || `installer exited with ${code}` },
      ),
    );
  });

export const install = async (url: string, args: string[] = []) => {
  const fetched = await fetchInstaller(url);
  return fetched.ok ? runInstaller(fetched.script, args) : fetched;
};
