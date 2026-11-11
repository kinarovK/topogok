import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './app/App.tsx';
import { ErrorBoundary } from './app/ErrorBoundary.tsx';
import { SettingsProvider } from './app/settings.tsx';
import { AccountProvider } from './account/account.tsx';
import { initPwa } from './pwa/updateCoordinator.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ErrorBoundary>
        <AccountProvider>
          <App />
        </AccountProvider>
      </ErrorBoundary>
    </SettingsProvider>
  </StrictMode>,
);

void initPwa();
