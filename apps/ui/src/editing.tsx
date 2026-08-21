import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type ApiFailure, type NoteDetail, type NotePatch, toFailure } from './api.ts';
import { Button, Card } from './bits.tsx';
import { type Strings, useT } from './i18n.ts';

const LAYERS = ['state', 'rule', 'past'];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-xs text-muted">
    {label}
    {children}
  </label>
);

const inputClass =
  'w-full rounded-md border border-line bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary';

const Failure = ({ failure }: { failure: ApiFailure | null }) => {
  const t = useT();
  if (!failure) return null;
  return (
    <p className="mt-2 text-xs" style={{ color: 'var(--negative)' }}>
      {t.error(failure)}
    </p>
  );
};

const useWriter = <T,>(run: (value: T) => Promise<void>) => {
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (value: T) => {
    setBusy(true);
    setFailure(null);
    run(value)
      .catch((error: unknown) => setFailure(toFailure(error)))
      .finally(() => setBusy(false));
  };

  return { failure, busy, submit };
};

const parseTags = (value: string): string[] =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

export const NoteEditor = ({
  note,
  onSaved,
  onCancel,
}: {
  note: NoteDetail;
  onSaved: (next: NoteDetail) => void;
  onCancel: () => void;
}) => {
  const t = useT();
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags.join(', '));
  const [layer, setLayer] = useState(note.layer);
  const [body, setBody] = useState(note.content);
  const { failure, busy, submit } = useWriter<NotePatch>(async (patch) =>
    onSaved(await api.updateNote(note.id, patch)),
  );

  const changed = (): NotePatch => ({
    title: title === note.title ? undefined : title,
    body: body === note.content ? undefined : body,
    tags: tags === note.tags.join(', ') ? undefined : parseTags(tags),
    layer: layer === note.layer ? undefined : layer,
  });

  const untouched = Object.values(changed()).every((value) => value === undefined);

  return (
    <Card className="mt-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label={t.edit.title}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t.edit.layer}>
          <select
            value={layer}
            onChange={(e) => setLayer(e.target.value)}
            className={inputClass}
          >
            {LAYERS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-3">
        <Field label={t.edit.tags}>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t.edit.tagsHint}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label={t.edit.body}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            className={`${inputClass} font-mono text-xs leading-6`}
          />
        </Field>
      </div>

      {layer === 'past' && note.layer !== 'past' ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--caution)' }}>
          {t.edit.becomingPast}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button tone="primary" onClick={() => submit(changed())} disabled={busy || untouched}>
          {busy ? t.edit.saving : t.edit.save}
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          {t.edit.cancel}
        </Button>
      </div>
      <Failure failure={failure} />
    </Card>
  );
};

export type Draft = {
  heading: string;
  explain?: string;
  title: string;
  body: string;
  layer: string;
  fixedLayer?: boolean;
  amends?: number;
  submitLabel: string;
};

export const correctionDraft = (note: NoteDetail, t: Strings): Draft | null =>
  note.amendment
    ? {
        heading: t.edit.correctionTitle,
        explain: t.edit.correctionWhy,
        title: note.amendment.title,
        body: `${note.amendment.link}\n\n`,
        layer: note.amendment.layer,
        fixedLayer: true,
        amends: note.amendment.amends,
        submitLabel: t.edit.createCorrection,
      }
    : null;

export const missingNoteDraft = (title: string, t: Strings): Draft => ({
  heading: t.edit.missingTitle,
  explain: t.edit.missingWhy,
  title,
  body: '',
  layer: 'past',
  submitLabel: t.edit.createNote,
});

export const Composer = ({
  draft,
  note,
  onCancel,
}: {
  draft: Draft;
  note: NoteDetail;
  onCancel: () => void;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [layer, setLayer] = useState(draft.layer);
  const { failure, busy, submit } = useWriter<void>(async () => {
    const created = await api.createNote({
      title,
      content: body,
      layer,
      folder: note.folder ?? undefined,
      tags: note.tags,
      amends: draft.amends,
    });
    navigate(`/note/${created.id}`);
  });

  return (
    <Card className="mt-4">
      <h2 className="text-sm font-semibold">{draft.heading}</h2>
      {draft.explain ? <p className="mt-1 text-xs text-muted">{draft.explain}</p> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label={t.edit.title}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        {draft.fixedLayer ? null : (
          <Field label={t.edit.layer}>
            <select
              value={layer}
              onChange={(e) => setLayer(e.target.value)}
              className={inputClass}
            >
              {LAYERS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="mt-3">
        <Field label={t.edit.body}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className={`${inputClass} font-mono text-xs leading-6`}
          />
        </Field>
      </div>

      <p className="mt-2 text-xs text-muted">{t.edit.landsIn(note.folder ?? t.edit.vaultRoot)}</p>

      <div className="mt-3 flex items-center gap-2">
        <Button
          tone="primary"
          onClick={() => submit()}
          disabled={busy || title.trim().length === 0 || body.trim().length === 0}
        >
          {busy ? t.edit.saving : draft.submitLabel}
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          {t.edit.cancel}
        </Button>
      </div>
      <Failure failure={failure} />
    </Card>
  );
};
