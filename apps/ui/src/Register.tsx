import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  type RegisterEntry,
  type RegisterHistoryEntry,
  type RegisterKeyCard,
  type RegisterScope,
  type RegisterScreen as RegisterScreenData,
  type RegisterValue,
  toFailure,
} from './api.ts';
import { Button, Card, Page } from './bits.tsx';
import { useT } from './i18n.ts';
import { day } from './time.ts';
import { useAsync } from './useAsync.ts';

const Scope = ({ scope }: { scope: RegisterScope }) => {
  const t = useT();
  return (
    <span className="text-[11px] text-muted">
      {scope.kind === 'global' ? t.register.always : `${scope.start} → ${scope.end}`}
    </span>
  );
};

const Source = ({ value }: { value: RegisterValue }) => {
  const t = useT();
  return (
    <p className="text-[11px] text-muted">
      {value.author === 'person' ? t.register.byPerson : t.register.byAgent} · {day(value.at)}
      {value.note && (
        <>
          {' · '}
          <Link to={`/note/${value.note.id}`} className="hover:underline">
            #{value.note.id} {value.note.title}
          </Link>
        </>
      )}
    </p>
  );
};

const History = ({ entries }: { entries: RegisterHistoryEntry[] }) => {
  const t = useT();
  if (entries.length === 0) return <p className="text-[11px] text-muted">{t.common.loading}</p>;
  return (
    <ol className="space-y-2 border-l border-line pl-3">
      {entries.map((entry) => (
        <li key={entry.id} className="text-xs">
          <span className={entry.superseded ? 'text-muted line-through' : 'text-foreground'}>
            {entry.value}
          </span>
          <Source value={entry} />
        </li>
      ))}
    </ol>
  );
};

const Correction = ({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: string;
  busy: boolean;
  onSave: (value: string) => void;
  onCancel: () => void;
}) => {
  const t = useT();
  const [draft, setDraft] = useState(initial);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-background px-2 py-1.5 text-sm text-foreground"
        // biome-ignore lint/a11y/noAutofocus: the field only exists because the reader asked to type in it
        autoFocus
      />
      <Button tone="primary" disabled={busy || draft.trim() === ''} onClick={() => onSave(draft)}>
        {t.register.save}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-xs text-muted hover:underline disabled:opacity-50"
      >
        {t.rules.cancel}
      </button>
    </div>
  );
};

const Entry = ({
  subject,
  predicate,
  entry,
  showScope,
  onWritten,
}: {
  subject: string;
  predicate: string;
  entry: RegisterEntry;
  showScope: boolean;
  onWritten: (next: RegisterScreenData) => void;
}) => {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RegisterHistoryEntry[] | null>(null);

  const forked = entry.heads.length > 1;

  const write = (value: string) => {
    setBusy(true);
    setError(null);
    api
      .setRegister(subject, { predicate, value, scope: entry.scope })
      .then((next) => {
        setEditing(false);
        setHistory(null);
        onWritten(next);
      })
      .catch((cause: unknown) => setError(t.error(toFailure(cause))))
      .finally(() => setBusy(false));
  };

  const toggleHistory = () => {
    if (history !== null) {
      setHistory(null);
      return;
    }
    setHistory([]);
    api
      .registerHistory(subject, predicate, entry.scope)
      .then(setHistory)
      .catch((cause: unknown) => setError(t.error(toFailure(cause))));
  };

  return (
    <div className="space-y-2">
      {showScope && <Scope scope={entry.scope} />}

      {forked && <p className="text-xs text-danger">{t.register.forked(entry.heads.length)}</p>}

      {editing ? (
        <Correction
          initial={entry.heads[0].value}
          busy={busy}
          onSave={write}
          onCancel={() => setEditing(false)}
        />
      ) : (
        entry.heads.map((head) => (
          <div key={head.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-foreground">{head.value}</p>
              <Source value={head} />
            </div>
            {forked && (
              <Button disabled={busy} onClick={() => write(head.value)}>
                {t.register.thisOne}
              </Button>
            )}
          </div>
        ))
      )}

      {error !== null && <p className="text-xs text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {!editing && !forked && (
          <Button disabled={busy} onClick={() => setEditing(true)}>
            {t.register.correct}
          </Button>
        )}
        {entry.changes > 0 && (
          <button
            type="button"
            onClick={toggleHistory}
            className="text-[11px] text-muted hover:underline"
          >
            {history === null ? t.register.showHistory(entry.changes) : t.register.hideHistory}
          </button>
        )}
      </div>

      {history !== null && <History entries={history} />}
    </div>
  );
};

