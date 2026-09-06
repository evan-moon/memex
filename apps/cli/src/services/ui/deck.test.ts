import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  confirmClaim,
  deferReviewItem,
  insertNote,
  logRetrieval,
  type MemexClient,
  mintInference,
  openDb,
  setNoteShape,
  updateNote,
} from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildDeck, deckCardState, eligibleCards, SESSION } from './deck.ts';

let dbDir: string;
let vaultDir: string;
let client: MemexClient;
let made = 0;

beforeEach(() => {
  made = 0;
  dbDir = mkdtempSync(join(tmpdir(), 'memex-deck-db-'));
  vaultDir = mkdtempSync(join(tmpdir(), 'memex-deck-vault-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(vaultDir, { recursive: true, force: true });
});

const addNote = (title: string, layer: 'past' | 'state' | 'rule' = 'state', content = 'the body') =>
  insertNote(client, {
    title,
    content,
    filePath: join(vaultDir, `${title}.md`),
    source: 'manual',
    layer,
  });

const spoke = (noteId: number) =>
  logRetrieval(client, { query: 'q', surface: 'mcp', noteIds: [noteId], injectedIds: [noteId] });

const claimNote = (claims: string[], { spoken = true } = {}) => {
  made += 1;
  const note = addNote(`source ${String(made)}`, 'state', `body ${String(made)}`);
  setNoteShape(client, { noteId: note.id, kind: 'position', claims });
  if (spoken) spoke(note.id);
  return note;
};

const keys = () => buildDeck(client).cards.map((card) => card.key);

describe('the deck', () => {
  it('is empty when nothing has been extracted', () => {
    addNote('a note');
    expect(buildDeck(client).cards).toEqual([]);
  });

  it('leaves out a claim the agent has never said', () => {
    claimNote(['이 값은 아직 아무 데도 안 쓰였다'], { spoken: false });
    expect(buildDeck(client).cards).toEqual([]);
  });

  it('raises a claim the agent has said, with the claim as the card', () => {
    const note = claimNote(['Opula의 채팅은 Groq에서 돈다']);

    const [card] = buildDeck(client).cards;
    expect(card?.kind).toBe('claim');
    expect(card?.text).toBe('Opula의 채팅은 Groq에서 돈다');
    expect(card?.source?.id).toBe(note.id);
    expect(card?.injected.hits).toBe(1);
  });

  it('leaves out a claim too long to answer true or false', () => {
    claimNote(['가'.repeat(101)]);
    expect(buildDeck(client).cards).toEqual([]);
  });

  // History does not go out of date, an instruction is approved rather than
  // checked, and a preference never had a truth value.
  it('asks only about what is true now', () => {
    claimNote(['스크린샷 세 장을 재캡처해 반영했다']);
    claimNote(['답하기 전에 먼저 검색해야 한다']);
    claimNote(['이 통합이 최고 ROI 항목이다']);
    expect(buildDeck(client).cards).toEqual([]);

    const now = claimNote(['제품명은 Opula이고 결제는 Lemon Squeezy로 간다']);
    expect(buildDeck(client).cards.map((card) => card.source?.id)).toEqual([now.id]);
  });

  it('drops a claim once it is confirmed, and brings it back when freshness runs out', () => {
    const note = claimNote(['트라이얼은 14일이다']);
    const id = buildDeck(client).cards[0]?.id;
    expect(id).toBeDefined();
    if (id === undefined) return;

    confirmClaim(client, id, 'card');
    expect(buildDeck(client).cards).toEqual([]);

    const later = Date.now() + 31 * 24 * 60 * 60 * 1000;
    expect(buildDeck(client, { now: later }).cards.map((c) => c.source?.id)).toContain(note.id);
  });

  it('gives an evidence-deep confirmation three times the quiet', () => {
    claimNote(['가격은 9.99달러다']);
    const id = buildDeck(client).cards[0]?.id;
    if (id === undefined) return;

    confirmClaim(client, id, 'evidence');
    const at31 = Date.now() + 31 * 24 * 60 * 60 * 1000;
    const at91 = Date.now() + 91 * 24 * 60 * 60 * 1000;
    expect(buildDeck(client, { now: at31 }).cards).toEqual([]);
    expect(buildDeck(client, { now: at91 }).cards).toHaveLength(1);
  });

  it('raises a confirmed claim again the moment its note is rewritten', () => {
    const note = claimNote(['제품명은 firma-cloud다']);
    const id = buildDeck(client).cards[0]?.id;
    if (id === undefined) return;
    confirmClaim(client, id, 'evidence');
    expect(buildDeck(client).cards).toEqual([]);

    updateNote(client, note.id, { content: 'a different body entirely' });

    const [card] = buildDeck(client).cards;
    expect(card?.id).toBe(id);
    expect(card?.evidenceMoved).toBe(true);
  });

  it('does not re-extract a claim when its note is rewritten', () => {
    const note = claimNote(['제품명은 firma-cloud다']);
    updateNote(client, note.id, { content: 'a different body entirely' });

    setNoteShape(client, { noteId: note.id, kind: 'position', claims: ['제품명은 firma-cloud다'] });

    const rows = client.sqlite
      .prepare('SELECT text, confirmed_at FROM note_claims WHERE note_id = ?')
      .all(note.id);
    expect(rows).toHaveLength(1);
    expect(buildDeck(client).cards[0]?.text).toBe('제품명은 firma-cloud다');
  });

  it('keeps a judgement when the same claim is written again', () => {
    const note = claimNote(['트라이얼은 14일이다']);
    const id = buildDeck(client).cards[0]?.id;
    if (id === undefined) return;
    confirmClaim(client, id, 'evidence');

    setNoteShape(client, { noteId: note.id, kind: 'position', claims: ['트라이얼은 14일이다'] });

    const row = client.sqlite
      .prepare('SELECT id, confirmed_at AS at FROM note_claims WHERE note_id = ?')
      .get(note.id) as { id: number; at: number | null };
    expect(row.id).toBe(id);
    expect(row.at).not.toBeNull();
  });

  it('puts a rule waiting for approval at the front, without it having been said', () => {
    claimNote(['어떤 주장']);
    const rule = addNote('노트는 자기 레이어가 정한 섹션을 갖춰 쓴다', 'rule');
    client.sqlite.prepare("UPDATE notes SET rule_status = 'provisional' WHERE id = ?").run(rule.id);

    expect(keys()[0]).toBe(`rule:${String(rule.id)}`);
  });

  it('leaves a 중복 hypothesis out and keeps a 충돌 one that was said', () => {
    const source = addNote('a source', 'past', 'first body');
    spoke(source.id);
    const dup = mintInference(client, {
      title: '중복: "A" ↔ "B"',
      summary: '두 노트가 겹친다',
      evidence: [{ noteId: source.id }],
    });
    const clash = mintInference(client, {
      title: '충돌: "A" ↔ "B"',
      summary: '두 노트가 어긋난다',
      evidence: [{ noteId: source.id }],
    });
    updateNote(client, source.id, { content: 'a different body' });

    const found = keys();
    expect(found).toContain(`inference:${String(clash.id)}`);
    expect(found).not.toContain(`inference:${String(dup.id)}`);
  });

  it('leaves out a hypothesis built on notes the agent never used', () => {
    const source = addNote('a quiet source', 'past', 'first body');
    const quiet = mintInference(client, {
      title: '충돌: "A" ↔ "B"',
      summary: '조용한 가설',
      evidence: [{ noteId: source.id }],
    });
    updateNote(client, source.id, { content: 'moved on' });

    expect(keys()).not.toContain(`inference:${String(quiet.id)}`);
  });

  it('hands out one session at a time and never opens the next by itself', () => {
    for (let n = 0; n < SESSION + 4; n += 1) claimNote([`주장 ${String(n)}`]);

    expect(buildDeck(client).cards).toHaveLength(SESSION);
    expect(buildDeck(client, { sessions: 2 }).cards).toHaveLength(SESSION + 4);
  });

  it('holds a deferred card back until the agent uses it again', () => {
    const note = claimNote(['보류할 주장']);
    const key = `claim:${String(buildDeck(client).cards[0]?.id ?? 0)}`;
    const state = deckCardState(client, key);
    expect(state).not.toBeNull();
    if (state) deferReviewItem(client, state);

    expect(buildDeck(client).cards).toEqual([]);

    spoke(note.id);
    expect(keys()).toContain(key);
  });

  it('orders by what moved, then by how often it was said', () => {
    const quiet = claimNote(['조용한 주장']);
    const loud = claimNote(['자주 쓰인 주장']);
    spoke(loud.id);
    spoke(loud.id);

    const cards = eligibleCards(client);
    expect(cards[0]?.source?.id).toBe(loud.id);
    expect(cards.map((c) => c.source?.id)).toContain(quiet.id);
  });
});
