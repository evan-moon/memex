import { Link } from 'react-router-dom';
import type { Overview as Data, Topic } from './api.ts';
import { useT } from './i18n.ts';
import { Review as Deck } from './Review.tsx';

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
export const Overview = ({ data, topics }: { data: Data; topics: Topic[] }) => {
  const t = useT();
  if (data.notes === 0) return <EmptyVault />;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <Deck />
      <p className="mt-10 text-[11px] text-muted">{t.overview.kept(data.notes, topics.length)}</p>
    </div>
  );
};
