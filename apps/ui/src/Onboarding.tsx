import { Folder } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EngineRows, OfferRows } from './Apps.tsx';
import { api, type ModelState, type OnboardingState, toFailure } from './api.ts';
import { offerable, thinkingIds, useApps } from './apps-setup.ts';
import { useT } from './i18n.ts';
import { currentStep, type Progress, STEPS, type Step } from './onboarding.ts';

const MODEL_POLL_MS = 1000;

const Ground = () => (
  <div className="onboard-ground" aria-hidden="true">
    <span className="onboard-blob onboard-blob-a" />
    <span className="onboard-blob onboard-blob-b" />
    <span className="onboard-blob onboard-blob-c" />
    <span className="onboard-scrim" />
  </div>
);

const Action = ({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="no-drag rounded-full bg-primary px-6 py-3 text-sm font-medium text-background transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
  >
    {children}
  </button>
);

const _Quiet = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="no-drag text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
  >
    {children}
  </button>
);

// Every screen is the same shape — a label, one sentence, one paragraph, one
// thing to do — so what changes between them is only ever the words. The rise
// is staggered down the column so the eye lands on the sentence first.
const Screen = ({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: React.ReactNode;
  children?: React.ReactNode;
}) => (
  <div className="w-full max-w-[34rem]">
    <p className="onboard-eyebrow onboard-rise">{eyebrow}</p>
    <h1
      className="onboard-display onboard-rise mt-3 text-foreground"
      style={{ animationDelay: '70ms' }}
    >
      {title}
    </h1>
    <p
      className="onboard-rise onboard-lead mt-5 max-w-[46ch] text-[15px] leading-[1.65] text-muted"
      style={{ animationDelay: '140ms' }}
    >
      {lead}
    </p>
    {children ? (
      <div className="onboard-rise mt-9" style={{ animationDelay: '210ms' }}>
        {children}
      </div>
    ) : null}
  </div>
);

// How far along, not what is already true of the machine. A step whose probe
// happens to be satisfied — the weights were cached before any of this started —
// is still ahead of the reader, and colouring it says they have been somewhere
// they have not.
const Ticks = ({ at }: { at: Step | null }) => {
  const here = at === null ? STEPS.length : STEPS.indexOf(at);
  return (
    <div className="mx-auto flex w-full max-w-[34rem] gap-1.5">
      {STEPS.map((step, index) => (
        <span
          key={step}
          className={`onboard-tick ${index <= here ? 'onboard-tick-done' : ''}`}
          style={{ flexGrow: step === at ? 2.2 : 1 }}
        />
      ))}
    </div>
  );
};

