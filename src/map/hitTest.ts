import type { RegionKind } from '../data/validation.ts';

/** `area`: the feature's size (any planar unit); when areas overlap, the smaller one is the more specific target. */
export type HitCandidate = { id: string; kind: RegionKind; area?: number | undefined };

/**
 * Chooses one feature ID from the rendered features under a pointer.
 * Order: deduplicate, city polygons above surrounding units, then the smallest area (a sea inside an ocean, a
 * mountain range inside a region: owner decision 2026-11-16), then stable ID order.
 * The question's correct answer is never an input here.
 */
export function pickFeatureId(candidates: readonly HitCandidate[], allowed: ReadonlySet<string>): string | null {
  const seen = new Map<string, HitCandidate>();
  for (const c of candidates) if (allowed.has(c.id) && !seen.has(c.id)) seen.set(c.id, c);
  const list = [...seen.values()];
  if (list.length === 0) return null;
  list.sort((a, b) => {
    const pa = a.kind === 'city' ? 0 : 1;
    const pb = b.kind === 'city' ? 0 : 1;
    return pa - pb || (a.area ?? 0) - (b.area ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  return list[0]!.id;
}

/** Thin target (line or point) with its distance to the tap in CSS pixels. */
export type NearCandidate = { id: string; distance: number };
export type ScreenPoint = { x: number; y: number };

/** Distance from a point to a polyline (or a single vertex), all in screen pixels. */
export function distanceToPath(p: ScreenPoint, path: readonly ScreenPoint[]): number {
  if (path.length === 1) return Math.hypot(p.x - path[0]!.x, p.y - path[0]!.y);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!; const b = path[i]!;
    const dx = b.x - a.x; const dy = b.y - a.y; const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/**
 * Tap buffer (0005 §5): the nearest line or point within `buffer` px wins, because a thin target always lies on
 * top of an area and would otherwise be impossible to hit; with nothing thin in reach, the area under the tap wins.
 * Ties go to the stable id order. Neither the question nor its type is an input (owner decision 2026-11-16).
 */
export function pickTarget(areaHits: readonly HitCandidate[], near: readonly NearCandidate[], allowed: ReadonlySet<string>, buffer: number): string | null {
  const thin = near.filter((c) => allowed.has(c.id) && c.distance <= buffer)
    .sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (thin.length) return thin[0]!.id;
  return pickFeatureId(areaHits, allowed);
}

/** Default buffer sizes in CSS px; the superadmin can change them (app settings). */
export const DEFAULT_TAP_BUFFER = { touch: 22, mouse: 10 } as const;
export const TAP_BUFFER_LIMITS = { touch: [8, 48], mouse: [4, 30] } as const;
