import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ClaudeCodeState, Overview as OverviewData } from './api.ts';
import { gateFrom } from './first-run.ts';
import { dictionaries, setLocale } from './i18n.ts';
import { Overview } from './Overview.tsx';

const emptyVault: OverviewData = {
  notes: 0,
  chunks: 0,
  links: { wiki: 0, amends: 0 },
  topics: 0,
  changed: 0,
  review: 0,
  activity: [{ date: '2026-08-29', notes: 0 }],
  staleness: [],
};

const render = (data: OverviewData) => {
  setLocale('en');
  return renderToStaticMarkup(
    <MemoryRouter>
      <Overview data={data} />
    </MemoryRouter>,
  );
};

describe('the first-run gate', () => {
  it('waits rather than guessing while the setup state is still loading', () => {
    expect(gateFrom({ claude: null, failed: false }, false)).toBe('unknown');
  });

  it('sends someone who has not signed in to the setup screen', () => {
    expect(gateFrom({ claude: { kind: 'missing' }, failed: false }, false)).toBe('needed');
    expect(
      gateFrom({ claude: { kind: 'logged-out', binary: '/bin/claude' }, failed: false }, false),
    ).toBe('needed');
  });

  it('does not gate on a version it cannot read, but does send them there', () => {
    const unreadable: ClaudeCodeState = {
      kind: 'unreadable',
      binary: '/bin/claude',
      reason: 'nonsense',
    };

    expect(gateFrom({ claude: unreadable, failed: false }, false)).toBe('needed');
  });

  it('lets a signed-in machine straight through', () => {
    expect(
      gateFrom(
        {
          claude: { kind: 'ready', binary: '/bin/claude', method: 'claude.ai', plan: 'max' },
          failed: false,
        },
        false,
      ),
    ).toBe('clear');
  });

  // Someone who skipped, and someone who finished, are the same person on the
  // next launch: a setup screen that comes back on its own is the app losing
  // what it was told.
  it('opens rather than holds the door shut when the check itself fails', () => {
    expect(gateFrom({ claude: null, failed: true }, false)).toBe('clear');
  });

  it('stays out of the way once it has settled, whatever the state says', () => {
    expect(gateFrom({ claude: { kind: 'missing' }, failed: false }, true)).toBe('clear');
    expect(gateFrom({ claude: null, failed: true }, true)).toBe('clear');
  });
});

describe('an empty vault', () => {
  it('says nothing has started, instead of assembling a dashboard of zeroes', () => {
    const t = dictionaries.en;
    const html = render(emptyVault);

    expect(html).toContain(t.overview.emptyTitle);
    expect(html).toContain('/connect');
    // The daily card is what says "All done.", and it only says it because the
    // rest of the screen renders around it. Nothing here has started, so none
    // of that scaffolding is built.
    expect(html).not.toContain(t.overview.activityTitle);
    expect(html).not.toContain(t.overview.stalenessTitle);
  });

  it('still builds the whole screen once something has been written', () => {
    const t = dictionaries.en;
    const html = render({ ...emptyVault, notes: 1 });

    expect(html).toContain(t.overview.activityTitle);
    expect(html).not.toContain(t.overview.emptyTitle);
  });
});
