const KEY = 'memex-recent';
const KEEP = 8;

export type Visit = { id: number; title: string };

const parse = (raw: string | null): Visit[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Visit[]) : [];
  } catch {
    return [];
  }
};

export const recentVisits = (): Visit[] =>
  typeof localStorage === 'undefined' ? [] : parse(localStorage.getItem(KEY));

export const rememberVisit = (visit: Visit) => {
  if (typeof localStorage === 'undefined') return;
  const kept = [visit, ...recentVisits().filter((v) => v.id !== visit.id)].slice(0, KEEP);
  localStorage.setItem(KEY, JSON.stringify(kept));
};
