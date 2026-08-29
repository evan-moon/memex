export type NoteStatus =
  | { kind: 'amended'; by: { id: number; title: string } }
  | { kind: 'piled-up'; count: number }
  | { kind: 'recent' };

export type NoteRef = {
  id: number;
  title: string;
  layer: string;
  author?: string;
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
  hypotheses: { id: number; title: string; status: string; shared: number }[];
};

export type TopicDetail = Topic & { notes: NoteRef[] };

export type ThreadStep = {
  id: number;
  title: string;
  layer: string;
  at: number;
  children: ThreadStep[];
};

export type ThreadRef = {
  rootId: number;
  title: string;
  steps: number;
  branches: number;
  startedAt: number;
  lastAt: number;
  tags: string[];
};

export type Thread = ThreadRef & { root: ThreadStep };

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
  author: string;
  at: number;
  updatedAt: number;
  tags: string[];
  filePath: string;
  folder: string | null;
  amendment: Amendment | null;
  wikiLinks: { title: string; id: number }[];
  deadLinks: string[];
  evidence: {
    id: number;
    title: string | null;
    changed: boolean;
    missing: boolean;
    amendedBy: { id: number; title: string } | null;
  }[];
  candidateSources: NoteRef[];
  hypotheses: { id: number; title: string; status: string }[];
  stale: { newer: NoteRef[] } | null;
  supersededBy: NoteRef[];
  corrects: NoteRef[];
  backlinks: NoteRef[];
  related: NoteRef[];
};

export type NoteSource = { path: string; text: string | null };

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
  rulesWaiting: number;
};

export type RuleCard = {
  id: number;
  title: string;
  content: string;
  truncated: boolean;
  author: string;
  source: string;
  createdAt: number;
};

export type RulesScreen = { waiting: RuleCard[]; active: RuleCard[] };

export type TodayItem =
  | { kind: 'evidence-moved'; id: number; title: string }
  | { kind: 'typo-link'; id: number; title: string; target: string; nearest: string }
  | { kind: 'undeclared'; id: number; title: string; candidates: number };

export type Buried = {
  undeclared: number;
  staleNotes: number;
  forwardLinks: number;
  placeholders: number;
  tagMerges: number;
  looseTags: number;
};

export type Today = { items: TodayItem[]; buried: Buried };

export type SearchHit = NoteRef & { snippet: string };

