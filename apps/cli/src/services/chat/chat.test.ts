import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getNote,
  insertNote,
  type MemexClient,
  openDb,
  readRegister,
  setRegister,
} from '@memex/db';
import type { LlmProvider } from '@memex/llm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmationFor, type Plan, parsePlanDraft } from './plan.ts';
import { applyPlan, buildPrompt, type ChatDeps, gatherCandidates, planTurn } from './turn.ts';

let dbDir: string;
let client: MemexClient;

const stubEmbedder = async () => new Array(768).fill(0);

const answering =
  (text: string): LlmProvider =>
  async () => ({ text, durationMs: 1 });

const deps = (ask?: LlmProvider): ChatDeps => ({
  client,
  embedder: stubEmbedder,
  vaultPath: dbDir,
  ask,
});

const addNote = (title: string, layer: 'past' | 'state' | 'rule', ruleStatus?: 'provisional') =>
  insertNote(client, {
    title,
    content: `body of ${title}`,
    filePath: join(dbDir, `${title}.md`),
    source: 'claude-code',
    layer,
    ...(ruleStatus ? { ruleStatus } : {}),
  });

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-chat-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('reading a plan out of an answer', () => {
  it('takes the JSON out of whatever else the model said around it', () => {
    const draft = parsePlanDraft(
      'Sure — here is the change:\n{"action":"set-register","subject":"opula","predicate":"trial.duration","value":"30일"}\nLet me know.',
    );

    expect(draft).toEqual({
      action: 'set-register',
      subject: 'opula',
      predicate: 'trial.duration',
      value: '30일',
    });
  });

  it('refuses a plan with a field missing rather than filling it in', () => {
    expect(parsePlanDraft('{"action":"set-register","subject":"opula","value":"30일"}')).toBeNull();
    expect(
      parsePlanDraft('{"action":"amend-note","amends":"1832","title":"x","content":"y"}'),
    ).toBeNull();
    expect(
      parsePlanDraft('{"action":"new-note","title":"x","content":"y","layer":"rule"}'),
    ).toBeNull();
    expect(parsePlanDraft('{"action":"delete-note","noteId":12}')).toBeNull();
    expect(parsePlanDraft('not json at all')).toBeNull();
  });
});

describe('deciding what to ask before writing', () => {
  const setValue = (newPredicate: boolean): Plan => ({
    kind: 'set-register',
    subject: 'opula',
    predicate: 'trial.duration',
    scope: { kind: 'global' },
    value: '30일',
    newPredicate,
  });

  it('writes without asking only when the value was already on screen', () => {
    expect(confirmationFor(setValue(false), { kind: 'register', subject: 'Opula' })).toBe(
      'immediate',
    );
  });

  it('asks when the model picked the subject rather than the reader', () => {
    expect(confirmationFor(setValue(false), null)).toBe('confirm');
    expect(confirmationFor(setValue(false), { kind: 'register', subject: 'firma' })).toBe(
      'confirm',
    );
    expect(confirmationFor(setValue(false), { kind: 'note', id: 3 })).toBe('confirm');
  });

  it('asks before a new key, even on the subject in front of them', () => {
    expect(confirmationFor(setValue(true), { kind: 'register', subject: 'opula' })).toBe('confirm');
  });

  it('asks before anything that is not a value', () => {
    const plans: Plan[] = [
      { kind: 'amend-note', amends: 1, title: 't', content: 'c' },
      { kind: 'new-note', title: 't', content: 'c', folder: null, layer: 'past', tags: [] },
      { kind: 'rule-decision', noteId: 1, decision: 'approve' },
    ];

    for (const plan of plans) {
      expect(confirmationFor(plan, { kind: 'register', subject: 'opula' })).toBe('confirm');
    }
  });
});

describe('gathering what the model may choose from', () => {
  it('offers only the subject the conversation was opened on', () => {
    setRegister(client, {
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'global' },
      value: '14일',
      author: 'agent',
    });
    setRegister(client, {
      subject: 'firma',
      predicate: 'stage',
      scope: { kind: 'global' },
      value: 'beta',
      author: 'agent',
    });

    return gatherCandidates(deps(), { kind: 'register', subject: 'opula' }, 'anything').then(
      (candidates) => {
        expect(candidates.register.map((r) => r.subject)).toEqual(['opula']);
      },
    );
  });

  it('offers a subject an empty message never named to nobody', async () => {
    setRegister(client, {
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'global' },
      value: '14일',
      author: 'agent',
    });

    const named = await gatherCandidates(deps(), null, 'opula 트라이얼이 30일로 바뀌었어');
    const unnamed = await gatherCandidates(deps(), null, '그거 30일로 바꿔줘');

    expect(named.register).toHaveLength(1);
    expect(unnamed.register).toHaveLength(0);
  });

  it('only offers rules that are still waiting', async () => {
    addNote('a provisional rule', 'rule', 'provisional');
    addNote('a settled rule', 'rule');

    const candidates = await gatherCandidates(deps(), null, 'rules');

    expect(candidates.rules.map((r) => r.title)).toEqual(['a provisional rule']);
  });

  // The weights are 282MB and a register correction does not need them. A vault
  // still downloading answers what a value is now, and says the rest is waiting.
  it('still answers about values when search cannot run', async () => {
    setRegister(client, {
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'global' },
      value: '14일',
      author: 'agent',
    });
    const broken: ChatDeps = {
      ...deps(),
      embedder: async () => {
        throw new Error('weights are still downloading');
      },
    };

    const candidates = await gatherCandidates(broken, { kind: 'register', subject: 'opula' }, 'x');

    expect(candidates.searchable).toBe(false);
    expect(candidates.register).toHaveLength(1);
    expect(buildPrompt('x', candidates)).toContain('search is unavailable');
  });
});

