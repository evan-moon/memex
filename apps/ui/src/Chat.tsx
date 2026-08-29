import { ArrowUp, FileText, Hash, MessageSquare, Square, SquarePen, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  api,
  type ChatPreview,
  type ChatReceipt,
  type ChatReply,
  type ChatSession,
  toFailure,
} from './api.ts';
import { Button, Card } from './bits.tsx';
import { targetFrom } from './chat-target.ts';
import { type Strings, useT } from './i18n.ts';
import { type Choice, defaultChoice, MODELS } from './models.ts';
import { useAsync } from './useAsync.ts';

// `reply` is this run's; `outcome` is what a saved session recorded. A reopened
// turn shows what it settled and nothing to press: the ticket it was offered
// under is gone, and offering it again would be offering something else.
type Exchange = {
  id: string;
  said: string;
  reply?: ChatReply | null;
  outcome?: string;
  discarded?: boolean;
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2 text-sm">
    <span className="shrink-0 text-muted">{label}</span>
    <span className="min-w-0 break-words">{value}</span>
  </div>
);

const PreviewBody = ({ preview, t }: { preview: ChatPreview; t: Strings }) => {
  if (preview.kind === 'register') {
    return (
      <div className="space-y-1">
        <Field label={`${preview.subject} ·`} value={preview.predicate} />
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className="text-muted line-through">
            {preview.from.length > 0 ? preview.from.join(' / ') : t.chat.nothingOnRecord}
          </span>
          <span className="text-muted">→</span>
          <span className="font-semibold">{preview.to}</span>
        </div>
        {preview.newPredicate ? <p className="text-[11px] text-caution">{t.chat.newKey}</p> : null}
      </div>
    );
  }

  if (preview.kind === 'amend') {
    return (
      <div className="space-y-1">
        <p className="text-[11px] text-muted">
          {preview.target ? t.chat.amendTarget(preview.target.title) : t.chat.amendUnknown}
        </p>
        <h4 className="text-sm font-semibold">{preview.title}</h4>
        <p className="whitespace-pre-wrap text-xs text-muted">{preview.body}</p>
        <p className="text-[11px] text-muted">{t.chat.amendKeeps}</p>
      </div>
    );
  }

  if (preview.kind === 'new-note') {
    return (
      <div className="space-y-1">
        <p className="text-[11px] text-muted">
          {t.chat.newNote(preview.layer)}
          {preview.folder ? ` · ${preview.folder}` : ''}
          {preview.tags.length > 0 ? ` · ${preview.tags.join(', ')}` : ''}
        </p>
        <h4 className="text-sm font-semibold">{preview.title}</h4>
        <p className="whitespace-pre-wrap text-xs text-muted">{preview.body}</p>
      </div>
    );
  }

  const title = preview.rule?.title ?? t.chat.ruleUnknown;
  return (
    <p className="text-sm">
      {preview.decision === 'approve' ? t.chat.ruleApprove(title) : t.chat.ruleDecline(title)}
    </p>
  );
};

const ReceiptBody = ({ receipt, t }: { receipt: ChatReceipt; t: Strings }) => {
  if (receipt.kind === 'register') {
    return (
      <div className="space-y-1">
        <p className="text-sm">
          {t.chat.doneRegister(receipt.subject, receipt.predicate, receipt.value)}
        </p>
        {receipt.previous.length > 0 ? (
          <p className="text-xs text-muted">
            {t.chat.doneRegisterFrom(receipt.previous.join(' / '))}
          </p>
        ) : null}
        {receipt.similar.length > 0 ? (
          <p className="text-[11px] text-caution">
            {t.chat.doneSimilar(receipt.similar.join(', '))}
          </p>
        ) : null}
        <p className="text-[11px] text-muted">{t.chat.doneRewrite}</p>
      </div>
    );
  }

  if (receipt.kind === 'rule') {
    return (
      <p className="text-sm">
        {receipt.decision === 'approve'
          ? t.chat.doneRuleApproved(receipt.title)
          : t.chat.doneRuleDeclined(receipt.title)}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-sm">
        <Link to={`/note/${receipt.id}`} className="text-primary hover:underline">
          {t.chat.doneNote(receipt.title)}
        </Link>
      </p>
      {receipt.corrected ? (
        <p className="text-xs text-muted">{t.chat.doneCorrected(receipt.corrected.title)}</p>
      ) : null}
      {receipt.unlinked !== null ? (
        <p className="text-xs text-danger">{t.chat.doneUnlinked(receipt.unlinked)}</p>
      ) : null}
    </div>
  );
};

const Failed = ({
  reply,
  t,
  onRetry,
}: {
  reply: Extract<ChatReply, { kind: 'failed' }>;
  t: Strings;
  onRetry: () => void;
}) => (
  <div className="space-y-2">
    <p className="text-sm text-danger">{t.chat.failure[reply.failure] ?? reply.detail}</p>
    {/* Every failure here leaves the vault alone, and in a correction tool not
        knowing whether it landed is worse than knowing it did not. */}
    <p className="text-[11px] text-muted">{t.chat.nothingWritten}</p>
    {reply.remedy === 'install' || reply.remedy === 'sign-in' ? (
      <Link to="/settings" className="inline-block text-xs text-primary hover:underline">
        {t.chat.remedy[reply.remedy]}
      </Link>
    ) : null}
    {reply.remedy === 'retry' ? (
      <Button tone="plain" onClick={onRetry}>
        {t.chat.remedy.retry}
      </Button>
    ) : null}
  </div>
);

const Reply = ({
  reply,
  t,
  busy,
  onApply,
  onDiscard,
  onRetry,
}: {
  reply: ChatReply;
  t: Strings;
  busy: boolean;
  onApply: (ticket: string) => void;
  onDiscard: () => void;
  onRetry: () => void;
}) => {
  if (reply.kind === 'failed') return <Failed reply={reply} t={t} onRetry={onRetry} />;
  if (reply.kind === 'unmapped') {
    return (
      <div className="space-y-1">
        <p className="text-sm">{t.chat.unmapped}</p>
        {reply.searchable ? null : (
          <p className="text-[11px] text-muted">{t.chat.unmappedNoSearch}</p>
        )}
      </div>
    );
  }
  if (reply.kind === 'done') return <ReceiptBody receipt={reply.receipt} t={t} />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t.chat.confirmLead}</p>
      <PreviewBody preview={reply.preview} t={t} />
      <div className="flex gap-2">
        <Button tone="primary" disabled={busy} onClick={() => onApply(reply.ticket)}>
          {t.chat.apply}
        </Button>
        <Button tone="plain" disabled={busy} onClick={onDiscard}>
          {t.chat.discard}
        </Button>
      </div>
    </div>
  );
};

