export type NoteStatus =
  | { kind: 'amended'; by: { id: number; title: string } }
  | { kind: 'piled-up'; count: number }
  | { kind: 'recent' };

export type NoteRef = {
  id: number;
  title: string;
  layer: string;
  at: number;
  status?: NoteStatus | null;
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
  arcs: { reasoning: string | null; noteIds: number[] }[];
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

export type SearchHit = NoteRef & { snippet: string };

export type ApiFailure = { code: string; detail?: string };

const failed = (failure: ApiFailure) => Object.assign(new Error(failure.code), { failure });

const carriesFailure = (error: unknown): error is { failure: ApiFailure } =>
  typeof error === 'object' && error !== null && 'failure' in error;

export const toFailure = (error: unknown): ApiFailure =>
  carriesFailure(error)
    ? error.failure
    : { code: 'unknown', detail: error instanceof Error ? error.message : String(error) };

const failureOf = (data: unknown): ApiFailure | null => {
  if (typeof data !== 'object' || data === null || !('error' in data)) return null;
  const { error } = data;
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error;
  if (typeof code !== 'string') return null;
  const detail = 'detail' in error && typeof error.detail === 'string' ? error.detail : undefined;
  return { code, detail };
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, init).catch(() => null);
  if (!res) throw failed({ code: 'unreachable' });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw failed(failureOf(data) ?? { code: 'unknown', detail: `${path} → ${res.status}` });
  }
  return data as T;
};

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

export const api = {
  sidebar: () => request<Sidebar>('/api/sidebar'),
  overview: () => request<Overview>('/api/overview'),
  topics: () => request<Topic[]>('/api/topics'),
  topic: (tag: string) => request<TopicDetail>(`/api/topic/${encodeURIComponent(tag)}`),
  note: (id: number) => request<NoteDetail>(`/api/note/${id}`),
  search: (q: string) => request<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  draft: (id: number) =>
    post<{
      body: string;
      changes: DraftChange[];
      verdict: DraftVerdict;
      reason: string;
      durationMs: number;
    }>(`/api/draft/${id}`),
  saveNote: (id: number, body: string) => post<NoteDetail>(`/api/note/${id}`, { body }),
  stillTrue: (id: number) => post<{ ok: true }>(`/api/still-true/${id}`),
};
