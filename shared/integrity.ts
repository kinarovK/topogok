// F6: page-leave intervals. Shared by the browser (collecting) and the server (validating/normalising).
export type Interval = [number, number];
export type IntegrityLog = { hidden: Interval[]; blur: Interval[]; offline: Interval[] };
export type IntegritySummary = { hiddenCount: number; hiddenMs: number; blurCount: number; blurMs: number; offlineCount: number; offlineMs: number };

export const INTEGRITY_VERSION = 1;
const MAX_INTERVALS = 200;

/** Clamps to [0, end], drops empty ones, sorts and merges overlapping or touching intervals. */
export function mergeIntervals(list: readonly Interval[], end: number): Interval[] {
  const clean = list
    .map(([a, b]): Interval => [Math.max(0, Math.min(a, end)), Math.max(0, Math.min(b, end))])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const iv of clean) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** Removes the parts of `list` covered by `cover` (both merged): the same absence is not counted twice. */
export function subtract(list: readonly Interval[], cover: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a0, b] of list) {
    let a = a0;
    for (const [c, d] of cover) {
      if (d <= a || c >= b) continue;
      if (c > a) out.push([a, c]);
      a = Math.max(a, d);
      if (a >= b) break;
    }
    if (a < b) out.push([a, b]);
  }
  return out;
}

export function normalize(log: IntegrityLog, end: number): IntegrityLog {
  const hidden = mergeIntervals(log.hidden, end).slice(0, MAX_INTERVALS);
  return {
    hidden,
    blur: subtract(mergeIntervals(log.blur, end), hidden).slice(0, MAX_INTERVALS),
    offline: mergeIntervals(log.offline, end).slice(0, MAX_INTERVALS),
  };
}

const total = (l: Interval[]) => l.reduce((s, [a, b]) => s + (b - a), 0);
export function summarize(log: IntegrityLog): IntegritySummary {
  return {
    hiddenCount: log.hidden.length, hiddenMs: total(log.hidden),
    blurCount: log.blur.length, blurMs: total(log.blur),
    offlineCount: log.offline.length, offlineMs: total(log.offline),
  };
}

/** Parses untrusted input; null when the shape is wrong. */
export function parseLog(v: unknown): IntegrityLog | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const list = (x: unknown): Interval[] | null => {
    if (!Array.isArray(x) || x.length > 2 * MAX_INTERVALS) return null;
    const r: Interval[] = [];
    for (const iv of x) {
      if (!Array.isArray(iv) || iv.length !== 2 || !iv.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
      r.push([Math.round(iv[0] as number), Math.round(iv[1] as number)]);
    }
    return r;
  };
  const hidden = list(o['hidden']); const blur = list(o['blur']); const offline = list(o['offline']);
  return hidden && blur && offline ? { hidden, blur, offline } : null;
}
