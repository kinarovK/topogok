// F6: collects page-leave intervals during a signed-in student's assessment. Sent with the existing finish
// request (no extra traffic). This is an event log, not proof: see F6_DESIGN.md.
import type { Interval, IntegrityLog } from '../../shared/integrity.ts';

export type IntegrityNotice = { kind: 'hidden'; ms: number } | { kind: 'blur' } | { kind: 'offline' } | { kind: 'online' };

export class IntegrityTracker {
  private readonly t0 = performance.now();
  private readonly log: IntegrityLog = { hidden: [], blur: [], offline: [] };
  private open: Partial<Record<keyof IntegrityLog, number>> = {};
  private stopped = false;

  private readonly notify: (n: IntegrityNotice) => void;

  constructor(notify: (n: IntegrityNotice) => void) {
    this.notify = notify;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('offline', this.onOffline);
    window.addEventListener('online', this.onOnline);
    if (document.visibilityState === 'hidden') this.begin('hidden');
    if (!navigator.onLine) this.begin('offline');
  }

  private now() { return Math.round(performance.now() - this.t0); }
  private begin(k: keyof IntegrityLog) { if (this.open[k] === undefined) this.open[k] = this.now(); }
  private end(k: keyof IntegrityLog): number | null {
    const from = this.open[k];
    if (from === undefined) return null;
    delete this.open[k];
    const iv: Interval = [from, this.now()];
    this.log[k].push(iv);
    return iv[1] - iv[0];
  }

  private readonly onVisibility = () => {
    if (this.stopped) return;
    if (document.visibilityState === 'hidden') this.begin('hidden');
    else { const ms = this.end('hidden'); if (ms !== null) this.notify({ kind: 'hidden', ms }); }
  };
  private readonly onBlur = () => { if (!this.stopped) this.begin('blur'); };
  private readonly onFocus = () => {
    if (this.stopped) return;
    const ms = this.end('blur');
    // A focus loss that was really a page hide is reported once, as "hidden".
    if (ms !== null && document.visibilityState === 'visible' && this.log.hidden.every(([, b]) => this.now() - b > 1000)) this.notify({ kind: 'blur' });
  };
  private readonly onOffline = () => { if (!this.stopped) { this.begin('offline'); this.notify({ kind: 'offline' }); } };
  private readonly onOnline = () => { if (!this.stopped && this.end('offline') !== null) this.notify({ kind: 'online' }); };

  /** Ends the log (open intervals are closed at this moment) and detaches the listeners. */
  finish(): IntegrityLog {
    if (!this.stopped) {
      for (const k of ['hidden', 'blur', 'offline'] as const) this.end(k);
      this.stop();
    }
    return this.log;
  }

  stop() {
    this.stopped = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('online', this.onOnline);
  }
}
