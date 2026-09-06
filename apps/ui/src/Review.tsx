import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type ApiFailure, api, type DeckCard, type DeckKind } from './api.ts';
import { Button, Card } from './bits.tsx';
import { type Strings, useT } from './i18n.ts';
import { day } from './time.ts';
import { useAsync } from './useAsync.ts';

type Settled =
  | 'not-a-fact'
  | 'correct-soon'
  | 'confirmed-card'
  | 'confirmed-evidence'
  | 'approved-rule'
  | 'downgraded'
  | 'deferred'
  | 'undone';

const kindLabel = (kind: DeckKind, t: Strings) =>
  kind === 'rule'
    ? t.deck.kindRule
    : kind === 'inference'
      ? t.deck.kindInference
      : t.deck.kindClaim;

const confirmLabel = (kind: DeckKind, t: Strings) =>
  kind === 'rule'
    ? t.deck.confirmRule
    : kind === 'inference'
      ? t.deck.confirmInference
      : t.deck.confirm;

const hrefOf = (card: DeckCard) =>
  card.kind === 'inference' ? `/inference/${card.id}` : `/note/${card.source?.id ?? card.id}`;

const Meta = ({ card }: { card: DeckCard }) => {
  const t = useT();
  const parts = [
    card.since === null ? null : t.deck.since(day(card.since)),
    card.confirmedAt === null
      ? t.deck.neverChecked
      : card.idleDays === null
        ? null
        : t.deck.idle(card.idleDays),
  ].filter((part): part is string => part !== null);

  return (
    <p className="text-[11px] leading-[1.7] text-muted">
      {parts.join(' · ')}
      <br />
      {card.injected.hits === 0
        ? t.deck.spokenNone
        : t.deck.spoken(card.injected.hits, card.injected.days)}
    </p>
  );
};

