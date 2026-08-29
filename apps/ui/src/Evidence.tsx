import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type ApiFailure, api, type NoteDetail, toFailure } from './api.ts';
import { Button, Card } from './bits.tsx';
import { useT } from './i18n.ts';

type Saved = (next: NoteDetail) => void;

const useDeclare = (noteId: number, onSaved: Saved) => {
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (work: Promise<NoteDetail>) => {
    setBusy(true);
    setFailure(null);
    work
      .then(onSaved)
      .catch((cause: unknown) => setFailure(toFailure(cause)))
      .finally(() => setBusy(false));
  };

  return {
    busy,
    failure,
    declare: (sourceIds: number[]) => run(api.updateNote(noteId, { derivesFrom: sourceIds })),
    accounted: () => run(api.stillTrue(noteId).then(() => api.note(noteId))),
  };
};

const Offer = ({ note, onSaved }: { note: NoteDetail; onSaved: Saved }) => {
  const t = useT();
  const [chosen, setChosen] = useState<number[]>(note.candidateSources.map((n) => n.id));
  const { busy, failure, declare } = useDeclare(note.id, onSaved);

  return (
    <Card className="mt-4">
      <h2 className="text-sm font-semibold">{t.evidence.undeclared}</h2>
      <p className="mt-1 text-xs text-muted">{t.evidence.undeclaredWhy}</p>

      {note.candidateSources.length === 0 ? null : (
        <>
          <p className="mt-3 text-xs">{t.evidence.offer}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {note.candidateSources.map((source) => (
              <li key={source.id}>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={chosen.includes(source.id)}
                    onChange={() =>
                      setChosen(
                        chosen.includes(source.id)
                          ? chosen.filter((id) => id !== source.id)
                          : [...chosen, source.id],
                      )
                    }
                  />
                  <span className="truncate">{source.title}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Button
              tone="primary"
              onClick={() => declare(chosen)}
              disabled={busy || chosen.length === 0}
            >
              {t.evidence.declare}
            </Button>
          </div>
        </>
      )}

      {failure ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--negative)' }}>
          {t.error(failure)}
        </p>
      ) : null}
    </Card>
  );
};

export const Evidence = ({ note, onSaved }: { note: NoteDetail; onSaved: Saved }) => {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const { busy, failure, declare, accounted } = useDeclare(note.id, onSaved);

  if (note.layer !== 'state') return null;
  if (note.evidence.length === 0) return <Offer note={note} onSaved={onSaved} />;

  const shaken = note.evidence.filter((e) => e.amendedBy || e.changed || e.missing);

  return (
    <Card className="mt-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{t.evidence.title}</h2>
        <span className="ml-auto">
          <Button onClick={() => setEditing(!editing)} disabled={busy}>
            {editing ? t.evidence.done : t.evidence.edit}
          </Button>
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {note.evidence.map((source) => (
          <li key={source.id} className="flex flex-wrap items-center gap-2 text-xs">
            {source.amendedBy || source.changed || source.missing ? (
              <TriangleAlert size={12} className="shrink-0" style={{ color: 'var(--caution)' }} />
            ) : (
              <CircleCheck size={12} className="shrink-0" style={{ color: 'var(--positive)' }} />
            )}
            <Link to={`/note/${source.id}`} className="truncate text-primary hover:underline">
              {source.title ?? `#${source.id}`}
            </Link>
            {source.amendedBy ? (
              <Link
                to={`/note/${source.amendedBy.id}`}
                className="text-muted hover:underline"
                style={{ color: 'var(--caution)' }}
              >
                {t.evidence.amended(source.amendedBy.title)}
              </Link>
            ) : null}
            {source.changed ? (
              <span style={{ color: 'var(--caution)' }}>{t.evidence.changed}</span>
            ) : null}
            {source.missing ? (
              <span style={{ color: 'var(--negative)' }}>{t.evidence.missing}</span>
            ) : null}
            {editing ? (
              <button
                type="button"
                onClick={() =>
                  declare(note.evidence.filter((e) => e.id !== source.id).map((e) => e.id))
                }
                disabled={busy}
                className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-muted"
              >
                {t.evidence.remove}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {shaken.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{t.evidence.holds}</p>
      ) : (
        <div className="mt-3">
          <Button onClick={accounted} disabled={busy}>
            {t.evidence.accounted}
          </Button>
        </div>
      )}

      {failure ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--negative)' }}>
          {t.error(failure)}
        </p>
      ) : null}
    </Card>
  );
};
