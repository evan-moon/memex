import { GitBranch } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, type Thread, type ThreadRef, type ThreadStep } from './api.ts';
import { Card, Layer } from './bits.tsx';
import { useT } from './i18n.ts';
import { layoutThread, type PlacedStep, type ThreadEdge } from './thread-layout.ts';
import { day } from './time.ts';
import { useAsync } from './useAsync.ts';

const ROW = 46;
const LANE = 20;
const TOP = 23;
const CURVE = 14;

const x = (lane: number) => lane * LANE + 10;
const y = (row: number) => row * ROW + TOP;

// A correction that stays on its line is a straight run; one that leaves it
// drops down its parent's lane first and then turns, so the eye reads "this
// came off that" rather than "these two are diagonal neighbours".
const edgePath = ({ from, to }: ThreadEdge) =>
  from.lane === to.lane
    ? `M${x(from.lane)} ${y(from.row)} V${y(to.row)}`
    : `M${x(from.lane)} ${y(from.row)} V${y(to.row) - CURVE} Q${x(from.lane)} ${y(to.row)} ${x(from.lane) + CURVE} ${y(to.row)} H${x(to.lane)}`;

const Spine = ({ steps, edges, lanes }: ReturnType<typeof layoutThread>) => (
  <svg
    aria-hidden="true"
    width={lanes * LANE + 10}
    height={steps.length * ROW}
    className="shrink-0"
  >
    <title>thread</title>
    {edges.map((edge) => (
      <path
        key={`${edge.from.id}-${edge.to.id}`}
        d={edgePath(edge)}
        fill="none"
        strokeWidth={edge.to.trunk ? 2 : 1.5}
        stroke={edge.to.trunk ? 'var(--primary)' : 'var(--border-accent)'}
      />
    ))}
    {steps.map((step) => (
      <circle
        key={step.id}
        cx={x(step.lane)}
        cy={y(step.row)}
        r={step.trunk ? 4.5 : 3.5}
        fill={step.trunk ? 'var(--primary)' : 'var(--background)'}
        stroke={step.trunk ? 'var(--primary)' : 'var(--border-accent)'}
        strokeWidth={1.5}
      />
    ))}
  </svg>
);

const Rows = ({ steps }: { steps: PlacedStep[] }) => {
  const t = useT();
  return (
    <div className="min-w-0 flex-1">
      {steps.map((step, i) => (
        <div
          key={step.id}
          className="flex min-w-0 flex-wrap items-baseline gap-x-2"
          style={{ height: ROW, paddingTop: TOP - 9 }}
        >
          <Link
            to={`/note/${step.id}`}
            className={`min-w-0 truncate text-sm hover:underline ${step.trunk ? 'text-foreground' : 'text-muted'}`}
          >
            {step.title}
          </Link>
          <span className="shrink-0 text-[11px] tabular-nums text-muted">{day(step.at)}</span>
          {step.forks ? (
            <span className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: 'var(--caution)' }}>
              <GitBranch size={11} />
              {t.threads.forksHere}
            </span>
          ) : null}
          {i === steps.length - 1 ? (
            <span className="shrink-0 text-[11px] text-muted">{t.threads.latest}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
};

// The list is a set of shapes before it is a set of titles: a straight run of
// two reads differently from twelve steps that fork, and that is the thing
// worth scanning for.
export const ThreadShape = ({ root }: { root: ThreadStep }) => {
  const { steps, edges, lanes } = layoutThread(root);
  const unit = 9;
  const at = (lane: number) => lane * unit + 3;
  const down = (row: number) => row * unit + 3;
  return (
    <svg
      aria-hidden="true"
      width={lanes * unit + 6}
      height={steps.length * unit + 6}
      className="shrink-0 opacity-80"
    >
      <title>shape</title>
      {edges.map((edge) => (
        <path
          key={`${edge.from.id}-${edge.to.id}`}
          d={
            edge.from.lane === edge.to.lane
              ? `M${at(edge.from.lane)} ${down(edge.from.row)} V${down(edge.to.row)}`
              : `M${at(edge.from.lane)} ${down(edge.from.row)} V${down(edge.to.row) - 4} Q${at(edge.from.lane)} ${down(edge.to.row)} ${at(edge.from.lane) + 4} ${down(edge.to.row)} H${at(edge.to.lane)}`
          }
          fill="none"
          strokeWidth={1.25}
          stroke={edge.to.trunk ? 'var(--primary)' : 'var(--border-accent)'}
        />
      ))}
      {steps.map((step) => (
        <circle
          key={step.id}
          cx={at(step.lane)}
          cy={down(step.row)}
          r={1.75}
          fill={step.trunk ? 'var(--primary)' : 'var(--border-accent)'}
        />
      ))}
    </svg>
  );
};

export const ThreadGraph = ({ root }: { root: ThreadStep }) => {
  const layout = layoutThread(root);
  return (
    <div className="flex gap-3 overflow-x-auto">
      <Spine {...layout} />
      <Rows steps={layout.steps} />
    </div>
  );
};

const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">{children}</div>
);

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
  const { data } = useAsync<Thread[]>(() => api.threads(), 'threads');

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
              <div className="flex gap-4">
                <ThreadShape root={thread.root} />
                <div className="min-w-0 flex-1">
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
                      <Link
                        key={tag}
                        to={`/topic/${encodeURIComponent(tag)}`}
                        className="text-primary"
                      >
                        {tag}
                      </Link>
                    ))}
                  </div>
                </div>
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
        <div className="mt-1">
          <ThreadGraph root={data.root} />
        </div>
      </Card>
    </Page>
  );
};
