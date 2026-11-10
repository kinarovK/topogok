import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import { TOPICS, type TopicEntry, type TopicId } from '../../data/topicRegistry.ts';
import type { MessageKey } from '../../i18n/translator.ts';
import type { Mode } from '../../domain/types.ts';
import s from '../../app/app.module.css';

const DESC: Record<TopicId, MessageKey> = {
  'ukraine-administration': 'home.topicAdminDesc',
  'ukraine-tectonics': 'home.topicTectonicsDesc',
};

/** Home = topic choice. */
export function HomeScreen({ onTopic, onHelp }: { onTopic: (id: TopicId) => void; onHelp: () => void }) {
  const { t, locale } = useSettings();
  return (
    <div className={s.page}>
      <div>
        <h1>{t('common.appName')}</h1>
        <p className={s.lead}>{t('home.tagline')}</p>
      </div>
      <section aria-labelledby="choose-topic" className={s.topicList}>
        <h2 id="choose-topic" className={s.sectionTitle}>{t('home.chooseTopic')}</h2>
        {TOPICS.map((topic) => (
          <button key={topic.id} type="button" className={s.topicCard} onClick={() => onTopic(topic.id)} data-topic={topic.id}>
            <span className={s.topicText}>
              <strong>{topic.title[locale]}</strong>
              <span>{t(DESC[topic.id])}</span>
            </span>
            <span className={s.topicMeta}>{t('home.topicCount', { count: topic.featureCount })}<span aria-hidden="true"> ›</span></span>
          </button>
        ))}
      </section>
      <nav className={s.secondaryLinks} aria-label={t('common.settings')}>
        <Button onClick={onHelp}>{t('home.help')}</Button>
      </nav>
    </div>
  );
}

/** After a topic: practice, assessment or exploration. */
export function TopicScreen({ topic, onMode, onExplore, onBack }: { topic: TopicEntry; onMode: (m: Mode) => void; onExplore: () => void; onBack: () => void }) {
  const { t, locale } = useSettings();
  return (
    <div className={s.page}>
      <div>
        <h1>{topic.title[locale]}</h1>
        <p className={s.lead}>{t(DESC[topic.id])}</p>
      </div>
      <h2 className={s.sectionTitle}>{t('home.chooseMode')}</h2>
      <div className={s.modes}>
        <button type="button" className={s.modeCard} onClick={() => onMode('practice')}>
          <strong>{t('home.practice')}</strong>
          <span>{t('home.practiceDesc')}</span>
        </button>
        <button type="button" className={s.modeCard} onClick={() => onMode('assessment')}>
          <strong>{t('home.assessment')}</strong>
          <span>{t('home.assessmentDesc')}</span>
        </button>
      </div>
      <div className={s.actions}>
        <Button onClick={onExplore}>{t('home.explore')}</Button>
        <Button onClick={onBack}>{t('common.back')}</Button>
      </div>
    </div>
  );
}
