import type { ClaudeCodeState } from './api.ts';

const KEY = 'memex-first-run';

export type Gate = 'unknown' | 'needed' | 'clear';

export const firstRunSettled = () => {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(KEY) === 'settled';
};

export const settleFirstRun = () => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, 'settled');
};

export type SetupProbe = { claude: ClaudeCodeState | null; failed: boolean };

// Sign-in is the only step that gates: the model download is not one because a
// register correction needs no embeddings, and MCP registration is for other
// sessions' Claude rather than for this app, whose own calls run with the MCP
// config emptied. Gating on either would make an optional step look required.
//
// It settles once. Someone who signed in and later signed out is not sent back
// to the setup screen — they know where it is, and a screen that reappears on
// its own reads as the app losing what it was told.
export const gateFrom = ({ claude, failed }: SetupProbe, settled: boolean): Gate => {
  if (settled) return 'clear';
  if (claude !== null) return claude.kind === 'ready' ? 'clear' : 'needed';
  // A readiness check that could not answer is not an answer of "not ready".
  // Holding the home screen shut on it would turn one failed request into an
  // app with no way in.
  return failed ? 'clear' : 'unknown';
};
