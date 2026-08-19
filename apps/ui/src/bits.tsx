import { Link } from 'react-router-dom';
import type { NoteRef } from './api.ts';

export const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const ago = (ms: number) => {
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  if (d < 1) return '오늘';
  if (d < 30) return `${d}일 전`;
  if (d < 365) return `${Math.floor(d / 30)}개월 전`;
  return `${(d / 365).toFixed(1)}년 전`;
};

const LAYER_TONE: Record<string, string> = {
  state: 'border-primary text-primary',
  rule: 'border-positive text-positive',
  past: 'border-line text-muted',
};

export const Layer = ({ layer }: { layer: string }) => (
  <span
    className={`shrink-0 rounded-full border px-2 py-px text-[10px] leading-4 ${LAYER_TONE[layer] ?? LAYER_TONE.past}`}
  >
    {layer}
  </span>
);

export const NoteItem = ({ note, snippet }: { note: NoteRef; snippet?: string }) => (
  <Link
    to={`/note/${note.id}`}
    className="-mx-2 block rounded-lg px-2 py-2 hover:bg-surface-muted"
  >
    <div className="flex items-baseline gap-2">
      <Layer layer={note.layer} />
      <span className="min-w-0 flex-1 truncate text-sm">{note.title}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted">{day(note.at)}</span>
    </div>
    {note.reason ? (
      <div className="mt-1 text-xs" style={{ color: 'var(--caution)' }}>
        {note.reason}
      </div>
    ) : null}
    {snippet ? <div className="mt-1 line-clamp-2 text-xs text-muted">{snippet}…</div> : null}
  </Link>
);

export const NoteList = ({ notes, empty }: { notes: NoteRef[]; empty: string }) =>
  notes.length === 0 ? (
    <div className="px-2 py-3 text-xs text-muted">{empty}</div>
  ) : (
    <div>
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} />
      ))}
    </div>
  );

export const Card = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`rounded-card border border-line bg-surface p-4 sm:p-5 ${className}`}>
    {children}
  </div>
);
