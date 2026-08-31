import { Check } from 'lucide-react';
import type { AppRow } from './api.ts';
import {
  type EngineStage,
  engineApps,
  engineStageOf,
  type LinkStage,
  linkStageOf,
  type Stage,
  stageOf,
  type useApps,
} from './apps-setup.ts';
import { useT } from './i18n.ts';

type Setup = ReturnType<typeof useApps>;

const Pill = ({
  children,
  onClick,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
}) => {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="no-drag shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-medium text-background transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
    >
      {busy ? t.engines.working : children}
    </button>
  );
};

// A row says what is still in the way. Once nothing is, the tick is the whole
// message — a line repeating it under every finished app was four sentences
// saying what four ticks already said.
const Row = ({
  app,
  done,
  detail,
  action,
  children,
}: {
  app: AppRow;
  done: boolean;
  detail: string | null;
  action: React.ReactNode;
  children?: React.ReactNode;
}) => (
  <div className="flex items-center gap-4 border-b border-glass-line py-4 last:border-b-0">
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
        done ? 'bg-primary text-background' : 'border border-line text-muted'
      }`}
    >
      {done ? <Check size={13} /> : null}
    </span>
    <div className="min-w-0 flex-1">
      <h3 className="text-sm text-foreground">{app.name}</h3>
      {detail === null ? null : <p className="mt-0.5 break-all text-[11px] text-muted">{detail}</p>}
      {children}
    </div>
    {action}
  </div>
);

const Waiting = ({ setup, app }: { setup: Setup; app: AppRow }) => {
  const t = useT();
  const login = setup.login;
  if (setup.pendingId !== app.id || login?.state.kind !== 'waiting' || login.state.url === null) {
    return null;
  }
  return (
    <a
      href={login.state.url}
      target="_blank"
      rel="noreferrer"
      className="no-drag mt-1 inline-block text-[11px] text-primary hover:underline"
    >
      {t.engines.openAgain}
    </a>
  );
};

// What memex can reach to do the thinking. Nothing here mentions MCP: an app
// that is signed in but unregistered is perfectly good at answering, and saying
// otherwise here would send someone to fix the wrong thing.
const EngineRow = ({ app, setup }: { app: AppRow; setup: Setup }) => {
  const t = useT();
  const copy = t.engines;
  const stage = engineStageOf(app);
  const at = setup.busy?.id === app.id ? setup.busy.kind : null;
  const waiting = setup.pendingId === app.id;

  const detail: Record<EngineStage, string | null> = {
    install: copy.absent,
    login: waiting ? copy.waiting : copy.installed,
    ready: null,
    unreadable: copy.unreadable,
  };

  const action =
    stage === 'install' ? (
      <Pill busy={at === 'install'} onClick={() => setup.install(app.id)}>
        {copy.install}
      </Pill>
    ) : stage === 'login' ? (
      <Pill busy={at === 'login'} onClick={() => setup.signIn(app.id, 'subscription')}>
        {copy.signIn}
      </Pill>
    ) : null;

  return (
    <Row app={app} done={stage === 'ready'} detail={detail[stage]} action={action}>
      <Waiting setup={setup} app={app} />
      {/* Only Claude Code has a second way in. Codex's other path reads an API
          key from stdin, which is a credential memex would have to carry. */}
      {stage === 'login' && !waiting && app.methods.includes('metered') ? (
        <button
          type="button"
          onClick={() => setup.signIn(app.id, 'metered')}
          className="no-drag mt-1 block text-[11px] text-muted hover:underline"
        >
          {copy.useMetered}
        </button>
      ) : null}
    </Row>
  );
};

// The other direction: what a conversation held elsewhere can write into memex.
// Installing and signing in belong to the section above, so a row here never
// offers them — an app nobody has installed simply says so.
const LinkRow = ({ app, setup }: { app: AppRow; setup: Setup }) => {
  const t = useT();
  const copy = t.links;
  const stage = linkStageOf(app);
  const busy = setup.busy?.id === app.id && setup.busy.kind === 'connect';

  const detail: Record<LinkStage, string | null> = {
    absent: copy.absent,
    connect: copy.ready,
    repoint: copy.elsewhere(app.registration.kind === 'elsewhere' ? app.registration.command : '—'),
    linked: null,
  };

  const action =
    stage === 'connect' || stage === 'repoint' ? (
      <Pill busy={busy} onClick={() => setup.connect(app.id)}>
        {stage === 'repoint' ? copy.repoint : copy.connect}
      </Pill>
    ) : null;

  return <Row app={app} done={stage === 'linked'} detail={detail[stage]} action={action} />;
};

// Onboarding walks one list all the way, so a row there carries both directions
// in order and hands over whichever is next.
const WholeRow = ({ app, setup }: { app: AppRow; setup: Setup }) => {
  const stage = stageOf(app);
  const engine: Stage[] = ['install', 'login', 'unreadable'];
  return engine.includes(stage) && app.methods.length > 0 ? (
    <EngineRow app={app} setup={setup} />
  ) : (
    <LinkRow app={app} setup={setup} />
  );
};

const List = ({
  setup,
  apps,
  render,
}: {
  setup: Setup;
  apps: AppRow[];
  render: (app: AppRow) => React.ReactNode;
}) => {
  const t = useT();
  if (setup.screen === null) {
    return (
      <p className="text-xs text-muted">
        {setup.failure ? t.error(setup.failure) : t.common.loading}
      </p>
    );
  }
  return (
    <div>
      {apps.map((app) => (
        <div key={app.id}>{render(app)}</div>
      ))}
      {setup.error !== null && <p className="pt-3 text-xs text-danger">{setup.error}</p>}
    </div>
  );
};

export const EngineRows = ({ setup }: { setup: Setup }) => (
  <List
    setup={setup}
    apps={engineApps(setup.screen)}
    render={(app) => <EngineRow app={app} setup={setup} />}
  />
);

export const LinkRows = ({ setup }: { setup: Setup }) => (
  <List
    setup={setup}
    apps={setup.screen?.apps ?? []}
    render={(app) => <LinkRow app={app} setup={setup} />}
  />
);

// Only the apps already on this machine, and only while they are unconnected.
// Nothing to offer means no block at all — the shortest setup is the one that
// does not ask.
export const OfferRows = ({ setup, apps }: { setup: Setup; apps: AppRow[] }) => (
  <List setup={setup} apps={apps} render={(app) => <LinkRow app={app} setup={setup} />} />
);

export const AppRows = ({ setup }: { setup: Setup }) => (
  <List
    setup={setup}
    apps={setup.screen?.apps ?? []}
    render={(app) => <WholeRow app={app} setup={setup} />}
  />
);
