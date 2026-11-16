// Raster polygon clipping for the continent topics: polygons are burnt into a lon/lat grid, combined cell by cell
// (land ∩ area, area − land …) and traced back into polygons. Robust for any input (no vector clipping
// degeneracies); the price is a stair-step outline that is smoothed with Douglas–Peucker, about one cell
// (≈2–3 km) of accuracy, far below what a continent map shows.
import { pointInRing, validatePolygon, type PolygonCoords } from './geometry.ts';
import type { Pos } from './wkb.ts';

/** A window of the global grid: cell (0, 0) is the north-west corner. */
export type Grid = { lon0: number; lat0: number; cell: number; w: number; h: number };
export type Mask = { grid: Grid; data: Uint8Array };

export function makeGrid(bbox: [number, number, number, number], cell: number, pad = 0.5): Grid {
  const snap = (v: number, f: (x: number) => number) => f(v / cell) * cell;
  const lon0 = Math.max(-180, snap(bbox[0] - pad, Math.floor)); const lon1 = Math.min(180, snap(bbox[2] + pad, Math.ceil));
  const lat1 = Math.max(-90, snap(bbox[1] - pad, Math.floor)); const lat0 = Math.min(90, snap(bbox[3] + pad, Math.ceil));
  return { lon0, lat0, cell, w: Math.round((lon1 - lon0) / cell), h: Math.round((lat0 - lat1) / cell) };
}

export const emptyMask = (grid: Grid): Mask => ({ grid, data: new Uint8Array(grid.w * grid.h) });

/** Burns polygons into the mask (even–odd within one polygon, union between polygons); a cell counts by its centre. */
export function fill(mask: Mask, polys: PolygonCoords[], value = 1): Mask {
  const { lon0, lat0, cell, w, h } = mask.grid;
  for (const poly of polys) {
    let minY = Infinity; let maxY = -Infinity;
    for (const r of poly) for (const p of r) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const rowA = Math.max(0, Math.floor((lat0 - maxY) / cell)); const rowB = Math.min(h - 1, Math.ceil((lat0 - minY) / cell));
    if (rowA > rowB) continue;
    const xs: number[][] = Array.from({ length: rowB - rowA + 1 }, () => []);
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i]!; const [bx, by] = ring[i + 1]!;
        if (ay === by) continue;
        const yLo = Math.min(ay, by); const yHi = Math.max(ay, by);
        // Rows whose centre latitude c satisfies yLo <= c < yHi.
        // One row of slack on both sides; the exact test below decides (rounding must never skip a row).
        const r0 = Math.max(rowA, Math.floor((lat0 - yHi) / cell - 0.5)); const r1 = Math.min(rowB, Math.ceil((lat0 - yLo) / cell - 0.5));
        for (let r = r0; r <= r1; r++) {
          const c = lat0 - (r + 0.5) * cell;
          if (c < yLo || c >= yHi) continue;
          xs[r - rowA]!.push(ax + ((c - ay) * (bx - ax)) / (by - ay));
        }
      }
    }
    for (let k = 0; k < xs.length; k++) {
      const row = xs[k]!; if (row.length < 2) continue;
      row.sort((a, b) => a - b);
      const base = (rowA + k) * w;
      for (let i = 0; i + 1 < row.length; i += 2) {
        const c0 = Math.max(0, Math.ceil((row[i]! - lon0) / cell - 0.5)); const c1 = Math.min(w - 1, Math.ceil((row[i + 1]! - lon0) / cell - 0.5) - 1);
        for (let c = c0; c <= c1; c++) mask.data[base + c] = value;
      }
    }
  }
  return mask;
}

/** Cell-wise combination of masks on the same grid. */
export function combine(a: Mask, b: Mask, op: 'and' | 'andNot'): Mask {
  const out = emptyMask(a.grid);
  for (let i = 0; i < out.data.length; i++) out.data[i] = op === 'and' ? (a.data[i]! && b.data[i]! ? 1 : 0) : (a.data[i]! && !b.data[i]! ? 1 : 0);
  return out;
}

export const count = (m: Mask) => { let n = 0; for (const v of m.data) n += v; return n; };

/** Fills one empty cell of every diagonal-only contact, so traced rings never touch at a corner. */
function removeSaddles(m: Mask) {
  const { w, h } = m.grid; const d = m.data;
  // Filling a cell can create a new diagonal contact with an earlier row: repeat until none is left.
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y + 1 < h; y++) for (let x = 0; x + 1 < w; x++) {
      const a = d[y * w + x]!, b = d[y * w + x + 1]!, c = d[(y + 1) * w + x]!, e = d[(y + 1) * w + x + 1]!;
      if (a && e && !b && !c) { d[y * w + x + 1] = 1; changed = true; }
      else if (b && c && !a && !e) { d[y * w + x] = 1; changed = true; }
    }
  }
}

