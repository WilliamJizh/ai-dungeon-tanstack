import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Locale } from '../lib/i18n';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: 'en', setLocale: () => {} });

export function LocaleProvider({ children, initial = 'en' }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initial);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
