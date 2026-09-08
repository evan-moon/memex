import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type LibraryFilter, type LibraryPage } from './api.ts';
import { Page } from './bits.tsx';
import { useT } from './i18n.ts';
import { Pending } from './screens.tsx';
import { ago } from './time.ts';
import { useAsync } from './useAsync.ts';

const FILTERS: LibraryFilter[] = ['all', 'mine', 'reference', 'instruction'];

// The shelf, as it sits. Folders are not rearranged and documents are not
// reclassified — the only thing added over a file list is the one question a
// file list cannot answer, which is what kind of document this is.
export const LibraryScreen = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const asked = params.get('kind');
  const kind: LibraryFilter = FILTERS.find((f) => f === asked) ?? 'all';
  const [round, setRound] = useState(0);
  const { data, failure } = useAsync<LibraryPage>(() => api.library(kind), `${kind}-${round}`);

  const claim = (id: number, origin: string) => {
    api
      .setOrigin(id, origin)
      .then(() => setRound((at) => at + 1))
      .catch(() => {});
  };

  if (!data) return <Pending failure={failure} needs="/api/library" />;

  const pick = (next: LibraryFilter) => {
    const now = new URLSearchParams(params);
    if (next === 'all') now.delete('kind');
    else now.set('kind', next);
    setParams(now, { replace: true });
  };

  return (
    <Page>
      <h1 className="text-lg font-semibold">{t.library.title}</h1>

      <div className="mt-4 flex flex-wrap gap-1">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => pick(option)}
            className={`rounded-full px-3 py-1 text-xs ${
              kind === option ? 'bg-accent-soft text-foreground' : 'text-muted hover:bg-surface'
            }`}
          >
            {t.library.filters[option]}
            <span className="ml-1.5 tabular-nums text-muted">{data.counts[option]}</span>
          </button>
        ))}
      </div>

      {data.rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{t.library.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-glass-line">
          {data.rows.map((row) => (
            <li key={row.id}>
              <div className="flex items-baseline gap-3 py-2.5">
                <Link
                  to={`/note/${row.id}`}
                  className="min-w-0 flex-1 truncate text-sm hover:underline"
                >
                  {row.title}
                </Link>
                <span className="shrink-0 text-[11px] text-muted">
                  {row.folder === '' ? t.edit.vaultRoot : row.folder}
                </span>
                {/* memex guessed from how the file arrived, and a guess nobody
                    can see is a guess nobody can correct. One click says the
                    guess is wrong, and one more takes it back. */}
                <button
                  type="button"
                  onClick={() => claim(row.id, row.origin === 'person' ? 'unknown' : 'person')}
                  title={t.library.whoWrote}
                  className={`shrink-0 rounded-full px-2 py-px text-[10px] ${
                    row.origin === 'person'
                      ? 'bg-accent-soft text-foreground'
                      : 'text-muted hover:bg-surface-muted'
                  }`}
                >
                  {t.library.origins[row.origin] ?? row.origin}
                </button>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">
                  {ago(t, row.updatedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
};
