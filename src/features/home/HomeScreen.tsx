import { useAccount } from '../../account/account.tsx';
import { useSettings } from '../../app/settings.tsx';
import acc from '../account/account.module.css';
import { Button } from '../../components/ui.tsx';
import { TOPICS, type TopicEntry, type TopicId } from '../../data/topicRegistry.ts';
import type { MessageKey } from '../../i18n/translator.ts';
import type { Mode } from '../../domain/types.ts';
import s from '../../app/app.module.css';

const DESC: Record<TopicId, MessageKey> = {
  'ukraine-administration': 'home.topicAdminDesc',
  'ukraine-tectonics': 'home.topicTectonicsDesc',
  'world-continents': 'home.topicWorldDesc',
};

/** Home = topic choice. */
export function HomeScreen({ onTopic, onHelp, onLogin, onManage }: { onTopic: (id: TopicId) => void; onHelp: () => void; onLogin: () => void; onManage: () => void }) {
  const { t, locale } = useSettings();
  return (
    <div className={s.page}>
      <AccountBar onLogin={onLogin} onManage={onManage} />
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

/** Who is signed in (or a sign-in button). Personal data stays in memory only. */
function AccountBar({ onLogin, onManage }: { onLogin: () => void; onManage: () => void }) {
  const { t } = useSettings();
  const { state, me, logout } = useAccount();
  if (state.status === 'unknown') return null;
  if (!me) {
    return (
      <div className={acc.accountBar}>
        <span className={acc.meta}>{state.status === 'guest' && state.offline ? t('account.needsOnline') : ''}</span>
        <Button onClick={onLogin}>{t('account.login')}</Button>
      </div>
    );
  }
  const role = me.role === 'superadmin' ? t('account.roleSuperadmin') : me.role === 'teacher' ? t('account.roleTeacher') : t('account.roleStudent');
  return (
    <div className={acc.accountBar} data-testid="account-bar">
      <span className={acc.chip}>
        <strong>{me.fullName}</strong>
        <span className={acc.badge}>{role}</span>
        {me.role === 'student' && <span className={acc.meta}>{t('account.studentInfo', { teacher: me.teacherName ?? '—', className: me.className ?? '—' })}</span>}
      </span>
      <span className={acc.itemActions}>
        {me.role !== 'student' && <Button variant="primary" onClick={onManage}>{me.role === 'superadmin' ? t('account.admin') : t('account.manage')}</Button>}
        <Button onClick={() => void logout()}>{t('account.logout')}</Button>
      </span>
    </div>
  );
}
