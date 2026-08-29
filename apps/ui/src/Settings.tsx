import { useState } from 'react';
import { api, type McpClient, type McpClientId, type McpConnections, toFailure } from './api.ts';
import { Button, Page } from './bits.tsx';
import { type Locale, type Strings, setLocale, useLocale } from './i18n.ts';
import { ModelCard } from './ModelCard.tsx';
import { type Choice, MODELS, setDefaultChoice, useDefaultChoice } from './models.ts';
import { ClaudeCodeSetup } from './Setup.tsx';
import { setTheme, type Theme, useTheme } from './theme.ts';
import { useAsync } from './useAsync.ts';

// Sections divided by a hairline rather than boxed into cards: a settings page
// is a list of decisions, and a border around each one makes eleven things look
// like eleven places instead of one.
const Section = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <section className="border-t border-glass-line pt-6 first:border-t-0 first:pt-0">
    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    {hint ? <p className="mt-1 max-w-prose text-xs text-muted">{hint}</p> : null}
    <div className="mt-4">{children}</div>
  </section>
);

const Choice = <T extends string>({
  options,
  value,
  onPick,
}: {
  options: { value: T; label: string; disabled?: boolean; hint?: string }[];
  value: T;
  onPick: (value: T) => void;
}) => (
  <div className="flex flex-wrap gap-2">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        disabled={option.disabled}
        onClick={() => onPick(option.value)}
        title={option.hint}
        className={`rounded-md border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
          option.value === value
            ? 'border-primary bg-accent-soft text-foreground'
            : 'border-glass-line text-muted hover:bg-surface-muted'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const AppRow = ({
  client,
  justConnected,
  busy,
  onConnect,
  t,
}: {
  client: McpClient;
  justConnected: boolean;
  busy: boolean;
  onConnect: (id: McpClientId) => void;
  t: Strings;
}) => {
  const { registration } = client;
  const detail = !client.installed
    ? t.connect.notInstalled
    : registration.kind === 'elsewhere'
      ? t.connect.elsewhere(registration.command)
      : registration.kind === 'current'
        ? t.connect.current
        : t.connect.absent;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-line py-3 last:border-b-0">
      <div className="min-w-0 space-y-0.5">
        <h3 className="text-sm text-foreground">{client.name}</h3>
        <p className="break-all text-[11px] text-muted">{detail}</p>
        {justConnected ? (
          <p className="text-[11px] text-primary">{t.connect.restart(client.name)}</p>
        ) : null}
      </div>
      {registration.kind === 'current' ? (
        <span className="text-xs text-muted">{t.connect.connected}</span>
      ) : (
        <Button
          tone={registration.kind === 'absent' ? 'primary' : 'plain'}
          disabled={busy || !client.installed}
          onClick={() => onConnect(client.id)}
        >
          {registration.kind === 'absent' ? t.connect.connect : t.connect.repoint}
        </Button>
      )}
    </div>
  );
};

export const SettingsScreen = ({
  gated = false,
  onSkip,
}: {
  gated?: boolean;
  onSkip?: () => void;
}) => {
  const { locale, t } = useLocale();
  const theme = useTheme();
  const fallback = useDefaultChoice();
  const { data, failure } = useAsync(() => api.mcp(), '');
  const [written, setWritten] = useState<McpConnections | null>(null);
  const [done, setDone] = useState<McpClientId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connections = written ?? data;

  const connect = (id: McpClientId) => {
    setBusy(true);
    setError(null);
    api
      .connectMcp(id)
      .then((next) => {
        setWritten(next);
        setDone((ids) => [...ids, id]);
      })
      .catch((cause: unknown) => setError(t.error(toFailure(cause))))
      .finally(() => setBusy(false));
  };

  if (connections === null) {
    return (
      <Page>
        <p className="py-16 text-sm text-muted">{failure ? t.error(failure) : t.common.loading}</p>
      </Page>
    );
  }

  // Claude Code is what the three steps are about. Listing it among the apps too
  // put the same one on screen twice saying two different things.
  const others = connections.clients.filter((client) => client.id !== 'claude-code');

  const setup = (
    <>
      <Section title={t.settings.searchModel} hint={t.settings.searchModelHint}>
        <ModelCard />
      </Section>
      <Section title={t.settings.claudeCode} hint={t.settings.claudeCodeHint}>
        <ClaudeCodeSetup connections={connections} onConnected={setWritten} />
      </Section>
      <Section title={t.settings.apps} hint={t.settings.appsHint}>
        {error !== null ? <p className="mb-3 text-xs text-danger">{error}</p> : null}
        <div>
          {others.map((client) => (
            <AppRow
              key={client.id}
              client={client}
              justConnected={done.includes(client.id)}
              busy={busy}
              onConnect={connect}
              t={t}
            />
          ))}
        </div>
        <p className="mt-4 break-all text-[11px] text-muted">
          {t.connect.serverPath} <span className="font-mono">{connections.serverPath}</span>
        </p>
      </Section>
    </>
  );

  const preferences = (
    <>
      <Section title={t.settings.appearance}>
        <Choice<Theme>
          value={theme}
          onPick={setTheme}
          options={[
            { value: 'light', label: t.settings.light },
            { value: 'dark', label: t.settings.dark },
          ]}
        />
      </Section>
      <Section title={t.settings.language}>
        <Choice<Locale>
          value={locale}
          onPick={setLocale}
          options={[
            { value: 'ko', label: '한국어' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Section>
      <Section title={t.settings.thinking} hint={t.settings.thinkingHint}>
        <Choice
          value={`${fallback.provider}:${fallback.model}`}
          onPick={(picked) => {
            const [provider, model = ''] = picked.split(':');
            setDefaultChoice({ provider: provider as Choice['provider'], model });
          }}
          options={MODELS.map((option) => ({
            value: `${option.provider}:${option.model}`,
            label: option.label,
          }))}
        />
        <p className="mt-2 text-[11px] text-muted">{t.settings.defaultOnly}</p>
      </Section>
    </>
  );

  return (
    <Page>
      <h1 className="text-lg font-semibold text-foreground">
        {gated ? t.firstRun.title : t.settings.screenTitle}
      </h1>
      <p className="mt-1 max-w-prose text-xs text-muted">
        {gated ? t.firstRun.lead : t.settings.intro}
      </p>
      {gated && onSkip ? (
        <button
          type="button"
          onClick={onSkip}
          className="mt-2 text-[11px] text-muted hover:underline"
        >
          {t.firstRun.skip}
        </button>
      ) : null}

      {/* Setup first while it is unfinished, preferences first once it is not:
          what someone opens this page for changes the day they stop setting up. */}
      <div className="mt-7 space-y-6">
        {gated ? setup : preferences}
        {gated ? preferences : setup}
      </div>
    </Page>
  );
};
