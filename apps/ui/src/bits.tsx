import type { NoteRef } from './api.ts';
import { go } from './route.ts';

export const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const ago = (ms: number) => {
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  if (d < 1) return '오늘';
  if (d < 30) return `${d}일 전`;
  if (d < 365) return `${Math.floor(d / 30)}개월 전`;
  return `${(d / 365).toFixed(1)}년 전`;
};

export const Layer = ({ layer }: { layer: string }) => (
  <span className={`tag ${layer}`}>{layer}</span>
);

export const NoteItem = ({ note, snippet }: { note: NoteRef; snippet?: string }) => (
  <a className="item" href={`#/note/${note.id}`}>
    <div className="ttl">
      <Layer layer={note.layer} />
      <span className="t">{note.title}</span>
      <span className="when">{day(note.at)}</span>
    </div>
    {note.reason ? <div className="why">{note.reason}</div> : null}
    {snippet ? <div className="snip">{snippet}…</div> : null}
  </a>
);

export const NoteList = ({ notes, empty }: { notes: NoteRef[]; empty: string }) =>
  notes.length === 0 ? (
    <div className="empty">{empty}</div>
  ) : (
    <div>
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} />
      ))}
    </div>
  );

export const openNote = (id: number) => go({ name: 'note', id });
