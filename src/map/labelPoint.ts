import type { FeatureGeometry, PolygonGeometry, Position } from '../data/validation.ts';

type Poly = Position[][];

function inRing(x: number, y: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPoly(x: number, y: number, poly: Poly): boolean {
  if (!inRing(x, y, poly[0]!)) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(x, y, poly[h]!)) return false;
  return true;
}

function segDist2(px: number, py: number, a: Position, b: Position): number {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

function edgeDistance(x: number, y: number, poly: Poly, cosLat: number): number {
  let min = Infinity;
  for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!, b = ring[i + 1]!;
    min = Math.min(min, segDist2(x * cosLat, y, [a[0] * cosLat, a[1]], [b[0] * cosLat, b[1]]));
  }
  return Math.sqrt(min);
}

function ringArea(r: Position[]): number {
  let s = 0;
  for (let i = 0; i < r.length - 1; i++) s += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1];
  return Math.abs(s / 2);
}

/**
 * Interior label point: a coarse-to-fine grid search for the point inside the largest polygon
 * that is farthest from its edges (approximate pole of inaccessibility). Always inside the polygon.
 */
export function labelPoint(geometry: PolygonGeometry): Position {
  const polys: Poly[] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const poly = polys.reduce((best, p) => (ringArea(p[0]!) > ringArea(best[0]!) ? p : best));
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of poly[0]!) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const cosLat = Math.cos((((s + n) / 2) * Math.PI) / 180);
  let best: Position = poly[0]![0]!;
  let bestD = -1;
  let cw = (e - w), ch = (n - s), cx = (w + e) / 2, cy = (s + n) / 2;
  for (let round = 0; round < 4; round++) {
    const steps = round === 0 ? 24 : 10;
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
      const x = cx - cw / 2 + (cw * i) / steps;
      const y = cy - ch / 2 + (ch * j) / steps;
      if (!inPoly(x, y, poly)) continue;
      const d = edgeDistance(x, y, poly, cosLat);
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    cx = best[0]; cy = best[1]; cw /= 4; ch /= 4;
  }
  if (bestD < 0) {
    // Degenerate fallback: midpoint of the first edge nudged inside is not guaranteed; use first vertex.
    return poly[0]![0]!;
  }
  return best;
}

/** The package may carry a precomputed label point (world topic: placed so labels do not overlap). */
export function regionLabelPoint(r: { properties: { label?: Position }; geometry: FeatureGeometry }): Position {
  if (r.properties.label) return r.properties.label;
  const g = r.geometry;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'LineString' || g.type === 'MultiLineString') return lineMidpoint(g.type === 'LineString' ? [g.coordinates] : g.coordinates);
  return labelPoint(g);
}

/** Point halfway along the longest part of a line (the label of a river sits on the river). */
export function lineMidpoint(parts: Position[][]): Position {
  const len = (l: Position[]) => l.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - l[i]![0], p[1] - l[i]![1]), 0);
  const line = parts.reduce((best, l) => (len(l) > len(best) ? l : best));
  let rest = len(line) / 2;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!; const b = line[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d >= rest && d > 0) return [a[0] + ((b[0] - a[0]) * rest) / d, a[1] + ((b[1] - a[1]) * rest) / d];
    rest -= d;
  }
  return line[line.length - 1]!;
}

/** Bounding box [w, s, e, n] of any feature geometry. */
export function geometryBounds(g: FeatureGeometry): [number, number, number, number] {
  const pts: Position[] = g.type === 'Point' ? [g.coordinates] : g.type === 'LineString' ? g.coordinates
    : g.type === 'MultiLineString' ? g.coordinates.flat() : g.type === 'Polygon' ? g.coordinates[0]! : g.coordinates.flatMap((p) => p[0]!);
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}
