import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type NoteDetail, type SearchHit, type Topic, type TopicDetail } from './api.ts';
import { ago, Card, day, Layer, NoteItem, NoteList } from './bits.tsx';
import { Markdown } from './Markdown.tsx';
import { StalePanel } from './StalePanel.tsx';
import { Spark } from './Spark.tsx';

const useAsync = <T,>(load: () => Promise<T>, key: string) => {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({
    data: null,
    error: null,
  });
  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null });
    load()
      .then((data) => alive && setState({ data, error: null }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message }));
    return () => {
      alive = false;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: key identifies the request
  }, [key]);
  return state;
};

const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">{children}</div>
);

const Pending = ({ error }: { error: string | null }) => (
  <Page>
    <div className="py-16 text-sm text-muted">{error ?? '…'}</div>
  </Page>
);

export const TopicsScreen = ({ topics }: { topics: Topic[] }) => (
  <Page>
    <h1 className="text-xl font-semibold tracking-tight">주제</h1>
    <p className="mt-1 text-sm text-muted">
      {topics.length}개 · 낡은 정보가 많은 순 · 선은 최근 1년 주간 활동
    </p>
    <div className="mt-4 divide-y divide-line border-y border-line">
      {topics.map((t) => {
        const stale = t.changedCount + t.reviewCount;
        const total = Math.max(1, t.currentCount + stale);
        return (
          <Link
            key={t.tag}
            to={`/topic/${encodeURIComponent(t.tag)}`}
            className={`flex items-center gap-4 py-4 hover:bg-surface ${t.dormant ? 'opacity-60' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-semibold text-primary">{t.tag}</span>
                <span className="shrink-0 text-[11px] text-muted">{t.count}개</span>
                {t.dormant ? (
                  <span className="shrink-0 rounded-full border border-line px-2 text-[10px] text-muted">
                    잠듦
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex h-1.5 max-w-sm overflow-hidden rounded-full bg-surface-muted">
                <i
                  className="block h-full"
                  style={{ width: `${(t.currentCount / total) * 100}%`, background: 'var(--positive)' }}
                />
                <i
                  className="block h-full"
                  style={{ width: `${(stale / total) * 100}%`, background: 'var(--caution)' }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                <span>
                  아직 맞는 얘기{' '}
                  <b className="tabular-nums" style={{ color: 'var(--positive)' }}>
                    {t.currentCount}
                  </b>
                </span>
                <span>
                  지난 얘기{' '}
                  <b className="tabular-nums" style={{ color: 'var(--caution)' }}>
                    {stale}
                  </b>
                </span>
                <span>{ago(t.lastAt)}</span>
              </div>
            </div>
            <div className="hidden shrink-0 sm:block">
              <Spark values={t.spark} />
            </div>
          </Link>
        );
      })}
    </div>
  </Page>
);

export const TopicScreen = () => {
  const { tag = '' } = useParams();
  const { data, error } = useAsync<TopicDetail>(() => api.topic(tag), tag);
  if (!data) return <Pending error={error} />;
  return (
    <Page>
      <h1 className="text-xl font-semibold tracking-tight">{data.tag}</h1>
      <p className="mt-1 text-sm text-muted">
        {data.count}개 · 마지막 {ago(data.lastAt)}
        {data.dormant ? ' · 잠듦' : ''}
      </p>
      {data.arcs.map((a) => (
        <Card key={a.reasoning} className="mt-4 border-l-2" >
          <div className="text-sm">💡 {a.reasoning}</div>
        </Card>
      ))}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <i className="size-2 rounded-full" style={{ background: 'var(--positive)' }} />
            아직 맞는 이야기 {data.currentCount}
          </h2>
          <div className="mt-2">
            <NoteList notes={data.current} empty="없음" />
          </div>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <i className="size-2 rounded-full" style={{ background: 'var(--caution)' }} />
            지난 이야기 {data.changedCount + data.reviewCount}
          </h2>
          <div className="mt-2">
            <p className="mb-1 text-[11px] text-muted">
              이미 바뀜 {data.changedCount} · 다시 볼 것 {data.reviewCount}
            </p>
            <NoteList notes={data.outdated} empty="아직 바뀐 이야기가 없어" />
          </div>
        </Card>
      </div>
      {data.companions.length > 0 ? (
        <Card className="mt-5">
          <h2 className="text-sm font-semibold">이 주제가 붙어 다니는 곳</h2>
          <p className="mt-1 text-xs text-muted">
            같은 노트에 함께 달린 주제 — 이 이야기가 어디로 흩어져 있는지
          </p>
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
                  <span className="ml-2 text-muted">· 같은 말 같아</span>
                ) : c.overlap >= 0.8 ? (
                  <span className="ml-2 text-muted">· {Math.round(c.overlap * 100)}% 겹침</span>
                ) : null}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
      <Card className="mt-5">
        <h2 className="text-sm font-semibold">전체 {data.notes.length}</h2>
        <div className="mt-2">
          <NoteList notes={data.notes.slice(0, 60)} empty="없음" />
        </div>
      </Card>
    </Page>
  );
};

export const NoteScreen = () => {
  const { id = '' } = useParams();
  const { data, error } = useAsync<NoteDetail>(() => api.note(Number(id)), id);
  const [edited, setEdited] = useState<NoteDetail | null>(null);
  const note = edited?.id === Number(id) ? edited : data;
  if (!note) return <Pending error={error} />;
  const newest = note.supersededBy.at(-1);
  return (
    <Page>
      <h1 className="text-xl font-semibold leading-snug tracking-tight">{note.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <Layer layer={note.layer} />
        <span className="tabular-nums">{day(note.at)}</span>
        {note.tags.map((t) => (
          <Link key={t} to={`/topic/${encodeURIComponent(t)}`} className="text-primary">
            {t}
          </Link>
        ))}
        {note.obsidianUrl ? (
          <a href={note.obsidianUrl} className="text-primary">
            Obsidian에서 열기 ↗
          </a>
        ) : null}
      </div>
      {newest ? (
        <Card className="mt-4" >
          <div className="text-sm" style={{ color: 'var(--negative)' }}>
            ⚠ 이후 {note.supersededBy.length}개 노트에서 정정됐어
          </div>
          <Link to={`/note/${newest.id}`} className="mt-1 block text-sm text-primary">
            최신: {newest.title}
          </Link>
        </Card>
      ) : null}
      {note.corrects.length > 0 ? (
        <Card className="mt-3">
          <div className="text-xs text-muted">이 노트가 정정하는 것</div>
          <Link to={`/note/${note.corrects[0].id}`} className="mt-1 block text-sm text-primary">
            {note.corrects[0].title}
          </Link>
        </Card>
      ) : null}
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
          <p className="text-sm text-muted">본문이 없는 노트야 — 제목과 태그만 있어.</p>
        )}
      </article>
      {note.backlinks.length > 0 ? (
        <Card className="mt-8">
          <h2 className="text-sm font-semibold">이 노트를 참조하는 노트 {note.backlinks.length}</h2>
          <div className="mt-2">
            <NoteList notes={note.backlinks} empty="" />
          </div>
        </Card>
      ) : null}
      {note.related.length > 0 ? (
        <Card className="mt-3">
          <h2 className="text-sm font-semibold">의미상 가까운 노트</h2>
          <div className="mt-2">
            <NoteList notes={note.related} empty="" />
          </div>
        </Card>
      ) : null}
    </Page>
  );
};

export const SearchScreen = () => {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { data, error } = useAsync<SearchHit[]>(() => api.search(q), q);
  if (!data) return <Pending error={error} />;
  return (
    <Page>
      <h1 className="text-xl font-semibold tracking-tight">검색</h1>
      <p className="mt-1 text-sm text-muted">
        {q} · {data.length}건
      </p>
      <div className="mt-4">
        {data.length === 0 ? (
          <div className="text-sm text-muted">없음</div>
        ) : (
          data.map((h) => (
            <NoteItem
              key={h.id}
              note={{ ...h, reason: h.supersededBy ? `⚠ #${h.supersededBy.id} 에서 정정됨` : null }}
              snippet={h.snippet}
            />
          ))
        )}
      </div>
    </Page>
  );
};