function dp(points: Pos[], tol: number): Pos[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; const [ax, ay] = points[a]!; const [bx, by] = points[b]!;
    const dx = bx - ax, dy = by - ay; const len = Math.hypot(dx, dy) || 1e-12;
    let best = -1; let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]!;
      const d = len < 1e-12 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Closed ring simplification that keeps the ring's two farthest-apart vertices. */
function simplifyRing(ring: Pos[], tol: number): Pos[] {
  if (tol <= 0) return ring;
  const open = ring.slice(0, -1);
  let far = 0; let farD = -1;
  for (let i = 1; i < open.length; i++) { const d = Math.hypot(open[i]![0] - open[0]![0], open[i]![1] - open[0]![1]); if (d > farD) { farD = d; far = i; } }
  const a = dp(open.slice(0, far + 1), tol); const b = dp([...open.slice(far), open[0]!], tol);
  return [...a, ...b.slice(1)];
}

const signedArea = (r: Pos[]) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1]; return s / 2; };

/**
 * Traces the filled cells into polygons (outer rings with their holes). `tol` smooths the stair steps (degrees);
 * components smaller than `minCells` cells are dropped.
 */
export function trace(mask: Mask, tol: number, minCells = 2): PolygonCoords[] {
  const m: Mask = { grid: mask.grid, data: mask.data.slice() };
  removeSaddles(m);
  const { lon0, lat0, cell, w, h } = m.grid; const d = m.data;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? d[y * w + x]! : 0);
  // Directed boundary edges, filled cell on the right (screen coordinates, y down); one outgoing edge per corner.
  const next = new Map<number, number>();
  const W = w + 1; const id = (x: number, y: number) => y * W + x;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!d[y * w + x]) continue;
    if (!at(x, y - 1)) next.set(id(x, y), id(x + 1, y));
    if (!at(x + 1, y)) next.set(id(x + 1, y), id(x + 1, y + 1));
    if (!at(x, y + 1)) next.set(id(x + 1, y + 1), id(x, y + 1));
    if (!at(x - 1, y)) next.set(id(x, y + 1), id(x, y));
  }
  const rings: Pos[][] = [];
  for (const start of [...next.keys()]) {
    if (!next.has(start)) continue;
    const corners: number[] = []; let cur = start;
    while (next.has(cur)) { corners.push(cur); const n = next.get(cur)!; next.delete(cur); cur = n; }
    // Keep only the corners where the direction changes.
    const pts: Pos[] = [];
    for (let i = 0; i < corners.length; i++) {
      const p = corners[(i - 1 + corners.length) % corners.length]!, c = corners[i]!, q = corners[(i + 1) % corners.length]!;
      if (c - p !== q - c) pts.push([lon0 + (c % W) * cell, lat0 - Math.floor(c / W) * cell]);
    }
    if (pts.length >= 3) rings.push([...pts, pts[0]!]);
  }
  // Filled cells on the right: outer rings come out clockwise on the map (negative area), holes counter-clockwise.
  const minArea = minCells * cell * cell;
  const outers = rings.filter((r) => -signedArea(r) >= minArea).map((r) => [r] as PolygonCoords);
  const holes = rings.filter((r) => signedArea(r) >= minArea);
  type Box = [number, number, number, number];
  const bb = (r: Pos[]): Box => r.reduce<Box>((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  const outerBoxes = outers.map((o) => bb(o[0]!));
  for (const hole of holes) {
    const p = hole[0]!;
    // The smallest containing outer ring is the hole's own island.
    let best = -1; let bestA = Infinity;
    outers.forEach((o, i) => {
      const b = outerBoxes[i]!;
      if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) return;
      const a = -signedArea(o[0]!);
      if (a < bestA && pointInRing([p[0] + cell * 0.25, p[1] - cell * 0.25], o[0]!)) { best = i; bestA = a; }
    });
    if (best >= 0) outers[best]!.push(hole);
  }
  // Smoothing can make a narrow part cross itself: then that polygon is smoothed less, down to the exact stair
  // steps, which are always valid (no diagonal contacts are left).
  return outers.map((poly) => {
    for (let t = tol; ; t = t > tol / 8 ? t / 2 : 0) {
      const out = poly.map((r) => simplifyRing(r, t)).filter((r) => r.length >= 4);
      if (t === 0 || (out.length === poly.length && validatePolygon('trace', out).length === 0)) return out;
    }
  });
}
