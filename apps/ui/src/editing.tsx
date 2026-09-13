import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ApiFailure, api, type NoteDetail, type NotePatch, toFailure } from './api.ts';
import { type SaveState, useAutosave } from './autosave.ts';
import { Button, Card } from './bits.tsx';
import { whileEditing } from './closing.ts';
import { DiffView } from './DiffView.tsx';
import type { Draft } from './drafts.ts';
import { MarkdownEditor } from './editor/index.ts';
import { bodyUnder, isUntouched, titleOf, withTitle } from './heading.ts';
import { useT } from './i18n.ts';
import { decodeNewDocument, encodeNewDocument, hasDraftContent } from './new-document.ts';
import { isDirty, patchFor } from './patch.ts';
import { useTemplates } from './templates.ts';
import { useVaultTitles } from './titles.ts';
import { vaultChanged } from './vault.ts';

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

const ComposerFrame = ({ document, children }: { document: boolean; children: React.ReactNode }) =>
  document ? (
    <div className="mx-auto min-h-[70vh] max-w-3xl px-2 pb-20 pt-12 sm:px-8">{children}</div>
  ) : (
    <Card className="mt-4 mb-4">{children}</Card>
  );

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

  // A body edit is a document write: it carries the version it was built on, and
  // it goes through the path that keeps history and refuses to flatten somebody
  // else's edit. Everything else is memory metadata and keeps the older shape.
  //
  // This is also what lets a record be edited at all. Correcting the claims
  // inside one is still a separate operation; changing the words is not.
  const write = useCallback(
    async (next: NotePatch) => {
      setFailure(null);
      try {
        const { body: edited, ...rest } = next;
        const wrote =
          edited === undefined
            ? null
            : await api.writeBody(note.id, {
                body: edited,
                expectedRevision: note.revision ?? null,
                mutationId: crypto.randomUUID(),
              });
        const changed = Object.values(rest).some((value) => value !== undefined);
        onSaved(changed ? await api.updateNote(note.id, rest) : (wrote ?? note));
      } catch (cause) {
        setFailure(toFailure(cause));
        throw cause;
      }
    },
    [note, onSaved],
  );

  const { state: saved, flush, retry, safeToClose } = useAutosave(patch, dirty, write);

  // The window asks this editor whether it may go. Registered while the editor
  // is open and forgotten the moment it is not, so a closed tab cannot keep the
  // window alive on the strength of a buffer nobody is looking at.
  useEffect(() => whileEditing({ flush, safeToClose }), [flush, safeToClose]);

  // ⌘S does not mean "save" here — everything saves on its own. It means stop
  // waiting for the pause, which is what somebody who just typed the last word
  // of a paragraph is asking for.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 's' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      flush();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flush]);

  return (
    <div className="authoring-page">
      {/* The title is the document's first line, not a labelled field. A note's
          filename is its title here, so typing in it renames the file — which is
          what it looks like it should do. */}
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="w-full border-none bg-transparent p-0 text-4xl font-bold leading-tight tracking-[-0.03em] text-foreground outline-none placeholder:text-muted"
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
                  {t.layers[option]?.name ?? option}
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

      <div className="mt-7">
        <MarkdownEditor value={body} onChange={setBody} titles={titles} />
      </div>

      <StatusLine
        body={body}
        note={note}
        saved={saved}
        onRetry={() => {
          retry();
        }}
      />
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
  onRetry,
}: {
  body: string;
  note: NoteDetail;
  saved: SaveState;
  onRetry: () => void;
}) => {
  const t = useT();
  const words = body.trim() === '' ? 0 : body.trim().split(/\s+/).length;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3 text-[11px] text-muted">
      <span>{t.edit.backlinks(note.backlinks?.length ?? 0)}</span>
      <span>{t.edit.counts(words, body.length)}</span>
      <span className="ml-auto">
        {saved === 'saving'
          ? t.edit.saving
          : saved === 'clean'
            ? t.edit.saved
            : saved === 'failed'
              ? t.edit.saveFailed
              : t.edit.unsaved}
        {saved === 'failed' ? (
          <button type="button" onClick={onRetry} className="text-primary">
            {t.common.retry}
          </button>
        ) : null}
      </span>
    </p>
  );
};

// Where a new note lands. A correction lands beside the note it corrects and a
// blank one lands where the person right-clicked, so the destination is passed
// in rather than read off a note the composer may not have.
export type Destination = { folder: string | null; tags: string[] };

