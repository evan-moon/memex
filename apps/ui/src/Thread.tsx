import { Link, useParams } from 'react-router-dom';
import { api, type Thread, type ThreadStep } from './api.ts';
import { Card, Layer } from './bits.tsx';
import { useT } from './i18n.ts';
import { lengthOf, straighten, type ThreadLine } from './thread-layout.ts';
import { day } from './time.ts';
import { useAsync } from './useAsync.ts';

const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">{children}</div>
);

const RAIL = 20;
const DOT = 10;

const Dot = ({ muted }: { muted?: boolean }) => (
  <span
    className="absolute rounded-full border-2"
    style={{
      left: -(RAIL + DOT / 2),
      top: 6,
      width: DOT,
      height: DOT,
      background: muted ? 'var(--background)' : 'var(--primary)',
      borderColor: muted ? 'var(--border-accent)' : 'var(--primary)',
    }}
  />
);

export const ThreadTimeline = ({ line, muted = false }: { line: ThreadLine; muted?: boolean }) => {
  const t = useT();
  return (
    <ol className="border-l border-line" style={{ paddingLeft: RAIL }}>
      {line.steps.map((step, i) => (
        <li key={step.id} className="relative pb-6 last:pb-0">
          <Dot muted={muted} />
          <div className="flex items-baseline gap-2">
            <Link
              to={`/note/${step.id}`}
              className="shrink-0 text-[11px] tabular-nums text-muted hover:underline"
            >
              #{step.id}
            </Link>
            <Link
              to={`/note/${step.id}`}
              className={`min-w-0 flex-1 text-sm leading-snug hover:underline ${muted ? 'text-muted' : 'text-foreground'}`}
            >
              {step.title}
            </Link>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">{day(step.at)}</span>
          </div>
          {!muted && i === line.steps.length - 1 ? (
            <div className="mt-1 text-[11px] text-muted">{t.threads.latest}</div>
          ) : null}
          {line.branches
            .filter((branch) => branch.after === i)
            .map((branch) => (
              <div key={branch.line.steps[0]?.id} className="mt-4">
                <div className="flex items-baseline gap-2 text-[11px] text-muted">
                  <span>{t.threads.alsoWent}</span>
                  <span className="tabular-nums">{t.threads.steps(lengthOf(branch.line))}</span>
                </div>
                <div className="mt-3">
                  <ThreadTimeline line={branch.line} muted />
                </div>
              </div>
            ))}
        </li>
      ))}
    </ol>
  );
};

// A thread's shape is worth scanning before its title is read: a straight run
// of two looks nothing like twelve steps that split twice.
export const ThreadShape = ({ root }: { root: ThreadStep }) => {
  const line = straighten(root);
  const unit = 8;
  const height = line.steps.length * unit + 4;
  return (
    <svg aria-hidden="true" width={14} height={height} className="mt-1 shrink-0">
      <title>shape</title>
      <path
        d={`M3 3 V${height - 3}`}
        stroke="var(--primary)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {line.steps.map((step, i) => (
        <circle key={step.id} cx={3} cy={i * unit + 3} r={1.75} fill="var(--primary)" />
      ))}
      {line.branches.map((branch) => (
        <path
          key={branch.line.steps[0]?.id}
          d={`M3 ${branch.after * unit + 3} q0 ${unit} ${unit} ${unit}`}
          fill="none"
          stroke="var(--border-accent)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
};

const Facts = ({ thread }: { thread: Thread }) => {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="tabular-nums">
        {t.threads.span(day(thread.startedAt), day(thread.lastAt))}
      </span>
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

  if (!data) {
    return (
      <Page>
        <div className="py-16 text-sm text-muted">{t.common.loading}</div>
      </Page>
    );
  }
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
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[11px] tabular-nums text-muted">
                      #{thread.rootId}
                    </span>
                    <Link
                      to={`/thread/${thread.rootId}`}
                      className="min-w-0 flex-1 text-sm font-medium text-primary hover:underline"
                    >
                      {thread.title}
                    </Link>
                  </div>
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
        <div className="mb-3 text-[11px] text-muted">{t.threads.startsHere}</div>
        <ThreadTimeline line={straighten(data.root)} />
      </Card>
    </Page>
  );
};
