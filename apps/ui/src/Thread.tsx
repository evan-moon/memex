import { GitBranch } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, type Thread, type ThreadRef, type ThreadStep } from './api.ts';
import { Card, Layer } from './bits.tsx';
import { useT } from './i18n.ts';
import { day } from './time.ts';
import { useAsync } from './useAsync.ts';

const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">{children}</div>
);

const Step = ({ step, last }: { step: ThreadStep; last: boolean }) => {
  const t = useT();
  const forks = step.children.length > 1;
  return (
    <li className="relative pl-5">
      <span className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full bg-line-strong" />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Link to={`/note/${step.id}`} className="text-sm text-primary hover:underline">
          {step.title}
        </Link>
        <span className="text-[11px] tabular-nums text-muted">{day(step.at)}</span>
        {last ? <span className="text-[11px] text-muted">{t.threads.latest}</span> : null}
        {forks ? (
          <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--caution)' }}>
            <GitBranch size={11} />
            {t.threads.forksHere}
          </span>
        ) : null}
      </div>
      {step.children.length > 0 ? (
        <ul className="ml-1 mt-2 flex flex-col gap-2 border-l border-line pl-3">
          {step.children.map((child, i) => (
            <Step key={child.id} step={child} last={last && i === step.children.length - 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

const Facts = ({ thread }: { thread: ThreadRef }) => {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="tabular-nums">{t.threads.span(day(thread.startedAt), day(thread.lastAt))}</span>
      <span className="tabular-nums">{t.threads.steps(thread.steps)}</span>
      {thread.branches > 0 ? (
        <span className="tabular-nums">{t.threads.branches(thread.branches)}</span>
      ) : null}
    </div>
  );
};

export const ThreadsScreen = () => {
  const t = useT();
  const { data } = useAsync<ThreadRef[]>(() => api.threads(), 'threads');

  if (!data) return <Page><div className="py-16 text-sm text-muted">{t.common.loading}</div></Page>;
  return (
    <Page>
      <h1 className="text-xl font-semibold tracking-tight">{t.threads.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.threads.lead}</p>
      {data.length === 0 ? (
        <p className="mt-8 text-sm text-muted">{t.threads.empty}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {data.map((thread) => (
            <Card key={thread.rootId}>
              <Link
                to={`/thread/${thread.rootId}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {thread.title}
              </Link>
              <div className="mt-2">
                <Facts thread={thread} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted">
                {thread.tags.slice(0, 8).map((tag) => (
                  <Link key={tag} to={`/topic/${encodeURIComponent(tag)}`} className="text-primary">
                    {tag}
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
};

export const ThreadScreen = () => {
  const t = useT();
  const { id = '' } = useParams();
  const { data, failure } = useAsync<Thread>(() => api.thread(Number(id)), id);

  if (!data) {
    return (
      <Page>
        <div className="py-16 text-sm text-muted">
          {failure ? t.error(failure) : t.common.loading}
        </div>
      </Page>
    );
  }
  return (
    <Page>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Layer layer={data.root.layer} />
        <Link to="/threads" className="text-primary">
          {t.threads.title}
        </Link>
      </div>
      <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight">{data.title}</h1>
      <div className="mt-2">
        <Facts thread={data} />
      </div>
      <Card className="mt-6">
        <div className="text-[11px] text-muted">{t.threads.startsHere}</div>
        <ul className="mt-2 flex flex-col gap-2">
          <Step step={data.root} last />
        </ul>
      </Card>
    </Page>
  );
};
