import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type RuleCard, toFailure } from './api.ts';
import { Button, Card, Page } from './bits.tsx';
import { useT } from './i18n.ts';
import { Markdown } from './Markdown.tsx';
import { useAsync } from './useAsync.ts';

// A long note cannot be judged inside a card, so the id is the way out to it.
const Meta = ({ rule }: { rule: RuleCard }) => {
  const t = useT();
  return (
    <p className="text-[11px] text-muted">
      <Link to={`/note/${rule.id}`} className="hover:underline">
        #{rule.id}
      </Link>{' '}
      · {t.rules.wroteBy(rule.source)}
    </p>
  );
};

// No inner scrollbar: a card the page cannot scroll past is a trap, and the
// whole note is one link away.
const Body = ({ rule }: { rule: RuleCard }) => {
  const t = useT();
  return (
    <div className="text-xs">
      <Markdown>{rule.content}</Markdown>
      {rule.truncated && (
        <Link
          to={`/note/${rule.id}`}
          className="mt-1 inline-block text-[11px] text-primary hover:underline"
        >
          {t.rules.readWhole}
        </Link>
      )}
    </div>
  );
};

const Waiting = ({ rule, onDone }: { rule: RuleCard; onDone: () => void }) => {
  const t = useT();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (work: Promise<unknown>) => {
    setBusy(true);
    setError(null);
    work
      .then(onDone)
      .catch((cause: unknown) => setError(t.error(toFailure(cause))))
      .finally(() => setBusy(false));
  };

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{rule.title}</h3>
        <Meta rule={rule} />
      </div>
      <Body rule={rule} />
      {error !== null && <p className="text-xs text-danger">{error}</p>}
      {choosing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t.rules.declineAs}</span>
          <Button onClick={() => run(api.declineRule(rule.id, 'past'))} disabled={busy}>
            {t.rules.asPast}
          </Button>
          <Button onClick={() => run(api.declineRule(rule.id, 'state'))} disabled={busy}>
            {t.rules.asState}
          </Button>
          <button
            type="button"
            onClick={() => setChoosing(false)}
            disabled={busy}
            className="text-xs text-muted hover:underline disabled:opacity-50"
          >
            {t.rules.cancel}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button tone="primary" onClick={() => run(api.approveRule(rule.id))} disabled={busy}>
            {t.rules.approve}
          </Button>
          <Button onClick={() => setChoosing(true)} disabled={busy}>
            {t.rules.decline}
          </Button>
        </div>
      )}
    </Card>
  );
};

const Active = ({ rule }: { rule: RuleCard }) => (
  <Card className="space-y-2">
    <h3 className="text-sm font-semibold text-foreground">{rule.title}</h3>
    <Meta rule={rule} />
    <Body rule={rule} />
  </Card>
);

export const RulesScreen = () => {
  const t = useT();
  const [round, setRound] = useState(0);
  const { data, failure } = useAsync(() => api.rules(), String(round));
  const reload = () => setRound((n) => n + 1);

  if (data === null)
    return (
      <Page>
        <p className="py-16 text-sm text-muted">{failure ? t.error(failure) : t.common.loading}</p>
      </Page>
    );

  return (
    <Page>
      <h1 className="text-lg font-semibold text-foreground">{t.rules.screenTitle}</h1>

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-foreground">{t.rules.waiting}</h2>
        <p className="mt-1 text-xs text-muted">{t.rules.waitingHint}</p>
        {data.waiting.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t.rules.none}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {data.waiting.map((rule) => (
              <Waiting key={rule.id} rule={rule} onDone={reload} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">{t.rules.active}</h2>
        <p className="mt-1 text-xs text-muted">{t.rules.activeHint}</p>
        {data.active.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t.rules.noneActive}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {data.active.map((rule) => (
              <Active key={rule.id} rule={rule} />
            ))}
          </div>
        )}
      </section>
    </Page>
  );
};
