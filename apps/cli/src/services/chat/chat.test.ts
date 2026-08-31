import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getNote,
  insertNote,
  type MemexClient,
  openDb,
  readRegister,
  serializeTags,
  setRegister,
} from '@memex/db';
import type { LlmProvider } from '@memex/llm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { committedAction, confirmationFor, type Plan, parsePlanDraft } from './plan.ts';
import { applyPlan, buildPrompt, type ChatDeps, gatherCandidates, planTurn } from './turn.ts';

const CHOICE = { provider: 'claude-code' as const, model: 'sonnet' };

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

const addSkill = (title: string, body: string, status: 'provisional' | 'canonical' = 'canonical') =>
  insertNote(client, {
    title,
    content: body,
    filePath: join(dbDir, `${title}.md`),
    source: 'claude-code',
    layer: 'rule',
    tags: serializeTags(['skill']),
    ruleStatus: status,
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

describe('naming the action before the answer is whole', () => {
  it('reads the word the model has committed to', () => {
    expect(committedAction('{"action":"answer","text":"두 건')).toBe('answer');
    expect(committedAction('{"action": "new-note", "title"')).toBe('new-note');
  });

  // Half a word is not a decision. A step drawn from one is a sentence the
  // screen has to take back, which is worse than the spinner it replaced.
  it('says nothing until the word is finished, or is not one it knows', () => {
    expect(committedAction('{"action":"ans')).toBeNull();
    expect(committedAction('{"acti')).toBeNull();
    expect(committedAction('{"action":"delete-note"')).toBeNull();
    expect(committedAction('')).toBeNull();
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
      { message: '30일이야', carried: { kind: 'register', subject: 'opula' }, choice: CHOICE },
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
      { message: '30일이야', carried: { kind: 'register', subject: 'opula' }, choice: CHOICE },
    );

    if (turn.kind !== 'plan' || turn.plan.kind !== 'set-register') throw new Error('no plan');
    expect(turn.plan.newPredicate).toBe(true);
    expect(turn.confirmation).toBe('confirm');
  });

  it('refuses to plan a correction to a note that is not there', async () => {
    const turn = await planTurn(
      deps(answering('{"action":"amend-note","amends":9999,"title":"t","content":"c"}')),
      { message: 'that note is wrong', choice: CHOICE },
    );

    expect(turn).toMatchObject({ kind: 'unmapped', reason: 'unknown-target' });
  });

  it('refuses to approve a rule that is no longer waiting', async () => {
    const settled = addNote('a settled rule', 'rule');

    const turn = await planTurn(
      deps(answering(`{"action":"rule-decision","noteId":${settled.id},"decision":"approve"}`)),
      { message: 'keep that one', choice: CHOICE },
    );

    expect(turn).toMatchObject({ kind: 'unmapped', reason: 'unknown-target' });
  });

  it('reports a missing CLI apart from everything else it can fail at', async () => {
    const missing: LlmProvider = async () => ({
      error: 'spawn claude ENOENT',
      code: 'not-installed',
    });

    expect(await planTurn(deps(missing), { message: 'anything', choice: CHOICE })).toMatchObject({
      kind: 'failed',
      failure: 'not-installed',
    });
  });

  it('answers a question instead of calling it a change it could not map', async () => {
    const note = addNote('발견 공급량 실측', 'past');
    const turn = await planTurn(
      deps(
        answering(
          JSON.stringify({
            action: 'answer',
            text: '한 노트에 리서치와 결정이 같이 들어 있어요.',
            cites: [note.id],
          }),
        ),
      ),
      {
        message: '맥락이 여러 개인데 한 노트로 표시된 게 있어?',
        carried: { kind: 'note', id: note.id },
        choice: CHOICE,
      },
    );

    expect(turn).toMatchObject({
      kind: 'answer',
      text: '한 노트에 리서치와 결정이 같이 들어 있어요.',
      cites: [{ id: note.id, title: '발견 공급량 실측' }],
    });
  });

  // An id that was never on the page is the one citation a reader cannot check,
  // because it looks exactly like one they can.
  it('drops a citation that was not among the notes it was shown', async () => {
    const turn = await planTurn(
      deps(answering(JSON.stringify({ action: 'answer', text: '답', cites: [9999] }))),
      { message: '뭐가 있어?', choice: CHOICE },
    );

    expect(turn).toMatchObject({ kind: 'answer', cites: [] });
  });

  it('writes nothing when it answers', async () => {
    const before = client.sqlite.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number };
    await planTurn(deps(answering(JSON.stringify({ action: 'answer', text: '답', cites: [] }))), {
      message: '뭐가 있어?',
      choice: CHOICE,
    });
    const after = client.sqlite.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number };

    expect(after.n).toBe(before.n);
  });

  // The list a turn starts with is what search put in front of it. A question
  // about the vault as a whole is not answerable from that list, so the model
  // has to be able to go and look, and what it finds has to come back to it.
  it('runs the search it asked for and hands the result back', async () => {
    addNote('발견 공급량 실측', 'past');
    const prompts: string[] = [];
    const replies = [
      JSON.stringify({ action: 'search', query: '발견 공급량', limit: 5 }),
      JSON.stringify({ action: 'answer', text: '찾았어요', cites: [] }),
    ];
    const ask: LlmProvider = async ({ prompt }) => {
      prompts.push(prompt);
      return { text: replies[prompts.length - 1] ?? replies[1], durationMs: 1 };
    };

    const turn = await planTurn(deps(ask), { message: '전체에서 찾아줘', choice: CHOICE });

    expect(turn).toMatchObject({ kind: 'answer', text: '찾았어요' });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('WHAT YOU HAVE LOOKED UP');
    expect(prompts[1]).toContain('searched "발견 공급량"');
  });

  it('lets a note it went and read be cited', async () => {
    const note = addNote('세 엔진', 'past');
    const replies = [
      JSON.stringify({ action: 'read', ids: [note.id] }),
      JSON.stringify({ action: 'answer', text: '읽었어요', cites: [note.id] }),
    ];
    let at = 0;
    const ask: LlmProvider = async () => ({ text: replies[at++] ?? replies[1], durationMs: 1 });

    expect(await planTurn(deps(ask), { message: '읽어줘', choice: CHOICE })).toMatchObject({
      kind: 'answer',
      cites: [{ id: note.id, title: '세 엔진' }],
    });
  });

  // Unbounded is the whole risk of letting a model drive the looking. The turn
  // ends whether or not the model decides it is finished.
  it('stops looking after the budget runs out', async () => {
    let calls = 0;
    const ask: LlmProvider = async () => {
      calls += 1;
      return { text: JSON.stringify({ action: 'search', query: '또', limit: 5 }), durationMs: 1 };
    };

    const turn = await planTurn(deps(ask), { message: '계속 찾아', choice: CHOICE });

    expect(turn).toMatchObject({ kind: 'unmapped' });
    expect(calls).toBeLessThanOrEqual(7);
  });

  it('tells the model when it has no lookups left', async () => {
    const prompts: string[] = [];
    const ask: LlmProvider = async ({ prompt }) => {
      prompts.push(prompt);
      return { text: JSON.stringify({ action: 'search', query: '또', limit: 5 }), durationMs: 1 };
    };

    await planTurn(deps(ask), { message: '계속 찾아', choice: CHOICE });

    expect(prompts[0]).toContain('LOOKUPS LEFT');
    expect(prompts.at(-1)).toContain('None. Answer from what you have');
  });

  it('says it understood nothing rather than writing half a plan', async () => {
    const turn = await planTurn(deps(answering('I think you mean the trial length?')), {
      message: 'x',
      choice: CHOICE,
    });

    expect(turn).toMatchObject({ kind: 'failed', failure: 'unreadable-plan' });
  });
});

