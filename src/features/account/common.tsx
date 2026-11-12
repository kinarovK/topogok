import { useCallback, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { PASSWORD_MIN_LENGTH } from '../../../shared/kdf.ts';
import { ApiFailure } from '../../account/api.ts';
import { useSettings } from '../../app/settings.tsx';
import { dictionaries, type MessageKey } from '../../i18n/translator.ts';
import s from './account.module.css';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={s.field}><span>{label}</span>{children}</label>;
}

export function TextInput(props: ComponentProps<'input'>) {
  return <input autoCapitalize="off" autoCorrect="off" spellCheck={false} {...props} />;
}

/** Localized message for an API failure or a local validation code. */
/** Stable per language, so effects that depend on it do not re-run (and re-request) on every render. */
export function useErrorText() {
  const { t } = useSettings();
  return useCallback((e: unknown): string => {
    const code = e instanceof ApiFailure ? e.code : e instanceof Error ? e.message : 'generic';
    if (code === 'rate_limited') {
      const secs = e instanceof ApiFailure ? e.retryAfterSeconds ?? 60 : 60;
      return t('account.err.rate_limited', { minutes: Math.max(1, Math.ceil(secs / 60)) });
    }
    if (code === 'password_short') return t('account.err.password_short', { min: PASSWORD_MIN_LENGTH });
    return code in dictionaries.hu.account.err ? t(`account.err.${code}` as MessageKey) : t('account.err.generic');
  }, [t]);
}

/** Two password fields with the length rule; validate() throws a coded Error for useErrorText. */
export function usePasswordFields() {
  const { t } = useSettings();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const id = useId();
  const fields = (
    <>
      <Field label={t('account.password')}><TextInput id={`${id}-a`} type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></Field>
      <Field label={t('account.passwordAgain')}><TextInput id={`${id}-b`} type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      <p className={s.hint}>{t('account.passwordHint', { min: PASSWORD_MIN_LENGTH })}</p>
    </>
  );
  return {
    fields,
    value: a,
    validate() {
      if ([...a].length < PASSWORD_MIN_LENGTH) throw new Error('password_short');
      if (a !== b) throw new Error('password_mismatch');
      return a;
    },
    reset() { setA(''); setB(''); },
  };
}

/** Runs an async action with busy state and a localized error/success line. */
export function useAction() {
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  return {
    busy, error, ok,
    async run(fn: () => Promise<void | string>) {
      setBusy(true); setError(null); setOk(null);
      try { const msg = await fn(); if (typeof msg === 'string') setOk(msg); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
    },
    messages: (
      <>
        {error && <p className={s.error} role="alert">{error}</p>}
        {ok && <p className={s.ok} role="status">{ok}</p>}
      </>
    ),
  };
}

export const formatDate = (ms: number, locale: string) => new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : 'hu-HU', { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
