// Service worker registration and safe, user-initiated updates.
// Rules (docs/OPERATIONS.md): never reload an active round; update only on explicit action while this
// tab is idle and no other tab reports an active round; unknown peer state defers the update.
import { registerSW } from 'virtual:pwa-register';
import { topicBaseUrl } from '../data/topicRegistry.ts';

export type PwaState = {
  offlineReady: boolean;
  /** Offline-ready was just reached (first install) and has not been dismissed. */
  offlineJustReady: boolean;
  needRefresh: boolean;
  blockedByOtherTab: boolean;
  dismissed: boolean;
};

let state: PwaState = { offlineReady: false, offlineJustReady: false, needRefresh: false, blockedByOtherTab: false, dismissed: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<PwaState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export const pwaStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,
};

// --- activity coordination between tabs ---
const tabId = Math.random().toString(36).slice(2);
export type Activity = 'idle' | 'round' | 'result';
let activity: Activity = 'idle';
const busy = () => activity !== 'idle';
/** Last state each peer announced; kept across queries so a silent (frozen) busy tab still counts. */
const peers = new Map<string, boolean>();
let replies: Map<string, boolean> | null = null;
const channel: BroadcastChannel | null = typeof BroadcastChannel === 'function' ? new BroadcastChannel('topogok-activity') : null;
channel?.addEventListener('message', (e: MessageEvent) => {
  const m = e.data as { type: string; from: string; busy?: boolean };
  if (!m || m.from === tabId) return;
  if (m.type === 'query') channel.postMessage({ type: 'state', from: tabId, busy: busy() });
  if (m.type === 'state' || m.type === 'announce') { peers.set(m.from, !!m.busy); replies?.set(m.from, !!m.busy); }
  if (m.type === 'bye') peers.delete(m.from);
});
window.addEventListener('pagehide', () => channel?.postMessage({ type: 'bye', from: tabId }));

/** Called by the app on every view change: a running round, an unsaved result, or idle. */
export function setActivity(value: Activity) {
  activity = value;
  channel?.postMessage({ type: 'announce', from: tabId, busy: busy() });
  if (value === 'idle' && state.blockedByOtherTab) set({ blockedByOtherTab: false });
}

async function anyPeerBusy(): Promise<boolean> {
  if (!channel) return true; // unknown peer state: defer
  replies = new Map();
  channel.postMessage({ type: 'query', from: tabId });
  await new Promise((r) => setTimeout(r, 350));
  const got = replies;
  replies = null;
  if ([...got.values()].some(Boolean)) return true;
  // A peer that last said "busy" and did not answer (frozen/background) is treated as busy.
  return [...peers].some(([id, wasBusy]) => wasBusy && !got.has(id));
}

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let requestedHere = false;
let activatedElsewhere = false;

/** `discardResult`: the user confirmed losing the on-screen result (results view only). */
export async function requestUpdate(discardResult = false): Promise<'started' | 'busy' | 'peer-busy' | 'unavailable'> {
  const locallyBusy = () => activity === 'round' || (activity === 'result' && !discardResult);
  if (!updateSW || !state.needRefresh) return 'unavailable';
  if (locallyBusy()) return 'busy';
  if (activatedElsewhere) { window.location.reload(); return 'started'; }
  if (await anyPeerBusy()) { set({ blockedByOtherTab: true }); return 'peer-busy'; }
  if (locallyBusy()) return 'busy';
  requestedHere = true;
  await updateSW(true);
  return 'started';
}

export function dismissUpdate() { set({ dismissed: true }); }
export function dismissOfflineReady() { set({ offlineJustReady: false }); }

/** Offline readiness is reported only from a real cache hit of the app shell and the data package. */
async function cacheHasPackage(): Promise<boolean> {
  if (!('caches' in window)) return false;
  const urls = [`${import.meta.env.BASE_URL}index.html`, `${topicBaseUrl}manifest.json`, `${topicBaseUrl}regions.geojson`, `${topicBaseUrl}country.geojson`];
  const hits = await Promise.all(urls.map((u) => caches.match(new URL(u, location.href).href, { ignoreSearch: true })));
  return hits.every(Boolean);
}

export async function initPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  updateSW = registerSW({
    immediate: true,
    onOfflineReady() {
      void navigator.serviceWorker.ready.then(async () => {
        // The SW may not control this first page yet; check the cache directly.
        const ok = await cacheHasPackage();
        if (ok) set({ offlineReady: true, offlineJustReady: true });
      });
    },
    onNeedRefresh() { set({ needRefresh: true, dismissed: false }); },
    onNeedReload() {
      // Reload only if this tab asked for the update AND no round has started in the meantime.
      if (requestedHere && activity !== 'round') window.location.reload();
      else { requestedHere = false; activatedElsewhere = true; set({ needRefresh: true, dismissed: false }); }
    },
  });
  if (navigator.serviceWorker.controller && (await cacheHasPackage())) set({ offlineReady: true });
}