describe('carrying the conversation', () => {
  // No provider is ever handed a conversation it is expected to remember, so
  // what came before travels in the prompt. Switching provider mid-conversation
  // is then just the next turn, with nothing to hand over.
  it('puts what came before into the prompt, whoever is answering', async () => {
    const prompts: string[] = [];
    const watching: LlmProvider = async ({ prompt }) => {
      prompts.push(prompt);
      return { text: '{"action":"none"}', durationMs: 1 };
    };

    await planTurn(deps(watching), {
      message: '30일이야',
      choice: { provider: 'codex', model: '' },
      history: [{ said: 'opula 얘기야', outcome: 'nothing was written' }],
    });

    expect(prompts[0]).toContain('EARLIER IN THIS CONVERSATION');
    expect(prompts[0]).toContain('opula 얘기야');
    expect(prompts[0]).toContain('nothing was written');
  });

  it('says nothing about a conversation that has not started', async () => {
    const prompts: string[] = [];
    const watching: LlmProvider = async ({ prompt }) => {
      prompts.push(prompt);
      return { text: '{"action":"none"}', durationMs: 1 };
    };

    await planTurn(deps(watching), { message: 'x', choice: CHOICE });

    expect(prompts[0]).not.toContain('EARLIER IN THIS CONVERSATION');
  });

  it('asks the provider the turn named, with the model it named', async () => {
    const asked: { provider: string; model: string }[] = [];
    const watching: LlmProvider = async ({ model }) => {
      asked.push({ provider: 'seen', model });
      return { text: '{"action":"none"}', durationMs: 1 };
    };

    await planTurn(deps(watching), { message: 'x', choice: { provider: 'codex', model: 'gpt-5' } });

    expect(asked[0]?.model).toBe('gpt-5');
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

// A skill is a way of working the person wrote down. It is a rule, so it lands
// provisional and is not offered until they approve it — the same gate that
// keeps the vault from teaching itself something nobody agreed to.
describe('a skill the person approved', () => {
  it('offers an approved one and hands over its instructions when asked', async () => {
    const skill = addSkill('블로그 초안 쓰기', '1. 볼트에서 재료를 모은다\n2. 내 문체로 쓴다');
    const prompts: string[] = [];
    const replies = [
      JSON.stringify({ action: 'use-skill', id: skill.id }),
      JSON.stringify({ action: 'answer', text: '따랐어요', cites: [] }),
    ];
    const ask: LlmProvider = async ({ prompt }) => {
      prompts.push(prompt);
      return { text: replies[prompts.length - 1] ?? replies[1], durationMs: 1 };
    };

    const turn = await planTurn(deps(ask), { message: '초안 써줘', choice: CHOICE });

    expect(prompts[0]).toContain('=== SKILLS ===');
    expect(prompts[0]).toContain('블로그 초안 쓰기');
    expect(prompts[1]).toContain('skill "블로그 초안 쓰기"');
    expect(prompts[1]).toContain('내 문체로 쓴다');
    expect(turn).toMatchObject({ kind: 'answer', text: '따랐어요' });
  });

  it('does not offer one still waiting for approval', async () => {
    addSkill('승인 안 된 스킬', 'body', 'provisional');

    const candidates = await gatherCandidates(deps(), null, '초안 써줘');

    expect(candidates.skills).toEqual([]);
    expect(candidates.rules.map((rule) => rule.title)).toContain('승인 안 된 스킬');
  });

  // The list in the prompt is the whole permission. A rule that is not offered
  // is not loaded, and the turn ends saying so rather than running it — the
  // person asks again, which is recoverable; a rule nobody approved is not.
  it('will not load a rule that was never offered as a skill', async () => {
    const plain = addNote('그냥 규칙', 'rule');
    const prompts: string[] = [];
    const ask: LlmProvider = async ({ prompt }) => {
      prompts.push(prompt);
      return { text: JSON.stringify({ action: 'use-skill', id: plain.id }), durationMs: 1 };
    };

    const turn = await planTurn(deps(ask), { message: '초안 써줘', choice: CHOICE });

    expect(turn).toMatchObject({ kind: 'unmapped' });
    expect(prompts).toHaveLength(1);
  });
});
