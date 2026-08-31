import { X } from 'lucide-react';
import { useState } from 'react';
import { api, type History as HistoryData } from './api.ts';
import { useT } from './i18n.ts';
import { useAsync } from './useAsync.ts';

// What git already knows about this file. memex does not keep its own versions —
// the vault is a repository, so the history is the repository's, and reading it
// here beats asking someone to leave for a terminal.
export const HistoryPanel = ({
  note,
  onClose,
}: {
  note: { id: number; title: string };
  onClose: () => void;
}) => {
  const t = useT();
  const { data, failure } = useAsync<HistoryData>(() => api.history(note.id), String(note.id));
  const [open, setOpen] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);

  const show = (sha: string) => {
    setOpen(sha);
    setBody(null);
    api
      .revision(note.id, sha)
      .then((revision) => setBody(revision.content))
      .catch(() => setBody(null));
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[28rem] flex-col border-l border-glass-line bg-reading">
      <div className="flex items-center gap-2 border-b border-glass-line px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{note.title}</h2>
        <button type="button" onClick={onClose} aria-label={t.common.close} className="p-1">
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {data === null ? (
          <p className="text-xs text-muted">{failure ? t.error(failure) : t.common.loading}</p>
        ) : data.tracked === false ? (
          // Two different silences. A folder outside any repository has no
          // history to give; a file that exists but was never committed has one
          // that is empty, and today is the day that mattered.
          <p className="max-w-prose text-xs text-muted">
            {data.reason === 'no-repo' ? t.history.noRepo : t.history.neverCommitted}
          </p>
        ) : (
          <div className="space-y-1">
            {data.revisions.map((revision) => (
              <div key={revision.sha}>
                <button
                  type="button"
                  onClick={() => (open === revision.sha ? setOpen(null) : show(revision.sha))}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface-muted ${
                    open === revision.sha ? 'bg-surface-muted' : ''
                  }`}
                >
                  <span className="block truncate text-foreground">{revision.subject}</span>
                  <span className="text-[11px] text-muted">
                    {revision.at.slice(0, 10)} · {revision.author} · {revision.sha.slice(0, 7)}
                  </span>
                </button>
                {open === revision.sha ? (
                  <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-surface-muted p-3 text-[11px] leading-relaxed">
                    {body ?? t.common.loading}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
