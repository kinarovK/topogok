// Records a logged-in student's round and saves it with two requests: start and finish (F3_DESIGN §1, §3).
// The round never waits for the network: if the start fails, the round goes on as a guest round.
// Pending saves live only in memory (no localStorage) and are dropped on logout.
import type { GameConfiguration, GameEvent } from '../domain/types.ts';
import { api, ApiFailure, type AttemptResult, type WireEvent } from './api.ts';

export type SaveStatus =
  | 'starting'   // start request in flight, round in progress
  | 'recording'  // round has a server id
  | 'unsaved'    // start failed: this round will not be saved
  | 'pending'    // finish not yet acknowledged (offline, server busy); retrying
  | 'saved'
  | 'failed'     // the server refused the finish (e.g. signed out); the user may retry
  | 'rejected'   // the server replayed the round and found it invalid
  | 'discarded'; // dropped on logout

const MAX_DELAY = 60_000;
const live = new Set<RoundRecorder>();

/** Logout: pending saves of the previous user are dropped, never sent with another account. */
export function discardAllRounds(): void {
  for (const r of [...live]) r.discard();
}

const retryable = (e: unknown) => e instanceof ApiFailure && (e.status === 0 || e.status === 429 || e.status >= 500);

export class RoundRecorder {
  private status: SaveStatus = 'starting';
  private readonly listeners = new Set<() => void>();
  private readonly events: WireEvent[] = [];
  private readonly attemptId: Promise<string | null>;
  private closed = false;
  private finishBody: { reason: 'completed' | 'quit'; events?: WireEvent[]; visibleMs?: number } | null = null;
  private delay = 2_000;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private visibleMs = 0;
  private visibleSince: number | null;
  result: AttemptResult | null = null;

  constructor(config: GameConfiguration, dataVersion: string, seed: number) {
    live.add(this);
    this.visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
    this.attemptId = api.startAttempt({
      topicId: config.topicId, dataVersion, mode: config.mode, count: config.count, seed,
      ...(config.mode === 'practice' ? { showElapsed: config.showElapsed } : { timeLimitMinutes: config.timeLimitMinutes }),
    }).then(
      (r) => { if (this.status === 'starting') this.set('recording'); return r.attemptId; },
      () => { this.set('unsaved'); this.cleanup(); return null; },
    );
  }

  getStatus = (): SaveStatus => this.status;
  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  get isClosed(): boolean { return this.closed; }

  /** Only events that changed the game state are recorded (the server rejects no-op events). */
  record(e: GameEvent): void {
    if (this.closed) return;
    const w: WireEvent = e.type === 'SELECT' ? { type: 'SELECT', t: Math.round(e.elapsedMs), f: e.featureId } : { type: e.type, t: Math.round(e.elapsedMs) };
    const last = this.events[this.events.length - 1];
    // Consecutive selections collapse into the last one: before a selection run the selection is always empty,
    // so the remaining event still changes the state on replay.
    if (w.type === 'SELECT' && last?.type === 'SELECT') this.events[this.events.length - 1] = { ...w, t: Math.max(w.t, last.t) };
    else this.events.push(w);
  }

  finish(reason: 'completed' | 'quit'): void {
    if (this.closed) return;
    this.closed = true;
    this.stopVisible();
    this.finishBody = reason === 'completed' ? { reason, events: this.events, visibleMs: Math.round(this.visibleMs) } : { reason };
    if (this.status === 'unsaved' || this.status === 'discarded') return;
    this.set('pending');
    void this.send();
  }

  /** Manual retry from the result screen. */
  retry(): void {
    if (this.status !== 'failed' || !this.finishBody) return;
    this.delay = 2_000;
    this.set('pending');
    void this.send();
  }

  discard(): void {
    if (this.status === 'saved' || this.status === 'rejected') { this.cleanup(); return; }
    this.closed = true;
    this.set('discarded');
    this.cleanup();
  }

  private async send(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const id = await this.attemptId;
    if (!id || !this.finishBody || this.status !== 'pending') return;
    try {
      const r = await api.finishAttempt(id, this.finishBody);
      if (this.status !== 'pending') return;
      this.result = r;
      this.set(r.status === 'invalid' ? 'rejected' : 'saved');
      this.cleanup();
    } catch (e) {
      if (this.status !== 'pending') return;
      if (!retryable(e)) { this.set('failed'); return; }
      this.timer = setTimeout(() => { void this.send(); }, this.delay);
      this.delay = Math.min(this.delay * 2, MAX_DELAY);
    }
  }

  private readonly onOnline = () => { if (this.status === 'pending') void this.send(); };
  private readonly onVisibility = () => {
    if (this.closed) return;
    if (document.visibilityState === 'visible') this.visibleSince ??= performance.now();
    else this.stopVisible();
  };
  private stopVisible() {
    if (this.visibleSince !== null) { this.visibleMs += performance.now() - this.visibleSince; this.visibleSince = null; }
  }
  private set(s: SaveStatus) { this.status = s; for (const l of this.listeners) l(); }
  private cleanup() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
    if (this.closed || this.status === 'unsaved') live.delete(this);
  }
}
