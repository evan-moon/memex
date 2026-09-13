import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthoringProgress } from './AuthoringProgress.tsx';
import { dictionaries } from './i18n.ts';

describe('AuthoringProgress', () => {
  it('shows the work completed and the work happening now', () => {
    const html = renderToStaticMarkup(
      <AuthoringProgress
        steps={[
          { kind: 'gathering' },
          { kind: 'thinking' },
          { kind: 'acting', action: 'new-note' },
        ]}
        stopping={false}
        t={dictionaries.en}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain(dictionaries.en.chat.steps.gathering);
    expect(html).toContain(dictionaries.en.chat.steps.writing);
    expect(html).toContain(dictionaries.en.edit.stopDraft);
    expect(html).toContain('animate-spin');
  });
});
