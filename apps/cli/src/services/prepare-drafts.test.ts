import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  basisOf,
  draftedNotes,
  getDraft,
  insertNote,
  type MemexClient,
  openDb,
  upsertSignal,
} from '@memex/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const askClaude = vi.hoisted(() => vi.fn());
vi.mock('./llm.ts', () => ({ askClaude }));

const { prepareDrafts } = await import('./prepare-drafts.ts');

const answer = (body: string, why: string) => ({
  text: `${body}\n<<<CHANGES>>>\n- ${why}`,
  durationMs: 1,
});

describe('drafting before anyone asks', () => {
  let dir: string;
  let client: MemexClient;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-prepare-'));
    client = openDb(dir);
    askClaude.mockReset();
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const note = (title: string, content: string, layer: 'state' | 'past') =>
    insertNote(client, {
      title,
      content,
      filePath: join(dir, `${title}-${Math.random()}.md`),
      source: 'manual',
      layer,
    });

  const stale = (target: number, newer: number[]) =>
    upsertSignal(client, {
      type: 'stale_state',
      evidenceIds: [target, ...newer],
      reasoning: 'r',
      identity: String(target),
    });

  it('writes a draft the review can read instantly', async () => {
    const target = note('projection', '지금 참인 것', 'state');
    const newer = note('later', '나중에 알게 된 것', 'past');
    stale(target.id, [newer.id]);
    askClaude.mockResolvedValue(answer('다시 쓴 본문', '근거가 바뀌었어요'));

    const result = await prepareDrafts(client, 10);

    expect(result.drafted).toEqual([target.id]);
    const found = getDraft(client, target.id, {
      noteContent: target.content,
      basis: basisOf([{ id: newer.id, content: newer.content }]),
    });
    expect(found?.body.trim()).toBe('다시 쓴 본문');
    expect(found?.changes.map((c) => c.text)).toEqual(['근거가 바뀌었어요']);
  });

  // The one thing this product will not do is let the model rewrite what the
  // model wrote. Preparing is not applying.
  it('changes no note', async () => {
    const target = note('projection', '지금 참인 것', 'state');
    const newer = note('later', '나중', 'past');
    stale(target.id, [newer.id]);
    askClaude.mockResolvedValue(answer('다시 쓴 본문', 'why'));

    await prepareDrafts(client, 10);

    expect(
      (
        client.sqlite.prepare('SELECT content FROM notes WHERE id = ?').get(target.id) as {
          content: string;
        }
      ).content,
    ).toBe('지금 참인 것');
  });

  it('stops at the limit rather than spending the night on the whole backlog', async () => {
    const newer = note('later', '나중', 'past');
    for (let i = 0; i < 4; i++) stale(note(`p${i}`, `본문 ${i}`, 'state').id, [newer.id]);
    askClaude.mockResolvedValue(answer('다시 쓴 본문', 'why'));

    const result = await prepareDrafts(client, 2);

    expect(result.drafted).toHaveLength(2);
    expect(askClaude).toHaveBeenCalledTimes(2);
  });

  it('reports a failure instead of storing half an answer', async () => {
    const target = note('projection', '지금 참인 것', 'state');
    const newer = note('later', '나중', 'past');
    stale(target.id, [newer.id]);
    askClaude.mockResolvedValue({ error: 'claude is not installed', code: 'not-installed' });

    const result = await prepareDrafts(client, 10);

    expect(result.drafted).toEqual([]);
    expect(result.failed[0].id).toBe(target.id);
    expect(draftedNotes(client)).toEqual([]);
  });

  it('skips a signal whose newer notes are gone', async () => {
    const target = note('projection', '지금 참인 것', 'state');
    stale(target.id, [9999]);

    const result = await prepareDrafts(client, 10);

    expect(result.skipped).toEqual([{ id: target.id, why: 'no-evidence' }]);
    expect(askClaude).not.toHaveBeenCalled();
  });
});
