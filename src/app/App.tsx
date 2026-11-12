import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getTopic, topicEntry, type TopicId } from '../data/topicRegistry.ts';
import { DataError, type Topic } from '../data/validation.ts';
import type { RoundRecorder } from '../account/recorder.ts';
import type { AssessmentConfiguration, GameConfiguration, GameResult, Mode, PracticeConfiguration } from '../domain/types.ts';
import { GameScreen } from '../features/game/GameScreen.tsx';
import { HomeScreen, TopicScreen } from '../features/home/HomeScreen.tsx';
import { SetupScreen } from '../features/setup/SetupScreen.tsx';
import { ResultScreen } from '../features/results/ResultScreen.tsx';
import { ExploreScreen } from '../features/explore/ExploreScreen.tsx';
import { LeaderboardScreen } from '../features/leaderboard/Leaderboard.tsx';
import { HelpScreen } from '../features/help/HelpScreens.tsx';
import { LoginScreen, SetupScreen as AdminSetupScreen } from '../features/account/LoginScreen.tsx';
import { ManageScreen } from '../features/account/ManageScreen.tsx';
import { dismissOfflineReady, dismissUpdate, pwaStore, requestUpdate, setActivity } from '../pwa/updateCoordinator.ts';
import { Header } from './Header.tsx';
import { useSettings } from './settings.tsx';
import { Button } from '../components/ui.tsx';
import s from './app.module.css';

type View =
  | { name: 'home' }
  | { name: 'topic'; topicId: TopicId }
  | { name: 'setup'; topicId: TopicId; mode: Mode }
  | { name: 'game'; topicId: TopicId; config: GameConfiguration; round: number }
  | { name: 'results'; topicId: TopicId; config: GameConfiguration; result: GameResult; recorder: RoundRecorder | null }
  | { name: 'explore'; topicId: TopicId }
  | { name: 'leaderboard'; topicId: TopicId }
  | { name: 'help' }
  | { name: 'login' }
  | { name: 'manage' }
  | { name: 'admin-setup' };

type TopicState = { status: 'loading' } | { status: 'ready'; topic: Topic } | { status: 'error'; kind: 'load' | 'invalid' };

