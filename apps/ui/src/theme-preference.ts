export type ResolvedTheme = 'light' | 'dark';

export type ThemePreference = 'system' | ResolvedTheme;

export const readThemePreference = (value: string | null): ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system' ? value : 'system';

export const resolveTheme = (
  preference: ThemePreference,
  system: ResolvedTheme,
): { preference: ThemePreference; resolved: ResolvedTheme } => ({
  preference,
  resolved: preference === 'system' ? system : preference,
});