describe('a turn', () => {
  const openOnOpula = () =>
    setRegister(client, {
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'global' },
      value: '14일',
      author: 'agent',
    });

  it('takes the scope off the record rather than the sentence', async () => {
    setRegister(client, {
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'period', start: '2026-01-01', end: '2026-12-31' },
      value: '14일',
      author: 'agent',
    });

    const turn = await planTurn(
      deps(
        answering(
          '{"action":"set-register","subject":"opula","predicate":"trial.duration","value":"30일"}',
        ),
      ),
      '30일이야',
      { kind: 'register', subject: 'opula' },
    );

    expect(turn.kind).toBe('plan');
    if (turn.kind !== 'plan' || turn.plan.kind !== 'set-register') throw new Error('no plan');
    expect(turn.plan.scope).toEqual({ kind: 'period', start: '2026-01-01', end: '2026-12-31' });
    expect(turn.plan.newPredicate).toBe(false);
  });

  it('calls a key nothing on record matches a new one, and asks', async () => {
    openOnOpula();

    const turn = await planTurn(
      deps(
        answering(
          '{"action":"set-register","subject":"opula","predicate":"trial_length","value":"30일"}',
        ),
      ),
      '30일이야',
      { kind: 'register', subject: 'opula' },
    );

    if (turn.kind !== 'plan' || turn.plan.kind !== 'set-register') throw new Error('no plan');
    expect(turn.plan.newPredicate).toBe(true);
    expect(turn.confirmation).toBe('confirm');
  });

  it('refuses to plan a correction to a note that is not there', async () => {
    const turn = await planTurn(
      deps(answering('{"action":"amend-note","amends":9999,"title":"t","content":"c"}')),
      'that note is wrong',
    );

    expect(turn).toMatchObject({ kind: 'unmapped', reason: 'unknown-target' });
  });

  it('refuses to approve a rule that is no longer waiting', async () => {
    const settled = addNote('a settled rule', 'rule');

    const turn = await planTurn(
      deps(answering(`{"action":"rule-decision","noteId":${settled.id},"decision":"approve"}`)),
      'keep that one',
    );

    expect(turn).toMatchObject({ kind: 'unmapped', reason: 'unknown-target' });
  });

  it('reports a missing CLI apart from everything else it can fail at', async () => {
    const missing: LlmProvider = async () => ({
      error: 'spawn claude ENOENT',
      code: 'not-installed',
    });

    expect(await planTurn(deps(missing), 'anything')).toMatchObject({
      kind: 'failed',
      failure: 'not-installed',
    });
  });

  it('says it understood nothing rather than writing half a plan', async () => {
    const turn = await planTurn(deps(answering('I think you mean the trial length?')), 'x');

    expect(turn).toMatchObject({ kind: 'failed', failure: 'unreadable-plan' });
  });
});

describe('applying a plan', () => {
  it('keeps the value it replaced, because writing the old one back is not an undo', async () => {
    setRegister(client, {
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'global' },
      value: '14일',
      author: 'agent',
    });

    const applied = await applyPlan(deps(), {
      kind: 'set-register',
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'global' },
      value: '30일',
      newPredicate: false,
    });

    if (!applied.ok || applied.wrote.kind !== 'register') throw new Error('not written');
    expect(applied.wrote.previous).toEqual(['14일']);
    expect(readRegister(client, 'opula')[0]?.heads.map((h) => h.value)).toEqual(['30일']);
  });

  it('records the person as the author, not the agent', async () => {
    await applyPlan(deps(), {
      kind: 'set-register',
      subject: 'opula',
      predicate: 'trial.duration',
      scope: { kind: 'global' },
      value: '30일',
      newPredicate: true,
    });

    expect(readRegister(client, 'opula')[0]?.heads[0]?.author).toBe('person');
  });

  it('corrects a past note with a new note rather than editing the old one', async () => {
    const wrong = addNote('the note that got it wrong', 'past');

    const applied = await applyPlan(deps(), {
      kind: 'amend-note',
      amends: wrong.id,
      title: 'what it actually was',
      content: 'the trial was 30 days.',
    });

    if (!applied.ok || applied.wrote.kind !== 'note') throw new Error('not written');
    expect(applied.wrote.note.id).not.toBe(wrong.id);
    expect(applied.wrote.amended?.id).toBe(wrong.id);
    expect(getNote(client, wrong.id)?.content).toBe(wrong.content);
  });

  // saveNote reports an amends id it could not find rather than refusing, so a
  // target that vanished between the plan and the press would otherwise leave a
  // correction that corrects nothing while search keeps returning the claim.
  it('refuses a correction whose target went away before it was pressed', async () => {
    const applied = await applyPlan(deps(), {
      kind: 'amend-note',
      amends: 9999,
      title: 'what it actually was',
      content: 'the trial was 30 days.',
    });

    expect(applied).toEqual({ ok: false, reason: 'target-missing' });
  });

  it('leaves a rule settled the way the person settled it', async () => {
    const waiting = addNote('a provisional rule', 'rule', 'provisional');

    const applied = await applyPlan(deps(), {
      kind: 'rule-decision',
      noteId: waiting.id,
      decision: 'approve',
    });

    expect(applied.ok).toBe(true);
    expect(getNote(client, waiting.id)?.ruleStatus).toBe('canonical');
  });
});
