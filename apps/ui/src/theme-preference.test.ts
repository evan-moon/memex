import { describe, expect, it } from 'vitest';
import { readThemePreference, resolveTheme } from './theme-preference.ts';

describe('theme preference', () => {
  it('follows a dark system while keeping system as the preference', () => {
    expect(resolveTheme('system', 'dark')).toEqual({ preference: 'system', resolved: 'dark' });
  });

  it('follows a light system while keeping system as the preference', () => {
    expect(resolveTheme('system', 'light')).toEqual({ preference: 'system', resolved: 'light' });
  });

  it('keeps an explicit theme when the system changes', () => {
    expect(resolveTheme('dark', 'light')).toEqual({ preference: 'dark', resolved: 'dark' });
  });

  it('migrates an empty or unknown stored value to system', () => {
    expect(readThemePreference(null)).toBe('system');
    expect(readThemePreference('sepia')).toBe('system');
  });
});
