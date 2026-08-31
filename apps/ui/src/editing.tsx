import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ApiFailure, api, type NoteDetail, type NotePatch, toFailure } from './api.ts';
import { type SaveState, useAutosave } from './autosave.ts';
import { Button, Card } from './bits.tsx';
import { DiffView } from './DiffView.tsx';
import type { Draft } from './drafts.ts';
import { MarkdownEditor } from './editor/index.ts';
import { useT } from './i18n.ts';
import { isDirty, patchFor } from './patch.ts';
import { useVaultTitles } from './titles.ts';

const LAYERS = ['state', 'rule', 'past'];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: the control arrives as children, which the rule cannot see through — every call site passes one
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

// The draft opens with a link line and the quoted paragraph above the cursor.
// The diff should compare what the reader is writing, not the scaffolding.
const bodyBelowQuote = (body: string): string => {
  const lines = body.split('\n');
  const lastQuote = lines.reduce((at, line, i) => (line.startsWith('> ') ? i : at), -1);
  return lines
    .slice(lastQuote + 1)
    .join('\n')
    .trim();
};

// The note screen opens here rather than on a rendered copy, so there is no
// Save button: the pause between keystrokes commits, and leaving flushes what
// the pause has not.
export const NoteEditor = ({
  note,
  onSaved,
}: {
  note: NoteDetail;
  onSaved: (next: NoteDetail) => void;
}) => {
  const t = useT();
  const titles = useVaultTitles();
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags.join(', '));
  const [layer, setLayer] = useState(note.layer);
  const [body, setBody] = useState(note.content);
  const [showProps, setShowProps] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const patch = patchFor(note, { title, tags, layer, body });
  const dirty = isDirty(patch);

  const write = useCallback(
    async (next: NotePatch) => {
      setFailure(null);
      try {
        onSaved(await api.updateNote(note.id, next));
      } catch (cause) {
        setFailure(toFailure(cause));
        throw cause;
      }
    },
    [note.id, onSaved],
  );

  const saved = useAutosave(patch, dirty, write);

  return (
    <div>
      {/* The title is the document's first line, not a labelled field. A note's
          filename is its title here, so typing in it renames the file — which is
          what it looks like it should do. */}
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="w-full border-none bg-transparent p-0 text-2xl font-semibold leading-snug tracking-tight text-foreground outline-none"
      />

      <button
        type="button"
        onClick={() => setShowProps(!showProps)}
        className="mt-2 flex items-center gap-1.5 text-[11px] text-muted hover:text-foreground"
      >
        {showProps ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {t.edit.properties}
      </button>
      {showProps ? (
        <div className="mt-2 grid gap-3 border-l border-glass-line pl-3 sm:grid-cols-[1fr_auto]">
          <Field label={t.edit.tags}>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t.edit.tagsHint}
              className={inputClass}
            />
          </Field>
          <Field label={t.edit.layer}>
            <select value={layer} onChange={(e) => setLayer(e.target.value)} className={inputClass}>
              {LAYERS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      {layer === 'past' && note.layer !== 'past' ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--caution)' }}>
          {t.edit.becomingPast}
        </p>
      ) : null}

      <div className="mt-5">
        <MarkdownEditor value={body} onChange={setBody} titles={titles} />
      </div>

      <StatusLine body={body} note={note} saved={saved} />
      <Failure failure={failure} />
    </div>
  );
};

// What Obsidian keeps in the corner: how long this is, what points at it, and
// whether it is written down yet. Saving is the normal case, so it sits with the
// counts rather than announcing itself.
const StatusLine = ({
  body,
  note,
  saved,
}: {
  body: string;
  note: NoteDetail;
  saved: SaveState;
}) => {
  const t = useT();
  const words = body.trim() === '' ? 0 : body.trim().split(/\s+/).length;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3 text-[11px] text-muted">
      <span>{t.edit.backlinks(note.backlinks?.length ?? 0)}</span>
      <span>{t.edit.counts(words, body.length)}</span>
      <span className="ml-auto">
        {saved === 'saving' ? t.edit.saving : saved === 'clean' ? t.edit.saved : t.edit.unsaved}
      </span>
    </p>
  );
};

export const Composer = ({
  draft,
  note,
  quoted,
  onCancel,
}: {
  draft: Draft;
  note: NoteDetail;
  quoted?: string;
  onCancel: () => void;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const titles = useVaultTitles();
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
      // A person writing here has said the earlier note is wrong. That is the
      // one case where `corrects` is not a guess.
      amendsKind: draft.amends === undefined ? undefined : 'corrects',
    });
    navigate(`/note/${created.id}`);
  });

  // What the paragraph said against what it will say. The old text is not gone
  // — a `past` note is never edited — so this is what the correction claims,
  // not what replaces it.
  const said = quoted === undefined ? null : bodyBelowQuote(body);

  return (
    <Card className="mt-4 mb-4">
      <h2 className="text-sm font-semibold">{draft.heading}</h2>
      {draft.explain ? <p className="mt-1 text-xs text-muted">{draft.explain}</p> : null}
      {quoted !== undefined && said ? <DiffView before={quoted} after={said} /> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label={t.edit.title}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        {draft.fixedLayer ? null : (
          <Field label={t.edit.layer}>
            <select value={layer} onChange={(e) => setLayer(e.target.value)} className={inputClass}>
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
          <MarkdownEditor value={body} onChange={setBody} titles={titles} autoFocus />
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
