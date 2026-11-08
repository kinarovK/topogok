import type { RegionKind } from '../data/validation.ts';

export type HitCandidate = { id: string; kind: RegionKind };

/**
 * Chooses one feature ID from the rendered features under a pointer.
 * Order: deduplicate, city polygons above surrounding units, then stable ID order.
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
    return pa - pb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  return list[0]!.id;
}
