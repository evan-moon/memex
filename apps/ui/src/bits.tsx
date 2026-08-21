import { Link } from 'react-router-dom';
import type { NoteRef } from './api.ts';
import { useT } from './i18n.ts';
import { ago, day } from './time.ts';

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

// Only the agent's own notes are marked. Marking the person's would put a
// badge on almost every row, which says nothing.
export const Agent = () => {
  const t = useT();
  return (
    <span className="shrink-0 rounded-full border border-line px-2 py-px text-[10px] leading-4 text-muted">
      {t.note.agent}
    </span>
  );
};

export const NoteItem = ({ note, snippet }: { note: NoteRef; snippet?: string }) => {
  const t = useT();
  return (
      <Link
      to={`/note/${note.id}`}
      className="-mx-2 block rounded-lg px-2 py-2 hover:bg-surface-muted"
    >
      <div className="flex items-baseline gap-2">
        <Layer layer={note.layer} />
        {note.author === 'agent' ? <Agent /> : null}
        <span className="min-w-0 flex-1 truncate text-sm">{note.title}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">{day(note.at)}</span>
      </div>
      {note.status ? (
        <div className="mt-1 text-xs" style={{ color: 'var(--caution)' }}>
          {t.status(note.status)}
        </div>
      ) : null}
      {snippet ? <div className="mt-1 line-clamp-2 text-xs text-muted">{snippet}…</div> : null}
    </Link>
  );
};

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

export const Button = ({
  children,
  onClick,
  disabled,
  tone = 'plain',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'plain';
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
      tone === 'primary'
        ? 'bg-primary text-background hover:brightness-110'
        : 'border border-line hover:bg-surface-muted'
    }`}
  >
    {children}
  </button>
);
