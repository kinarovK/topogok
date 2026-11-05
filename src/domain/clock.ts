export type TimeSource = { wallNow: () => number; monoNow: () => number };

export type Clock = { elapsed: () => number };

/**
 * Monotonic elapsed time: max(wall-clock delta, monotonic delta, previous value).
 * Wall-clock is included so that time spent while the device sleeps is counted even where the
 * monotonic source pauses; setting the wall clock back never decreases the value; setting it
 * forward can only make the round expire earlier (documented client-side limitation).
 */
export function createClock(src: TimeSource): Clock {
  const wall0 = src.wallNow();
  const mono0 = src.monoNow();
  let last = 0;
  return {
    elapsed() {
      const v = Math.max(src.wallNow() - wall0, src.monoNow() - mono0, last, 0);
      last = v;
      return v;
    },
  };
}

export const browserTimeSource: TimeSource = {
  wallNow: () => Date.now(),
  monoNow: () => performance.now(),
};

export function limitMs(minutes: number | null): number | null {
  return minutes === null ? null : minutes * 60_000;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function format(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Countdown display: whole seconds rounded up. */
export function formatRemaining(ms: number): string {
  return format(Math.max(0, Math.ceil(ms / 1000)));
}

/** Elapsed / result display: whole seconds rounded down. */
export function formatDuration(ms: number): string {
  return format(Math.max(0, Math.floor(ms / 1000)));
}