export const DeckCardFace = ({
  card,
  open,
  onToggleEvidence,
}: {
  card: DeckCard;
  open: boolean;
  onToggleEvidence: () => void;
}) => {
  const t = useT();
  const moved = card.evidenceMoved && card.kind !== 'inference';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] tracking-[0.06em] text-muted">{kindLabel(card.kind, t)}</span>
        {moved ? (
          <span className="rounded-full border border-line-strong px-2 py-px text-[10px] leading-4 text-foreground">
            {t.deck.moved}
          </span>
        ) : null}
      </div>

      {/* The sentence is the page; everything else is annotation on it, and the
          size difference is what says so. A long one steps down rather than
          growing the card, and clamps rather than pushing its own buttons off
          the screen. */}
      <p
        className={`max-w-[52ch] line-clamp-[8] font-medium tracking-[-0.02em] ${
          card.text.length > 120
            ? 'text-[15px] leading-[1.7]'
            : card.text.length > 60
              ? 'text-[17px] leading-[1.6]'
              : 'text-[20px] leading-[1.5]'
        }`}
      >
        {card.text}
      </p>

      {card.heading === null ? null : (
        <p className="text-[11px] text-muted">
          {card.source === null ? card.heading : `${card.source.title} · ${card.heading}`}
        </p>
      )}

      {card.detail === null ? null : (
        /* The whole of it, scrolling inside the card rather than pushing the
           verdicts off the screen. Nothing is elided: an answer given on a
           truncation is not an answer. */
        <div className="max-h-56 overflow-y-auto rounded-md border border-glass-line bg-reading p-3">
          <p className="whitespace-pre-wrap text-[13px] leading-[1.75]">{card.detail}</p>
        </div>
      )}

      <Meta card={card} />

      {moved ? <p className="text-[11px] text-muted">{t.deck.movedLead}</p> : null}

      <div className="border-glass-line border-t pt-3">
        <button
          type="button"
          onClick={onToggleEvidence}
          className="text-[11px] text-muted hover:underline"
        >
          {t.deck.evidence} {open ? '▴' : '▾'}
        </button>
        {open && card.source ? (
          <p className="mt-2 text-xs">
            <Link to={hrefOf(card)} className="hover:underline">
              {card.source.title}
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
};

const Actions = ({
  kind,
  busy,
  canUndo,
  onConfirm,
  onCorrect,
  onDefer,
  onNotAFact,
  onUndo,
}: {
  kind: DeckKind;
  busy: boolean;
  canUndo: boolean;
  onConfirm: () => void;
  onCorrect: () => void;
  onDefer: () => void;
  onNotAFact: () => void;
  onUndo: () => void;
}) => {
  const t = useT();
  return (
    <>
      {/* The two directions are not the same size of thing. Saying it still holds
          costs nothing and keeps the rhythm; saying it changed needs a new value,
          so it sits on the other side and will stop the deck when it lands. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button onClick={onCorrect} disabled={busy}>
          ← {t.deck.correct}
        </Button>
        <Button onClick={onDefer} disabled={busy}>
          ↓ {t.deck.defer}
        </Button>
        <Button tone="primary" onClick={onConfirm} disabled={busy}>
          {confirmLabel(kind, t)} →
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <p className="text-[11px] text-muted">{t.deck.keys}</p>
        {kind === 'claim' ? (
          <button
            type="button"
            onClick={onNotAFact}
            disabled={busy}
            className="ml-auto text-[11px] text-muted hover:underline disabled:opacity-50"
          >
            {t.deck.notAFact}
          </button>
        ) : null}
        {canUndo ? (
          <button
            type="button"
            onClick={onUndo}
            disabled={busy}
            className="ml-auto text-[11px] text-muted hover:underline disabled:opacity-50"
          >
            ⌘Z {t.deck.undo}
          </button>
        ) : null}
      </div>
    </>
  );
};

export const DeckEmpty = ({ done }: { done: boolean }) => {
  const t = useT();
  return (
    <Card className="mt-3">
      <p className="font-semibold text-[15px]">{done ? t.deck.doneTitle : t.deck.emptyTitle}</p>
      <p className="mt-1 max-w-prose text-sm text-muted">
        {done ? t.deck.doneLead : t.deck.emptyLead}
      </p>
    </Card>
  );
};

type Drag = { x: number; y: number; live: boolean };

const REST: Drag = { x: 0, y: 0, live: false };

// Long enough to read as a card leaving, short enough that seven of them in a
// row never feels like waiting.
const EXIT_MS = 280;

const stillness = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Past this the card leaves. Short enough to feel like a flick, long enough that
// a scroll gesture on a trackpad does not judge a memory by accident.
const COMMIT_X = 110;
const COMMIT_Y = 130;

export type SwipeAim = 'confirm' | 'correct' | 'defer' | null;

export const aimOf = (drag: Drag): SwipeAim => {
  if (Math.abs(drag.x) > Math.abs(drag.y)) {
    if (drag.x >= COMMIT_X) return 'confirm';
    if (drag.x <= -COMMIT_X) return 'correct';
    return null;
  }
  return drag.y >= COMMIT_Y ? 'defer' : null;
};

const leaning = (drag: Drag): SwipeAim => {
  const pull = 40;
  if (Math.abs(drag.x) > Math.abs(drag.y)) {
    if (drag.x > pull) return 'confirm';
    if (drag.x < -pull) return 'correct';
    return null;
  }
  return drag.y > pull ? 'defer' : null;
};

// How far the card has been pulled toward a verdict, 0 to 1. The card tints and
// the label fades in on this rather than snapping at the threshold, so the
// commit point is something you feel arriving instead of discover afterwards.
const pullOf = (drag: Drag): number => {
  const lateral = Math.abs(drag.x) / COMMIT_X;
  const down = drag.y / COMMIT_Y;
  return Math.min(1, Math.max(0, Math.abs(drag.x) > Math.abs(drag.y) ? lateral : down));
};

const TINT: Record<Exclude<SwipeAim, null>, string> = {
  confirm: 'var(--primary)',
  correct: 'var(--caution)',
  defer: 'var(--border-accent)',
};

const Verdict = ({ aim, pull, kind }: { aim: SwipeAim; pull: number; kind: DeckKind }) => {
  const t = useT();
  if (aim === null) return null;
  const label =
    aim === 'confirm' ? confirmLabel(kind, t) : aim === 'correct' ? t.deck.correct : t.deck.defer;
  return (
    <span
      className="-translate-x-1/2 pointer-events-none absolute top-5 left-1/2 rounded-full border-2 px-4 py-1.5 font-semibold text-sm"
      style={{
        background: 'var(--reading)',
        borderColor: TINT[aim],
        color: TINT[aim],
        opacity: Math.min(1, pull * 1.4),
        transform: `scale(${String(0.9 + pull * 0.1)})`,
      }}
    >
      {label}
    </span>
  );
};

// Seven dots, not a number. The session is a distance you can see the end of,
// which is the whole reason it is seven and not everything.
const Progress = ({ total, at }: { total: number; at: number }) => (
  <span className="ml-auto flex items-center gap-1.5">
    {Array.from({ length: total }, (_, n) => (
      <i
        key={`dot-${String(n)}`}
        aria-hidden
        className="block rounded-full transition-all duration-300 ease-out motion-reduce:transition-none"
        style={{
          width: n === at ? '18px' : '5px',
          height: '5px',
          background: n <= at ? 'var(--primary)' : 'var(--border-accent)',
          opacity: n < at ? 0.45 : 1,
        }}
      />
    ))}
  </span>
);

export const Review = () => {
  const t = useT();
  const [sessions, setSessions] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const { data, failure } = useAsync(
    () => api.deck(sessions),
    `deck-${String(sessions)}-${String(attempt)}`,
  );

  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [openEvidence, setOpenEvidence] = useState(false);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionFailure, setActionFailure] = useState<ApiFailure | null>(null);
  const [judged, setJudged] = useState(0);
  const [drag, setDrag] = useState<Drag>(REST);
  const [flying, setFlying] = useState<SwipeAim>(null);
  // Where the card was let go, so it leaves along the line it was thrown rather
  // than on a fixed rail.
  const [thrown, setThrown] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (data) setCards(data.cards);
  }, [data]);

  const current = cards?.[index];

  // The write lands immediately; the card is what waits. Advancing the index the
  // moment the request resolves would swap the card out before it has left the
  // screen, which reads as a flicker rather than a decision.
  const step = useCallback((next: DeckCard[] | null, outcome: Settled) => {
    const settle = () => {
      if (next) setCards(next);
      setSettled(outcome);
      setIndex((at) => at + 1);
      setJudged((n) => n + 1);
      setOpenEvidence(false);
      setDrag(REST);
      setFlying(null);
    };
    if (stillness()) settle();
    else window.setTimeout(settle, EXIT_MS);
  }, []);

  const confirm = useCallback(() => {
    if (!current || busy) return;
    const depth = openEvidence ? 'evidence' : 'card';
    const kind = current.kind;
    setFlying((was) => was ?? 'confirm');
    setBusy(true);
    setActionFailure(null);
    api
      .confirmCard(current.key, depth)
      .then((reply) =>
        step(
          null,
          kind === 'rule'
            ? 'approved-rule'
            : reply.downgraded
              ? 'downgraded'
              : depth === 'evidence'
                ? 'confirmed-evidence'
                : 'confirmed-card',
        ),
      )
      .catch((error: unknown) => setActionFailure(error as ApiFailure))
      .finally(() => setBusy(false));
  }, [busy, current, openEvidence, step]);

  const correct = useCallback(() => {
    if (!current || busy) return;
    setFlying((was) => was ?? 'correct');
    setBusy(true);
    setActionFailure(null);
    api
      .markCorrection(current.key)
      .then(() => step(null, 'correct-soon'))
      .catch((error: unknown) => setActionFailure(error as ApiFailure))
      .finally(() => setBusy(false));
  }, [busy, current, step]);

  const notAFact = useCallback(() => {
    if (!current || current.kind !== 'claim' || busy) return;
    setFlying((was) => was ?? 'defer');
    setBusy(true);
    setActionFailure(null);
    api
      .markNotAFact(current.id)
      .then(() => step(null, 'not-a-fact'))
      .catch((error: unknown) => setActionFailure(error as ApiFailure))
      .finally(() => setBusy(false));
  }, [busy, current, step]);

  const defer = useCallback(() => {
    if (!current || busy) return;
    setFlying((was) => was ?? 'defer');
    setBusy(true);
    setActionFailure(null);
    api
      .deferCard(current.key)
      .then(() => step(null, 'deferred'))
      .catch((error: unknown) => setActionFailure(error as ApiFailure))
      .finally(() => setBusy(false));
  }, [busy, current, step]);

  const undo = useCallback(() => {
    if (judged === 0 || busy) return;
    setBusy(true);
    setActionFailure(null);
    api
      .undoCard()
      .then(() => {
        setIndex((at) => Math.max(0, at - 1));
        setJudged((n) => Math.max(0, n - 1));
        setSettled('undone');
        setOpenEvidence(false);
      })
      .catch((error: unknown) => setActionFailure(error as ApiFailure))
      .finally(() => setBusy(false));
  }, [busy, judged]);

  const commit = useCallback(
    (aim: SwipeAim) => {
      if (aim === null) {
        setDrag(REST);
        return;
      }
      setFlying(aim);
      setThrown({ x: drag.x, y: drag.y });
      if (aim === 'confirm') confirm();
      else if (aim === 'correct') correct();
      else defer();
    },
    [confirm, correct, defer, drag.x, drag.y],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (busy) return;
    if (event.target instanceof HTMLElement && event.target.closest('button, a')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: 0, y: 0, live: true });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.live) return;
    setDrag({ x: drag.x + event.movementX, y: drag.y + event.movementY, live: true });
  };

  const onPointerUp = () => {
    if (!drag.live) return;
    commit(aimOf(drag));
    setDrag((was) => ({ ...was, live: false }));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowRight' || event.key === '2') {
        event.preventDefault();
        confirm();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === '1') {
        event.preventDefault();
        correct();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === '3') {
        event.preventDefault();
        defer();
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        setOpenEvidence((was) => !was);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, correct, defer, undo]);

  if (failure) {
    return (
      <section className="mt-6">
        <h2 className="font-semibold text-sm">{t.deck.title}</h2>
        <Card className="mt-3">
          <p className="text-sm">{t.deck.errorTitle}</p>
          <p className="mt-1 text-muted text-xs">{t.error(failure)}</p>
          <div className="mt-3">
            <Button onClick={() => setAttempt((n) => n + 1)}>{t.common.retry}</Button>
          </div>
        </Card>
      </section>
    );
  }

  if (!cards) {
    return (
      <section className="mt-6">
        <h2 className="font-semibold text-sm">{t.deck.title}</h2>
        <Card className="mt-3">
          <p className="text-muted text-sm">{t.deck.loading}</p>
        </Card>
      </section>
    );
  }

  const aim = leaning(drag);
  const pull = pullOf(drag);

  const settledLine =
    settled === 'not-a-fact'
      ? t.deck.notAFactDone
      : settled === 'correct-soon'
        ? t.deck.correctSoon
        : settled === 'approved-rule'
          ? t.deck.approvedRule
          : settled === 'confirmed-card'
            ? t.deck.confirmedCard
            : settled === 'confirmed-evidence'
              ? t.deck.confirmedEvidence
              : settled === 'downgraded'
                ? t.deck.downgraded
                : settled === 'deferred'
                  ? t.deck.deferred
                  : settled === 'undone'
                    ? t.deck.undone
                    : null;

  return (
    <section className="mt-6">
      <div className="flex items-baseline gap-3">
        <h2 className="font-semibold text-sm">{t.deck.title}</h2>
        {current ? <Progress total={cards.length} at={index} /> : null}
      </div>

      {settledLine ? <p className="mt-2 text-muted text-xs">{settledLine}</p> : null}

      {current ? (
        <div className="relative mt-3">
          {/* The cards behind are what says the session ends. Two at most: a deck
              you can see the bottom of is a session, one you cannot is a backlog. */}
          {cards.slice(index + 1, index + 3).map((behind, depth) => (
            <div
              key={behind.key}
              aria-hidden
              className="glass absolute inset-x-0 top-0 h-full rounded-card bg-surface transition-all duration-300 ease-out motion-reduce:hidden motion-reduce:transition-none"
              style={{
                transform: `translateY(${String((depth + 1) * 10)}px) scale(${String(1 - (depth + 1) * 0.03)})`,
                zIndex: -depth - 1,
                opacity: 1 - (depth + 1) * 0.25,
              }}
            />
          ))}
          <Card
            key={current.key}
            className={`deck-card relative touch-none select-none ${drag.live ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: flying
                ? `translate(${String(thrown.x * 4 + (flying === 'confirm' ? 700 : flying === 'correct' ? -700 : 0))}px, ${String(thrown.y * 4 + (flying === 'defer' ? 700 : 0))}px) rotate(${String(thrown.x / 6)}deg)`
                : `translate(${String(drag.x)}px, ${String(drag.y)}px) rotate(${String(drag.x / 28)}deg)`,
              opacity: flying ? 0 : 1,
              borderColor: aim === null ? undefined : TINT[aim],
              boxShadow:
                aim === null
                  ? undefined
                  : `0 10px 30px rgb(20 24 40 / 0.10), 0 0 0 ${String(1 + pull * 2)}px color-mix(in oklab, ${TINT[aim]} ${String(Math.round(pull * 40))}%, transparent)`,
              transition: drag.live
                ? 'none'
                : flying
                  ? 'transform 320ms cubic-bezier(0.32, 0, 0.67, 0), opacity 260ms ease-in'
                  : 'transform 320ms cubic-bezier(0.34, 1.36, 0.64, 1), box-shadow 200ms ease-out, border-color 200ms ease-out',
            }}
          >
            <Verdict aim={aim} pull={pull} kind={current.kind} />
            <DeckCardFace
              card={current}
              open={openEvidence}
              onToggleEvidence={() => setOpenEvidence((was) => !was)}
            />
            <Actions
              kind={current.kind}
              busy={busy}
              canUndo={judged > 0}
              onConfirm={confirm}
              onCorrect={correct}
              onDefer={defer}
              onNotAFact={notAFact}
              onUndo={undo}
            />
            {current.kind === 'rule' ? (
              <p className="mt-2 text-[11px] text-muted">{t.deck.ruleCost}</p>
            ) : null}
            {actionFailure ? (
              <p className="mt-3 text-danger text-xs">{t.deck.actionFailed}</p>
            ) : null}
          </Card>
        </div>
      ) : (
        <>
          <DeckEmpty done={cards.length > 0} />
          {cards.length > 0 ? (
            <div className="mt-3">
              <Button onClick={() => setSessions((n) => n + 1)}>{t.deck.more}</Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};
