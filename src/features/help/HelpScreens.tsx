import { useEffect, useState } from 'react';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import type { TopicManifest } from '../../data/validation.ts';
import { getTopic, TOPICS } from '../../data/topicRegistry.ts';
import type { MessageKey } from '../../i18n/translator.ts';
import s from '../../app/app.module.css';

const SECTIONS: Array<[MessageKey, MessageKey]> = [
  ['help.practiceTitle', 'help.practiceText'],
  ['help.assessmentTitle', 'help.assessmentText'],
  ['help.gradeTitle', 'help.gradeText'],
  ['help.smallTitle', 'help.smallText'],
  ['help.greyTitle', 'help.greyText'],
  ['help.privacyTitle', 'help.privacyText'],
  ['help.offlineTitle', 'help.offlineText'],
  ['help.installTitle', 'help.installText'],
  ['help.troubleTitle', 'help.troubleText'],
];

export function HelpScreen({ onBack }: { onBack: () => void }) {
  const { t } = useSettings();
  return (
    <div className={s.page}>
      <h1>{t('help.title')}</h1>
      {SECTIONS.map(([title, text]) => (
        <section key={title} className={s.helpSection}>
          <h2>{t(title)}</h2>
          <p>{t(text)}</p>
        </section>
      ))}
      <div className={s.actions}><Button onClick={onBack}>{t('common.back')}</Button></div>
    </div>
  );
}

export function AboutScreen({ onBack }: { onBack: () => void }) {
  const { t, locale } = useSettings();
  const [manifests, setManifests] = useState<Record<string, TopicManifest>>({});
  useEffect(() => {
    for (const topic of TOPICS) {
      getTopic(topic.id).then((x) => setManifests((m) => ({ ...m, [topic.id]: x.manifest })), () => { /* shown as not provided */ });
    }
  }, []);
  return (
    <div className={s.page}>
      <h1>{t('about.title')}</h1>
      <dl className={s.dl}>
        <dt>{t('about.appVersion')}</dt><dd>{__APP_VERSION__}</dd>
      </dl>
      <h2 className={s.sectionTitle}>{t('about.topicsTitle')}</h2>
      {TOPICS.map((topic) => {
        const m = manifests[topic.id];
        const p = m?.provenance;
        return (
          <section key={topic.id} className={s.helpSection} data-about-topic={topic.id}>
            <h3>{topic.title[locale]}</h3>
            <dl className={s.dl}>
              <dt>{t('about.dataVersion')}</dt><dd>{topic.dataVersion}</dd>
              <dt>{t('about.source')}</dt><dd>{p?.source ?? t('about.notProvided')}</dd>
              <dt>{t('about.license')}</dt><dd>{p?.license ?? t('about.notProvided')}</dd>
            </dl>
            <p className={s.notice}>{p?.status === 'verified' ? t('about.verified') : t('about.unverified')}</p>
            {p?.ownerStatement && <p><strong>{t('about.ownerStatementLabel')}:</strong> {p.ownerStatement[locale]}</p>}
          </section>
        );
      })}
      <div className={s.actions}><Button onClick={onBack}>{t('common.back')}</Button></div>
    </div>
  );
}
