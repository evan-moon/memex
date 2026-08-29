import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Overview as Data, type Digest, type Topic } from './api.ts';
import { useT } from './i18n.ts';
import { Spark } from './Spark.tsx';
import { ago } from './time.ts';
import { useAsync } from './useAsync.ts';

const WINDOWS = [7, 30] as const;

const FOLDERS_SHOWN = 6;
const TOPICS_SHOWN = 12;

// The vault is markdown in folders, and the folder is the subject. Showing what
// arrived under each one is the shortest true answer to "what is in here" —
// shorter than a count, and it is already the shape the notes are kept in.
const Arrivals = ({ digest }: { digest: Digest }) => {
  const t = useT();
  if (digest.total === 0) return <p className="text-sm text-muted">{t.thisWeek.arrivedNone}</p>;

  return (
    <div className="divide-y divide-glass-line">
      {digest.folders.slice(0, FOLDERS_SHOWN).map((folder) => (
        <div key={folder.folder} className="flex gap-4 py-3">
          <span className="w-40 shrink-0 truncate pt-0.5 text-xs text-muted">{folder.folder}</span>
          <ul className="min-w-0 flex-1 space-y-1">
            {folder.notes.slice(0, 4).map((note) => (
              <li key={note.id} className="truncate text-sm">
                <Link to={`/note/${note.id}`} className="hover:underline">
                  {note.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

// The one thing the digest finds rather than lists: two notes written far apart
// that landed near each other. It earns a line because it is a reason to read,
// which is what this screen is for.
const Connected = ({ digest }: { digest: Digest }) => {
  const t = useT();
  const { connection } = digest;
  if (!connection) return null;

  return (
    <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
      <span>{t.thisWeek.connection}</span>
      <Link to={`/note/${connection.from.id}`} className="text-foreground hover:underline">
        {connection.from.title}
      </Link>
      <span>↔</span>
      <Link to={`/note/${connection.to.id}`} className="text-foreground hover:underline">
        {connection.to.title}
      </Link>
      <span>· {t.thisWeek.apart(connection.daysApart)}</span>
    </p>
  );
};

const Topics = ({ topics }: { topics: Topic[] }) => {
  const t = useT();
  const moving = [...topics].sort((a, b) => b.lastAt - a.lastAt).slice(0, TOPICS_SHOWN);

  return (
    <div className="divide-y divide-glass-line">
      {moving.map((topic) => (
        <Link
          key={topic.tag}
          to={`/topic/${encodeURIComponent(topic.tag)}`}
          className="flex items-center gap-4 py-2.5 hover:bg-surface-muted"
        >
          <span className="w-40 shrink-0 truncate text-sm">{topic.tag}</span>
          <span className="w-14 shrink-0 text-[11px] tabular-nums text-muted">
            {t.common.notes(topic.count)}
          </span>
          <div className="min-w-0 flex-1">
            <Spark values={topic.spark} width={200} height={22} fill />
          </div>
          <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted">
            {ago(t, topic.lastAt)}
          </span>
        </Link>
      ))}
    </div>
  );
};

// One line, and only when there is something. The signals this points at arrive
// a few times a month, so a panel that is always on screen would be empty most
// days and a standing count would read as debt on the rest.
const Waiting = () => {
  const t = useT();
  const { data } = useAsync(() => api.today(), 'today');
  if (!data || data.items.length === 0) return null;

  return (
    <Link to="/today" className="mt-4 inline-block text-xs text-primary hover:underline">
      {t.today.title(data.items.length)} →
    </Link>
  );
};

const EmptyVault = () => {
  const t = useT();
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <h1 className="text-xl font-semibold tracking-tight">{t.overview.emptyTitle}</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">{t.overview.emptyLead}</p>
      <Link
        to="/settings"
        className="mt-5 inline-block rounded-md border border-glass-line px-3 py-1.5 text-sm hover:bg-surface-muted"
      >
        {t.overview.emptyAction}
      </Link>
    </div>
  );
};

export const Overview = ({ data, topics }: { data: Data; topics: Topic[] }) => {
  const t = useT();
  const [days, setDays] = useState<number>(WINDOWS[0]);
  const { data: digest } = useAsync(() => api.digest(days), String(days));

  if (data.notes === 0) return <EmptyVault />;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <h1 className="text-xl font-semibold tracking-tight">{t.overview.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.overview.kept(data.notes, topics.length)}</p>
      <Waiting />

      <section className="mt-8">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold">{t.overview.arrived}</h2>
          <div className="ml-auto flex gap-1">
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                onClick={() => setDays(window)}
                className={`rounded px-2 py-0.5 text-[11px] ${
                  days === window ? 'bg-surface-muted text-foreground' : 'text-muted'
                }`}
              >
                {t.thisWeek.window(window)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          {digest ? <Arrivals digest={digest} /> : <p className="py-3 text-sm text-muted">…</p>}
        </div>
        {digest?.connection ? <Connected digest={digest} /> : null}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">{t.overview.topics}</h2>
        <div className="mt-2">
          <Topics topics={topics} />
        </div>
      </section>
    </div>
  );
};
