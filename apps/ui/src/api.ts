export type NoteRef = {
  id: number;
  title: string;
  layer: string;
  at: number;
  reason?: string | null;
};

export type Topic = {
  tag: string;
  count: number;
  spark: number[];
  lastAt: number;
  dormant: boolean;
  currentCount: number;
  outdatedCount: number;
  current: NoteRef[];
  outdated: NoteRef[];
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
  supersededBy: NoteRef[];
  corrects: NoteRef[];
  backlinks: NoteRef[];
  related: NoteRef[];
};

export type Overview = {
  notes: number;
  chunks: number;
  links: { wiki: number; amends: number };
  topics: number;
  outdated: number;
  activity: { date: string; notes: number }[];
  staleness: { tag: string; count: number; outdated: number; share: number }[];
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

export const api = {
  sidebar: () => get<Sidebar>('/api/sidebar'),
  overview: () => get<Overview>('/api/overview'),
  topics: () => get<Topic[]>('/api/topics'),
  topic: (tag: string) => get<TopicDetail>(`/api/topic/${encodeURIComponent(tag)}`),
  note: (id: number) => get<NoteDetail>(`/api/note/${id}`),
  search: (q: string) => get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
};