export const Composer = ({
  draft,
  into,
  quoted,
  draftKey,
  onCancel,
}: {
  draft: Draft;
  into: Destination;
  quoted?: string;
  draftKey?: string;
  onCancel: () => void;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const titles = useVaultTitles();
  const templates = useTemplates();
  const [body, setBody] = useState(withTitle(draft.title, draft.body));
  const [layer, setLayer] = useState(draft.layer);
  const [bufferReady, setBufferReady] = useState(draftKey === undefined);
  const [bufferFailure, setBufferFailure] = useState<ApiFailure | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (draftKey === undefined) return;
    let active = true;
    api
      .buffer(draftKey)
      .then((saved) => {
        if (!active) return;
        if (saved?.documentId) {
          navigate(`/note/${saved.documentId}`, { replace: true });
          return;
        }
        if (saved !== null) {
          const restored = decodeNewDocument(saved.content);
          sequence.current = saved.sequence;
          setBody(restored.markdown);
          setLayer(restored.layer);
        }
        setBufferReady(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setBufferFailure(toFailure(cause));
        setBufferReady(true);
      });
    return () => {
      active = false;
    };
  }, [draftKey, navigate]);

  // The note names itself in its first line. Nothing else knows the title, so
  // nothing else has to be kept in step with it.
  const title = titleOf(body);
  const under = bodyUnder(body);

  // A kind of note brings the sections it is written in, and takes them back
  // when the kind changes — but only while nobody has written into them.
  useEffect(() => {
    if (!bufferReady) return;
    if (draft.emptyPage) return;
    if (templates === null) return;
    setBody((current) =>
      isUntouched(bodyUnder(current), Object.values(templates))
        ? withTitle(titleOf(current), templates[layer] ?? '')
        : current,
    );
  }, [templates, layer, bufferReady, draft.emptyPage]);

  useEffect(() => {
    if (draftKey === undefined || !bufferReady) return;
    const timer = setTimeout(() => {
      if (!hasDraftContent(body)) {
        api.dropBuffer(draftKey).catch((cause: unknown) => setBufferFailure(toFailure(cause)));
        return;
      }
      const next = sequence.current + 1;
      sequence.current = next;
      api
        .keepBuffer(draftKey, {
          content: encodeNewDocument({ markdown: body, layer, folder: into.folder }),
          sequence: next,
        })
        .then(() => setBufferFailure(null))
        .catch((cause: unknown) => setBufferFailure(toFailure(cause)));
    }, 500);
    return () => clearTimeout(timer);
  }, [body, layer, draftKey, bufferReady, into.folder]);

  const { failure, busy, submit } = useWriter<void>(async () => {
    if (draftKey !== undefined) {
      const next = sequence.current + 1;
      sequence.current = next;
      await api.keepBuffer(draftKey, {
        content: encodeNewDocument({ markdown: body, layer, folder: into.folder }),
        sequence: next,
      });
    }
    const created = await api.createNote({
      title,
      content: body,
      layer,
      folder: into.folder ?? undefined,
      tags: into.tags,
      amends: draft.amends,
      draftKey,
      // A person writing here has said the earlier note is wrong. That is the
      // one case where `corrects` is not a guess.
      amendsKind: draft.amends === undefined ? undefined : 'corrects',
    });
    if (draftKey !== undefined) await api.dropBuffer(draftKey);
    // The shelf has a note on it that was not there a moment ago, and the
    // sidebar read the vault once when the window opened.
    vaultChanged();
    navigate(`/note/${created.id}`);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 's' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (busy || !bufferReady || title === '' || under.trim().length === 0) return;
      submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, bufferReady, title, under, submit]);

  // What the paragraph said against what it will say. The old text is not gone
  // — a `past` note is never edited — so this is what the correction claims,
  // not what replaces it.
  const said = quoted === undefined ? null : bodyBelowQuote(body);

  return (
    <ComposerFrame document={Boolean(draft.emptyPage)}>
      {draft.emptyPage ? null : <h2 className="text-sm font-semibold">{draft.heading}</h2>}
      {draft.emptyPage || !draft.explain ? null : (
        <p className="mt-1 text-xs text-muted">{draft.explain}</p>
      )}
      {quoted !== undefined && said ? <DiffView before={quoted} after={said} /> : null}

      {draft.fixedLayer || draft.emptyPage ? null : (
        <div className="mt-3">
          <Field label={t.edit.layer}>
            <select value={layer} onChange={(e) => setLayer(e.target.value)} className={inputClass}>
              {LAYERS.map((option) => (
                <option key={option} value={option}>
                  {t.layers[option]?.name ?? option}
                </option>
              ))}
            </select>
          </Field>
          <p className="mt-1 text-xs text-muted">{t.layers[layer]?.hint}</p>
        </div>
      )}

      <div className={draft.emptyPage ? '' : 'mt-3'}>
        <MarkdownEditor value={body} onChange={setBody} titles={titles} autoFocus />
      </div>
      {title === '' ? <p className="mt-2 text-xs text-muted">{t.edit.needsTitle}</p> : null}

      <p className="mt-3 text-xs text-muted">{draft.lands(into.folder ?? t.edit.vaultRoot)}</p>

      <div className="mt-3 flex items-center gap-2 border-glass-line border-t pt-3">
        <Button
          tone="primary"
          onClick={() => submit()}
          disabled={busy || !bufferReady || title === '' || under.trim().length === 0}
        >
          {busy ? t.edit.saving : draft.submitLabel}
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          {t.edit.cancel}
        </Button>
      </div>
      <Failure failure={failure ?? bufferFailure} />
    </ComposerFrame>
  );
};
