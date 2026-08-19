import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type NoteDetail, type SearchHit, type Topic, type TopicDetail } from './api.ts';
import { ago, Card, day, Layer, NoteItem, NoteList } from './bits.tsx';
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
        const total = Math.max(1, t.currentCount + t.outdatedCount);
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
                  style={{ width: `${(t.outdatedCount / total) * 100}%`, background: 'var(--caution)' }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                <span>
                  유효{' '}
                  <b className="tabular-nums" style={{ color: 'var(--positive)' }}>
                    {t.currentCount}
                  </b>
                </span>
                <span>
                  낡음{' '}
                  <b className="tabular-nums" style={{ color: 'var(--caution)' }}>
                    {t.outdatedCount}
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
            지금 유효한 것 {data.currentCount}
          </h2>
          <div className="mt-2">
            <NoteList notes={data.current} empty="없음" />
          </div>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <i className="size-2 rounded-full" style={{ background: 'var(--caution)' }} />
            낡았거나 뒤집힌 것 {data.outdatedCount}
          </h2>
          <div className="mt-2">
            <NoteList notes={data.outdated} empty="아직 뒤집힌 게 없어" />
          </div>
        </Card>
      </div>
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
  if (!data) return <Pending error={error} />;
  const newest = data.supersededBy.at(-1);
  return (
    <Page>
      <h1 className="text-xl font-semibold leading-snug tracking-tight">{data.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <Layer layer={data.layer} />
        <span className="tabular-nums">{day(data.at)}</span>
        {data.tags.map((t) => (
          <Link key={t} to={`/topic/${encodeURIComponent(t)}`} className="text-primary">
            {t}
          </Link>
        ))}
        {data.obsidianUrl ? (
          <a href={data.obsidianUrl} className="text-primary">
            Obsidian에서 열기 ↗
          </a>
        ) : null}
      </div>
      {newest ? (
        <Card className="mt-4" >
          <div className="text-sm" style={{ color: 'var(--negative)' }}>
            ⚠ 이후 {data.supersededBy.length}개 노트에서 정정됐어
          </div>
          <Link to={`/note/${newest.id}`} className="mt-1 block text-sm text-primary">
            최신: {newest.title}
          </Link>
        </Card>
      ) : null}
      {data.corrects.length > 0 ? (
        <Card className="mt-3">
          <div className="text-xs text-muted">이 노트가 정정하는 것</div>
          <Link to={`/note/${data.corrects[0].id}`} className="mt-1 block text-sm text-primary">
            {data.corrects[0].title}
          </Link>
        </Card>
      ) : null}
      <article className="mt-6 whitespace-pre-wrap text-sm leading-7">{data.content}</article>
      {data.backlinks.length > 0 ? (
        <Card className="mt-8">
          <h2 className="text-sm font-semibold">이 노트를 참조하는 노트 {data.backlinks.length}</h2>
          <div className="mt-2">
            <NoteList notes={data.backlinks} empty="" />
          </div>
        </Card>
      ) : null}
      {data.related.length > 0 ? (
        <Card className="mt-3">
          <h2 className="text-sm font-semibold">의미상 가까운 노트</h2>
          <div className="mt-2">
            <NoteList notes={data.related} empty="" />
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
