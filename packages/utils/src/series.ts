const DATE_TAIL = /[\s([]*\d{4}[-.]\d{1,2}(?:[-.]\d{1,2})?(?:\s*~\s*[\d-.]+)?[\s)\]]*$/;
const SUBTITLE = /\s+[—–-]\s+.*$/;
const ORDINAL_TAIL = /\s*[([]?\s*(?:\d+|[ivx]+)\s*(?:회|차|편|부)?\s*[)\]]?\s*$/i;
const AMENDMENT_PREFIX = /^\s*(?:\[[^\]]*\]\s*)*\[Amendment(?:\s+\d+)?\]\s*/i;

// A stem long enough to be distinctive identifies a series on its own: the same
// log can straddle folders (or carry no category at all), and keying on the
// folder splits it into pieces that each get their own slots. Short stems like
// "회고" do collide across folders, so those keep the category.
const DISTINCTIVE_STEM = 8;

export const seriesLabel = (title: string): string =>
  title
    .replace(AMENDMENT_PREFIX, '')
    .replace(SUBTITLE, '')
    .replace(DATE_TAIL, '')
    .replace(ORDINAL_TAIL, '')
    .trim();

export const seriesKey = (title: string, category?: string | null): string => {
  const stem = seriesLabel(title).toLowerCase();
  return stem.length >= DISTINCTIVE_STEM ? stem : `${category ?? ''}|${stem}`;
};

export type SeriesMember = { title: string; category?: string | null };

export const isSameSeries = (a: SeriesMember, b: SeriesMember): boolean =>
  seriesKey(a.title, a.category) === seriesKey(b.title, b.category);

export type CollapsedSeries<T> = {
  results: T[];
  collapsed: { key: string; label: string; hidden: number }[];
};

/**
 * Keep at most `keep` notes from any one dated series at the top of a result
 * page, so a 28-part work log cannot take every slot. Extra members are pushed
 * below the diverse results rather than dropped, so a page never comes back
 * shorter than it would have been — only differently ordered.
 */
export const collapseSeries = <T extends SeriesMember>(
  candidates: T[],
  limit: number,
  keep = 2,
): CollapsedSeries<T> => {
  const counts = new Map<string, number>();
  const split = candidates.reduce<{ primary: T[]; deferred: T[] }>(
    (acc, candidate) => {
      const key = seriesKey(candidate.title, candidate.category);
      const taken = counts.get(key) ?? 0;
      if (taken >= keep) return { ...acc, deferred: [...acc.deferred, candidate] };
      counts.set(key, taken + 1);
      return { ...acc, primary: [...acc.primary, candidate] };
    },
    { primary: [], deferred: [] },
  );

  const ordered = [...split.primary, ...split.deferred];
  const hidden = ordered
    .slice(limit)
    .reduce<Map<string, { label: string; hidden: number }>>((acc, candidate) => {
      const key = seriesKey(candidate.title, candidate.category);
      if ((counts.get(key) ?? 0) < keep) return acc;
      const entry = acc.get(key) ?? { label: seriesLabel(candidate.title), hidden: 0 };
      return acc.set(key, { ...entry, hidden: entry.hidden + 1 });
    }, new Map());

  return {
    results: ordered.slice(0, limit),
    collapsed: [...hidden.entries()].map(([key, entry]) => ({
      key,
      label: entry.label,
      hidden: entry.hidden,
    })),
  };
};
