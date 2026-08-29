'use client';
import { createContext, type ReactNode, useContext } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locale';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export const useLocale = (): Locale => useContext(LocaleContext);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
