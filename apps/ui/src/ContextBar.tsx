import { useEffect, useState } from 'react';
import { api, type DocumentReference, type LibraryRow } from './api.ts';
import { useT } from './i18n.ts';

// What this request is about, what it may read, and what it was told to follow.
// The design asks for these to be stated rather than inferred, and stating them
// is most of the value: somebody about to send a request can see that the
// handbook they attached is material and not an order.
export type Picked = {
  targetId: number | null;
  referenceIds: number[];
  instructionIds: number[];
};

export const ContextBar = ({
  targetId,
  targetTitle,
  picked,
  onPicked,
  provider,
}: {
  targetId: number | null;
  targetTitle: string | null;
  picked: Picked;
  onPicked: (next: Picked) => void;
  provider: string;
}) => {
  const t = useT();
  const [references, setReferences] = useState<DocumentReference[]>([]);
  const [instructions, setInstructions] = useState<LibraryRow[]>([]);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (targetId === null) return setReferences([]);
    api
      .references(targetId)
      .then(setReferences)
      .catch(() => setReferences([]));
  }, [targetId]);

  useEffect(() => {
    api
      .library('instruction')
      .then((page) => setInstructions(page.rows))
      .catch(() => setInstructions([]));
  }, []);

  const toggle = (id: number) =>
    onPicked({
      ...picked,
      instructionIds: picked.instructionIds.includes(id)
        ? picked.instructionIds.filter((one) => one !== id)
        : [...picked.instructionIds, id],
    });

  const chosen = instructions.filter((row) => picked.instructionIds.includes(row.id));

  return (
    <div className="space-y-1 border-glass-line border-t px-3 py-2 text-[11px] text-muted">
      <p>
        <span className="text-foreground">{t.context.target}</span>{' '}
        {targetTitle ?? t.context.noTarget}
      </p>
      <p>
        <span className="text-foreground">{t.context.references}</span>{' '}
        {references.length === 0
          ? t.context.noReferences
          : references.map((one) => one.title ?? t.references.gone).join(', ')}
      </p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-foreground">{t.context.instructions}</span>
        <span>
          {chosen.length === 0
            ? t.context.noInstructions
            : chosen.map((row) => row.title).join(', ')}
        </span>
        {instructions.length === 0 ? null : (
          <button type="button" onClick={() => setChoosing(!choosing)} className="text-primary">
            {t.context.choose}
          </button>
        )}
      </p>
      {choosing ? (
        <ul className="space-y-0.5 pt-1">
          {instructions.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => toggle(row.id)}
                className={`w-full rounded px-2 py-1 text-left ${
                  picked.instructionIds.includes(row.id)
                    ? 'bg-accent-soft text-foreground'
                    : 'hover:bg-surface-muted'
                }`}
              >
                {row.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p>
        <span className="text-foreground">{t.context.provider}</span> {provider}
      </p>
    </div>
  );
};
