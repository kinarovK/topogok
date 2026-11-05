// Dependency-free planar/ellipsoidal geometry checks used by the data pipeline.
// Coordinates are [longitude, latitude] in EPSG:4326.
export type Pos = [number, number];
export type Ring = Pos[];
export type PolygonCoords = Ring[]; // [shell, ...holes]

export type Issue = { featureId: string; code: string; detail: string };

/** Planar signed area in degree² (shoelace). Positive = counter-clockwise. */
export function signedArea(ring: Ring): number {
  let s = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function pointInRing(p: Pos, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

type Seg = { ax: number; ay: number; bx: number; by: number; ring: number; idx: number; owner: string };

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function onSegment(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return Math.min(ax, bx) <= cx && cx <= Math.max(ax, bx) && Math.min(ay, by) <= cy && cy <= Math.max(ay, by);
}

/**
 * Classifies the relation of two segments.
 * 'none' = disjoint; 'touch' = they meet only at a shared endpoint;
 * 'cross' = interiors intersect at a point; 'overlap' = collinear overlap of positive length.
 */
export function segmentRelation(s: Seg, t: Seg): 'none' | 'touch' | 'cross' | 'overlap' {
  const o1 = orient(s.ax, s.ay, s.bx, s.by, t.ax, t.ay);
  const o2 = orient(s.ax, s.ay, s.bx, s.by, t.bx, t.by);
  const o3 = orient(t.ax, t.ay, t.bx, t.by, s.ax, s.ay);
  const o4 = orient(t.ax, t.ay, t.bx, t.by, s.bx, s.by);
  const sameP = (x1: number, y1: number, x2: number, y2: number) => x1 === x2 && y1 === y2;
  const shared =
    (sameP(s.ax, s.ay, t.ax, t.ay) ? 1 : 0) + (sameP(s.ax, s.ay, t.bx, t.by) ? 1 : 0) +
    (sameP(s.bx, s.by, t.ax, t.ay) ? 1 : 0) + (sameP(s.bx, s.by, t.bx, t.by) ? 1 : 0);
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
    // collinear
    const tA = onSegment(s.ax, s.ay, s.bx, s.by, t.ax, t.ay);
    const tB = onSegment(s.ax, s.ay, s.bx, s.by, t.bx, t.by);
    const sA = onSegment(t.ax, t.ay, t.bx, t.by, s.ax, s.ay);
    const sB = onSegment(t.ax, t.ay, t.bx, t.by, s.bx, s.by);
    const count = (tA ? 1 : 0) + (tB ? 1 : 0) + (sA ? 1 : 0) + (sB ? 1 : 0);
    if (count === 0) return 'none';
    if (shared === 2) return 'overlap'; // identical segment
    if (shared === 1 && count === 2) return 'touch';
    return 'overlap';
  }
  if (o1 !== o2 && o3 !== o4) {
    return shared >= 1 ? 'touch' : 'cross';
  }
  // T-junction: an endpoint lies in the interior of the other segment
  if ((o1 === 0 && onSegment(s.ax, s.ay, s.bx, s.by, t.ax, t.ay)) ||
      (o2 === 0 && onSegment(s.ax, s.ay, s.bx, s.by, t.bx, t.by)) ||
      (o3 === 0 && onSegment(t.ax, t.ay, t.bx, t.by, s.ax, s.ay)) ||
      (o4 === 0 && onSegment(t.ax, t.ay, t.bx, t.by, s.bx, s.by))) {
    return shared >= 1 ? 'touch' : 'cross';
  }
  return 'none';
}

/** Uniform grid spatial index for segment-pair candidate generation. */
export function forEachCandidatePair(segs: Seg[], cell: number, fn: (a: Seg, b: Seg) => void): void {
  const grid = new Map<string, number[]>();
  segs.forEach((s, i) => {
    const x0 = Math.floor(Math.min(s.ax, s.bx) / cell);
    const x1 = Math.floor(Math.max(s.ax, s.bx) / cell);
    const y0 = Math.floor(Math.min(s.ay, s.by) / cell);
    const y1 = Math.floor(Math.max(s.ay, s.by) / cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x}:${y}`;
      const list = grid.get(k);
      if (list) list.push(i); else grid.set(k, [i]);
    }
  });
  const seen = new Set<number>();
  const n = segs.length;
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const i = Math.min(list[a]!, list[b]!);
      const j = Math.max(list[a]!, list[b]!);
      const key = i * n + j;
      if (seen.has(key)) continue;
      seen.add(key);
      fn(segs[i]!, segs[j]!);
    }
  }
}

export function ringSegments(ring: Ring, ringIndex: number, owner: string): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    out.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], ring: ringIndex, idx: i, owner });
  }
  return out;
}

/**
 * Validates one polygon (shell + holes) following OGC simple-feature rules that GEOS enforces:
 * closed rings, ≥4 positions, finite coordinates, no self-intersection, rings may touch only at
 * isolated points, holes lie inside the shell and not inside each other.
 */
export function validatePolygon(featureId: string, poly: PolygonCoords): Issue[] {
  const issues: Issue[] = [];
  if (poly.length === 0) return [{ featureId, code: 'empty', detail: 'polygon has no rings' }];
  poly.forEach((ring, r) => {
    if (ring.length < 4) issues.push({ featureId, code: 'ring-too-short', detail: `ring ${r} has ${ring.length} positions` });
    for (const p of ring) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) {
        issues.push({ featureId, code: 'bad-coordinate', detail: `ring ${r}: ${p[0]},${p[1]}` });
        break;
      }
    }
    const f = ring[0];
    const l = ring[ring.length - 1];
    if (!f || !l || f[0] !== l[0] || f[1] !== l[1]) issues.push({ featureId, code: 'ring-not-closed', detail: `ring ${r}` });
    if (Math.abs(signedArea(ring)) === 0) issues.push({ featureId, code: 'zero-area-ring', detail: `ring ${r}` });
  });
  if (issues.length) return issues;

  const segs = poly.flatMap((ring, r) => ringSegments(ring, r, featureId));
  const touchPoints = new Map<string, number>();
  forEachCandidatePair(segs, 0.05, (a, b) => {
    if (a.ring === b.ring) {
      const n = poly[a.ring]!.length - 1;
      const adjacent = Math.abs(a.idx - b.idx) === 1 || Math.abs(a.idx - b.idx) === n - 1;
      const rel = segmentRelation(a, b);
      if (adjacent) {
        if (rel === 'overlap') issues.push({ featureId, code: 'spike', detail: `ring ${a.ring} segments ${a.idx}/${b.idx}` });
        return;
      }
      if (rel !== 'none') issues.push({ featureId, code: 'self-intersection', detail: `ring ${a.ring} segments ${a.idx}/${b.idx} (${rel})` });
    } else {
      const rel = segmentRelation(a, b);
      if (rel === 'cross' || rel === 'overlap') {
        issues.push({ featureId, code: 'ring-intersection', detail: `rings ${a.ring}/${b.ring} (${rel})` });
      } else if (rel === 'touch') {
        const k = `${a.ring}-${b.ring}`;
        touchPoints.set(k, (touchPoints.get(k) ?? 0) + 1);
      }
    }
  });
  for (const [k, count] of touchPoints) {
    // A single shared vertex yields up to 4 touching segment pairs; more means a shared edge chain.
    if (count > 4) issues.push({ featureId, code: 'rings-touch-along-line', detail: `rings ${k}: ${count} touching pairs` });
  }
  const shell = poly[0]!;
  for (let h = 1; h < poly.length; h++) {
    const hole = poly[h]!;
    const probe = hole.find((p) => !shell.some((q) => q[0] === p[0] && q[1] === p[1]));
    if (probe && !pointInRing(probe, shell)) issues.push({ featureId, code: 'hole-outside-shell', detail: `ring ${h}` });
    for (let g = 1; g < poly.length; g++) {
      if (g === h) continue;
      const p = hole[0]!;
      if (pointInRing(p, poly[g]!)) issues.push({ featureId, code: 'nested-holes', detail: `ring ${h} in ring ${g}` });
    }
  }
  return issues;
}

/**
 * Groups shapefile parts into polygons. Shapefile convention: shells clockwise, holes counter-clockwise.
 * Returns GeoJSON-oriented polygons (RFC 7946: shells counter-clockwise, holes clockwise).
 */
export function partsToPolygons(featureId: string, parts: Ring[]): { polygons: PolygonCoords[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const shells: Ring[] = [];
  const holes: Ring[] = [];
  for (const part of parts) {
    if (signedArea(part) < 0) shells.push(part); else holes.push(part);
  }
  const polygons: PolygonCoords[] = shells.map((s) => [[...s].reverse()]);
  for (const hole of holes) {
    const probe = hole[0]!;
    const owners = shells.map((s, i) => (pointInRing(probe, s) ? i : -1)).filter((i) => i >= 0);
    if (owners.length !== 1) {
      issues.push({ featureId, code: 'orphan-hole', detail: `hole has ${owners.length} candidate shells` });
      continue;
    }
    polygons[owners[0]!]!.push([...hole].reverse());
  }
  return { polygons, issues };
}

// --- Ellipsoidal Lambert azimuthal equal-area (Snyder 1987, eqs. 3-12, 24-2) on WGS 84 ---
const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const rad = Math.PI / 180;

function qOf(sinPhi: number): number {
  return (1 - E2) * (sinPhi / (1 - E2 * sinPhi * sinPhi) - (1 / (2 * E)) * Math.log((1 - E * sinPhi) / (1 + E * sinPhi)));
}

export function makeLaea(lon0: number, lat0: number): (p: Pos) => Pos {
  const qp = qOf(1);
  const Rq = A * Math.sqrt(qp / 2);
  const beta = (phi: number) => Math.asin(qOf(Math.sin(phi)) / qp);
  const b1 = beta(lat0 * rad);
  const m1 = Math.cos(lat0 * rad) / Math.sqrt(1 - E2 * Math.sin(lat0 * rad) ** 2);
  const D = (A * m1) / (Rq * Math.cos(b1));
  return ([lon, lat]) => {
    const b = beta(lat * rad);
    const dl = (lon - lon0) * rad;
    const B = Rq * Math.sqrt(2 / (1 + Math.sin(b1) * Math.sin(b) + Math.cos(b1) * Math.cos(b) * Math.cos(dl)));
    const x = B * D * Math.cos(b) * Math.sin(dl);
    const y = (B / D) * (Math.cos(b1) * Math.sin(b) - Math.sin(b1) * Math.cos(b) * Math.cos(dl));
    return [x, y];
  };
}

/** Area in m² of a polygon set, computed in an equal-area projection (vertices projected, straight edges). */
export function projectedArea(polys: PolygonCoords[], project: (p: Pos) => Pos): number {
  let total = 0;
  for (const poly of polys) {
    poly.forEach((ring, i) => {
      const a = Math.abs(signedArea(ring.map(project)));
      total += i === 0 ? a : -a;
    });
  }
  return total;
}

export function bboxOf(polys: PolygonCoords[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of polys) for (const p of poly[0]!) {
    w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]);
  }
  return [w, s, e, n];
}
