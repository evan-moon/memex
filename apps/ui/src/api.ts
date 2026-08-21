export type NoteRef = {
  id: number;
  title: string;
  layer: string;
  at: number;
  reason?: string | null;
};

export type Companion = { tag: string; shared: number; overlap: number; sameThing: boolean };

export type Topic = {
  tag: string;
  count: number;
  spark: number[];
  lastAt: number;
  dormant: boolean;
  currentCount: number;
  changedCount: number;
  reviewCount: number;
  current: NoteRef[];
  outdated: NoteRef[];
  companions: Companion[];
  arcs: { reasoning: string; noteIds: number[] }[];
};

export type TopicDetail = Topic & { notes: NoteRef[] };

export type NoteDetail = {
  id: number;
  title: string;
  content: string;
  layer: string;
  at: number;
  tags: string[];
  obsidianUrl: string | null;
  wikiLinks: { title: string; id: number }[];
  stale: { newer: NoteRef[] } | null;
  supersededBy: NoteRef[];
  corrects: NoteRef[];
  backlinks: NoteRef[];
  related: NoteRef[];
};

export type DraftChange = { text: string; from: number[] };

export type DraftVerdict = 'changed' | 'no-change' | 'unexplained';

export type Overview = {
  notes: number;
  chunks: number;
  links: { wiki: number; amends: number };
  topics: number;
  changed: number;
  review: number;
  activity: { date: string; notes: number }[];
  tidy: { pairs: { keep: string; drop: string[]; notes: number }[]; notes: number };
  staleness: {
    tag: string;
    count: number;
    outdated: number;
    share: number;
    spark: number[];
    lastAt: number;
  }[];
};

export type Sidebar = {
  counts: Record<string, number>;
  stale: number[];
  state: NoteRef[];
  rule: NoteRef[];
  past: NoteRef[];
};

export type SearchHit = NoteRef & {
  snippet: string;
  supersededBy: { id: number; title: string } | null;
};

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
};

const post = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error((data as { error?: string } | null)?.error ?? `${path} → ${res.status}`);
  return data as T;
};

export const api = {
  sidebar: () => get<Sidebar>('/api/sidebar'),
  overview: () => get<Overview>('/api/overview'),
  topics: () => get<Topic[]>('/api/topics'),
  topic: (tag: string) => get<TopicDetail>(`/api/topic/${encodeURIComponent(tag)}`),
  note: (id: number) => get<NoteDetail>(`/api/note/${id}`),
  search: (q: string) => get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  draft: (id: number) =>
    post<{
      body: string;
      changes: DraftChange[];
      verdict: DraftVerdict;
      reason: string;
      cost: number;
    }>(`/api/draft/${id}`),
  saveNote: (id: number, body: string) => post<NoteDetail>(`/api/note/${id}`, { body }),
  stillTrue: (id: number) => post<{ ok: true }>(`/api/still-true/${id}`),
};
