import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  api,
  type ApiFailure,
  type Facets,
  type NoteDetail,
  type SearchFilters,
  type SearchPage,
  type Topic,
  type TopicDetail,
} from './api.ts';
import { Agent, ago, Button, Card, day, Layer, NoteItem, NoteList } from './bits.tsx';
import { Evidence } from './Evidence.tsx';
import {
  Composer,
  correctionDraft,
  type Draft,
  missingNoteDraft,
  NoteEditor,
} from './editing.tsx';
import { useT } from './i18n.ts';
import { Markdown } from './Markdown.tsx';
import { Spark } from './Spark.tsx';
import { StalePanel } from './StalePanel.tsx';
import { rememberVisit } from './recent.ts';
import { useAsync } from './useAsync.ts';

const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">{children}</div>
);

const Pending = ({ failure }: { failure: ApiFailure | null }) => {
  const t = useT();
  return (
    <Page>
      <div className="py-16 text-sm text-muted">
        {failure ? t.error(failure) : t.common.loading}
      </div>
    </Page>
  );
};

export const TopicsScreen = ({ topics }: { topics: Topic[] }) => {
  const t = useT();
  return (
    <Page>
      <h1 className="text-xl font-semibold tracking-tight">{t.topics.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.topics.subtitle(topics.length)}</p>
      <div className="mt-4 divide-y divide-line border-y border-line">
        {topics.map((topic) => {
          const stale = topic.changedCount + topic.reviewCount;
          const total = Math.max(1, topic.currentCount + stale);
          return (
            <Link
              key={topic.tag}
              to={`/topic/${encodeURIComponent(topic.tag)}`}
              className={`flex items-center gap-4 py-4 hover:bg-surface ${topic.dormant ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-semibold text-primary">{topic.tag}</span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {t.common.notes(topic.count)}
                  </span>
                  {topic.dormant ? (
                    <span className="shrink-0 rounded-full border border-line px-2 text-[10px] text-muted">
                      {t.topics.dormant}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex h-1.5 max-w-sm overflow-hidden rounded-full bg-surface-muted">
                  <i
                    className="block h-full"
                    style={{
                      width: `${(topic.currentCount / total) * 100}%`,
                      background: 'var(--positive)',
                    }}
                  />
                  <i
                    className="block h-full"
                    style={{ width: `${(stale / total) * 100}%`, background: 'var(--caution)' }}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                  <span>
                    {t.topics.stillHolds}{' '}
                    <b className="tabular-nums" style={{ color: 'var(--positive)' }}>
                      {topic.currentCount}
                    </b>
                  </span>
                  <span>
                    {t.topics.oldNews}{' '}
                    <b className="tabular-nums" style={{ color: 'var(--caution)' }}>
                      {stale}
                    </b>
                  </span>
                  <span>{ago(t, topic.lastAt)}</span>
                </div>
              </div>
              <div className="hidden shrink-0 sm:block">
                <Spark values={topic.spark} />
              </div>
            </Link>
          );
        })}
      </div>
    </Page>
  );
};

export const TopicScreen = () => {
  const t = useT();
  const { tag = '' } = useParams();
  const { data, failure } = useAsync<TopicDetail>(() => api.topic(tag), tag);
  if (!data) return <Pending failure={failure} />;
  return (
    <Page>
      <h1 className="text-xl font-semibold tracking-tight">{data.tag}</h1>
      <p className="mt-1 text-sm text-muted">
        {t.topic.subtitle(data.count, ago(t, data.lastAt))}
        {data.dormant ? t.topic.dormantSuffix : ''}
      </p>
      {data.arcs.map((arc) => (
        <Card key={arc.noteIds.join(',')} className="mt-4 border-l-2">
          <div className="text-sm">💡 {arc.reasoning ?? t.topic.arcFallback}</div>
        </Card>
      ))}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <i className="size-2 rounded-full" style={{ background: 'var(--positive)' }} />
            {t.topic.stillHolds(data.currentCount)}
          </h2>
          <div className="mt-2">
            <NoteList notes={data.current} empty={t.common.none} />
          </div>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <i className="size-2 rounded-full" style={{ background: 'var(--caution)' }} />
            {t.topic.oldNews(data.changedCount + data.reviewCount)}
          </h2>
          <div className="mt-2">
            <p className="mb-1 text-[11px] text-muted">
              {t.common.staleBreakdown(data.changedCount, data.reviewCount)}
            </p>
            <NoteList notes={data.outdated} empty={t.topic.outdatedEmpty} />
          </div>
        </Card>
      </div>
      {data.companions.length > 0 ? (
        <Card className="mt-5">
          <h2 className="text-sm font-semibold">{t.topic.companions}</h2>
          <p className="mt-1 text-xs text-muted">{t.topic.companionsHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.companions.map((c) => (
              <Link
                key={c.tag}
                to={`/topic/${encodeURIComponent(c.tag)}`}
                className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-line-strong hover:bg-surface-muted"
              >
                {c.tag}
                <span className="ml-2 tabular-nums text-muted">{c.shared}</span>
                {c.sameThing ? (
                  <span className="ml-2 text-muted">{t.topic.sameThing}</span>
                ) : c.overlap >= 0.8 ? (
                  <span className="ml-2 text-muted">
                    {t.topic.overlap(Math.round(c.overlap * 100))}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
      <Card className="mt-5">
        <h2 className="text-sm font-semibold">{t.topic.all(data.notes.length)}</h2>
        <div className="mt-2">
          <NoteList notes={data.notes.slice(0, 60)} empty={t.common.none} />
        </div>
      </Card>
    </Page>
  );
};

export const NoteScreen = () => {
  const t = useT();
  const { id = '' } = useParams();
  const { data, failure } = useAsync<NoteDetail>(() => api.note(Number(id)), id);
  const [edited, setEdited] = useState<NoteDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const note = edited?.id === Number(id) ? edited : data;

  useEffect(() => {
    if (data) rememberVisit({ id: data.id, title: data.title });
    setEditing(false);
    setDraft(null);
  }, [data]);

  if (!note) return <Pending failure={failure} />;
  const newest = note.supersededBy.at(-1);
  return (
    <Page>
      <h1 className="text-xl font-semibold leading-snug tracking-tight">{note.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <Layer layer={note.layer} />
        {note.author === 'agent' ? <Agent /> : null}
        <span className="tabular-nums">{day(note.at)}</span>
        {note.tags.map((tag) => (
          <Link key={tag} to={`/topic/${encodeURIComponent(tag)}`} className="text-primary">
            {tag}
          </Link>
        ))}
        {note.obsidianUrl ? (
          <a href={note.obsidianUrl} className="text-primary">
            {t.note.openInObsidian}
          </a>
        ) : null}
        <span className="ml-auto">
          {editing || draft ? null : note.layer === 'past' ? (
            <Button onClick={() => setDraft(correctionDraft(note, t))}>{t.edit.correct}</Button>
          ) : (
            <Button onClick={() => setEditing(true)}>{t.edit.start}</Button>
          )}
        </span>
      </div>
      {newest ? (
        <Card className="mt-4">
          <div className="text-sm" style={{ color: 'var(--negative)' }}>
            {t.note.correctedBy(note.supersededBy.length)}
          </div>
          <Link to={`/note/${newest.id}`} className="mt-1 block text-sm text-primary">
            {t.note.newest(newest.title)}
          </Link>
        </Card>
      ) : null}
      {note.corrects.length > 0 ? (
        <Card className="mt-3">
          <div className="text-xs text-muted">{t.note.corrects}</div>
          <Link to={`/note/${note.corrects[0].id}`} className="mt-1 block text-sm text-primary">
            {note.corrects[0].title}
          </Link>
        </Card>
      ) : null}
      {editing ? (
        <NoteEditor
          note={note}
          onSaved={(next) => {
            setEdited(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}
      {draft ? <Composer draft={draft} note={note} onCancel={() => setDraft(null)} /> : null}

      <Evidence note={note} onSaved={setEdited} />

      <StalePanel
        note={note}
        onSaved={setEdited}
        onDismissed={() => setEdited({ ...note, stale: null })}
      />
      <article className="mt-7">
        {note.content.trim() ? (
          <Markdown links={note.wikiLinks}>{note.content}</Markdown>
        ) : (
          // Frontmatter-only stubs exist in the vault, and a silently blank
          // article reads as the screen having failed to load.
          <p className="text-sm text-muted">{t.note.emptyBody}</p>
        )}
      </article>
      {note.deadLinks.length > 0 ? (
        <Card className="mt-8">
          <h2 className="text-sm font-semibold">{t.edit.deadLinks(note.deadLinks.length)}</h2>
          <p className="mt-1 text-xs text-muted">{t.edit.deadLinksWhy}</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {note.deadLinks.map((title) => (
              <li key={title} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-muted">[[{title}]]</span>
                <Button onClick={() => setDraft(missingNoteDraft(title, t))}>{t.edit.write}</Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {note.backlinks.length > 0 ? (
        <Card className="mt-8">
          <h2 className="text-sm font-semibold">{t.note.backlinks(note.backlinks.length)}</h2>
          <div className="mt-2">
            <NoteList notes={note.backlinks} empty="" />
          </div>
        </Card>
      ) : null}
      {note.related.length > 0 ? (
        <Card className="mt-3">
          <h2 className="text-sm font-semibold">{t.note.related}</h2>
          <div className="mt-2">
            <NoteList notes={note.related} empty="" />
          </div>
        </Card>
      ) : null}
    </Page>
  );
};

const SEARCH_LIMIT = 12;

const filtersFrom = (params: URLSearchParams): SearchFilters => ({
  layer: params.get('layer') ?? undefined,
  author: params.get('author') ?? undefined,
  tag: params.get('tag') ?? undefined,
  folder: params.get('folder') ?? undefined,
  from: params.get('from') ?? undefined,
  to: params.get('to') ?? undefined,
  limit: Number(params.get('limit') ?? SEARCH_LIMIT),
});

const Choice = ({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (next: string) => void;
  children: React.ReactNode;
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
  >
    {children}
  </select>
);

const DateField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) => (
  <label className="flex items-center gap-1.5 text-xs text-muted">
    {label}
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
    />
  </label>
);

export const SearchScreen = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const filters = filtersFrom(params);
  const { data, failure } = useAsync<SearchPage>(() => api.search(q, filters), params.toString());
  const facets = useAsync<Facets>(() => api.facets(), 'facets');

  const replace = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace: true });
  };

  const setFilter = (key: string, value: string) =>
    replace((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('limit');
    });

  const filtered = ['layer', 'author', 'tag', 'folder', 'from', 'to'].some((key) =>
    params.get(key),
  );

  return (
    <Page>
      <h1 className="text-xl font-semibold tracking-tight">{t.search.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {t.search.summary(q, data?.results.length ?? 0)}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Choice value={params.get('layer') ?? ''} onChange={(v) => setFilter('layer', v)}>
          <option value="">{t.search.anyLayer}</option>
          <option value="state">state</option>
          <option value="past">past</option>
          <option value="rule">rule</option>
        </Choice>
        <Choice value={params.get('author') ?? ''} onChange={(v) => setFilter('author', v)}>
          <option value="">{t.search.anyAuthor}</option>
          <option value="person">{t.search.mine}</option>
          <option value="agent">{t.search.agents}</option>
        </Choice>
        <Choice value={params.get('folder') ?? ''} onChange={(v) => setFilter('folder', v)}>
          <option value="">{t.search.anyFolder}</option>
          {(facets.data?.folders ?? []).map((folder) => (
            <option key={folder.name} value={folder.name}>
              {folder.name} ({folder.count})
            </option>
          ))}
        </Choice>
        <Choice value={params.get('tag') ?? ''} onChange={(v) => setFilter('tag', v)}>
          <option value="">{t.search.anyTag}</option>
          {(facets.data?.tags ?? []).map((tag) => (
            <option key={tag.name} value={tag.name}>
              {tag.name} ({tag.count})
            </option>
          ))}
        </Choice>
        <DateField
          label={t.search.from}
          value={params.get('from') ?? ''}
          onChange={(v) => setFilter('from', v)}
        />
        <DateField
          label={t.search.to}
          value={params.get('to') ?? ''}
          onChange={(v) => setFilter('to', v)}
        />
        {filtered ? (
          <button
            type="button"
            onClick={() => replace((next) => ['layer', 'author', 'tag', 'folder', 'from', 'to', 'limit'].forEach((key) => next.delete(key)))}
            className="rounded-md px-2 py-1.5 text-xs text-muted hover:bg-surface"
          >
            {t.search.clear}
          </button>
        ) : null}
      </div>

      {data ? (
        <div className="mt-4">
          {data.results.length === 0 ? (
            <div className="text-sm text-muted">{t.common.none}</div>
          ) : (
            data.results.map((hit) => (
              <NoteItem key={hit.id} note={hit} snippet={hit.snippet} />
            ))
          )}
          {data.collapsed.map((series) => (
            <p key={series.key} className="mt-2 text-xs text-muted">
              {t.search.collapsed(series.label, series.hidden)}
            </p>
          ))}
          {data.results.length >= data.limit ? (
            <button
              type="button"
              onClick={() => replace((next) => next.set('limit', String(data.limit + SEARCH_LIMIT)))}
              className="mt-4 rounded-md border border-line px-3 py-1.5 text-xs hover:bg-surface-muted"
            >
              {t.search.more}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {failure ? t.error(failure) : t.common.loading}
        </p>
      )}
    </Page>
  );
};
