// 0005 §5: the superadmin sets the tap buffer for rivers and points (touch and mouse, in screen pixels).
import { useState, type FormEvent } from 'react';
import { api } from '../../account/api.ts';
import { getTapBuffer } from '../../app/appSettings.ts';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import { DEFAULT_TAP_BUFFER, TAP_BUFFER_LIMITS } from '../../map/hitTest.ts';
import { Field, useAction } from './common.tsx';
import s from './account.module.css';

export function SettingsPanel() {
  const { t } = useSettings();
  const current = getTapBuffer();
  const [touch, setTouch] = useState(String(current.touch));
  const [mouse, setMouse] = useState(String(current.mouse));
  const action = useAction();
  const inRange = (v: string, [lo, hi]: readonly [number, number]) => /^\d+$/.test(v) && Number(v) >= lo && Number(v) <= hi;
  const valid = inRange(touch, TAP_BUFFER_LIMITS.touch) && inRange(mouse, TAP_BUFFER_LIMITS.mouse);
  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => { await api.saveAppSettings({ tapBufferTouch: Number(touch), tapBufferMouse: Number(mouse) }); return t('account.saved'); });
  };
  return (
    <section aria-label={t('account.settings')} data-testid="settings-panel">
      <h2>{t('appSettings.tapTitle')}</h2>
      <p className={s.hint}>{t('appSettings.tapHint')}</p>
      <form className={s.toolbar} onSubmit={save}>
        <Field label={t('appSettings.touch', { min: TAP_BUFFER_LIMITS.touch[0], max: TAP_BUFFER_LIMITS.touch[1] })}>
          <input type="number" inputMode="numeric" min={TAP_BUFFER_LIMITS.touch[0]} max={TAP_BUFFER_LIMITS.touch[1]} value={touch} onChange={(e) => setTouch(e.target.value)} />
        </Field>
        <Field label={t('appSettings.mouse', { min: TAP_BUFFER_LIMITS.mouse[0], max: TAP_BUFFER_LIMITS.mouse[1] })}>
          <input type="number" inputMode="numeric" min={TAP_BUFFER_LIMITS.mouse[0]} max={TAP_BUFFER_LIMITS.mouse[1]} value={mouse} onChange={(e) => setMouse(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={action.busy || !valid}>{t('topics.save')}</Button>
        <Button onClick={() => { setTouch(String(DEFAULT_TAP_BUFFER.touch)); setMouse(String(DEFAULT_TAP_BUFFER.mouse)); }}>{t('appSettings.defaults')}</Button>
      </form>
      {action.messages}
    </section>
  );
}
