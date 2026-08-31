import { describe, expect, it } from 'vitest';
import type { AppRow, OnboardingState } from './api.ts';
import { engineStageOf, linkStageOf, stageOf } from './apps-setup.ts';
import { currentStep, gateFrom, type Progress, stepDone } from './onboarding.ts';

const fresh: Progress = {
  acked: [],
  thinking: [],
  modelReady: false,
};

const set = (state: Partial<OnboardingState> = {}): OnboardingState => ({
  onboardedAt: null,
  vaultPath: '/Users/someone/Documents/Second Brain',
  vaultExists: false,
  canPickFolder: true,
  ...state,
});

describe('the onboarding gate', () => {
  it('waits rather than guessing while it is still reading', () => {
    expect(gateFrom(null, false, false)).toBe('unknown');
  });

  it('sends a machine that has never been through it to setup', () => {
    expect(gateFrom(set(), false, false)).toBe('needed');
  });

  // A vault the CLI filled says nothing about whether a person was ever shown
  // what this app is for. Only having walked through it does.
  it('is not opened by a vault that already has notes in it', () => {
    expect(gateFrom(set({ vaultExists: true }), false, false)).toBe('needed');
  });

  it('lets someone who has been through it straight in', () => {
    expect(gateFrom(set({ onboardedAt: '2026-08-30T00:00:00.000Z' }), false, false)).toBe('clear');
  });

  it('opens for this launch as soon as the last step lands, without re-reading', () => {
    expect(gateFrom(set(), false, true)).toBe('clear');
  });

  // The file it reads is local, so a failure means this machine is wrong, and
  // setup is the one screen that can say so.
  it('treats a settings read it could not finish as not-yet, not as done', () => {
    expect(gateFrom(null, true, false)).toBe('needed');
  });
});

describe('the steps', () => {
  it('starts at the first one and finishes nothing', () => {
    expect(currentStep(fresh)).toBe('intro');
    expect(currentStep(fresh)).not.toBeNull();
  });

  it('counts a step with something to probe as done without asking', () => {
    expect(stepDone('model', { ...fresh, modelReady: true })).toBe(true);
  });

  // The chat in the app runs through one of these, so having none is having no
  // app. Registering with MCP is an addition and deliberately gates nothing.
  it('needs something that can think, and takes one as enough', () => {
    expect(stepDone('engine', fresh)).toBe(false);
    expect(stepDone('engine', { ...fresh, thinking: ['codex'] })).toBe(true);
    expect(stepDone('engine', { ...fresh, thinking: ['claude-code', 'codex'] })).toBe(true);
  });

  it('still asks for the two steps that have nothing to probe', () => {
    const probed: Progress = { ...fresh, thinking: ['claude-code'], modelReady: true };
    expect(currentStep(probed)).toBe('intro');
    expect(currentStep({ ...probed, acked: ['intro'] })).toBe('vault');
    expect(currentStep({ ...probed, acked: ['intro', 'vault'] })).toBeNull();
  });

  it('walks past what is already done rather than making them redo it', () => {
    expect(currentStep({ ...fresh, acked: ['intro', 'vault'], modelReady: true })).toBe('engine');
  });
});

// Each row offers one thing, so which of the three facts about a CLI is still
// missing decides what that row asks for.
const app = (over: Partial<AppRow> = {}): AppRow => ({
  id: 'claude-code',
  name: 'Claude Code',
  installed: true,
  methods: ['subscription', 'metered'],
  cli: { kind: 'ready', binary: '/bin/claude', method: 'claude.ai', plan: 'max' },
  registration: { kind: 'current' },
  ...over,
});

// memex reaching a CLI is what makes the chat in the app work. Whether that CLI
// can also write into memex is a different question, and this one must not
// answer it — an app signed in but unregistered answers questions perfectly.
describe('whether memex can make an app think', () => {
  it('asks to install when it is not on the machine', () => {
    expect(engineStageOf(app({ installed: false, cli: { kind: 'missing' } }))).toBe('install');
  });

  it('asks to sign in once it is there', () => {
    expect(engineStageOf(app({ cli: { kind: 'logged-out', binary: '/bin/claude' } }))).toBe(
      'login',
    );
  });

  it('is ready whatever the registration says', () => {
    expect(engineStageOf(app({ registration: { kind: 'absent' } }))).toBe('ready');
  });

  it('says so rather than looping when the version cannot be read', () => {
    expect(
      engineStageOf(app({ cli: { kind: 'unreadable', binary: '/bin/claude', reason: 'x' } })),
    ).toBe('unreadable');
  });
});

// The other direction: what a conversation held elsewhere can write into memex.
// Claude on the desktop can do this and can never do the above, which is why
// the two are not one list.
describe('whether an app can reach memex', () => {
  const desktop = app({ id: 'claude-desktop', methods: [], cli: null });

  it('offers to connect an installed app that is not registered', () => {
    expect(linkStageOf({ ...desktop, registration: { kind: 'absent' } })).toBe('connect');
  });

  it('offers to repoint an app aimed at some other memex', () => {
    expect(
      linkStageOf({ ...desktop, registration: { kind: 'elsewhere', command: 'node /old.js' } }),
    ).toBe('repoint');
  });

  it('counts an app memex could never sign in as linked all the same', () => {
    expect(linkStageOf(desktop)).toBe('linked');
  });

  it('has nothing to offer an app that is not installed', () => {
    expect(linkStageOf({ ...desktop, installed: false })).toBe('absent');
  });
});

// Onboarding walks one list all the way, so it asks them in order: registering
// an app that is not signed in yet would leave a row claiming to be finished.
describe('the two questions in order', () => {
  it('holds the sign-in in front of the registration', () => {
    expect(
      stageOf(app({ cli: { kind: 'logged-out', binary: '/b' }, registration: { kind: 'absent' } })),
    ).toBe('login');
  });

  it('moves on to registering once the sign-in is behind it', () => {
    expect(stageOf(app({ registration: { kind: 'absent' } }))).toBe('connect');
    expect(stageOf(app())).toBe('linked');
  });
});
