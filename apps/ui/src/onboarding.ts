import type { McpClientId, OnboardingState } from './api.ts';

export const STEPS = ['intro', 'vault', 'engine', 'model'] as const;

export type Step = (typeof STEPS)[number];

// Two of the steps have something to probe and two do not. Where a probe exists
// it is the answer — a machine that already has Claude Code signed in does not
// get asked to sign in — and where it does not, saying so is the whole step.
export type Progress = {
  acked: readonly Step[];
  // Which CLIs memex can put a question to. The chat in this app runs through
  // one of them, so having none is having no app — which is why this is the step
  // that gates and registering with MCP is not. That one is an addition: it
  // brings conversations held elsewhere into the same notes.
  thinking: readonly McpClientId[];
  modelReady: boolean;
};

const doneBy: Record<Step, (progress: Progress) => boolean> = {
  intro: (p) => p.acked.includes('intro'),
  vault: (p) => p.acked.includes('vault'),
  engine: (p) => p.thinking.length > 0,
  model: (p) => p.modelReady,
};

export const stepDone = (step: Step, progress: Progress): boolean => doneBy[step](progress);

export const currentStep = (progress: Progress): Step | null =>
  STEPS.find((step) => !stepDone(step, progress)) ?? null;

export type Gate = 'unknown' | 'needed' | 'clear';

// `onboarded_at` is the only thing that opens this door, so a fresh install and
// a vault the CLI has been writing to for a year both start here. Someone who
// has been through it once is never sent back, whatever the probes say later.
//
// A read that failed is treated as not-yet rather than as clear. The file it
// reads is local, so failing means something is wrong with this machine, and
// the setup screen is the one place that can say what.
export const gateFrom = (state: OnboardingState | null, failed: boolean, done: boolean): Gate => {
  if (done) return 'clear';
  if (state !== null) return state.onboardedAt === null ? 'needed' : 'clear';
  return failed ? 'needed' : 'unknown';
};
