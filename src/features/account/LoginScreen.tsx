import { useState, type FormEvent } from 'react';
import { useAccount } from '../../account/account.tsx';
import { api } from '../../account/api.ts';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import app from '../../app/app.module.css';
import { Field, TextInput, useAction, usePasswordFields } from './common.tsx';
import s from './account.module.css';

export function LoginScreen({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { t } = useSettings();
  const account = useAccount();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const action = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => { await account.login(login.trim(), password); setPassword(''); onDone(); });
  };
  return (
    <div className={app.page}>
      <h1>{t('account.loginTitle')}</h1>
      {account.state.status === 'guest' && account.state.offline && <p className={s.hint}>{t('account.needsOnline')}</p>}
      <form className={s.form} onSubmit={submit}>
        <Field label={t('account.loginField')}>
          <TextInput name="username" autoComplete="username" required value={login} onChange={(e) => setLogin(e.target.value)} />
        </Field>
        <Field label={t('account.passwordField')}>
          <TextInput name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {action.messages}
        <div className={app.actions}>
          <Button type="submit" variant="primary" disabled={action.busy || !login || !password}>{action.busy ? t('account.working') : t('account.submit')}</Button>
          <Button onClick={onBack}>{t('common.back')}</Button>
        </div>
      </form>
    </div>
  );
}

/** #/setup: first superadmin (SETUP_CODE) or recovery (one-time code from the admin-recovery workflow). */
export function SetupScreen({ onLogin }: { onLogin: () => void }) {
  const { t } = useSettings();
  const [code, setCode] = useState('');
  const [login, setLogin] = useState('');
  const [fullName, setFullName] = useState('');
  const pw = usePasswordFields();
  const action = useAction();
  const [done, setDone] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const password = pw.validate();
      const r = await api.setup(code.trim(), login.trim(), fullName, password);
      pw.reset(); setDone(true);
      return r.created ? t('account.setupCreated') : t('account.setupRecovered');
    });
  };
  return (
    <div className={app.page}>
      <h1>{t('account.setupTitle')}</h1>
      <p className={s.hint}>{t('account.setupText')}</p>
      <form className={s.form} onSubmit={submit}>
        <Field label={t('account.setupCode')}><TextInput autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label={t('account.loginField')}><TextInput autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} /></Field>
        <Field label={t('account.fullName')}><TextInput autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        {pw.fields}
        {action.messages}
        <div className={app.actions}>
          {!done && <Button type="submit" variant="primary" disabled={action.busy}>{action.busy ? t('account.working') : t('account.save')}</Button>}
          {done && <Button variant="primary" onClick={onLogin}>{t('account.login')}</Button>}
        </div>
      </form>
    </div>
  );
}
