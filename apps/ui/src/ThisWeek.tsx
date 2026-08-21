import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Digest } from './api.ts';
import { Card } from './bits.tsx';
import { useT } from './i18n.ts';
import { useAsync } from './useAsync.ts';

const WINDOWS = [7, 30];
const ARRIVED_SHOWN = 5;

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="text-xs font-semibold text-muted">{title}</h3>
    <div className="mt-2">{children}</div>
  </div>
);

const Muted = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs leading-6 text-muted">{children}</p>
);

const Arrived = ({ digest }: { digest: Digest }) => {
  const t = useT();
  if (digest.total === 0) return <Muted>{t.thisWeek.arrivedNone}</Muted>;

  const newest = digest.folders
    .flatMap((f) => f.notes)
    .sort((a, b) => b.at - a.at)
    .slice(0, ARRIVED_SHOWN);

  return (
    <>
      <Muted>{t.thisWeek.spread(digest.total, digest.folders.length)}</Muted>
      <ul className="mt-2 flex flex-col gap-1">
        {newest.map((note) => (
          <li key={note.id} className="truncate text-xs">
            <Link to={`/note/${note.id}`} className="text-primary hover:underline">
              {note.title}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
};

const ToFix = ({ digest }: { digest: Digest }) => {
  const t = useT();
  if (digest.attention.length === 0) {
    return (
      <p className="flex items-start gap-1.5 text-xs leading-6 text-muted">
        <CircleCheck size={13} className="mt-1 shrink-0" style={{ color: 'var(--positive)' }} />
        {t.thisWeek.allClear}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {digest.attention.map((note) => (
        <li key={note.id} className="text-xs">
          <span className="flex items-start gap-1.5">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--caution)' }} />
            <Link to={`/note/${note.id}`} className="min-w-0 truncate text-primary hover:underline">
              {note.title}
            </Link>
          </span>
          <span className="ml-[19px] block text-[11px] text-muted">
            {t.thisWeek.piledUp(note.count)}
          </span>
        </li>
      ))}
    </ul>
  );
};

const Connection = ({ digest }: { digest: Digest }) => {
  const t = useT();
  const { connection } = digest;
  if (!connection) return <Muted>{t.thisWeek.connectionNone}</Muted>;

  return (
    <div className="flex flex-col gap-1 text-xs">
      <Link to={`/note/${connection.from.id}`} className="truncate text-primary hover:underline">
        {connection.from.title}
      </Link>
      <span className="text-[11px] text-muted">↕ {t.thisWeek.apart(connection.daysApart)}</span>
      <Link to={`/note/${connection.to.id}`} className="truncate text-primary hover:underline">
        {connection.to.title}
      </Link>
    </div>
  );
};

export const ThisWeekBlocks = ({ digest }: { digest: Digest }) => {
  const t = useT();
  return (
    <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Block title={t.thisWeek.arrived}>
        <Arrived digest={digest} />
      </Block>
      <Block title={t.thisWeek.toFix}>
        <ToFix digest={digest} />
      </Block>
      <Block title={t.thisWeek.connection}>
        <Connection digest={digest} />
      </Block>
    </div>
  );
};

export const ThisWeek = () => {
  const t = useT();
  const [days, setDays] = useState(WINDOWS[0]);
  const { data, failure } = useAsync(() => api.digest(days), String(days));

  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-sm font-semibold">{t.thisWeek.title(days)}</h2>
        <div className="ml-auto flex gap-1">
          {WINDOWS.map((window) => (
            <button
              key={window}
              type="button"
              onClick={() => setDays(window)}
              className={`rounded-md px-2 py-1 text-[11px] ${
                window === days ? 'bg-surface-muted text-foreground' : 'text-muted hover:bg-surface'
              }`}
            >
              {t.thisWeek.window(window)}
            </button>
          ))}
        </div>
      </div>

      {data ? (
        <ThisWeekBlocks digest={data} />
      ) : (
        <p className="mt-4 text-xs text-muted">{failure ? t.error(failure) : t.common.loading}</p>
      )}
    </Card>
  );
};
