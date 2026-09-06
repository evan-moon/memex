import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLAIM_TRUST,
  claimStandingFor,
  claimTrustFactor,
  confirmClaim,
  listClaims,
  setNoteShape,
} from './claims.ts';
import { type MemexClient, openDb } from './client.ts';
import { insertNote } from './repository.ts';

let dir: string;
let client: MemexClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memex-standing-'));
  client = openDb(dir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const noteWith = (claims: string[]) => {
  const note = insertNote(client, {
    title: `n${String(claims.length)}`,
    content: 'body',
    filePath: join(dir, `${String(Math.random())}.md`),
    source: 'manual',
    layer: 'state',
  });
  setNoteShape(client, { noteId: note.id, kind: 'position', claims });
  return note;
};

describe('claimStandingFor', () => {
  it('leaves out a note with no claims', () => {
    const note = insertNote(client, {
      title: 'plain',
      content: 'body',
      filePath: join(dir, 'plain.md'),
      source: 'manual',
      layer: 'past',
    });
    expect(claimStandingFor(client, [note.id]).has(note.id)).toBe(false);
  });

  it('sorts a note’s claims by what a person said about them', () => {
    const note = noteWith(['a', 'b', 'c']);
    const [first, second] = listClaims(client, [note.id]);
    if (!first || !second) throw new Error('claims missing');
    confirmClaim(client, first.id, 'card');
    client.sqlite
      .prepare("UPDATE note_claims SET status = 'closed', valid_until = 1 WHERE id = ?")
      .run(second.id);

    const standing = claimStandingFor(client, [note.id]).get(note.id);
    expect(standing?.confirmed.map((c) => c.text)).toEqual(['a']);
    expect(standing?.closed.map((c) => c.text)).toEqual(['b']);
    expect(standing?.unconfirmed.map((c) => c.text)).toEqual(['c']);
  });
});

describe('claimTrustFactor', () => {
  it('is neutral for a note nobody extracted claims from', () => {
    expect(claimTrustFactor(undefined)).toBe(1);
  });

  it('lifts a note a person stood behind', () => {
    const note = noteWith(['a']);
    const [claim] = listClaims(client, [note.id]);
    if (claim) confirmClaim(client, claim.id, 'card');
    expect(claimTrustFactor(claimStandingFor(client, [note.id]).get(note.id))).toBe(
      CLAIM_TRUST.confirmed,
    );
  });

  it('reads an unchecked note as slightly less certain, not as wrong', () => {
    const note = noteWith(['a']);
    const factor = claimTrustFactor(claimStandingFor(client, [note.id]).get(note.id));
    expect(factor).toBe(CLAIM_TRUST.unchecked);
    expect(factor).toBeGreaterThan(CLAIM_TRUST.closed);
  });

  it('drops a note whose every claim has been closed', () => {
    const note = noteWith(['a']);
    client.sqlite.prepare("UPDATE note_claims SET status = 'closed' WHERE note_id = ?").run(note.id);
    expect(claimTrustFactor(claimStandingFor(client, [note.id]).get(note.id))).toBe(
      CLAIM_TRUST.closed,
    );
  });
});
