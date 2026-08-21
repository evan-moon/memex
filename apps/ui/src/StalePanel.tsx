import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type NoteDetail } from './api.ts';
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
  | { phase: 'review'; body: string; cost: number }
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
      setState({ phase: 'review', body: d.body, cost: d.cost });
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
          <DiffView before={note.content} after={state.body} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button tone="primary" onClick={() => save(state.body)}>
              저장
            </Button>
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