const KeyCard = ({
  subject,
  card,
  onWritten,
}: {
  subject: string;
  card: RegisterKeyCard;
  onWritten: (next: RegisterScreenData) => void;
}) => {
  const periodic = card.entries.some((entry) => entry.scope.kind === 'period');

  return (
    <Card className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{card.predicate}</h3>
      <div className={periodic ? 'space-y-4 divide-y divide-line' : ''}>
        {card.entries.map((entry) => (
          <Entry
            key={entry.scope.kind === 'period' ? entry.scope.start : 'global'}
            subject={subject}
            predicate={card.predicate}
            entry={entry}
            showScope={periodic}
            onWritten={onWritten}
          />
        ))}
      </div>
    </Card>
  );
};

export const RegisterSubjectsScreen = () => {
  const t = useT();
  const { data, failure } = useAsync(() => api.registerSubjects(), '');

  if (data === null)
    return (
      <Page>
        <p className="py-16 text-sm text-muted">{failure ? t.error(failure) : t.common.loading}</p>
      </Page>
    );

  return (
    <Page>
      <h1 className="text-lg font-semibold text-foreground">{t.register.screenTitle}</h1>
      <p className="mt-1 text-xs text-muted">{t.register.intro}</p>

      {data.length === 0 ? (
        <p className="mt-5 text-xs text-muted">{t.register.none}</p>
      ) : (
        <div className="mt-5 space-y-2">
          {data.map((row) => (
            <Link
              key={row.subject}
              to={`/register/${encodeURIComponent(row.subject)}`}
              className="glass flex items-center justify-between rounded-card bg-surface px-4 py-3 hover:bg-surface-muted"
            >
              <span className="text-sm font-semibold text-foreground">{row.subject}</span>
              <span className="text-[11px] text-muted">
                {t.register.keyCount(row.keys)} · {day(row.lastAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
};

export const RegisterScreen = () => {
  const t = useT();
  const { subject = '' } = useParams();
  const { data, failure } = useAsync(() => api.register(subject), subject);
  const [written, setWritten] = useState<RegisterScreenData | null>(null);

  const screen = written ?? data;

  if (screen === null)
    return (
      <Page>
        <p className="py-16 text-sm text-muted">{failure ? t.error(failure) : t.common.loading}</p>
      </Page>
    );

  return (
    <Page>
      <Link to="/register" className="text-[11px] text-muted hover:underline">
        ← {t.register.screenTitle}
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-foreground">{screen.subject}</h1>
      <p className="mt-1 text-xs text-muted">{t.register.subjectHint}</p>
      {/* Carrying the subject is what makes the narrow immediate write reachable:
          the same sentence typed here is about something, and typed into an empty
          chat is a guess. */}
      <Link
        to={`?chat=1&subject=${encodeURIComponent(screen.subject)}`}
        replace
        className="mt-2 inline-block text-[11px] text-primary hover:underline"
      >
        {t.register.fixHere}
      </Link>

      {screen.keys.length === 0 ? (
        <p className="mt-5 text-xs text-muted">{t.register.none}</p>
      ) : (
        <div className="mt-5 space-y-3">
          {screen.keys.map((card) => (
            <KeyCard
              key={card.predicate}
              subject={screen.subject}
              card={card}
              onWritten={setWritten}
            />
          ))}
        </div>
      )}
    </Page>
  );
};
