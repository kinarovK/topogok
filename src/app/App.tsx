import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getTopic } from '../data/topicRegistry.ts';
import { DataError, type Topic } from '../data/validation.ts';
import type { AssessmentConfiguration, GameConfiguration, GameResult, Mode, PracticeConfiguration } from '../domain/types.ts';
import { GameScreen } from '../features/game/GameScreen.tsx';
import { HomeScreen } from '../features/home/HomeScreen.tsx';
import { SetupScreen } from '../features/setup/SetupScreen.tsx';
import { ResultScreen } from '../features/results/ResultScreen.tsx';
import { ExploreScreen } from '../features/explore/ExploreScreen.tsx';
import { AboutScreen, HelpScreen } from '../features/help/HelpScreens.tsx';
import { dismissOfflineReady, dismissUpdate, pwaStore, requestUpdate, setActivity } from '../pwa/updateCoordinator.ts';
import { Header } from './Header.tsx';
import { useSettings } from './settings.tsx';
import { Button } from '../components/ui.tsx';
import s from './app.module.css';

type View =
  | { name: 'home' }
  | { name: 'setup'; mode: Mode }
  | { name: 'game'; config: GameConfiguration; round: number }
  | { name: 'results'; config: GameConfiguration; result: GameResult }
  | { name: 'explore' }
  | { name: 'help' }
  | { name: 'about' };

type TopicState = { status: 'loading' } | { status: 'ready'; topic: Topic } | { status: 'error'; kind: 'load' | 'invalid' };

export function App() {
  const { t } = useSettings();
  const [view, setView] = useState<View>({ name: 'home' });
  const [topicState, setTopicState] = useState<TopicState>({ status: 'loading' });
  const [lastSetup, setLastSetup] = useState<{ practice?: PracticeConfiguration; assessment?: AssessmentConfiguration }>({});
  const [renderErrorView, setRenderErrorView] = useState<string | null>(null);
  const renderError = renderErrorView === view.name;
  const setRenderError = (v: boolean) => setRenderErrorView(v ? view.name : null);
  const pwa = useSyncExternalStore(pwaStore.subscribe, pwaStore.get);

  const fetchTopic = useCallback(() => {
    getTopic().then(
      (topic) => setTopicState({ status: 'ready', topic }),
      (e: unknown) => {
        if (!(e instanceof DataError)) console.error(e);
        setTopicState({ status: 'error', kind: e instanceof DataError ? e.kind : 'load' });
      },
    );
  }, []);
  useEffect(fetchTopic, [fetchTopic]);
  const load = () => { setTopicState({ status: 'loading' }); fetchTopic(); };

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

  const startGame = (config: GameConfiguration) => {
    setLastSetup((p) => (config.mode === 'practice' ? { ...p, practice: config } : { ...p, assessment: config }));
    setView({ name: 'game', config, round: Date.now() });
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
        content = <HomeScreen topicTitle={topic?.manifest.title ?? null} onMode={(mode) => setView({ name: 'setup', mode })} onExplore={() => setView({ name: 'explore' })} onHelp={() => setView({ name: 'help' })} onAbout={() => setView({ name: 'about' })} />;
        break;
      case 'setup':
        content = <SetupScreen key={view.mode} mode={view.mode} topic={topic!} initial={view.mode === 'practice' ? lastSetup.practice : lastSetup.assessment} onStart={startGame} onBack={() => setView({ name: 'home' })} />;
        break;
      case 'game':
        content = (
          <GameScreen key={view.round} topic={topic!} config={view.config}
            onFinish={(result) => setView({ name: 'results', config: view.config, result })}
            onRestart={() => setView({ name: 'game', config: view.config, round: Date.now() })}
            onExit={() => setView({ name: 'home' })}
            onRenderError={() => setRenderError(true)} />
        );
        break;
      case 'results':
        content = <ResultScreen result={view.result} onNewRound={() => startGame(view.config)} onHome={() => setView({ name: 'home' })} />;
        break;
      case 'explore':
        content = <ExploreScreen topic={topic!} onBack={() => setView({ name: 'home' })} onRenderError={() => setRenderError(true)} />;
        break;
      case 'help':
        content = <HelpScreen onBack={() => setView({ name: 'home' })} />;
        break;
      case 'about':
        content = <AboutScreen manifest={topic?.manifest ?? null} onBack={() => setView({ name: 'home' })} />;
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

