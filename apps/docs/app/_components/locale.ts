export type Locale = 'en' | 'ko';

export const LOCALES: readonly Locale[] = ['en', 'ko'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);

export type Localized<T> = Partial<Record<Locale, T>> & { en: T };
export const t = <T,>(value: Localized<T>, locale: Locale): T => value[locale] ?? value.en;
