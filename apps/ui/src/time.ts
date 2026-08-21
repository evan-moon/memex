import type { Strings } from './i18n.ts';

// A note with no usable timestamp is worth rendering without its date; throwing
// here unmounts the screen it appears on.
export const day = (ms: number) =>
  Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '—';

export const ago = (t: Strings, ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return t.time.unknown;
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  if (d < 1) return t.time.today;
  if (d < 30) return t.time.daysAgo(d);
  if (d < 365) return t.time.monthsAgo(Math.floor(d / 30));
  return t.time.yearsAgo(d / 365);
};
