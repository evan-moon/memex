import {
  type AssistantState,
  assistantSpecs,
  isAssistantId,
  type LoginMethod,
} from '../assistants/index.ts';
import {
  type McpClientId,
  type McpRegistration,
  readMcpConnections,
} from '../mcp-clients/index.ts';

// One row per app the reader might talk to, carrying everything true of it.
// Installing, signing in and registering used to be split across two screens
// because memex can do all three for a CLI and only the last for a GUI app —
// but that is a difference in what memex can offer, not in what the app is, and
// splitting the list on it put the same sentence in two places.
export type AppRow = {
  id: McpClientId;
  name: string;
  installed: boolean;
  // How memex can help. Empty means it can only write the config file, and the
  // reader installs and signs the app in themselves.
  methods: LoginMethod[];
  // What the CLI itself reports, where there is a CLI to ask.
  cli: AssistantState | null;
  registration: McpRegistration;
};

export type AppsScreen = { serverPath: string; apps: AppRow[] };

export const readApps = async (
  home: string,
  serverPath: string,
  pathEnv: string,
): Promise<AppsScreen> => {
  const connections = readMcpConnections(home, serverPath);
  const apps = await Promise.all(
    connections.clients.map(async (client): Promise<AppRow> => {
      if (!isAssistantId(client.id)) {
        return {
          id: client.id,
          name: client.name,
          installed: client.installed,
          methods: [],
          cli: null,
          registration: client.registration,
        };
      }
      const spec = assistantSpecs[client.id];
      const cli = await spec.read(home, pathEnv);
      return {
        id: client.id,
        name: client.name,
        // A config directory can outlive the CLI that made it, so what the CLI
        // itself answers wins over the marker file.
        installed: cli.kind !== 'missing',
        methods: Object.keys(spec.loginArgs) as LoginMethod[],
        cli,
        registration: client.registration,
      };
    }),
  );
  return { serverPath: connections.serverPath, apps };
};
