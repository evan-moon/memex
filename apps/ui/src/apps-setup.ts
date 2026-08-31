import { useEffect, useState } from 'react';
import {
  type AppRow,
  type AppsScreen,
  api,
  type LoginMethod,
  type LoginState,
  type McpClientId,
  toFailure,
} from './api.ts';
import { useT } from './i18n.ts';
import { useAsync } from './useAsync.ts';

const POLL_MS = 2000;

// Two directions, two questions. memex reaching a CLI is what makes the chat in
// this app work; an app reaching memex is what makes anything get written down.
// They fail differently, so a screen that answers one must not look like it is
// answering the other.
export type EngineStage = 'install' | 'login' | 'ready' | 'unreadable';

export const engineStageOf = (app: AppRow): EngineStage => {
  // No CLI behind the name means nothing to install or sign in — the app is as
  // ready as it will ever be for this purpose, which is not at all.
  if (app.cli === null) return 'ready';
  if (app.cli.kind === 'unreadable') return 'unreadable';
  if (app.cli.kind === 'missing') return 'install';
  return app.cli.kind === 'ready' ? 'ready' : 'login';
};

export type LinkStage = 'absent' | 'connect' | 'repoint' | 'linked';

export const linkStageOf = (app: AppRow): LinkStage => {
  if (!app.installed) return 'absent';
  if (app.registration.kind === 'current') return 'linked';
  return app.registration.kind === 'elsewhere' ? 'repoint' : 'connect';
};

// Onboarding walks the whole way in one list, so it asks both in order: there is
// no point offering to register an app that is not signed in yet.
export type Stage = EngineStage | LinkStage;

export const stageOf = (app: AppRow): Stage => {
  const engine = engineStageOf(app);
  return engine === 'ready' ? linkStageOf(app) : engine;
};

export const connectedIds = (screen: AppsScreen | null): McpClientId[] =>
  (screen?.apps ?? []).filter((app) => linkStageOf(app) === 'linked').map((app) => app.id);

// Only the apps memex can install and sign in have anything to say about who
// does the thinking.
export const engineApps = (screen: AppsScreen | null): AppRow[] =>
  (screen?.apps ?? []).filter((app) => app.methods.length > 0);

// Which of them memex can actually put a question to. An app with no CLI comes
// back 'ready' from engineStageOf because there is nothing to sign in, so it has
// to be kept out of this by the same filter.
export const thinkingIds = (screen: AppsScreen | null): McpClientId[] =>
  engineApps(screen)
    .filter((app) => engineStageOf(app) === 'ready')
    .map((app) => app.id);

// Apps already on this machine that memex could write into but has not been
// pointed at yet. Offering these is worth a moment; offering an app nobody has
// installed is a list of homework.
export const offerable = (screen: AppsScreen | null): AppRow[] =>
  (screen?.apps ?? []).filter((app) => app.methods.length === 0 && linkStageOf(app) === 'connect');

export type Busy = { id: McpClientId; kind: 'install' | 'login' | 'connect' };

export const useApps = () => {
  const t = useT();
  const [round, setRound] = useState(0);
  const { data, failure } = useAsync(() => api.apps(), String(round));
  const [live, setLive] = useState<AppsScreen | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [login, setLogin] = useState<{ id: McpClientId; state: LoginState } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Signing an assistant in is already the decision to let it reach memex, so
  // asking again would be confirming the same intent twice. Only what memex set
  // up itself is registered this way, and only when nothing is there yet — an
  // app pointed at some other memex is someone's existing setup, not a blank.
  const [autoLink, setAutoLink] = useState<McpClientId | null>(null);

  const screen = live ?? data;
  const pendingId = login?.state.kind === 'waiting' ? login.id : null;
  const pending =
    pendingId !== null && screen?.apps.find((app) => app.id === pendingId)?.cli?.kind !== 'ready';

  // The browser tab is where the sign-in actually finishes, so this has to keep
  // asking rather than wait for a reply that never comes back to it.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      api
        .apps()
        .then((next) => {
          setLive(next);
          if (next.apps.find((app) => app.id === pendingId)?.cli?.kind === 'ready') setLogin(null);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, pendingId]);

  useEffect(() => {
    if (autoLink === null || screen === null) return;
    const app = screen.apps.find((one) => one.id === autoLink);
    if (app === undefined || engineStageOf(app) !== 'ready') return;
    setAutoLink(null);
    if (linkStageOf(app) !== 'connect') return;
    api
      .connectApp(autoLink)
      .then(setLive)
      .catch(() => {});
  }, [autoLink, screen]);

  const run = (at: Busy, work: Promise<AppsScreen>) => {
    setBusy(at);
    setError(null);
    work
      .then(setLive)
      .catch((cause: unknown) => setError(t.error(toFailure(cause))))
      .finally(() => setBusy(null));
  };

  return {
    screen,
    failure,
    busy,
    login,
    error,
    pendingId: pending ? pendingId : null,
    refresh: () => setRound((n) => n + 1),
    install: (id: McpClientId) => {
      setAutoLink(id);
      run({ id, kind: 'install' }, api.installApp(id));
    },
    connect: (id: McpClientId) => run({ id, kind: 'connect' }, api.connectApp(id)),
    signIn: (id: McpClientId, method: LoginMethod) => {
      setAutoLink(id);
      return run(
        { id, kind: 'login' },
        api.loginApp(id, method).then(({ login: started, apps }) => {
          setLogin({ id, state: started });
          return apps;
        }),
      );
    },
  };
};
