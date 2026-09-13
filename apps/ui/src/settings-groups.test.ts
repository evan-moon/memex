import { describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS } from './settings-groups.ts';

describe('settings groups', () => {
  it('groups settings by the thing a person wants to change', () => {
    expect(SETTINGS_GROUPS).toEqual([
      { id: 'appearance', sections: ['appearance', 'language'] },
      { id: 'notes', sections: ['sources', 'searchModel'] },
      { id: 'ai', sections: ['thinkingApps', 'models'] },
      { id: 'connections', sections: ['apps'] },
      { id: 'data', sections: ['vault'] },
    ]);
  });
});
