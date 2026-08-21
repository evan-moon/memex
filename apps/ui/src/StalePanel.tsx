import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DraftChange, type DraftVerdict, type NoteDetail } from './api.ts';
import { collapseUnchanged, diffLines } from './diff.ts';

const DiffView = ({ before, after }: { before: string; after: string }) => (
  <div className="mt-3 overflow-x-auto rounded-card border border-line bg-background">
    <pre className="min-w-full py-2 font-mono text-xs leading-6">
      {collapseUnchanged(diffLines(before, after)).map((line, i) =>
        line.kind === 'skip' ? (
          <div key={`skip-${i}`} className="px-3 text-muted">
            {`⋯ ${line.count}줄 그대로`}
          </div>
        ) : (
          <div
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
  const titleOf = new Map(newer.map((n) => [n.id, n.title]));

  if (verdict === 'no-change') {
    return (
      <div className="mt-3 rounded-card border border-line bg-background p-3">
        <div className="text-xs font-semibold text-muted">고칠 게 없대</div>
        <p className="mt-1.5 text-xs leading-6">
          {reason || '새 노트들을 읽어봤지만 이 노트가 말하는 것과 어긋나는 게 없어.'}
        </p>
        <p className="mt-2 text-xs text-muted">
          경고를 끄려면 「이건 아직 맞아」를 눌러.
        </p>
      </div>
    );
  }

  if (verdict === 'unexplained') {
    return (
      <p className="mt-3 text-xs" style={{ color: 'var(--caution)' }}>
        바꾼 이유를 안 적었어 — 근거를 확인할 수 없으니 diff를 직접 읽고 판단해줘.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-card border border-line bg-background p-3">
      <div className="text-xs font-semibold text-muted">왜 이렇게 바꿨는지</div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {changes.map((c) => (
          <li key={c.text} className="text-xs leading-6">
            {c.from.map((id) => (
              <Link
                key={id}
                to={`/note/${id}`}
                className="mr-1.5 rounded bg-surface-muted px-1.5 py-0.5 text-primary"
                title={titleOf.get(id) ?? `노트 #${id}`}
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

const Button = ({
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

type State =
  | { phase: 'idle' }
  | { phase: 'drafting' }
  | {
      phase: 'review';
      body: string;
      changes: DraftChange[];
      verdict: DraftVerdict;
      reason: string;
      cost: number;
    }
  | { phase: 'saving' }
  | { phase: 'error'; message: string };

export const StalePanel = ({
  note,
  onSaved,
  onDismissed,
}: {
  note: NoteDetail;
  onSaved: (next: NoteDetail) => void;
  onDismissed: () => void;
}) => {
  const [state, setState] = useState<State>({ phase: 'idle' });
  if (!note.stale) return null;

  const guard = (run: () => Promise<void>) => {
    run().catch((e: unknown) =>
      setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
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
        cost: d.cost,
      });
    });
  };

  const save = (body: string) => {
    setState({ phase: 'saving' });
    guard(async () => {
      onSaved(await api.saveNote(note.id, body));
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
        ⚠ 이 노트를 마지막으로 손본 뒤 관련 노트 {note.stale.newer.length}개가 쌓였어
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
                이건 아직 맞아
              </Button>
            ) : (
              <Button tone="primary" onClick={() => save(state.body)}>
                저장
              </Button>
            )}
            <Button onClick={draft}>다시 뽑기</Button>
            <Button onClick={() => setState({ phase: 'idle' })}>버리기</Button>
            <span className="text-xs text-muted">${state.cost.toFixed(3)}</span>
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            tone="primary"
            onClick={draft}
            disabled={state.phase === 'drafting' || state.phase === 'saving'}
          >
            {state.phase === 'drafting' ? '초안 쓰는 중…' : '갱신본 초안 받기'}
          </Button>
          <Button onClick={stillTrue} disabled={state.phase === 'drafting'}>
            이건 아직 맞아
          </Button>
          <span className="text-xs text-muted">
            {state.phase === 'drafting'
              ? 'Claude가 관련 노트를 읽는 중 — 1~2분 걸려'
              : '1~2분 · 약 $0.3'}
          </span>
        </div>
      )}

      {state.phase === 'error' ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--negative)' }}>
          {state.message}
        </p>
      ) : null}
    </section>
  );
};
