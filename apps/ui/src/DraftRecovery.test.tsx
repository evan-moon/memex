import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DraftRecovery } from './DraftRecovery.tsx';
import { setLocale } from './i18n.ts';

describe('DraftRecovery', () => {
  it('shows a resumable draft and a way to discard it', () => {
    setLocale('en');
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DraftRecovery
          drafts={[
            {
              draftKey: 'new:k-1',
              documentId: null,
              title: 'A working title',
              snippet: 'An unfinished paragraph',
              path: '/new?draft=new%3Ak-1',
              at: Date.now(),
            },
          ]}
          onDiscard={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('Unsaved drafts');
    expect(html).toContain('A working title');
    expect(html).toContain('href="/new?draft=new%3Ak-1"');
    expect(html).toContain('Resume');
    expect(html).toContain('Discard');
  });
});
