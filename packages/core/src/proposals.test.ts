import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getProposal, type MemexClient, openDb, putProposal } from '@memex/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument, type DocumentContext, updateDocument } from './documents.ts';
import { applyProposal, discardProposal, isProposalFailure } from './proposals.ts';

let dbDir: string;
let vault: string;
let client: MemexClient;

const user = (): DocumentContext => ({ actor: 'user', vaultPath: vault });

const RAW = [
  '---',
  'title: 원고',
  'cssclass: wide',
  '---',
  '',
  '첫 문단.',
  '',
  '둘째 문단.',
  '',
].join('\n');

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'memex-proposals-db-'));
  vault = mkdtempSync(join(tmpdir(), 'memex-proposals-vault-'));
  client = openDb(dbDir);
});

afterEach(() => {
  client.sqlite.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(vault, { recursive: true, force: true });
});

const make = () => {
  const made = createDocument(client, { title: '원고', raw: RAW }, user());
  if ('error' in made) throw new Error('setup failed');
  return made;
};

// Offsets are into the body, which is what the person selected in. The
// frontmatter is not in that coordinate space.
const bodyOffsetOf = (needle: string) => {
  const body = RAW.slice(RAW.indexOf('---', 4) + 4).replace(/^\n+/, '');
  return { from: body.indexOf(needle), to: body.indexOf(needle) + needle.length };
};

describe('applyProposal', () => {
  it('replaces only the passage it was about', () => {
    const made = make();
    const at = bodyOffsetOf('첫 문단.');
    const proposal = putProposal(client, {
      documentId: made.id,
      baseRevision: made.revision,
      range: { ...at, exactText: '첫 문단.' },
      replacement: '고쳐 쓴 문단.',
    });

    const done = applyProposal(client, proposal.id, user());

    expect(isProposalFailure(done)).toBe(false);
    const onDisk = readFileSync(join(vault, '원고.md'), 'utf8');
    expect(onDisk).toContain('고쳐 쓴 문단.');
    expect(onDisk).toContain('둘째 문단.');
    expect(onDisk).toContain('cssclass: wide');
  });

  it('marks the offer decided so it cannot be applied twice', () => {
    const made = make();
    const at = bodyOffsetOf('첫 문단.');
    const proposal = putProposal(client, {
      documentId: made.id,
      baseRevision: made.revision,
      range: { ...at, exactText: '첫 문단.' },
      replacement: '한 번만.',
    });

    applyProposal(client, proposal.id, user());
    const again = applyProposal(client, proposal.id, user());

    expect(again).toMatchObject({ error: 'not-pending', status: 'applied' });
  });

  // A07. The document was edited after the agent wrote this, so the offsets no
  // longer point where it thought.
  it('refuses when the document moved after the offer was written', () => {
    const made = make();
    const at = bodyOffsetOf('첫 문단.');
    const proposal = putProposal(client, {
      documentId: made.id,
      baseRevision: made.revision,
      range: { ...at, exactText: '첫 문단.' },
      replacement: '고쳐 쓴 문단.',
    });
    updateDocument(
      client,
      made.id,
      {
        raw: `${RAW}\n사람이 나중에 쓴 문단.\n`,
        expectedRevision: made.revision,
        mutationId: 'm-1',
      },
      user(),
    );

    const done = applyProposal(client, proposal.id, user());

    expect(done).toMatchObject({ error: 'base-moved' });
    expect(readFileSync(join(vault, '원고.md'), 'utf8')).toContain('사람이 나중에 쓴 문단.');
    expect(getProposal(client, proposal.id)?.status).toBe('conflicted');
  });

  // The version can be right and the offsets still wrong, if the proposal was
  // written against text the agent misread.
  it('refuses when the passage is not where it was said to be', () => {
    const made = make();
    const proposal = putProposal(client, {
      documentId: made.id,
      baseRevision: made.revision,
      range: { from: 0, to: 5, exactText: '있지도 않은 문장' },
      replacement: '바꿔치기',
    });

    const done = applyProposal(client, proposal.id, user());

    expect(done).toMatchObject({ error: 'text-moved' });
    expect(readFileSync(join(vault, '원고.md'), 'utf8')).toBe(RAW);
  });

  it('leaves the document alone when the offer is thrown away', () => {
    const made = make();
    const proposal = putProposal(client, {
      documentId: made.id,
      baseRevision: made.revision,
      replacement: '전부 새로 씀',
    });

    discardProposal(client, proposal.id);

    expect(readFileSync(join(vault, '원고.md'), 'utf8')).toBe(RAW);
    expect(applyProposal(client, proposal.id, user())).toMatchObject({ status: 'discarded' });
  });

  // A06. The request was about this document, and switching tabs while it ran
  // does not make it about another one.
  it('is bound to the document it was written for', () => {
    const one = make();
    const two = createDocument(client, { title: '다른 원고', raw: '다른 글\n' }, user());
    if ('error' in two) throw new Error('setup failed');

    const proposal = putProposal(client, {
      documentId: one.id,
      baseRevision: one.revision,
      replacement: '한쪽에만',
    });
    applyProposal(client, proposal.id, user());

    expect(readFileSync(join(vault, '다른 원고.md'), 'utf8')).toBe('다른 글\n');
  });

  it('has nothing to apply for an offer that never existed', () => {
    expect(applyProposal(client, 'never', user())).toMatchObject({ error: 'not-found' });
  });
});
