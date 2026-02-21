import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Locale } from '../lib/i18n';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LOCALE_KEY = 'vn-locale';
const VALID_LOCALES: Locale[] = ['en', 'zh-CN'];

function readStoredLocale(fallback: Locale): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored && VALID_LOCALES.includes(stored as Locale)) return stored as Locale;
  } catch { /* private browsing / SSR guard */ }
  return fallback;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: 'en', setLocale: () => {} });

export function LocaleProvider({ children, initial = 'en' }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale(initial));

  const setLocale = useCallback((l: Locale) => {
    try { localStorage.setItem(LOCALE_KEY, l); } catch { /* ignore */ }
    setLocaleState(l);
  }, []);

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
