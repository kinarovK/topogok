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
    async login(login, password) { await api.login(login, password); await refresh(); },
    async logout() {
      discardAllRounds(); // pending saves belong to the user who played them (F3_DESIGN §3)
      try { await api.logout(); } finally {
        try { sessionStorage.clear(); } catch { /* storage may be unavailable */ }
        setState({ status: 'guest', offline: false });
      }
    },
  }), [state, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): AccountApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount outside AccountProvider');
  return v;
}
