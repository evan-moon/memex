import { type ChildProcess, spawn } from 'node:child_process';

export type LoginMethod = 'claudeai' | 'console';

export type LoginState =
  | { kind: 'idle' }
  | { kind: 'waiting'; url: string | null }
  | { kind: 'failed'; error: string };

const URL_GRACE_MS = 4000;

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

const URL_PATTERN = /https:\/\/[^\s"'<>]+/;

export type LoginRunner = {
  start: (binary: string, method: LoginMethod) => Promise<LoginState>;
  peek: () => LoginState;
  cancel: () => void;
};

// Claude Code owns this flow end to end: it opens Anthropic's own page and
// writes its own credential store. memex never sees a token, and the only thing
// it does here is make sure a browser actually opened — a window that never
// appears is indistinguishable, to the reader, from an app that hung.
export const createLoginRunner = (openUrl: (url: string) => void = () => {}): LoginRunner => {
  const session: { child: ChildProcess | null; state: LoginState; opened: boolean } = {
    child: null,
    state: { kind: 'idle' },
    opened: false,
  };

  const cancel = () => {
    session.child?.kill();
    session.child = null;
    session.state = { kind: 'idle' };
  };

  const start = (binary: string, method: LoginMethod) =>
    new Promise<LoginState>((resolve) => {
      cancel();
      session.opened = false;

      const child = spawn(binary, ['auth', 'login', `--${method}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      session.child = child;
      session.state = { kind: 'waiting', url: null };

      const timer = setTimeout(() => child.kill(), LOGIN_TIMEOUT_MS);
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve(session.state);
      };
      const grace = setTimeout(settle, URL_GRACE_MS);

      const sawOutput = (chunk: unknown) => {
        const found = URL_PATTERN.exec(String(chunk));
        if (!found || session.opened) return;
        session.opened = true;
        session.state = { kind: 'waiting', url: found[0] };
        openUrl(found[0]);
        clearTimeout(grace);
        settle();
      };

      child.stdout.on('data', sawOutput);
      child.stderr.on('data', sawOutput);

      child.on('error', (error) => {
        clearTimeout(timer);
        clearTimeout(grace);
        session.state = { kind: 'failed', error: error.message };
        session.child = null;
        settle();
      });

      child.on('close', () => {
        clearTimeout(timer);
        clearTimeout(grace);
        session.child = null;
        settle();
      });
    });

  return { start, peek: () => session.state, cancel };
};
