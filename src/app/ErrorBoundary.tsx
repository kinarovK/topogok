import { Component, type ReactNode } from 'react';
import { translate, type Locale } from '../i18n/translator.ts';

/** Last-resort boundary: a localized message and reload instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: unknown) { console.error(error); }
  override render() {
    if (!this.state.failed) return this.props.children;
    const locale: Locale = document.documentElement.lang === 'uk' ? 'uk' : 'hu';
    return (
      <div role="alert" style={{ padding: 24, display: 'grid', gap: 12, justifyItems: 'start' }}>
        <h1>{translate(locale, 'errors.title')}</h1>
        <p>{translate(locale, 'errors.generic')}</p>
        <button type="button" onClick={() => window.location.reload()}>{translate(locale, 'common.retry')}</button>
      </div>
    );
  }
}