// The conversations there are, and which one this is. Aside puts a switcher
// where a title would go; this one is only worth having because the transcripts
// behind it are real.
const Conversations = ({
  sessions,
  current,
  onPick,
  onFresh,
  t,
}: {
  sessions: ChatSession[];
  current: number | null;
  onPick: (id: number) => void;
  onFresh: () => void;
  t: Strings;
}) => (
  <select
    value={current === null ? '' : String(current)}
    onChange={(event) =>
      event.target.value === '' ? onFresh() : onPick(Number(event.target.value))
    }
    aria-label={t.chat.screenTitle}
    className="no-drag -ml-1 max-w-[13rem] cursor-pointer truncate rounded-md border-0 bg-transparent py-0.5 pl-1 text-sm font-semibold text-foreground outline-none hover:bg-surface-muted"
  >
    <option value="">{t.chat.clear}</option>
    {sessions.map((session) => (
      <option key={session.id} value={session.id}>
        {session.title}
      </option>
    ))}
  </select>
);

export const ChatPanel = ({ onClose }: { onClose: () => void }) => {
  const t = useT();
  const [params] = useSearchParams();
  const target = targetFrom(params);
  const [draft, setDraft] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  // This conversation's model, started from the default. Changing it here does
  // not change what the next conversation starts on — that is the setting.
  const [choice, setChoice] = useState<Choice>(defaultChoice);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const { data: sessions } = useAsync(() => api.chatSessions(), `${round}`);

  const startFresh = () => {
    setExchanges([]);
    setSessionId(null);
    setChoice(defaultChoice());
  };

  const reopen = (id: number) => {
    setSessionId(id);
    setChoice(defaultChoice());
    api
      .chatSession(id)
      .then((turns) =>
        setExchanges(
          turns.map((turn) => ({ id: `past-${turn.id}`, said: turn.said, outcome: turn.outcome })),
        ),
      )
      .catch(() => setExchanges([]));
  };

  const carriedNote = useAsync(
    () => (target?.kind === 'note' ? api.note(target.id) : Promise.resolve(null)),
    target?.kind === 'note' ? String(target.id) : '',
  );

  const answer = (at: number, reply: ChatReply) =>
    setExchanges((all) => all.map((one, i) => (i === at ? { ...one, reply } : one)));

  // The request is started beside the state update rather than inside it: an
  // updater is called twice under StrictMode, and a turn that asks Claude twice
  // is one the reader pays for twice.
  //
  // The id is the turn's name on both sides. Stopping is a request of its own,
  // because neither the protocol handler nor an IPC invoke is told that the page
  // stopped listening — so the answer to a stopped turn comes back the ordinary
  // way, saying it was stopped.
  const ask = (message: string) => {
    const at = exchanges.length;
    const id = crypto.randomUUID();
    setBusy(true);
    setExchanges((all) => [...all, { id, said: message, reply: null }]);

    // The conversation so far goes with the turn, so changing model between one
    // turn and the next costs nothing: no provider was holding it.
    // The transcript lives on the server, so the turn carries only which
    // conversation it belongs to. Changing model between turns costs nothing:
    // no provider was holding it.
    api
      .chat(message, target, id, choice, sessionId)
      .then((reply) => {
        setSessionId(reply.sessionId);
        setRound((n) => n + 1);
        answer(at, reply);
      })
      .catch((cause: unknown) => {
        const { code, detail } = toFailure(cause);
        answer(at, { kind: 'failed', failure: code, remedy: 'retry', detail: detail ?? '' });
      })
      .finally(() => setBusy(false));
  };

  const stop = () => {
    const waiting = exchanges.find((one) => one.reply === null);
    if (waiting) api.cancelChat(waiting.id).catch(() => {});
  };

  const send = () => {
    const message = draft.trim();
    if (message === '' || busy) return;
    setDraft('');
    ask(message);
  };

  const discard = (at: number) =>
    setExchanges((all) => all.map((one, i) => (i === at ? { ...one, discarded: true } : one)));

  const apply = (at: number, ticket: string) => {
    setBusy(true);
    api
      .applyChat(ticket)
      .then((reply) => answer(at, reply))
      .catch((cause: unknown) => {
        const { code, detail } = toFailure(cause);
        answer(at, { kind: 'failed', failure: code, remedy: 'none', detail: detail ?? '' });
      })
      .finally(() => setBusy(false));
  };

  const carried =
    target?.kind === 'register'
      ? { kind: 'register' as const, label: target.subject }
      : carriedNote.data
        ? { kind: 'note' as const, label: carriedNote.data.title }
        : null;

  return (
    // A column, not a page: the composer stays put at the bottom and only the
    // exchanges scroll, which is what makes it a panel you talk into rather than
    // a document you scroll to the end of.
    <div className="flex h-full min-h-0 flex-col">
      <div className="drag flex items-center justify-between gap-2 px-4 pt-4 pb-1">
        <Conversations
          sessions={sessions ?? []}
          current={sessionId}
          onPick={reopen}
          onFresh={startFresh}
          t={t}
        />
        <div className="no-drag flex items-center gap-0.5">
          <button
            type="button"
            onClick={startFresh}
            disabled={exchanges.length === 0}
            aria-label={t.chat.clear}
            title={t.chat.clear}
            className="rounded-md p-1.5 text-muted hover:bg-surface-muted disabled:opacity-30"
          >
            <SquarePen size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="rounded-md p-1.5 text-muted hover:bg-surface-muted"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {exchanges.length === 0 ? (
          // What the panel is for is said by the placeholder in the composer.
          // A wall of instructions above an empty conversation is read once and
          // then in the way forever.
          <div className="flex h-full items-center justify-center">
            <MessageSquare size={56} className="text-muted opacity-15" strokeWidth={1.25} />
          </div>
        ) : (
          <div className="space-y-3">
            {exchanges.map((exchange, at) => (
              <Card key={exchange.id} className="space-y-3">
                <p className="text-sm font-medium">{exchange.said}</p>
                {exchange.outcome !== undefined ? (
                  <p className="text-xs text-muted">{exchange.outcome}</p>
                ) : exchange.discarded ? (
                  <p className="text-xs text-muted">{t.chat.discarded}</p>
                ) : exchange.reply === null || exchange.reply === undefined ? (
                  <p className="text-xs text-muted">{t.chat.thinking}</p>
                ) : (
                  <Reply
                    reply={exchange.reply}
                    t={t}
                    busy={busy}
                    onApply={(ticket) => apply(at, ticket)}
                    onDiscard={() => discard(at)}
                    onRetry={() => ask(exchange.said)}
                  />
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 pb-3">
        {/* One card, not a field beside a button: what the turn is about and what
            it will say are the same thing being composed. */}
        <div className="glass rounded-card bg-surface p-1.5">
          {carried ? (
            <div className="flex items-center gap-2 rounded-md bg-surface-muted px-2.5 py-2">
              {carried.kind === 'register' ? (
                <Hash size={13} className="shrink-0 text-muted" />
              ) : (
                <FileText size={13} className="shrink-0 text-muted" />
              )}
              <span className="min-w-0 truncate text-xs">{carried.label}</span>
            </div>
          ) : null}
          <div className="flex items-end gap-2 px-1.5 py-1">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={t.chat.placeholder}
              className="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={busy ? stop : send}
              disabled={!busy && draft.trim() === ''}
              aria-label={busy ? t.chat.stop : t.chat.send}
              className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-background disabled:opacity-30"
            >
              {busy ? <Square size={11} fill="currentColor" /> : <ArrowUp size={15} />}
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1 px-1">
          <select
            value={`${choice.provider}:${choice.model}`}
            onChange={(event) => {
              const [provider, model = ''] = event.target.value.split(':');
              setChoice({ provider: provider as Choice['provider'], model });
            }}
            aria-label={t.chat.model}
            className="cursor-pointer rounded border-0 bg-transparent py-0.5 text-[10px] text-muted outline-none hover:text-foreground"
          >
            {MODELS.map((option) => (
              <option
                key={`${option.provider}:${option.model}`}
                value={`${option.provider}:${option.model}`}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
