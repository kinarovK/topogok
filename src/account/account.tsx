import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiFailure, type Me } from './api.ts';
import { discardAllRounds } from './recorder.ts';

/**
 * unknown: still asking the server; guest: no session (or no API, e.g. offline) — the app works as before.
 * The user object lives only in memory: nothing personal goes to localStorage or the PWA cache (F2-08).
 */
type AccountState = { status: 'unknown' } | { status: 'guest'; offline: boolean } | { status: 'user'; me: Me };

type AccountApi = {
  state: AccountState;
  me: Me | null;
  refresh: () => Promise<void>;
  /** Re-reads the session in the background (teacher settings may have changed); a failed request changes nothing. */
  revalidate: () => void;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AccountApi | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>({ status: 'unknown' });
  const refresh = useCallback(() => api.me().then(
    (me) => setState(me ? { status: 'user', me } : { status: 'guest', offline: false }),
    (e: unknown) => setState({ status: 'guest', offline: e instanceof ApiFailure && e.code === 'offline' }),
  ), []);
  const revalidate = useCallback(() => {
    api.me().then(
      (me) => setState((cur) => {
        const next: AccountState = me ? { status: 'user', me } : { status: 'guest', offline: false };
        return JSON.stringify(cur) === JSON.stringify(next) ? cur : next;
      }),
      () => { /* offline or a server hiccup: keep the current state */ },
    );
  }, []);
  // A phone keeps the app open for days: coming back to it re-reads the session, so a student never plays
  // with an outdated question set.
  const loggedIn = state.status === 'user';
  useEffect(() => {
    if (!loggedIn) return;
    const h = () => { if (document.visibilityState === 'visible') revalidate(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [loggedIn, revalidate]);
  useEffect(() => {
    let alive = true;
    api.me().then(
      (me) => { if (alive) setState(me ? { status: 'user', me } : { status: 'guest', offline: false }); },
      (e: unknown) => { if (alive) setState({ status: 'guest', offline: e instanceof ApiFailure && e.code === 'offline' }); },
    );
    return () => { alive = false; };
  }, []);
  const value = useMemo<AccountApi>(() => ({
    state,
    me: state.status === 'user' ? state.me : null,
    refresh,
    revalidate,
    async login(login, password) { await api.login(login, password); await refresh(); },
    async logout() {
      discardAllRounds(); // pending saves belong to the user who played them (F3_DESIGN §3)
      try { await api.logout(); } finally {
        try { sessionStorage.clear(); } catch { /* storage may be unavailable */ }
        setState({ status: 'guest', offline: false });
      }
    },
  }), [state, refresh, revalidate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): AccountApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount outside AccountProvider');
  return v;
}
