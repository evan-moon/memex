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

export type Amendment = {
  action: 'save_note';
  title: string;
  link: string;
  layer: string;
  amends: number;
};

export type NoteDetail = {
  id: number;
  title: string;
  content: string;
  layer: string;
  at: number;
  tags: string[];
  obsidianUrl: string | null;
  folder: string | null;
  amendment: Amendment | null;
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
};

export type SearchHit = NoteRef & { snippet: string };

export type SearchFilters = {
  layer?: string;
  tag?: string;
  folder?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export type SearchPage = {
  results: SearchHit[];
  collapsed: { key: string; label: string; hidden: number }[];
  limit: number;
};

export type NoteTitle = { id: number; title: string; layer: string };

export type NotePatch = { body?: string; title?: string; tags?: string[]; layer?: string };

export type NewNote = {
  title: string;
  content: string;
  layer: string;
  folder?: string;
  tags?: string[];
  amends?: number;
};

export type Facets = {
  folders: { name: string; count: number }[];
  tags: { name: string; count: number }[];
};

export type DigestNote = NoteRef & { tags: string[] };

export type Digest = {
  days: number;
  since: number;
  total: number;
  folders: { folder: string; notes: DigestNote[] }[];
  signals: { type: string; count: number }[];
  attention: { id: number; title: string; count: number }[];
  inferences: { active: { id: number; title: string }[]; stale: { id: number; title: string }[] };
  connection: { from: DigestNote; to: DigestNote; daysApart: number } | null;
};

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

export const searchQuery = (query: string, filters: SearchFilters): string => {
  const params = new URLSearchParams({ q: query });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
};

export const api = {
  sidebar: () => request<Sidebar>('/api/sidebar'),
  overview: () => request<Overview>('/api/overview'),
  digest: (days: number) => request<Digest>(`/api/digest?days=${days}`),
  topics: () => request<Topic[]>('/api/topics'),
  topic: (tag: string) => request<TopicDetail>(`/api/topic/${encodeURIComponent(tag)}`),
  note: (id: number) => request<NoteDetail>(`/api/note/${id}`),
  search: (query: string, filters: SearchFilters = {}) =>
    request<SearchPage>(`/api/search?${searchQuery(query, filters)}`),
  titles: () => request<NoteTitle[]>('/api/titles'),
  facets: () => request<Facets>('/api/facets'),
  draft: (id: number) =>
    post<{
      body: string;
      changes: DraftChange[];
      verdict: DraftVerdict;
      reason: string;
      durationMs: number;
    }>(`/api/draft/${id}`),
  updateNote: (id: number, patch: NotePatch) => post<NoteDetail>(`/api/note/${id}`, patch),
  createNote: (input: NewNote) => post<NoteDetail>('/api/notes', input),
  stillTrue: (id: number) => post<{ ok: true }>(`/api/still-true/${id}`),
};
