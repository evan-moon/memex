import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type ApiFailure, api, type RepairBatch, toFailure } from './api.ts';
import { Button, Card, Dates, Layer, Page } from './bits.tsx';
import { useT } from './i18n.ts';

const BATCH = 20;

const useBatch = () => {
  const [batch, setBatch] = useState<RepairBatch | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  // The stack in hand is not cleared while the next one loads: blanking it
  // unmounts the deck, and with it the card the person was standing on.
  const load = useCallback(() => {
    setFailure(null);
    api
      .repairEvidence(BATCH)
      .then(setBatch)
      .catch((cause: unknown) => setFailure(toFailure(cause)));
  }, []);

  useEffect(load, [load]);
  return { batch, failure, load };
};

const Deck = ({ batch, onFinished }: { batch: RepairBatch; onFinished: (n: number) => void }) => {
  const t = useT();
  const navigate = useNavigate();
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<number[]>([]);
  const [declared, setDeclared] = useState(0);
  const [busy, setBusy] = useState(false);

  const card = batch.cards[at];

  useEffect(() => {
    setChosen(card ? card.candidates.map((source) => source.id) : []);
  }, [card]);

  const advance = useCallback(
    (counted: boolean) => {
      const next = at + 1;
      const total = declared + (counted ? 1 : 0);
      setDeclared(total);
      if (next >= batch.cards.length) onFinished(total);
      else setAt(next);
    },
    [at, batch.cards.length, declared, onFinished],
  );

  const commit = useCallback(
    (work: Promise<unknown>, counted: boolean) => {
      setBusy(true);
      work.then(() => advance(counted)).finally(() => setBusy(false));
    },
    [advance],
  );

  const declare = useCallback(() => {
    if (!card || chosen.length === 0) return;
    commit(api.updateNote(card.id, { derivesFrom: chosen }), true);
  }, [card, chosen, commit]);

  const none = useCallback(() => {
    if (!card) return;
    commit(api.stillTrue(card.id), false);
  }, [card, commit]);

  const toggle = useCallback((id: number) => {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (busy || !card) return;
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= card.candidates.length) {
        const source = card.candidates[digit - 1];
        if (source) toggle(source.id);
        return;
      }
      if (event.key === 'Enter') declare();
      if (event.key.toLowerCase() === 'n') none();
      if (event.key.toLowerCase() === 's') advance(false);
      if (event.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, card, declare, none, advance, toggle, navigate]);

  if (!card) return null;

  return (
    <>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="tabular-nums">{t.repair.progress(at + 1, batch.cards.length)}</span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((at + 1) / batch.cards.length) * 100}%` }}
          />
        </div>
        <span>{t.repair.remaining(batch.remaining)}</span>
      </div>

      <Card className="mt-4">
        <Link
          to={`/note/${card.id}`}
          className="text-base font-semibold leading-snug hover:underline"
        >
          {card.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Layer layer={card.layer} />
          <Dates at={card.at} updatedAt={card.updatedAt} />
        </div>

        {card.claims.length > 0 ? (
          <>
            <p className="mt-4 text-xs text-muted">{t.repair.claims(card.claims.length)}</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {card.claims.map((claim, index) => (
                <li key={claim} className="flex gap-2 text-sm leading-snug">
                  <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted">
                    {index + 1}
                  </span>
                  <span>{claim}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <p className="mt-4 text-xs text-muted">{t.repair.sources}</p>
        <ul className="mt-2 flex flex-col gap-1">
          {card.candidates.map((source, index) => (
            <li key={source.id}>
              <button
                type="button"
                onClick={() => toggle(source.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted"
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={chosen.includes(source.id)}
                  className="pointer-events-none"
                />
                <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted">
                  {index + 1}
                </span>
                <Layer layer={source.layer} />
                <span className="truncate text-sm">{source.title}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center gap-2">
          <Button onClick={declare} disabled={busy || chosen.length === 0} tone="primary">
            {t.repair.declare}
          </Button>
          <Button onClick={none} disabled={busy}>
            {t.repair.none}
          </Button>
          <Button onClick={() => advance(false)} disabled={busy}>
            {t.repair.skip}
          </Button>
          <span className="ml-auto text-[11px] text-muted">{t.repair.keys}</span>
        </div>
      </Card>
    </>
  );
};

const Finished = ({ done, onAgain }: { done: number; onAgain: () => void }) => {
  const t = useT();
  return (
    <Card className="mt-4">
      <p className="text-sm font-semibold">{t.repair.doneTitle(done)}</p>
      <div className="mt-4 flex gap-2">
        <Button onClick={onAgain} tone="primary">
          {t.repair.again}
        </Button>
        <Link
          to="/"
          className="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
        >
          {t.repair.home}
        </Link>
      </div>
    </Card>
  );
};

export const RepairScreen = () => {
  const t = useT();
  const { batch, failure, load } = useBatch();
  const [done, setDone] = useState<number | null>(null);

  const again = () => {
    setDone(null);
    load();
  };

  return (
    <Page>
      <h1 className="text-xl font-semibold">{t.repair.title}</h1>
      <p className="mt-1 text-xs text-muted">{t.repair.subtitle}</p>

      {done !== null ? <Finished done={done} onAgain={again} /> : null}

      {done === null && batch ? (
        batch.cards.length === 0 ? (
          <Card className="mt-4">
            <p className="text-sm text-muted">{t.repair.empty}</p>
          </Card>
        ) : (
          <Deck batch={batch} onFinished={setDone} />
        )
      ) : null}

      {done === null && !batch ? (
        <p className="mt-4 text-xs text-muted">{failure ? t.error(failure) : t.common.loading}</p>
      ) : null}
    </Page>
  );
};
