import { EngineRows, LinkRows } from './Apps.tsx';
import { useApps } from './apps-setup.ts';
import { Page, Section } from './bits.tsx';
import { type Locale, setLocale, useLocale } from './i18n.ts';
import { ModelCard } from './ModelCard.tsx';
import { ModelSelect } from './ModelSelect.tsx';
import { setDefaultChoice, useDefaultChoice } from './models.ts';
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

export const SettingsScreen = () => {
  const { locale, t } = useLocale();
  const theme = useTheme();
  const fallback = useDefaultChoice();
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
          <div className="mt-5">
            <ModelSelect
              choice={fallback}
              onPick={setDefaultChoice}
              label={t.chat.model}
              className="flex items-center gap-1.5 rounded-md border border-glass-line bg-transparent px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted"
            />
            <p className="mt-2 text-[11px] text-muted">{t.settings.defaultOnly}</p>
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
      </div>
    </Page>
  );
};
