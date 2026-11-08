import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import type { TopicManifest } from '../../data/validation.ts';
import { TOPIC } from '../../data/topicRegistry.ts';
import type { MessageKey } from '../../i18n/translator.ts';
import s from '../../app/app.module.css';

const SECTIONS: Array<[MessageKey, MessageKey]> = [
  ['help.practiceTitle', 'help.practiceText'],
  ['help.assessmentTitle', 'help.assessmentText'],
  ['help.gradeTitle', 'help.gradeText'],
  ['help.smallTitle', 'help.smallText'],
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

export function AboutScreen({ manifest, onBack }: { manifest: TopicManifest | null; onBack: () => void }) {
  const { t, locale } = useSettings();
  const p = manifest?.provenance;
  return (
    <div className={s.page}>
      <h1>{t('about.title')}</h1>
      <dl className={s.dl}>
        <dt>{t('about.appVersion')}</dt><dd>{__APP_VERSION__}</dd>
        <dt>{t('about.dataVersion')}</dt><dd>{manifest?.dataVersion ?? TOPIC.dataVersion}</dd>
      </dl>
      <section className={s.helpSection}>
        <h2>{t('about.dataTitle')}</h2>
        {manifest && <p>{manifest.title[locale]}</p>}
        <dl className={s.dl}>
          <dt>{t('about.source')}</dt><dd>{p?.source ?? t('about.notProvided')}</dd>
          <dt>{t('about.license')}</dt><dd>{p?.license ?? t('about.notProvided')}</dd>
        </dl>
        <p className={s.notice}>{p?.status === 'verified' ? t('about.verified') : t('about.unverified')}</p>
        {p?.ownerStatement && (
          <p><strong>{t('about.ownerStatementLabel')}:</strong> {p.ownerStatement[locale]}</p>
        )}
      </section>
      <div className={s.actions}><Button onClick={onBack}>{t('common.back')}</Button></div>
    </div>
  );
}
