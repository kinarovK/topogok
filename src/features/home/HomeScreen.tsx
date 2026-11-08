import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import type { LocalizedText } from '../../data/validation.ts';
import type { Mode } from '../../domain/types.ts';
import s from '../../app/app.module.css';

export function HomeScreen({ topicTitle, onMode, onExplore, onHelp, onAbout }: {
  topicTitle: LocalizedText | null; onMode: (m: Mode) => void; onExplore: () => void; onHelp: () => void; onAbout: () => void;
}) {
  const { t, locale } = useSettings();
  return (
    <div className={s.page}>
      <div>
        <h1>{t('common.appName')}</h1>
        <p className={s.lead}>{t('home.tagline')}</p>
        {topicTitle && <p className={s.topicLine}>{t('home.topic', { topic: topicTitle[locale] })}</p>}
      </div>
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
      <nav className={s.secondaryLinks} aria-label={t('common.settings')}>
        <Button onClick={onExplore}>{t('home.explore')}</Button>
        <Button onClick={onHelp}>{t('home.help')}</Button>
        <Button onClick={onAbout}>{t('home.about')}</Button>
      </nav>
    </div>
  );
}
