import { LOCALE_LABEL, LOCALES, type Locale } from '../i18n/translator.ts';
import type { ThemePreference } from '../preferences/preferencesStore.ts';
import { uiStyles } from '../components/ui.tsx';
import { useSettings } from './settings.tsx';
import s from './app.module.css';

export function Logo({ className }: { className?: string | undefined }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--primary)" />
      <path d="M6 18.5 9.5 12l5 1.5L19 9l6.5 3.5L26 19l-4.5 4.5-6-1L11 24z" fill="var(--surface)" opacity="0.92" />
      <circle cx="19" cy="15.5" r="3" fill="var(--accent)" stroke="var(--primary)" strokeWidth="1.2" />
    </svg>
  );
}

/** onHome is null during an active round: leaving goes through the in-game confirmation only. */
export function Header({ onHome }: { onHome: (() => void) | null }) {
  const { t, locale, setLocale, themePreference, setThemePreference } = useSettings();
  return (
    <header className={s.header}>
      <button type="button" className={s.brand} onClick={onHome ?? undefined} disabled={!onHome} aria-label={onHome ? `${t('common.appName')} – ${t('common.home')}` : t('common.appName')}>
        <Logo className={s.brandMark} />
        <span>TopoGok</span>
      </button>
      <div className={s.prefs}>
        <label>
          <span className="visually-hidden">{t('common.language')}</span>
          <select className={uiStyles.select} value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={t('common.language')}>
            {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_LABEL[l]}</option>)}
          </select>
        </label>
        <label>
          <span className="visually-hidden">{t('common.theme')}</span>
          <select className={uiStyles.select} value={themePreference} onChange={(e) => setThemePreference(e.target.value as ThemePreference)} aria-label={t('common.theme')}>
            <option value="system">{t('common.themeSystem')}</option>
            <option value="light">{t('common.themeLight')}</option>
            <option value="dark">{t('common.themeDark')}</option>
          </select>
        </label>
      </div>
    </header>
  );
}
