import { useEffect, useState } from 'react';
import { api, type NoteDetail, type SearchHit, type Topic, type TopicDetail } from './api.ts';
import { ago, day, Layer, NoteItem, NoteList } from './bits.tsx';

const useAsync = <T,>(load: () => Promise<T>, deps: unknown[]) => {
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
    // biome-ignore lint/correctness/useExhaustiveDependencies: caller owns the key
  }, deps);
  return state;
};

const Loading = ({ error }: { error: string | null }) => (
  <div className="loading">{error ?? '…'}</div>
);

// The split is the point: how much of a subject still holds, and how much of it
// the vault already knows is out of date.
const Ratio = ({ topic }: { topic: Topic }) => {
  const total = Math.max(1, topic.currentCount + topic.outdatedCount);
  return (
    <>
      <div className="bar">
        <i className="ok" style={{ width: `${(topic.currentCount / total) * 100}%` }} />
        <i className="old" style={{ width: `${(topic.outdatedCount / total) * 100}%` }} />
      </div>
      <div className="legend">
        <span className="ok">
          유효 <b>{topic.currentCount}</b>
        </span>
        <span className="old">
          낡음 <b>{topic.outdatedCount}</b>
        </span>
        <span style={{ marginLeft: 'auto' }}>{topic.dormant ? '잠듦' : ago(topic.lastAt)}</span>
      </div>
    </>
  );
};

export const Home = ({ topics }: { topics: Topic[] }) => (
  <div className="wrap">
    <h1>주제</h1>
    <div className="sub">{topics.length}개 · 낡은 정보가 많은 순</div>
    <div className="grid">
      {topics.map((t) => (
        <a
          key={t.tag}
          className={`card${t.dormant ? ' quiet' : ''}`}
          href={`#/topic/${encodeURIComponent(t.tag)}`}
        >
          <div className="name">
            {t.tag}
            <small>{t.count}개</small>
          </div>
          <Ratio topic={t} />
        </a>
      ))}
    </div>
  </div>
);

export const TopicScreen = ({ tag }: { tag: string }) => {
  const { data, error } = useAsync<TopicDetail>(() => api.topic(tag), [tag]);
  if (!data) return <Loading error={error} />;
  return (
    <div className="wrap">
      <h1>{data.tag}</h1>
      <div className="sub">
        {data.count}개 · 마지막 {ago(data.lastAt)}
        {data.dormant ? ' · 잠듦' : ''}
      </div>
      {data.arcs.map((a) => (
        <div className="notice arc" key={a.reasoning}>
          💡 {a.reasoning}
        </div>
      ))}
      <div className="split">
        <div className="col">
          <h2>
            <span className="dot ok" />
            지금 유효한 것 {data.currentCount}
          </h2>
          <NoteList notes={data.current} empty="없음" />
        </div>
        <div className="col">
          <h2>
            <span className="dot old" />
            낡았거나 뒤집힌 것 {data.outdatedCount}
          </h2>
          <NoteList notes={data.outdated} empty="없음 — 아직 뒤집힌 게 없어" />
        </div>
      </div>
      <div className="rel">
        <h2>전체 {data.notes.length}</h2>
        <NoteList notes={data.notes.slice(0, 60)} empty="없음" />
      </div>
    </div>
  );
};

export const NoteScreen = ({ id }: { id: number }) => {
  const { data, error } = useAsync<NoteDetail>(() => api.note(id), [id]);
  if (!data) return <Loading error={error} />;
  const newest = data.supersededBy.at(-1);
  return (
    <div className="wrap">
      <h1>{data.title}</h1>
      <div className="sub">
        <Layer layer={data.layer} /> {day(data.at)}
        {data.tags.length > 0 ? ' · ' : ''}
        {data.tags.map((t) => (
          <a key={t} href={`#/topic/${encodeURIComponent(t)}`} style={{ color: 'var(--accent)' }}>
            {t}{' '}
          </a>
        ))}
        {data.obsidianUrl ? (
          <>
            {' · '}
            <a href={data.obsidianUrl} style={{ color: 'var(--accent)' }}>
              Obsidian에서 열기 ↗
            </a>
          </>
        ) : null}
      </div>
      {newest ? (
        <div className="notice">
          ⚠ 이후 {data.supersededBy.length}개 노트에서 정정됐어 — 최신:{' '}
          <a href={`#/note/${newest.id}`}>{newest.title}</a>
        </div>
      ) : null}
      {data.corrects.length > 0 ? (
        <div className="notice arc">
          이 노트가 정정하는 것: <a href={`#/note/${data.corrects[0].id}`}>{data.corrects[0].title}</a>
        </div>
      ) : null}
      <div className="note-body">{data.content}</div>
      {data.backlinks.length > 0 ? (
        <div className="rel">
          <h2>이 노트를 참조하는 노트 {data.backlinks.length}</h2>
          <NoteList notes={data.backlinks} empty="" />
        </div>
      ) : null}
      {data.related.length > 0 ? (
        <div className="rel">
          <h2>의미상 가까운 노트</h2>
          <NoteList notes={data.related} empty="" />
        </div>
      ) : null}
    </div>
  );
};

export const SearchScreen = ({ q }: { q: string }) => {
  const { data, error } = useAsync<SearchHit[]>(() => api.search(q), [q]);
  if (!data) return <Loading error={error} />;
  return (
    <div className="wrap">
      <h1>검색</h1>
      <div className="sub">
        {q} · {data.length}건
      </div>
      {data.length === 0 ? (
        <div className="empty">없음</div>
      ) : (
        data.map((h) => (
          <NoteItem
            key={h.id}
            note={{
              ...h,
              reason: h.supersededBy ? `⚠ #${h.supersededBy.id} 에서 정정됨` : null,
            }}
            snippet={h.snippet}
          />
        ))
      )}
    </div>
  );
};
