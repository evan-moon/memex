import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type ChatPreview, type ChatReceipt, type ChatReply, toFailure } from './api.ts';
import { Button, Card, Page } from './bits.tsx';
import { targetFrom } from './chat-target.ts';
import { type Strings, useT } from './i18n.ts';
import { useAsync } from './useAsync.ts';

type Exchange = { id: string; said: string; reply: ChatReply | null; discarded?: boolean };

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
      <Link to="/connect" className="inline-block text-xs text-primary hover:underline">
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

export const ChatScreen = () => {
  const t = useT();
  const [params] = useSearchParams();
  const target = targetFrom(params);
  const [draft, setDraft] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);

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

    api
      .chat(message, target, id)
      .then((reply) => answer(at, reply))
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
      ? t.chat.carriedRegister(target.subject)
      : carriedNote.data
        ? t.chat.carriedNote(carriedNote.data.title)
        : null;

  return (
    <Page>
      <h1 className="text-lg font-semibold text-foreground">{t.chat.screenTitle}</h1>
      <p className="mt-1 text-xs text-muted">{t.chat.intro}</p>
      {carried ? <p className="mt-2 text-[11px] text-primary">{carried}</p> : null}

      <div className="mt-5 space-y-4">
        {exchanges.map((exchange, at) => (
          <Card key={exchange.id} className="space-y-3">
            <p className="text-sm font-medium">{exchange.said}</p>
            {exchange.discarded ? (
              <p className="text-xs text-muted">{t.chat.discarded}</p>
            ) : exchange.reply === null ? (
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

      <div className="mt-5 flex gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={t.chat.placeholder}
          className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-line-strong"
        />
        {busy ? (
          <Button tone="plain" onClick={stop}>
            {t.chat.stop}
          </Button>
        ) : (
          <Button tone="primary" onClick={send}>
            {t.chat.send}
          </Button>
        )}
      </div>
    </Page>
  );
};
