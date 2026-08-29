import { useState } from 'react';
import { api, type McpClient, type McpClientId, type McpConnections, toFailure } from './api.ts';
import { Button, Card, Page } from './bits.tsx';
import { useT } from './i18n.ts';
import { ClaudeCodeSetup } from './Setup.tsx';
import { useAsync } from './useAsync.ts';

const Detail = ({ client }: { client: McpClient }) => {
  const t = useT();
  if (!client.installed) return <p className="text-[11px] text-muted">{t.connect.notInstalled}</p>;
  if (client.registration.kind === 'elsewhere')
    return (
      <p className="break-all text-[11px] text-muted">
        {t.connect.elsewhere(client.registration.command)}
      </p>
    );
  return (
    <p className="text-[11px] text-muted">
      {client.registration.kind === 'current' ? t.connect.current : t.connect.absent}
    </p>
  );
};

const Row = ({
  client,
  justConnected,
  busy,
  onConnect,
}: {
  client: McpClient;
  justConnected: boolean;
  busy: boolean;
  onConnect: (id: McpClientId) => void;
}) => {
  const t = useT();
  const { registration } = client;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{client.name}</h3>
        <Detail client={client} />
        {justConnected && (
          <p className="text-[11px] text-primary">{t.connect.restart(client.name)}</p>
        )}
      </div>
      {registration.kind === 'current' ? (
        <span className="text-xs text-muted">{t.connect.connected}</span>
      ) : (
        <Button
          tone={registration.kind === 'absent' ? 'primary' : 'plain'}
          disabled={busy}
          onClick={() => onConnect(client.id)}
        >
          {registration.kind === 'absent' ? t.connect.connect : t.connect.repoint}
        </Button>
      )}
    </Card>
  );
};

export const ConnectScreen = () => {
  const t = useT();
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

  if (connections === null)
    return (
      <Page>
        <p className="py-16 text-sm text-muted">{failure ? t.error(failure) : t.common.loading}</p>
      </Page>
    );

  // Claude Code is what the three steps above are about. Listing it here too
  // put the same app on screen twice saying two different things, and offered
  // to write a config for something that was not installed yet.
  const others = connections.clients.filter((client) => client.id !== 'claude-code');
  const here = others.filter((client) => client.installed);
  const elsewhere = others.filter((client) => !client.installed);

  return (
    <Page>
      <h1 className="text-lg font-semibold text-foreground">{t.connect.screenTitle}</h1>
      <p className="mt-1 text-xs text-muted">{t.connect.intro}</p>

      <div className="mt-5">
        <ClaudeCodeSetup connections={connections} onConnected={setWritten} />
      </div>

      <h2 className="mt-8 text-sm font-semibold text-foreground">{t.connect.appsTitle}</h2>

      {error !== null && <p className="mt-3 text-xs text-danger">{error}</p>}

      {here.length === 0 ? (
        <p className="mt-5 text-xs text-muted">{t.connect.none}</p>
      ) : (
        <div className="mt-5 space-y-3">
          {here.map((client) => (
            <Row
              key={client.id}
              client={client}
              justConnected={done.includes(client.id)}
              busy={busy}
              onConnect={connect}
            />
          ))}
        </div>
      )}

      {elsewhere.length > 0 && (
        <div className="mt-6 space-y-3 opacity-60">
          {elsewhere.map((client) => (
            <Row
              key={client.id}
              client={client}
              justConnected={false}
              busy={busy}
              onConnect={connect}
            />
          ))}
        </div>
      )}

      <p className="mt-8 break-all text-[11px] text-muted">
        {t.connect.serverPath} <span className="font-mono">{connections.serverPath}</span>
      </p>
    </Page>
  );
};
