import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DocumentReference, type NoteTitle } from './api.ts';
import { useT } from './i18n.ts';

// What the document is being written from, beside the document. The search here
// is the same one the library and `/search` use — a second search built into a
// panel would be a second set of results to keep honest.
//
// Nothing here navigates. Adding a reference while the caret is in the middle of
// a paragraph must leave the caret in the middle of that paragraph, which is why
// the panel owns its own query and never touches the route.
export const ReferencePanel = ({
  documentId,
  references,
  onChanged,
}: {
  documentId: number;
  references: DocumentReference[];
  onChanged: (next: DocumentReference[]) => void;
}) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<NoteTitle[] | null>(null);
  const [busy, setBusy] = useState(false);

  const look = async (text: string) => {
    setQuery(text);
    if (text.trim() === '') return setFound(null);
    const page = await api.search(text.trim(), { limit: 6 }).catch(() => null);
    setFound(page === null ? [] : page.results.map((hit) => ({ ...hit })));
  };

  const add = async (sourceId: number) => {
    setBusy(true);
    const next = await api.addReference(documentId, sourceId).catch(() => null);
    setBusy(false);
    if (next !== null) {
      onChanged(next);
      setQuery('');
      setFound(null);
    }
  };

  const drop = async (sourceId: number) => {
    const next = await api.dropReference(documentId, sourceId).catch(() => null);
    if (next !== null) onChanged(next);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <input
        value={query}
        onChange={(event) => look(event.target.value)}
        placeholder={t.references.find}
        className="w-full rounded-md border border-line bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
      />

      {found === null ? null : found.length === 0 ? (
        <p className="text-xs text-muted">{t.references.nothingFound}</p>
      ) : (
        <ul className="space-y-1">
          {found.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => add(hit.id)}
                className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
              >
                <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                <span className="shrink-0 text-[11px] text-primary">{t.references.add}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {references.length === 0 ? (
          <p className="text-xs text-muted">{t.references.empty}</p>
        ) : (
          <ul className="space-y-2">
            {references.map((reference) => (
              <li key={reference.id} className="rounded-md border border-glass-line p-2.5">
                <div className="flex items-baseline gap-2">
                  {reference.title === null ? (
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      {t.references.gone}
                    </span>
                  ) : (
                    <Link
                      to={`/note/${reference.sourceDocumentId}`}
                      className="min-w-0 flex-1 truncate text-sm text-primary"
                    >
                      {reference.title}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => drop(reference.sourceDocumentId)}
                    className="shrink-0 text-[11px] text-muted hover:text-foreground"
                  >
                    {t.references.remove}
                  </button>
                </div>
                {reference.quote === '' ? null : (
                  <p className="mt-1 border-glass-line border-l pl-2 text-xs text-muted">
                    {reference.quote}
                  </p>
                )}
                {reference.state === 'current' ? null : (
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--caution)' }}>
                    {reference.state === 'changed' ? t.references.changed : t.references.missing}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