export function App() {
  const { t, locale } = useSettings();
  // #/setup opens the first-superadmin / recovery page (F2_DESIGN §8); everything else starts at home.
  const [view, setView] = useState<View>(() => (typeof location !== 'undefined' && location.hash === '#/setup' ? { name: 'admin-setup' } : { name: 'home' }));
  const [topics, setTopics] = useState<Partial<Record<TopicId, TopicState>>>({});
  const [lastSetup, setLastSetup] = useState<Record<string, PracticeConfiguration | AssessmentConfiguration>>({});
  const [renderErrorView, setRenderErrorView] = useState<string | null>(null);
  const renderError = renderErrorView === view.name;
  const setRenderError = (v: boolean) => setRenderErrorView(v ? view.name : null);
  const pwa = useSyncExternalStore(pwaStore.subscribe, pwaStore.get);

  const currentTopicId = 'topicId' in view ? view.topicId : null;
  const fetchTopic = useCallback((id: TopicId) => {
    getTopic(id).then(
      (topic) => setTopics((m) => ({ ...m, [id]: { status: 'ready', topic } })),
      (e: unknown) => {
        if (!(e instanceof DataError)) console.error(e);
        setTopics((m) => ({ ...m, [id]: { status: 'error', kind: e instanceof DataError ? e.kind : 'load' } }));
      },
    );
  }, []);
  useEffect(() => { if (currentTopicId && !topics[currentTopicId]) fetchTopic(currentTopicId); }, [currentTopicId, topics, fetchTopic]);
  const topicState: TopicState = currentTopicId ? topics[currentTopicId] ?? { status: 'loading' } : { status: 'loading' };
  const load = () => { if (currentTopicId) { setTopics((m) => ({ ...m, [currentTopicId]: { status: 'loading' } })); fetchTopic(currentTopicId); } };

  const active = view.name === 'game';
  useEffect(() => { setActivity(view.name === 'game' ? 'round' : view.name === 'results' ? 'result' : 'idle'); }, [view.name]);

  // Leaving the page during a round: best-effort browser warning only.
  useEffect(() => {
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [active]);

  useEffect(() => { window.scrollTo(0, 0); }, [view.name]);

  const startGame = (topicId: TopicId, config: GameConfiguration) => {
    setLastSetup((p) => ({ ...p, [`${topicId}:${config.mode}`]: config }));
    setView({ name: 'game', topicId, config, round: Date.now() });
  };

  const needsTopic = view.name === 'game' || view.name === 'explore' || view.name === 'setup';
  let content: ReactNode;
  if (needsTopic && topicState.status !== 'ready') {
    content = topicState.status === 'loading'
      ? <p className={s.note} role="status">{t('common.loading')}</p>
      : (
        <div className={[s.page, s.error].join(' ')} role="alert">
          <h1>{t('errors.title')}</h1>
          <p>{topicState.kind === 'invalid' ? t('errors.dataInvalid') : t('errors.dataLoad')}</p>
          <div className={s.actions}>
            <Button variant="primary" onClick={load}>{t('common.retry')}</Button>
            <Button onClick={() => setView({ name: 'home' })}>{t('common.home')}</Button>
          </div>
        </div>
      );
  } else if (renderError) {
    content = (
      <div className={[s.page, s.error].join(' ')} role="alert">
        <h1>{t('errors.title')}</h1>
        <p>{t('errors.render')}</p>
        <div className={s.actions}>
          <Button variant="primary" onClick={() => { setRenderError(false); setView({ ...view }); }}>{t('common.retry')}</Button>
          <Button onClick={() => setView({ name: 'home' })}>{t('common.home')}</Button>
        </div>
      </div>
    );
  } else {
    const topic = topicState.status === 'ready' ? topicState.topic : null;
    switch (view.name) {
      case 'home':
        content = <HomeScreen onTopic={(topicId) => setView({ name: 'topic', topicId })} onHelp={() => setView({ name: 'help' })} onLogin={() => setView({ name: 'login' })} onManage={() => setView({ name: 'manage' })} />;
        break;
      case 'topic':
        content = <TopicScreen topic={topicEntry(view.topicId)} onMode={(mode) => (mode === 'practice'
          // F4.5: practice starts at once with every allowed feature and the elapsed time shown.
          ? startGame(view.topicId, { mode: 'practice', topicId: view.topicId, count: 'all', showElapsed: true })
          : setView({ name: 'setup', topicId: view.topicId, mode }))} onExplore={() => setView({ name: 'explore', topicId: view.topicId })} onLeaderboard={() => setView({ name: 'leaderboard', topicId: view.topicId })} onBack={() => setView({ name: 'home' })} />;
        break;
      case 'setup':
        content = <SetupScreen key={`${view.topicId}:${view.mode}`} mode={view.mode} topic={topic!} entry={topicEntry(view.topicId)} initial={lastSetup[`${view.topicId}:${view.mode}`]}
          onStart={(c) => startGame(view.topicId, c)} onBack={() => setView({ name: 'topic', topicId: view.topicId })} />;
        break;
      case 'game':
        content = (
          <GameScreen key={view.round} topic={topic!} config={view.config}
            onFinish={(result, recorder) => setView({ name: 'results', topicId: view.topicId, config: view.config, result, recorder })}
            onRestart={() => setView({ name: 'game', topicId: view.topicId, config: view.config, round: Date.now() })}
            onExit={() => setView({ name: 'topic', topicId: view.topicId })}
            onRenderError={() => setRenderError(true)} />
        );
        break;
      case 'results':
        content = <ResultScreen result={view.result} recorder={view.recorder} onNewRound={() => startGame(view.topicId, view.config)} onHome={() => setView({ name: 'home' })} />;
        break;
      case 'explore':
        content = <ExploreScreen topic={topic!} onBack={() => setView({ name: 'topic', topicId: view.topicId })} onRenderError={() => setRenderError(true)} />;
        break;
      case 'leaderboard':
        content = <LeaderboardScreen topicId={view.topicId} title={topicEntry(view.topicId).title[locale]} onBack={() => setView({ name: 'topic', topicId: view.topicId })} />;
        break;
      case 'help':
        content = <HelpScreen onBack={() => setView({ name: 'home' })} />;
        break;
      case 'login':
        content = <LoginScreen onDone={() => setView({ name: 'home' })} onBack={() => setView({ name: 'home' })} />;
        break;
      case 'manage':
        content = <ManageScreen onBack={() => setView({ name: 'home' })} />;
        break;
      case 'admin-setup':
        content = <AdminSetupScreen onLogin={() => { history.replaceState(null, '', location.pathname); setView({ name: 'login' }); }} />;
        break;
    }
  }

  const showUpdate = pwa.needRefresh && !pwa.dismissed;
  return (
    <>
      <a className="skip-link" href="#main">{t('common.skipToContent')}</a>
      <div className={s.shell}>
        <Header onHome={view.name === 'game' ? null : () => setView({ name: 'home' })} />
        <main id="main" className={s.main} tabIndex={-1}>
          {pwa.offlineJustReady && (
            <div className={s.banner} role="status">
              <p>{t('pwa.ready')}</p>
              <Button variant="ghost" onClick={dismissOfflineReady}>{t('common.close')}</Button>
            </div>
          )}
          {showUpdate && <UpdateBanner active={active} onResults={view.name === 'results'} blockedByOtherTab={pwa.blockedByOtherTab} />}
          {content}
        </main>
      </div>
    </>
  );

}

function UpdateBanner({ active, onResults, blockedByOtherTab }: { active: boolean; onResults: boolean; blockedByOtherTab: boolean }) {
  const { t } = useSettings();
    return (
      <div className={s.banner} role="status" data-testid="update-banner">
        <p>
          {active ? t('pwa.updateAfterRound') : blockedByOtherTab ? t('pwa.updateWaitingOtherTab') : t('pwa.updateAvailable')}
          {onResults && !active ? ` ${t('pwa.updateResultWarning')}` : ''}
        </p>
        {!active && (
          <Button variant="primary" onClick={() => { void requestUpdate(onResults); }}>{t('pwa.updateNow')}</Button>
        )}
        <Button variant="ghost" onClick={dismissUpdate}>{t('pwa.updateLater')}</Button>
      </div>
    );
  }

