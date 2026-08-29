import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type NoteTitle } from './api.ts';
import { Layer } from './bits.tsx';
import { useT } from './i18n.ts';
import { recentVisits } from './recent.ts';
import { titleScore } from './title-score.ts';

const SHOWN = 8;

const useTitles = (open: boolean) => {
  const [titles, setTitles] = useState<NoteTitle[] | null>(null);
  useEffect(() => {
    if (!open || titles) return;
    api
      .titles()
      .then(setTitles)
      .catch(() => setTitles([]));
  }, [open, titles]);
  return titles;
};

export const Palette = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const t = useT();
  const navigate = useNavigate();
  const titles = useTitles(open);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (open) return;
    setQuery('');
    setCursor(0);
  }, [open]);

  if (!open) return null;

  const trimmed = query.trim().toLowerCase();
  const matches =
    trimmed.length === 0
      ? recentVisits().map((visit) => ({ id: visit.id, title: visit.title, layer: '' }))
      : (titles ?? [])
          .map((note) => ({ note, rank: titleScore(note.title, trimmed) }))
          .filter((scored) => scored.rank > 0)
          .sort((a, b) => b.rank - a.rank)
          .slice(0, SHOWN)
          .map((scored) => scored.note);

  const rows = trimmed.length === 0 ? matches.length : matches.length + 1;
  const go = (index: number) => {
    const target = matches[index];
    onClose();
    navigate(target ? `/note/${target.id}` : `/search?q=${encodeURIComponent(query.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      return setCursor(rows === 0 ? 0 : (cursor + 1) % rows);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      return setCursor(rows === 0 ? 0 : (cursor - 1 + rows) % rows);
    }
    if (e.key === 'Enter' && (rows > 0 || trimmed.length > 0)) {
      e.preventDefault();
      return go(cursor);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label={t.common.close}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="glass relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-card bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            // biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t.app.searchPlaceholder}
            className="w-full bg-transparent py-3 text-sm outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {trimmed.length === 0 && matches.length > 0 ? (
            <p className="px-3 py-1.5 text-[11px] text-muted">{t.search.recent}</p>
          ) : null}

          {matches.map((note, index) => (
            <button
              key={note.id}
              type="button"
              onMouseEnter={() => setCursor(index)}
              onClick={() => go(index)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                index === cursor ? 'bg-surface-muted' : ''
              }`}
            >
              {note.layer ? <Layer layer={note.layer} /> : null}
              <span className="min-w-0 flex-1 truncate">{note.title}</span>
            </button>
          ))}

          {trimmed.length > 0 ? (
            <button
              type="button"
              onMouseEnter={() => setCursor(matches.length)}
              onClick={() => go(matches.length)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted ${
                matches.length === cursor ? 'bg-surface-muted' : ''
              }`}
            >
              <CornerDownLeft size={13} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t.search.ask(query.trim())}</span>
            </button>
          ) : null}

          {trimmed.length > 0 && matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">{t.search.noTitleMatch}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
