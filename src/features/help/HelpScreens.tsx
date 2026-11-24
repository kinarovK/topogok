import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import { TOPICS } from '../../data/topicRegistry.ts';
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
      <p className={s.versionLine} data-testid="version">
        {t('help.version', { app: __APP_VERSION__, build: __BUILD_ID__ })} · {t('help.dataVersions', { versions: [...new Set(TOPICS.map((x) => x.dataVersion))].sort().join(', ') })}
      </p>
    </div>
  );
}
