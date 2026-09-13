import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EngineRows, LinkRows } from './Apps.tsx';
import { api, type ModelJob, type SourceFolder } from './api.ts';
import { useApps } from './apps-setup.ts';
import { Page, Section } from './bits.tsx';
import { type Locale, type Strings, setLocale, useLocale, useT } from './i18n.ts';
import { ModelCard } from './ModelCard.tsx';
import { ModelSelect } from './ModelSelect.tsx';
import { assignModel, type Choice, useCatalog } from './models.ts';
import { SETTINGS_GROUPS } from './settings-groups.ts';
import { setTheme, type Theme, useTheme } from './theme.ts';

const Options = <T extends string>({
  options,
  value,
  onPick,
}: {
  options: { value: T; label: string }[];
  value: T;
  onPick: (value: T) => unknown;
}) => (
  <div className="flex flex-wrap gap-2">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onPick(option.value)}
        className={`rounded-md border px-3 py-1.5 text-xs ${option.value === value ? 'border-primary bg-accent-soft text-foreground' : 'border-glass-line text-muted hover:bg-surface-muted'}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const MODEL_JOBS: ModelJob[] = ['chat', 'draft', 'sweep'];

const JobRow = ({ job, choice, t }: { job: ModelJob; choice: Choice; t: Strings }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <div className="text-xs font-medium text-foreground">{t.settings.jobs[job].name}</div>
      <p className="mt-0.5 text-[11px] text-muted">{t.settings.jobs[job].what}</p>
    </div>
    <ModelSelect
      choice={choice}
      onPick={(next) => assignModel(job, next)}
      label={t.settings.jobs[job].name}
      className="shrink-0 rounded-md border border-glass-line bg-transparent px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted"
    />
  </div>
);

type FolderAction = 'add' | 'mark' | 'remove' | 'reindex';

const SourceRows = () => {
  const t = useT();
  const [rows, setRows] = useState<SourceFolder[] | null>(null);
  const [busy, setBusy] = useState<{ path: string; action: FolderAction } | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .sources()
      .then(setRows)
      .catch(() => {
        setRows([]);
        setError(t.settings.sourceFailed);
      });
  }, [t]);

  const run = async (path: string, action: FolderAction, work: () => Promise<SourceFolder[]>) => {
    setBusy({ path, action });
    setError(null);
    try {
      setRows(await work());
    } catch {
      setError(t.settings.sourceFailed);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (row: SourceFolder) => {
    if (!window.confirm(t.settings.disconnectHint)) return;
    await run(row.path, 'remove', async () => (await api.disconnectSource(row.path)).rows);
  };

  const reindex = async (row: SourceFolder) => {
    setBusy({ path: row.path, action: 'reindex' });
    setError(null);
    try {
      const result = await api.reindexSource(row.path);
      const changed = result.added + result.updated + result.removed + result.reindexed;
      setStatus({ ...status, [row.path]: t.settings.indexDone(changed, result.skipped) });
    } catch {
      setError(t.settings.sourceFailed);
    } finally {
      setBusy(null);
    }
  };

  if (rows === null) return <p className="text-xs text-muted">{t.common.loading}</p>;

  return (
    <div>
      <ul className="space-y-2">
        {rows.map((row) => {
          const working = busy?.path === row.path;
          return (
            <li key={row.path} className="rounded-lg border border-glass-line bg-surface px-4 py-3">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground">
                    {row.role === 'primary' ? t.settings.primaryVault : t.settings.connectedVault}
                  </div>
                  <div className="mt-1 break-all font-mono text-[11px] text-muted">{row.path}</div>
                  {status[row.path] ? (
                    <div className="mt-2 text-[11px] text-positive" role="status">
                      {status[row.path]}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {row.role === 'source' ? (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() =>
                        run(row.path, 'mark', () => api.markSource(row.path, !row.reference))
                      }
                      className={`rounded-md px-2.5 py-1.5 text-[11px] ${row.reference ? 'bg-accent-soft text-foreground' : 'text-muted hover:bg-surface-muted'}`}
                    >
                      {t.settings.notMyWriting}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => reindex(row)}
                    className="rounded-md border border-glass-line px-2.5 py-1.5 text-[11px] text-foreground hover:bg-surface-muted disabled:opacity-50"
                  >
                    {working && busy.action === 'reindex'
                      ? t.settings.reindexing
                      : t.settings.reindex}
                  </button>
                  {row.role === 'source' ? (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => disconnect(row)}
                      title={t.settings.disconnectHint}
                      className="rounded-md px-2.5 py-1.5 text-[11px] text-negative hover:bg-surface-muted disabled:opacity-50"
                    >
                      {t.settings.disconnectVault}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="mt-3 text-xs text-negative" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('', 'add', api.pickSource)}
        className="mt-3 rounded-md bg-foreground px-3 py-2 text-xs text-background disabled:opacity-50"
      >
        {t.settings.addVault}
      </button>
    </div>
  );
};

const SettingsGroup = ({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="scroll-mt-8 border-t border-line pt-6 first:border-0 first:pt-0">
    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    <p className="mt-1 text-xs text-muted">{hint}</p>
    <div className="mt-5 space-y-6">{children}</div>
  </section>
);

export const SettingsScreen = () => {
  const { locale, t } = useLocale();
  const theme = useTheme();
  const catalog = useCatalog();
  const apps = useApps();

  return (
    <Page>
      <h1 className="text-xl font-semibold text-foreground">{t.settings.screenTitle}</h1>
      <p className="mt-1 max-w-prose text-xs text-muted">{t.settings.intro}</p>
      <div className="mt-7 grid gap-8 md:grid-cols-[11rem_minmax(0,1fr)]">
        <nav
          className="space-y-1 md:sticky md:top-6 md:self-start"
          aria-label={t.settings.screenTitle}
        >
          {SETTINGS_GROUPS.map((group) => (
            <a
              key={group.id}
              href={`#${group.id}`}
              className="block rounded-md px-2 py-1.5 text-xs text-muted hover:bg-surface-muted hover:text-foreground"
            >
              {t.settings.groups[group.id].title}
            </a>
          ))}
        </nav>
        <div className="min-w-0 space-y-9">
          <SettingsGroup id="appearance" {...t.settings.groups.appearance}>
            <Section title={t.settings.appearance} hint={t.settings.appearanceHint}>
              <Options<Theme>
                value={theme}
                onPick={setTheme}
                options={[
                  { value: 'system', label: t.settings.system },
                  { value: 'light', label: t.settings.light },
                  { value: 'dark', label: t.settings.dark },
                ]}
              />
            </Section>
            <Section divided title={t.settings.language}>
              <Options<Locale>
                value={locale}
                onPick={setLocale}
                options={[
                  { value: 'ko', label: '한국어' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Section>
          </SettingsGroup>
          <SettingsGroup id="notes" {...t.settings.groups.notes}>
            <Section title={t.settings.sources} hint={t.settings.sourcesHint}>
              <SourceRows />
            </Section>
            <Section divided title={t.settings.searchModel} hint={t.settings.searchModelHint}>
              <ModelCard />
            </Section>
          </SettingsGroup>
          <SettingsGroup id="ai" {...t.settings.groups.ai}>
            <Section title={t.settings.thinkingApps} hint={t.settings.thinkingAppsHint}>
              <EngineRows setup={apps} />
            </Section>
            <Section divided title={t.settings.models}>
              <div className="space-y-4">
                {MODEL_JOBS.map((job) => (
                  <JobRow key={job} job={job} choice={catalog.jobs[job]} t={t} />
                ))}
                <p className="text-[11px] text-muted">{t.settings.defaultOnly}</p>
              </div>
            </Section>
          </SettingsGroup>
          <SettingsGroup id="connections" {...t.settings.groups.connections}>
            <Section title={t.settings.apps} hint={t.settings.appsHint}>
              <LinkRows setup={apps} />
            </Section>
          </SettingsGroup>
          <SettingsGroup id="data" {...t.settings.groups.data}>
            <Section title={t.settings.vault} hint={t.settings.vaultHint}>
              <ul className="grid gap-1 sm:grid-cols-2">
                {[
                  { to: '/rules', label: t.rules.screenTitle },
                  { to: '/register', label: t.register.screenTitle },
                  { to: '/threads', label: t.threads.title },
                  { to: '/today', label: t.today.screenTitle },
                  { to: '/tags', label: t.tags.screenTitle },
                  { to: '/repair/evidence', label: t.repair.title },
                ].map((row) => (
                  <li key={row.to}>
                    <Link
                      to={row.to}
                      className="block rounded-md px-2 py-2 text-xs text-primary hover:bg-surface-muted"
                    >
                      {row.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          </SettingsGroup>
        </div>
      </div>
    </Page>
  );
};
