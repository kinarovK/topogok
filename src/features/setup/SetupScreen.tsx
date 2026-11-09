import { useState } from 'react';
import { useSettings } from '../../app/settings.tsx';
import { Button, ChoiceGroup } from '../../components/ui.tsx';
import { DEFAULT_COUNT, TIME_LIMITS, validateConfig } from '../../domain/config.ts';
import type { TopicEntry } from '../../data/topicRegistry.ts';
import type { AssessmentConfiguration, GameConfiguration, Mode, PracticeConfiguration, QuestionCount, TimeLimitMinutes } from '../../domain/types.ts';
import type { Topic } from '../../data/validation.ts';
import s from '../../app/app.module.css';

export function SetupScreen({ mode, topic, entry, initial, onStart, onBack }: {
  mode: Mode; topic: Topic; entry: TopicEntry; initial: GameConfiguration | undefined; onStart: (c: GameConfiguration) => void; onBack: () => void;
}) {
  const { t, locale } = useSettings();
  const pick = (c: QuestionCount | undefined): QuestionCount => (c !== undefined && entry.counts.includes(c) ? c : entry.counts.includes(DEFAULT_COUNT) ? DEFAULT_COUNT : 'all');
  const [count, setCount] = useState<QuestionCount>(() => pick(initial?.count));
  const [showElapsed, setShowElapsed] = useState(initial?.mode === 'practice' ? initial.showElapsed : false);
  const [limit, setLimit] = useState<TimeLimitMinutes>(initial?.mode === 'assessment' ? initial.timeLimitMinutes : null);
  const total = topic.regions.length;

  const start = () => {
    const raw: PracticeConfiguration | AssessmentConfiguration = mode === 'practice'
      ? { mode, topicId: topic.manifest.id, count, showElapsed }
      : { mode, topicId: topic.manifest.id, count, timeLimitMinutes: limit };
    const valid = validateConfig(raw);
    if (valid) onStart(valid);
  };

  return (
    <div className={s.page}>
      <h1>{mode === 'practice' ? t('setup.titlePractice') : t('setup.titleAssessment')}</h1>
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); start(); }}>
        <div>
          <p className={s.topicLine}>{t('setup.topic')}</p>
          <p><strong>{topic.manifest.title[locale]}</strong></p>
        </div>
        <ChoiceGroup legend={t('setup.count')} name="count" value={count} onChange={setCount}
          options={entry.counts.map((c) => ({ value: c, label: c === 'all' ? t('setup.all', { count: total }) : String(c) }))} />
        {mode === 'practice' ? (
          <label className={s.toggle}>
            <input type="checkbox" checked={showElapsed} onChange={(e) => setShowElapsed(e.target.checked)} />
            <span>{t('setup.showElapsed')}</span>
          </label>
        ) : (
          <ChoiceGroup legend={t('setup.timeLimit')} name="limit" value={limit} onChange={setLimit}
            options={TIME_LIMITS.map((m) => ({ value: m, label: m === null ? t('setup.noLimit') : t('setup.minutes', { count: m }) }))} />
        )}
        <section>
          <h2 className="visually-hidden">{t('setup.rulesTitle')}</h2>
          <p className={s.rules}>{mode === 'practice' ? t('setup.rulesPractice') : t('setup.rulesAssessment')}</p>
        </section>
        <div className={s.actions}>
          <Button type="submit" variant="primary">{t('setup.start')}</Button>
          <Button onClick={onBack}>{t('common.back')}</Button>
        </div>
      </form>
    </div>
  );
}