export type SearchFilters = {
  layer?: string;
  author?: string;
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

export type InferenceDetail = {
  inference: {
    id: number;
    title: string;
    summary: string;
    confidence: number | null;
    status: string;
    modelId: string | null;
    promptText: string | null;
    createdAt: number;
    updatedAt: number;
  };
  evidence: {
    noteId: number;
    role: string;
    title: string | null;
    sourceExcerpt: string | null;
    changed: boolean;
    missing: boolean;
  }[];
};

export type NoteTitle = { id: number; title: string; layer: string; author?: string };

export type NotePatch = {
  body?: string;
  title?: string;
  tags?: string[];
  layer?: string;
  derivesFrom?: number[];
};

export type NewNote = {
  title: string;
  content: string;
  layer: string;
  folder?: string;
  tags?: string[];
  amends?: number;
};

export type MergeCandidate = {
  kind: 'spelling' | 'overlap';
  keep: string;
  drop: string[];
  notes: number;
  overlap?: number;
};

export type RenameResult = {
  notes: number;
  files: number;
  unwritten: string[];
  skipped: number;
};

export type TagRow = { tag: string; notes: number; mine: number };

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

export type RepairCard = {
  id: number;
  title: string;
  layer: string;
  at: number;
  updatedAt: number;
  claims: string[];
  candidates: NoteRef[];
};

export type RepairBatch = { remaining: number; cards: RepairCard[] };

export type RegisterScope = { kind: 'global' } | { kind: 'period'; start: string; end: string };

export type RegisterValue = {
  id: number;
  value: string;
  author: 'person' | 'agent';
  at: number;
  note: { id: number; title: string } | null;
};

export type RegisterEntry = {
  scope: RegisterScope;
  heads: RegisterValue[];
  changes: number;
};

export type RegisterKeyCard = { predicate: string; entries: RegisterEntry[] };

export type RegisterScreen = { subject: string; keys: RegisterKeyCard[] };

export type RegisterSubjectRow = { subject: string; keys: number; lastAt: number };

export type RegisterHistoryEntry = RegisterValue & { superseded: boolean };

export const scopeParams = (scope: RegisterScope): Record<string, string> =>
  scope.kind === 'global'
    ? { scope: 'global' }
    : { scope: 'period', start: scope.start, end: scope.end };

export type ModelState =
  | { kind: 'ready' }
  | { kind: 'absent' }
  | { kind: 'downloading'; loaded: number; total: number }
  | { kind: 'failed'; error: string };

export type ClaudeCodeState =
  | { kind: 'missing' }
  | { kind: 'unreadable'; binary: string; reason: string }
  | { kind: 'logged-out'; binary: string }
  | { kind: 'ready'; binary: string; method: string | null; plan: string | null };

export type LoginState =
  | { kind: 'idle' }
  | { kind: 'waiting'; url: string | null }
  | { kind: 'failed'; error: string };

export type McpClientId = 'claude-desktop' | 'claude-code' | 'codex' | 'cursor';

export type McpRegistration =
  | { kind: 'absent' }
  | { kind: 'current' }
  | { kind: 'elsewhere'; command: string };

export type McpClient = {
  id: McpClientId;
  name: string;
  configPath: string;
  installed: boolean;
  registration: McpRegistration;
};

export type McpConnections = { serverPath: string; clients: McpClient[] };

export type ChatPreview =
  | {
      kind: 'register';
      subject: string;
      predicate: string;
      from: string[];
      to: string;
      newPredicate: boolean;
    }
  | { kind: 'amend'; target: { id: number; title: string } | null; title: string; body: string }
  | {
      kind: 'new-note';
      title: string;
      body: string;
      folder: string | null;
      layer: 'past' | 'state';
      tags: string[];
    }
  | {
      kind: 'rule';
      rule: { id: number; title: string } | null;
      decision: 'approve' | 'decline';
    };

export type ChatReceipt =
  | {
      kind: 'register';
      subject: string;
      predicate: string;
      previous: string[];
      value: string;
      newPredicate: boolean;
      similar: string[];
    }
  | {
      kind: 'note';
      id: number;
      title: string;
      corrected: { id: number; title: string } | null;
      unlinked: number | null;
    }
  | { kind: 'rule'; id: number; title: string; decision: 'approve' | 'decline' };

export type ChatRemedy = 'install' | 'sign-in' | 'billing' | 'retry' | 'rephrase' | 'none';

export type ChatReply =
  | { kind: 'done'; receipt: ChatReceipt }
  | { kind: 'confirm'; ticket: string; preview: ChatPreview }
  | { kind: 'unmapped'; reason: 'none' | 'unknown-target'; searchable: boolean }
  | { kind: 'failed'; failure: string; remedy: ChatRemedy; detail: string };

export type ChatTarget = { kind: 'register'; subject: string } | { kind: 'note'; id: number };

const chatQuery = (target: ChatTarget | null) => {
  if (target === null) return '';
  return target.kind === 'register'
    ? `?subject=${encodeURIComponent(target.subject)}`
    : `?note=${target.id}`;
};

export const api = {
  chat: (message: string, target: ChatTarget | null, operationId: string) =>
    post<ChatReply>(`/api/chat${chatQuery(target)}`, { message, operationId }),
  cancelChat: (operationId: string) =>
    post<{ stopped: boolean }>('/api/chat/cancel', { operationId }),
  applyChat: (ticket: string) => post<ChatReply>('/api/chat/apply', { ticket }),
  sidebar: () => request<Sidebar>('/api/sidebar'),
  overview: () => request<Overview>('/api/overview'),
  today: () => request<Today>('/api/today'),
  dismissDangling: (noteId: number) => post<{ ok: true }>('/api/dangling/dismiss', { noteId }),
  digest: (days: number) => request<Digest>(`/api/digest?days=${days}`),
  topics: () => request<Topic[]>('/api/topics'),
  threads: () => request<Thread[]>('/api/threads'),
  thread: (id: number) => request<Thread>(`/api/thread/${id}`),
  topic: (tag: string) => request<TopicDetail>(`/api/topic/${encodeURIComponent(tag)}`),
  note: (id: number) => request<NoteDetail>(`/api/note/${id}`),
  source: (id: number) => request<NoteSource>(`/api/source/${id}`),
  search: (query: string, filters: SearchFilters = {}) =>
    request<SearchPage>(`/api/search?${searchQuery(query, filters)}`),
  titles: () => request<NoteTitle[]>('/api/titles'),
  facets: () => request<Facets>('/api/facets'),
  tagMerges: () => request<MergeCandidate[]>('/api/tag-merges'),
  tags: () => request<TagRow[]>('/api/tags'),
  repairEvidence: (limit: number) => request<RepairBatch>(`/api/repair/evidence?limit=${limit}`),
  inference: (id: number) => request<InferenceDetail>(`/api/inference/${id}`),
  archiveInference: (id: number) => post<{ ok: true }>(`/api/inference/${id}/archive`),
  keepInference: (id: number) => post<InferenceDetail>(`/api/inference/${id}/still-true`),
  promoteInference: (id: number) => post<NoteDetail>(`/api/inference/${id}/promote`),
  redraftInference: (id: number) =>
    post<{ title: string; summary: string; durationMs: number }>(`/api/inference/${id}/redraft`),
  rewriteInference: (id: number, next: { title: string; summary: string }) =>
    post<InferenceDetail>(`/api/inference/${id}/rewrite`, next),
  deleteTags: (tags: string[]) => post<RenameResult>('/api/tags/delete', { tags }),
  renameTags: (from: string[], to: string) => post<RenameResult>('/api/tags/rename', { from, to }),
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
  rules: () => request<RulesScreen>('/api/rules'),
  approveRule: (id: number) => post<{ ok: true }>(`/api/rule/${id}/approve`),
  declineRule: (id: number, layer: 'past' | 'state') =>
    post<{ ok: true }>(`/api/rule/${id}/decline`, { layer }),
  registerSubjects: () => request<RegisterSubjectRow[]>('/api/register'),
  register: (subject: string) =>
    request<RegisterScreen>(`/api/register/${encodeURIComponent(subject)}`),
  registerHistory: (subject: string, predicate: string, scope: RegisterScope) =>
    request<RegisterHistoryEntry[]>(
      `/api/register/${encodeURIComponent(subject)}?${new URLSearchParams({
        predicate,
        ...scopeParams(scope),
      })}`,
    ),
  setRegister: (
    subject: string,
    entry: { predicate: string; value: string; scope: RegisterScope },
  ) =>
    post<RegisterScreen>(`/api/register/${encodeURIComponent(subject)}`, {
      predicate: entry.predicate,
      value: entry.value,
      ...scopeParams(entry.scope),
    }),
  model: () => request<ModelState>('/api/model'),
  downloadModel: () => post<ModelState>('/api/model'),
  claude: () => request<ClaudeCodeState>('/api/claude'),
  installClaude: () => post<ClaudeCodeState>('/api/claude/install'),
  loginClaude: (method: 'claudeai' | 'console') =>
    post<{ login: LoginState; claude: ClaudeCodeState }>('/api/claude/login', { method }),
  mcp: () => request<McpConnections>('/api/mcp'),
  connectMcp: (client: McpClientId) => post<McpConnections>('/api/mcp/connect', { client }),
};
