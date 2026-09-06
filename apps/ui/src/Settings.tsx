import { Link } from 'react-router-dom';
import { EngineRows, LinkRows } from './Apps.tsx';
import type { ModelJob } from './api.ts';
import { useApps } from './apps-setup.ts';
import { Page, Section } from './bits.tsx';
import { type Locale, type Strings, setLocale, useLocale } from './i18n.ts';
import { ModelCard } from './ModelCard.tsx';
import { ModelSelect } from './ModelSelect.tsx';
import { assignModel, type Choice, useCatalog } from './models.ts';
import { setTheme, type Theme, useTheme } from './theme.ts';

const Options = <T extends string>({
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

// One row per kind of work. The split is by who is waiting: a turn someone is
// watching, a draft they will be asked to approve, and a sweep nobody waits on.
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
      className="shrink-0 flex items-center gap-1.5 rounded-md border border-glass-line bg-transparent px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted"
    />
  </div>
);

export const SettingsScreen = () => {
  const { locale, t } = useLocale();
  const theme = useTheme();
  const catalog = useCatalog();
  const apps = useApps();

  return (
    <Page>
      <h1 className="text-lg font-semibold text-foreground">{t.settings.screenTitle}</h1>
      <p className="mt-1 max-w-prose text-xs text-muted">{t.settings.intro}</p>

      <div className="mt-7 space-y-6">
        <Section divided title={t.settings.appearance}>
          <Options<Theme>
            value={theme}
            onPick={setTheme}
            options={[
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
        {/* Two directions, two sections. memex reaching a CLI is what makes the
            chat here work; an app reaching memex is what gets anything written
            down. They break in different ways, so they are fixed in different
            places. */}
        <Section divided title={t.settings.thinkingApps} hint={t.settings.thinkingAppsHint}>
          <EngineRows setup={apps} />
          <div className="mt-5 space-y-4">
            {MODEL_JOBS.map((job) => (
              <JobRow key={job} job={job} choice={catalog.jobs[job]} t={t} />
            ))}
            <p className="text-[11px] text-muted">{t.settings.defaultOnly}</p>
          </div>
        </Section>
        <Section divided title={t.settings.apps} hint={t.settings.appsHint}>
          <LinkRows setup={apps} />
          {apps.screen === null ? null : (
            <p className="mt-4 break-all text-[11px] text-muted">
              {t.connect.serverPath} <span className="font-mono">{apps.screen.serverPath}</span>
            </p>
          )}
        </Section>
        <Section divided title={t.settings.searchModel} hint={t.settings.searchModelHint}>
          <ModelCard />
        </Section>
        <Section divided title={t.settings.vault} hint={t.settings.vaultHint}>
          <ul className="flex flex-col gap-1">
            {[
              { to: '/rules', label: t.rules.screenTitle },
              { to: '/register', label: t.register.screenTitle },
              { to: '/threads', label: t.threads.title },
              { to: '/today', label: t.today.screenTitle },
              { to: '/tags', label: t.tags.screenTitle },
              { to: '/repair/evidence', label: t.repair.title },
            ].map((row) => (
              <li key={row.to}>
                <Link to={row.to} className="text-xs text-primary hover:underline">
                  {row.label}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </Page>
  );
};
