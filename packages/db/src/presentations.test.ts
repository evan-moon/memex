import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MemexClient, openDb } from './client.ts';
import {
  presentationsFor,
  receptionCounts,
  recordPresentation,
  wasIgnored,
} from './presentations.ts';

describe('signal presentations', () => {
  let dir: string;
  let client: MemexClient;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memex-presentations-'));
    client = openDb(dir);
  });

  afterEach(() => {
    client.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records nothing until a signal is shown', () => {
    expect(presentationsFor(client, 1)).toEqual([]);
    expect(receptionCounts(client).size).toBe(0);
  });

  it('keeps every showing, not just the last', () => {
    recordPresentation(client, 7, 'mcp', 100);
    recordPresentation(client, 7, 'mcp', 200);
    recordPresentation(client, 9, 'ui', 150);

    expect(presentationsFor(client, 7).map((p) => p.at)).toEqual([100, 200]);
    expect(receptionCounts(client).get(7)).toMatchObject({ shown: 2, lastAt: 200 });
    expect(receptionCounts(client).get(9)).toMatchObject({ shown: 1, lastAt: 150 });
  });

  it('separates a signal declined by silence from one nobody was asked about', () => {
    recordPresentation(client, 7, 'mcp', 100);

    expect(wasIgnored(client, 7, 'new')).toBe(true);
    expect(wasIgnored(client, 8, 'new')).toBe(false);
  });

  it('does not call a triaged signal ignored, however often it was shown', () => {
    recordPresentation(client, 7, 'mcp', 100);

    expect(wasIgnored(client, 7, 'dismissed')).toBe(false);
    expect(wasIgnored(client, 7, 'minted')).toBe(false);
  });
});