const VaultScreen = ({
  state,
  onChosen,
}: {
  state: OnboardingState;
  onChosen: (next: OnboardingState) => void;
}) => {
  const t = useT();
  const [path, setPath] = useState(state.vaultPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const untouched = path === state.vaultPath;

  const fail = (cause: unknown) => setError(t.error(toFailure(cause)));

  const pick = () => {
    setBusy(true);
    setError(null);
    api
      .pickFolder()
      .then((picked) => {
        if (picked.path !== null) setPath(picked.path);
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  return (
    <Screen
      eyebrow={t.onboarding.vault.eyebrow}
      title={t.onboarding.vault.title}
      lead={t.onboarding.vault.lead}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <span className="onboard-eyebrow">{t.onboarding.vault.label}</span>
          {/* The folder is a thing on this machine, so the machine picks it. A
              text field here would ask someone who has never opened a terminal
              to know what a path looks like — the fallback is only for a host
              with no chooser to open. */}
          {state.canPickFolder ? (
            <button
              type="button"
              disabled={busy}
              onClick={pick}
              className="no-drag flex w-full items-center gap-3 rounded-xl border border-glass-line bg-surface px-4 py-3 text-left backdrop-blur transition hover:border-line-strong disabled:opacity-50"
            >
              <Folder size={15} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
                {path}
              </span>
              <span className="shrink-0 text-[11px] text-muted">{t.onboarding.vault.pick}</span>
            </button>
          ) : (
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              spellCheck={false}
              className="no-drag w-full rounded-xl border border-glass-line bg-surface px-4 py-3 font-mono text-[13px] text-foreground backdrop-blur transition focus:border-primary focus:outline-none"
            />
          )}
          <p className="text-xs text-muted">
            {untouched && state.vaultExists
              ? t.onboarding.vault.exists
              : t.onboarding.vault.willCreate}
          </p>
        </div>
        <Action
          disabled={busy || path.trim() === ''}
          onClick={() => {
            setBusy(true);
            setError(null);
            api
              .chooseVault(path.trim())
              .then(onChosen)
              .catch(fail)
              .finally(() => setBusy(false));
          }}
        >
          {t.onboarding.vault.use}
        </Action>
        {error !== null && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Screen>
  );
};

const EngineStep = ({ setup }: { setup: ReturnType<typeof useApps> }) => {
  const t = useT();
  return (
    <Screen
      eyebrow={t.onboarding.engine.eyebrow}
      title={t.onboarding.engine.title}
      lead={t.onboarding.engine.lead}
    >
      <EngineRows setup={setup} />
    </Screen>
  );
};

const Bar = ({ loaded, total }: { loaded: number; total: number }) => (
  <div className="h-1 w-full max-w-sm overflow-hidden rounded-full bg-surface-muted">
    <div
      className="h-full rounded-full bg-primary transition-[width] duration-500"
      style={{ width: `${total === 0 ? 4 : Math.min(100, (loaded / total) * 100)}%` }}
    />
  </div>
);

const ModelScreen = ({ state, onRestart }: { state: ModelState | null; onRestart: () => void }) => {
  const t = useT();
  const copy = t.onboarding.model;

  return (
    <Screen eyebrow={copy.eyebrow} title={copy.title} lead={copy.lead}>
      {state?.kind === 'downloading' ? (
        <div className="space-y-3">
          <Bar loaded={state.loaded} total={state.total} />
          <p className="text-xs text-muted">
            {state.total === 0
              ? copy.starting
              : copy.progress(
                  Math.round(state.loaded / 1_000_000),
                  Math.round(state.total / 1_000_000),
                )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {state?.kind === 'failed' ? <p className="text-xs text-danger">{state.error}</p> : null}
          <Action onClick={onRestart}>{state?.kind === 'failed' ? copy.retry : copy.action}</Action>
        </div>
      )}
    </Screen>
  );
};

const Unreachable = ({ onRetry }: { onRetry: () => void }) => {
  const t = useT();
  return (
    <Screen
      eyebrow={t.onboarding.vault.eyebrow}
      title={t.onboarding.vault.title}
      lead={t.onboarding.unreachable}
    >
      <Action onClick={onRetry}>{t.onboarding.retry}</Action>
    </Screen>
  );
};

export const Onboarding = ({
  state,
  onRetry,
  onDone,
}: {
  state: OnboardingState | null;
  onRetry: () => void;
  onDone: () => void;
}) => {
  const t = useT();
  const [acked, setAcked] = useState<Step[]>([]);
  const [chosen, setChosen] = useState<OnboardingState | null>(null);
  const [model, setModel] = useState<ModelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setup = useApps();

  // The 282MB download is the one step that costs real time, so it runs while
  // the rest is being read and clicked rather than after. `start` is idempotent
  // and answers straight away when the weights are already here.
  const startDownload = () => {
    api
      .downloadModel()
      .then(setModel)
      .catch(() => {});
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only — startDownload is rebuilt every render, and listing it would restart the download on each one
  useEffect(() => {
    startDownload();
  }, []);

  const modelReady = model?.kind === 'ready';
  useEffect(() => {
    if (modelReady) return;
    const timer = setInterval(() => {
      api
        .model()
        .then(setModel)
        .catch(() => {});
    }, MODEL_POLL_MS);
    return () => clearInterval(timer);
  }, [modelReady]);

  const vault = chosen ?? state;
  const progress: Progress = {
    acked,
    thinking: thinkingIds(setup.screen),
    modelReady,
  };
  const at = currentStep(progress);
  const offers = offerable(setup.screen);

  const ack = (step: Step) =>
    setAcked((steps) => (steps.includes(step) ? steps : [...steps, step]));

  const screenFor = (step: Step) => {
    if (step === 'intro')
      return (
        <Screen
          eyebrow={t.onboarding.intro.eyebrow}
          title={t.onboarding.intro.title}
          lead={t.onboarding.intro.lead}
        >
          <Action onClick={() => ack('intro')}>{t.onboarding.intro.ack}</Action>
        </Screen>
      );
    if (step === 'vault')
      return vault === null ? (
        <Unreachable onRetry={onRetry} />
      ) : (
        <VaultScreen
          state={vault}
          onChosen={(next) => {
            setChosen(next);
            ack('vault');
          }}
        />
      );
    if (step === 'engine') return <EngineStep setup={setup} />;
    return <ModelScreen state={model} onRestart={startDownload} />;
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Ground />
      <div className="drag relative h-10 shrink-0" />
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8">
        {/* Keyed on the step so the whole column remounts and the rise plays
            again: the screen changing is the only transition there is. */}
        <div key={at ?? 'done'} className="flex w-full justify-center py-10">
          {at === null ? (
            <Screen
              eyebrow={t.onboarding.done.eyebrow}
              title={t.onboarding.done.title}
              lead={t.onboarding.done.lead}
            >
              <div className="space-y-6">
                {/* Shown only when there is something on this machine to offer.
                    memex already registered whatever it signed in itself, so
                    this is the rest — and an empty rest is no question. */}
                {offers.length === 0 ? null : (
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      {t.onboarding.done.linkTitle(offers.map((app) => app.name).join(', '))}
                    </h2>
                    <p className="max-w-[46ch] text-xs text-muted">{t.onboarding.done.linkLead}</p>
                    <OfferRows setup={setup} apps={offers} />
                  </div>
                )}
                <div className="space-y-3">
                  <Action
                    onClick={() => {
                      setError(null);
                      api
                        .finishOnboarding()
                        .then(onDone)
                        .catch((cause: unknown) => setError(t.error(toFailure(cause))));
                    }}
                  >
                    {t.onboarding.finish}
                  </Action>
                  {error !== null && <p className="text-xs text-danger">{error}</p>}
                </div>
              </div>
            </Screen>
          ) : (
            screenFor(at)
          )}
        </div>
      </div>
      <div className="relative shrink-0 px-8 pb-8">
        <Ticks at={at} />
      </div>
    </div>
  );
};
