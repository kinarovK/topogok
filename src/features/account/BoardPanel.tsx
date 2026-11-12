// F5: teacher view of the leaderboard per topic, and starting a new competition period (with confirmation).
import { useState } from 'react';
import { api } from '../../account/api.ts';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import { TOPICS } from '../../data/topicRegistry.ts';
import { Leaderboard } from '../leaderboard/Leaderboard.tsx';
import { Field, useAction } from './common.tsx';
import s from './account.module.css';

export function BoardPanel({ scope }: { scope: string | null }) {
  const { t, locale } = useSettings();
  // No topic preselected: the leaderboard may be loaded once a minute per account, so load only what is asked for.
  const [topicId, setTopicId] = useState<string>('');
  const [confirming, setConfirming] = useState(false);
  const action = useAction();
  return (
    <section aria-label={t('board.tab')} data-testid="board-panel">
      <div className={s.toolbar}>
        <Field label={t('report.topic')}>
          <select value={topicId} onChange={(e) => { setTopicId(e.target.value); setConfirming(false); }}>
            <option value="" disabled>{t('board.chooseTopic')}</option>
            {TOPICS.map((x) => <option key={x.id} value={x.id}>{x.title[locale]}</option>)}
          </select>
        </Field>
        <Button onClick={() => setConfirming(true)} disabled={!topicId}>{t('board.newPeriod')}</Button>
      </div>
      {confirming && (
        <div className={s.item} role="group" aria-label={t('board.newPeriod')}>
          <p>{t('board.newPeriodConfirm')}</p>
          <div className={s.itemActions}>
            <Button variant="primary" disabled={action.busy}
              onClick={() => void action.run(async () => { await api.newPeriod(scope, topicId); setConfirming(false); return t('board.periodStarted'); })}>
              {t('board.newPeriodYes')}
            </Button>
            <Button onClick={() => setConfirming(false)}>{t('board.cancel')}</Button>
          </div>
        </div>
      )}
      {action.messages}
      {topicId && <Leaderboard key={topicId} topicId={topicId} teacherId={scope} />}
    </section>
  );
}
