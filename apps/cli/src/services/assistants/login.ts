import { type ChildProcess, spawn } from 'node:child_process';

export type LoginState =
  | { kind: 'idle' }
  | { kind: 'waiting'; url: string | null }
  | { kind: 'failed'; error: string };

const URL_GRACE_MS = 4000;

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export type LoginRunner = {
  start: (attempt: LoginAttempt) => Promise<LoginState>;
  peek: () => LoginState;
  cancel: () => void;
};

export type LoginAttempt = { binary: string; args: string[] };

// The page to send someone to is the vendor's, over TLS. Both CLIs print one,
// and requiring https is what tells it from the decoy above it: Codex opens a
// loopback server first and announces it as `http://localhost:1455.`, which is
// where the browser comes back to, not where the reader signs in.
//
// The CLI wraps its URL in an OSC 8 terminal hyperlink, which surrounds it with
// escape bytes and then repeats it as the link text. Excluding control
// characters ends the match at the BEL instead of swallowing the escape and the
// second copy.
const SIGN_IN_URL = /https:\/\/[^\s"'<>\p{Cc}]+/u;

// A URL at the end of a sentence takes the full stop with it — `1455.` was a
// port, once. Nothing a CLI links to ends in prose punctuation.
const TRAILING_PUNCTUATION = /[.,;:!]+$/;

// The CLI owns this flow end to end: it opens its own vendor's page and writes
// its own credential store. memex never sees a token, and the only thing it
// does here is make sure a browser actually opened — a window that never
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

  const start = ({ binary, args }: LoginAttempt) =>
    new Promise<LoginState>((resolve) => {
      cancel();
      session.opened = false;

      const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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

      // Chunks arrive at pipe boundaries, not line boundaries, so a URL can be
      // split across two of them. Matching the accumulated output instead of
      // each chunk is what keeps a half-URL from being opened.
      const buffer = { seen: '' };
      const sawOutput = (chunk: unknown) => {
        if (session.opened) return;
        buffer.seen += String(chunk);
        const found = SIGN_IN_URL.exec(buffer.seen);
        // A match that runs to the end of what has arrived may still be
        // growing. Waiting for the character that ends it — the BEL of the
        // hyperlink, or a newline — is what tells a whole URL from half of one.
        if (!found || found.index + found[0].length === buffer.seen.length) return;
        const url = found[0].replace(TRAILING_PUNCTUATION, '');
        session.opened = true;
        session.state = { kind: 'waiting', url };
        openUrl(url);
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
