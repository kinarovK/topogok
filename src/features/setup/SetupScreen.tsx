import { useState } from 'react';
import { useAccount } from '../../account/account.tsx';
import { useTopicAccess } from '../../account/topicAccess.ts';
import { countOptions } from '../../domain/questionCounts.ts';
import { useSettings } from '../../app/settings.tsx';
import { Button, ChoiceGroup } from '../../components/ui.tsx';
import { DEFAULT_COUNT, validateConfig } from '../../domain/config.ts';
import type { TopicEntry } from '../../data/topicRegistry.ts';
import type { AssessmentConfiguration, GameConfiguration, Mode, QuestionCount } from '../../domain/types.ts';
import type { Topic } from '../../data/validation.ts';
import s from '../../app/app.module.css';

export function SetupScreen({ topic, entry, initial, onStart, onBack }: {
  mode: Mode; topic: Topic; entry: TopicEntry; initial: GameConfiguration | undefined; onStart: (c: GameConfiguration) => void; onBack: () => void;
}) {
  const { t, locale } = useSettings();
  const access = useTopicAccess(topic)!;
  const { me } = useAccount();
  const total = access.enabled.length;
  const counts = countOptions(entry.counts, total);
  const pick = (c: QuestionCount | undefined): QuestionCount => (c !== undefined && counts.includes(c) ? c : counts.includes(DEFAULT_COUNT) ? DEFAULT_COUNT : 'all');
  const [count, setCount] = useState<QuestionCount>(() => pick(initial?.count));

  const start = () => {
    // F4.5: only the assessment has a setup screen, and it has no time limit.
    const raw: AssessmentConfiguration = { mode: 'assessment', topicId: topic.manifest.id, count, timeLimitMinutes: null };
    const valid = validateConfig(raw);
    if (valid) onStart(valid);
  };

  return (
    <div className={s.page}>
      <h1>{t('setup.titleAssessment')}</h1>
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); start(); }}>
        <div>
          <p className={s.topicLine}>{t('setup.topic')}</p>
          <p><strong>{topic.manifest.title[locale]}</strong></p>
          {access.restricted && <p className={s.topicLine} data-testid="teacher-selection">{t('setup.teacherSelection', { count: total, total: topic.regions.length })}</p>}
        </div>
        <ChoiceGroup legend={t('setup.count')} name="count" value={count} onChange={setCount}
          options={counts.map((c) => ({ value: c, label: c === 'all' ? t('setup.all', { count: total }) : String(c) }))} />
        {/* F5-10: say up front whether this round can reach the leaderboard, and why not. */}
        <p className={s.topicLine} data-testid="board-eligibility">
          {me?.role !== 'student' ? t('setup.boardGuest') : access.restricted ? t('setup.boardRestricted') : count !== 'all' ? t('setup.boardNotAll') : t('setup.boardYes')}
        </p>
        <section>
          <h2 className="visually-hidden">{t('setup.rulesTitle')}</h2>
          <p className={s.rules}>{t('setup.rulesAssessment')}</p>
        </section>
        <div className={s.actions}>
          <Button type="submit" variant="primary">{t('setup.start')}</Button>
          <Button onClick={onBack}>{t('common.back')}</Button>
        </div>
      </form>
    </div>
  );
}
