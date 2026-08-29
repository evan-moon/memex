import { useEffect, useState } from 'react';
import {
  api,
  type ClaudeCodeState,
  type LoginState,
  type McpConnections,
  toFailure,
} from './api.ts';
import { Button, Card } from './bits.tsx';
import { useT } from './i18n.ts';
import { useAsync } from './useAsync.ts';

const POLL_MS = 2000;

const Step = ({
  index,
  title,
  detail,
  done,
  children,
}: {
  index: number;
  title: string;
  detail: string;
  done: boolean;
  children?: React.ReactNode;
}) => (
  <div className="flex gap-3">
    <span
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
        done ? 'bg-primary text-background' : 'border border-line text-muted'
      }`}
    >
      {done ? '✓' : index}
    </span>
    <div className="min-w-0 flex-1 space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-[11px] text-muted">{detail}</p>
      {children}
    </div>
  </div>
);

export const ClaudeCodeSetup = ({
  connections,
  onConnected,
}: {
  connections: McpConnections | null;
  onConnected: (next: McpConnections) => void;
}) => {
  const t = useT();
  const [round, setRound] = useState(0);
  const { data, failure } = useAsync(() => api.claude(), String(round));
  const [live, setLive] = useState<ClaudeCodeState | null>(null);
  const [busy, setBusy] = useState<'install' | 'login' | 'register' | null>(null);
  const [login, setLogin] = useState<LoginState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = live ?? data;
  const pending = login?.kind === 'waiting' && state?.kind !== 'ready';

  // The browser tab is where the sign-in actually finishes, so the screen has
  // to keep asking rather than wait for a reply that never comes back to it.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      api
        .claude()
        .then((next) => {
          setLive(next);
          if (next.kind === 'ready') setLogin(null);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending]);

  if (state === null)
    return (
      <Card>
        <p className="text-xs text-muted">{failure ? t.error(failure) : t.common.loading}</p>
      </Card>
    );

  const run = (kind: 'install' | 'login' | 'register', work: Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    work
      .then(() => setRound((n) => n + 1))
      .catch((cause: unknown) => setError(t.error(toFailure(cause))))
      .finally(() => setBusy(null));
  };

  const installed = state.kind !== 'missing';
  const ready = state.kind === 'ready';
  const registered =
    connections?.clients.find((client) => client.id === 'claude-code')?.registration.kind ===
    'current';

  return (
    <Card className="space-y-5">
      <Step
        index={1}
        title={t.setup.installTitle}
        detail={installed ? t.setup.installDone : t.setup.installDetail}
        done={installed}
      >
        {!installed && (
          <div className="pt-1">
            <Button
              tone="primary"
              disabled={busy !== null}
              onClick={() => {
                setLive(null);
                run('install', api.installClaude());
              }}
            >
              {busy === 'install' ? t.setup.installing : t.setup.install}
            </Button>
            <p className="mt-1 text-[11px] text-muted">{t.setup.installSource}</p>
          </div>
        )}
      </Step>

      <Step
        index={2}
        title={t.setup.loginTitle}
        detail={
          ready
            ? t.setup.loginDone(state.plan ?? '—', state.method ?? '—')
            : pending
              ? t.setup.loginWaiting
              : t.setup.loginDetail
        }
        done={ready}
      >
        {installed && !ready && state.kind !== 'unreadable' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              tone="primary"
              disabled={busy !== null}
              onClick={() =>
                run(
                  'login',
                  api.loginClaude('claudeai').then(({ login: started, claude }) => {
                    setLogin(started);
                    setLive(claude);
                  }),
                )
              }
            >
              {t.setup.login}
            </Button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                run(
                  'login',
                  api.loginClaude('console').then(({ login: started, claude }) => {
                    setLogin(started);
                    setLive(claude);
                  }),
                )
              }
              className="text-[11px] text-muted hover:underline disabled:opacity-50"
            >
              {t.setup.useConsole}
            </button>
          </div>
        )}
        {state.kind === 'unreadable' && (
          <p className="pt-1 text-[11px] text-danger">{t.setup.unreadable}</p>
        )}
        {login?.kind === 'waiting' && login.url !== null && (
          <a
            href={login.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[11px] text-primary hover:underline"
          >
            {t.setup.openAgain}
          </a>
        )}
      </Step>

      <Step
        index={3}
        title={t.setup.registerTitle}
        detail={registered ? t.setup.registerDone : t.setup.registerDetail}
        done={registered}
      >
        {ready && !registered && (
          <div className="pt-1">
            <Button
              tone="primary"
              disabled={busy !== null}
              onClick={() => run('register', api.connectMcp('claude-code').then(onConnected))}
            >
              {t.setup.register}
            </Button>
          </div>
        )}
      </Step>

      {error !== null && <p className="text-xs text-danger">{error}</p>}
    </Card>
  );
};
