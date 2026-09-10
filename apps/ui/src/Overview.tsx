import { Link } from 'react-router-dom';
import { api, type Overview as Data, type Home, type Topic } from './api.ts';
import { useT } from './i18n.ts';
import { Review as Deck } from './Review.tsx';
import { ago } from './time.ts';
import { useAsync } from './useAsync.ts';

const EmptyVault = () => {
  const t = useT();
  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <h1 className="font-semibold text-xl tracking-tight">{t.overview.emptyTitle}</h1>
      <p className="mt-2 max-w-prose text-muted text-sm">{t.overview.emptyLead}</p>
      <Link
        to="/settings"
        className="mt-5 inline-block rounded-md border border-glass-line px-3 py-1.5 text-sm hover:bg-surface-muted"
      >
        {t.overview.emptyAction}
      </Link>
    </div>
  );
};

// One screen, one question: what has the AI said that needs a person. What
// arrived and which topics are moving are not that question — they were a feed,
// and a feed is what this app decided it is not.
// What a person was in the middle of, then what they have touched lately. The
// review deck used to open this screen and does not any more: it is reachable on
// its own and from the document it concerns, and assigning it as the day's work
// was the premise this redesign replaced.
const Continuing = ({ home }: { home: Home }) => {
  const t = useT();
  if (home.continuing === null) return null;
  const it = home.continuing;
  return (
    <section>
      <h2 className="text-xs font-medium text-muted">{t.home.continuing}</h2>
      <Link
        to={`/note/${it.id}`}
        className="mt-2 block rounded-card border border-glass-line p-4 hover:bg-surface"
      >
        <p className="font-semibold text-sm">{it.title}</p>
        <p className="mt-1 line-clamp-2 text-xs text-muted">{it.snippet}</p>
        <p className="mt-2 text-[11px] text-primary">{t.home.keepWriting}</p>
      </Link>
    </section>
  );
};

const Recent = ({ home }: { home: Home }) => {
  const t = useT();
  if (home.recent.length === 0) return null;
  return (
    <section className="mt-8">
      {/* The list says what it is sorted by. Mixing "recently changed" with
          "recently opened" makes a list nobody can predict. */}
      <h2 className="text-xs font-medium text-muted">{t.home.recent}</h2>
      <ul className="mt-2 divide-y divide-glass-line">
        {home.recent.map((row) => (
          <li key={row.id}>
            <Link
              to={`/note/${row.id}`}
              className="flex items-baseline gap-3 py-2 hover:bg-surface"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted">
                {ago(t, row.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export const Overview = ({ data, topics }: { data: Data; topics: Topic[] }) => {
  const t = useT();
  const { data: home } = useAsync<Home>(() => api.home(), 'home');
  if (data.notes === 0) return <EmptyVault />;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      {home === null ? null : (
        <>
          <Continuing home={home} />
          <Recent home={home} />
        </>
      )}
      {/* Still here, below the work rather than in front of it. */}
      <div className="mt-10">
        <Deck />
      </div>
      <p className="mt-10 text-[11px] text-muted">{t.overview.kept(data.notes, topics.length)}</p>
    </div>
  );
};
