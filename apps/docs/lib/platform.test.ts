import { describe, expect, it } from 'vitest';
import { onWindows } from './platform';

describe('who the download is offered to', () => {
  it('knows Windows from its user agent', () => {
    expect(
      onWindows(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      ),
    ).toBe(true);
  });

  it('leaves everyone else with the download', () => {
    const others = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    ];
    for (const agent of others) expect(onWindows(agent)).toBe(false);
  });
});
