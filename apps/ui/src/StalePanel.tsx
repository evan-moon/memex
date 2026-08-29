import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type ApiFailure,
  api,
  type DraftChange,
  type DraftVerdict,
  type NoteDetail,
  toFailure,
} from './api.ts';
import { Button } from './bits.tsx';
import { collapseUnchanged, diffLines } from './diff.ts';
import { useT } from './i18n.ts';

const DiffView = ({ before, after }: { before: string; after: string }) => {
  const t = useT();
  return (
    <div className="mt-3 overflow-x-auto rounded-card border border-line bg-background">
      <pre className="min-w-full py-2 font-mono text-xs leading-6">
        {collapseUnchanged(diffLines(before, after)).map((line, i) =>
          line.kind === 'skip' ? (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: in a diff the position is the identity — identical lines recur, so keying by text would collide
              key={`skip-${i}`}
              className="px-3 text-muted"
            >
              {t.stale.unchangedLines(line.count)}
            </div>
          ) : (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: in a diff the position is the identity — identical lines recur, so keying by text would collide
              key={`${line.kind}-${i}`}
              className="whitespace-pre-wrap break-words px-3"
              style={{
                background:
                  line.kind === 'add'
                    ? 'color-mix(in oklab, var(--positive) 14%, transparent)'
                    : line.kind === 'remove'
                      ? 'color-mix(in oklab, var(--negative) 14%, transparent)'
                      : undefined,
                color: line.kind === 'same' ? 'var(--muted-foreground)' : 'var(--foreground)',
              }}
            >
              {`${line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '} ${line.text}`}
            </div>
          ),
        )}
      </pre>
    </div>
  );
};

// The diff says what moved; this says why, and names the note that made it
// wrong. Without it the reader has to take the rewrite on faith.
const Rationale = ({
  changes,
  verdict,
  reason,
  newer,
}: {
  changes: DraftChange[];
  verdict: DraftVerdict;
  reason: string;
  newer: { id: number; title: string }[];
}) => {
  const t = useT();
  const titleOf = new Map(newer.map((n) => [n.id, n.title]));

  if (verdict === 'no-change') {
    return (
      <div className="mt-3 rounded-card border border-line bg-background p-3">
        <div className="text-xs font-semibold text-muted">{t.stale.noChangeTitle}</div>
        <p className="mt-1.5 text-xs leading-6">{reason || t.stale.noChangeFallback}</p>
        <p className="mt-2 text-xs text-muted">{t.stale.noChangeHint}</p>
      </div>
    );
  }

  if (verdict === 'unexplained') {
    return (
      <p className="mt-3 text-xs" style={{ color: 'var(--caution)' }}>
        {t.stale.unexplained}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-card border border-line bg-background p-3">
      <div className="text-xs font-semibold text-muted">{t.stale.whyTitle}</div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {changes.map((c) => (
          <li key={c.text} className="text-xs leading-6">
            {c.from.map((id) => (
              <Link
                key={id}
                to={`/note/${id}`}
                className="mr-1.5 rounded bg-surface-muted px-1.5 py-0.5 text-primary"
                title={titleOf.get(id) ?? t.stale.noteRef(id)}
              >
                #{id}
              </Link>
            ))}
            {c.text}
          </li>
        ))}
      </ul>
    </div>
  );
};

type State =
  | { phase: 'idle' }
  | { phase: 'drafting' }
  | {
      phase: 'review';
      body: string;
      changes: DraftChange[];
      verdict: DraftVerdict;
      reason: string;
      durationMs: number;
    }
  | { phase: 'saving' }
  | { phase: 'error'; failure: ApiFailure };

export const StalePanel = ({
  note,
  onSaved,
  onDismissed,
}: {
  note: NoteDetail;
  onSaved: (next: NoteDetail) => void;
  onDismissed: () => void;
}) => {
  const t = useT();
  const [state, setState] = useState<State>({ phase: 'idle' });
  if (!note.stale) return null;

  const guard = (run: () => Promise<void>) => {
    run().catch((error: unknown) => setState({ phase: 'error', failure: toFailure(error) }));
  };

  const draft = () => {
    setState({ phase: 'drafting' });
    guard(async () => {
      const d = await api.draft(note.id);
      setState({
        phase: 'review',
        body: d.body,
        changes: d.changes,
        verdict: d.verdict,
        reason: d.reason,
        durationMs: d.durationMs,
      });
    });
  };

  const save = (body: string) => {
    setState({ phase: 'saving' });
    guard(async () => {
      onSaved(await api.updateNote(note.id, { body }));
      setState({ phase: 'idle' });
    });
  };

  const stillTrue = () => {
    guard(async () => {
      await api.stillTrue(note.id);
      onDismissed();
    });
  };

  return (
    <section className="mt-4 rounded-card border border-line bg-surface p-4">
      <div className="text-sm font-semibold" style={{ color: 'var(--caution)' }}>
        {t.stale.header(note.stale.newer.length)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {note.stale.newer.map((n) => (
          <Link key={n.id} to={`/note/${n.id}`} className="text-primary">
            {n.title}
          </Link>
        ))}
      </div>

      {state.phase === 'review' ? (
        <>
          <Rationale
            changes={state.changes}
            verdict={state.verdict}
            reason={state.reason}
            newer={note.stale.newer}
          />
          <DiffView before={note.content} after={state.body} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {state.verdict === 'no-change' ? (
              <Button tone="primary" onClick={stillTrue}>
                {t.stale.stillTrue}
              </Button>
            ) : (
              <Button tone="primary" onClick={() => save(state.body)}>
                {t.stale.save}
              </Button>
            )}
            <Button onClick={draft}>{t.stale.redraft}</Button>
            <Button onClick={() => setState({ phase: 'idle' })}>{t.stale.discard}</Button>
            <span className="text-xs text-muted">
              {t.stale.took(Math.round(state.durationMs / 1000))}
            </span>
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            tone="primary"
            onClick={draft}
            disabled={state.phase === 'drafting' || state.phase === 'saving'}
          >
            {state.phase === 'drafting' ? t.stale.drafting : t.stale.draftCta}
          </Button>
          <Button onClick={stillTrue} disabled={state.phase === 'drafting'}>
            {t.stale.stillTrue}
          </Button>
          <span className="text-xs text-muted">
            {state.phase === 'drafting' ? t.stale.draftingHint : t.stale.idleHint}
          </span>
        </div>
      )}

      {state.phase === 'error' ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--negative)' }}>
          {t.error(state.failure)}
        </p>
      ) : null}
    </section>
  );
};
