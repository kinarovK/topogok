import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectLocale, translate, type Locale, type MessageKey, type Params } from '../i18n/translator.ts';
import { createPreferencesStore, type ThemePreference } from '../preferences/preferencesStore.ts';

export type ResolvedTheme = 'light' | 'dark';

type Settings = {
  locale: Locale;
  themePreference: ThemePreference;
  theme: ResolvedTheme;
  setLocale: (l: Locale) => void;
  setThemePreference: (t: ThemePreference) => void;
  t: (key: MessageKey, params?: Params) => string;
};

const SettingsContext = createContext<Settings | null>(null);

export const preferencesStore = createPreferencesStore(() => window.localStorage);

const darkQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => preferencesStore.load(), []);
  const [locale, setLocaleState] = useState<Locale>(() => initial.locale ?? detectLocale(navigator.languages ?? [navigator.language]));
  const [explicitLocale, setExplicitLocale] = useState<Locale | undefined>(initial.locale);
  const [themePreference, setThemePref] = useState<ThemePreference>(initial.theme);
  const [systemDark, setSystemDark] = useState<boolean>(() => darkQuery()?.matches ?? false);

  useEffect(() => {
    const q = darkQuery();
    if (!q) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    q.addEventListener('change', onChange);
    return () => q.removeEventListener('change', onChange);
  }, []);

  const theme: ResolvedTheme = themePreference === 'system' ? (systemDark ? 'dark' : 'light') : themePreference;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset['theme'] = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? '#101827' : '#f5f7fa');
  }, [locale, theme]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    setExplicitLocale(l);
    preferencesStore.save({ locale: l, theme: themePreference });
  }, [themePreference]);

  const setThemePreference = useCallback((tp: ThemePreference) => {
    setThemePref(tp);
    preferencesStore.save({ ...(explicitLocale ? { locale: explicitLocale } : {}), theme: tp });
  }, [explicitLocale]);

  const t = useCallback((key: MessageKey, params?: Params) => translate(locale, key, params), [locale]);

  const value = useMemo(() => ({ locale, themePreference, theme, setLocale, setThemePreference, t }), [locale, themePreference, theme, setLocale, setThemePreference, t]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const s = useContext(SettingsContext);
  if (!s) throw new Error('SettingsProvider missing');
  return s;
}
