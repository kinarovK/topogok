// Coastline for the continent topics (owner decision 2026-11-16): the base map is one continent cut from Natural
// Earth 1:50m land, land areas are clipped to that land and seas to the water, so hand-drawn areas no longer spill
// into the sea (or seas onto land). Islands and land pieces join the continent whose 1:110m outline (world topic)
// is nearest; the cut between Africa and Eurasia or the two Americas follows that outline.
import type { PolygonCoords } from './geometry.ts';
import { combine, emptyMask, fill, makeGrid, trace, type Grid, type Mask } from './raster.ts';
import { readSource } from './sources.ts';
import type { Geometry } from './wkb.ts';

export type CoastConfig = {
  /** Detailed land polygons (Natural Earth 1:50m land). */
  land: string;
  /** Continent outlines with an `id` field (world topic: build/world/world_continents.shp). */
  continents: string;
  /** The continent of this topic (an `id` in `continents`). */
  continent: string;
  /** Grid cell in degrees (default 0.025° ≈ 2.8 km). */
  cell?: number;
  /** Area layers and single areas that are sea: clipped to the water instead of the land. */
  seaLayers?: string[];
  seaIds?: string[];
  /** Areas kept as drawn (lakes, reefs). */
  keepIds?: string[];
  /** Island groups: the drawn outline ∩ the land grown by `islandBuffer` degrees, so small islands stay visible and tappable. */
  islandIds?: string[];
  islandBuffer?: number;
  /**
   * Relief units (plains, mountains, highlands, basins, deserts) must not overlap: each land cell belongs to one of
   * them – the listed `priorityIds` first, then the smaller unit. Outline features (peninsulas, islands, matched by
   * `outlineIds` or `outlinePattern` on the id) keep their full shape and may contain relief units. `cuts` lets an
   * outline (a mountain system containing its ranges) still cut back the listed neighbours.
   */
  partition?: { outlineIds?: string[]; outlinePattern?: RegExp; priorityIds?: string[]; cuts?: Record<string, string[]> };
};

/** Grows the filled cells by a radius of `r` cells (each cell joins when its nearest seed is close enough). */
function dilate(m: Mask, r: number): Mask {
  const { w, h } = m.grid; const out = { grid: m.grid, data: m.data.slice() };
  const seed = new Int32Array(w * h).fill(-1); const queue = new Int32Array(w * h); let head = 0; let tail = 0;
  for (let i = 0; i < m.data.length; i++) if (m.data[i]) { seed[i] = i; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++]!; const s0 = seed[i]!; const sx = s0 % w; const sy = (s0 - sx) / w;
    const x = i % w; const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx; if (seed[j]! >= 0 || (nx - sx) ** 2 + (ny - sy) ** 2 > r * r) continue;
      seed[j] = s0; out.data[j] = 1; queue[tail++] = j;
    }
  }
  return out;
}

const polysOf = (g: Geometry | null): PolygonCoords[] => (!g ? [] : g.type === 'Polygon' ? [g.coordinates as PolygonCoords] : g.type === 'MultiPolygon' ? (g.coordinates as PolygonCoords[]) : []);
type BBox = [number, number, number, number];
const bboxOf = (polys: PolygonCoords[]): BBox => {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys) for (const p of poly[0] ?? []) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
  return b;
};
const union = (a: BBox, b: BBox): BBox => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const overlaps = (a: BBox, b: BBox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** The cells of `src` that fall inside the (aligned) window `grid`. */
function window(src: Mask, grid: Grid): Mask {
  const out = emptyMask(grid);
  const dx = Math.round((grid.lon0 - src.grid.lon0) / grid.cell); const dy = Math.round((src.grid.lat0 - grid.lat0) / grid.cell);
  for (let y = 0; y < grid.h; y++) {
    const sy = y + dy; if (sy < 0 || sy >= src.grid.h) continue;
    for (let x = 0; x < grid.w; x++) { const sx = x + dx; if (sx >= 0 && sx < src.grid.w) out.data[y * grid.w + x] = src.data[sy * src.grid.w + sx]!; }
  }
  return out;
}

export type ClipItem = { id: string; layer: string; polys: PolygonCoords[] };
/** `clipAll` gives each area's new polygons, or null for an area kept as drawn. */
export type Coast = { base: PolygonCoords[]; clipAll: (items: ClipItem[]) => Map<string, PolygonCoords[] | null> };

/** `extent`: every question polygon of the topic, so the grid covers all of them. */
export function prepareCoast(cfg: CoastConfig, resolvePath: (p: string) => string, extent: PolygonCoords[]): Coast {
  const cell = cfg.cell ?? 0.025;
  const tol = cell * 0.8;
  const refs = readSource(resolvePath(cfg.continents)).flatMap((l) => l.features).map((f) => ({ id: String(f.props['id'] ?? ''), polys: polysOf(f.geometry) }));
  const own = refs.find((r) => r.id === cfg.continent);
  if (!own) throw new Error(`continent ${cfg.continent} not found in ${cfg.continents}`);
  const box = union(bboxOf(own.polys), bboxOf(extent));
  const grid = makeGrid(box, cell);
  const gridBox: BBox = [grid.lon0, grid.lat0 - grid.h * cell, grid.lon0 + grid.w * cell, grid.lat0];

  const landPolys = readSource(resolvePath(cfg.land)).flatMap((l) => l.features.flatMap((f) => polysOf(f.geometry))).filter((p) => overlaps(bboxOf([p]), gridBox));
  const land = fill(emptyMask(grid), landPolys);

  // Continent labels on a coarse grid: the 1:110m outlines, then every other cell takes the nearest label.
  const coarse = makeGrid(box, 0.25);
  const label = emptyMask(coarse);
  refs.forEach((r, i) => fill(label, r.polys, i + 1));
  const queue = new Int32Array(coarse.w * coarse.h); let head = 0; let tail = 0;
  for (let i = 0; i < label.data.length; i++) if (label.data[i]) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++]!; const x = i % coarse.w; const y = (i - x) / coarse.w;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= coarse.w || ny >= coarse.h) continue;
      const j = ny * coarse.w + nx; if (!label.data[j]) { label.data[j] = label.data[i]!; queue[tail++] = j; }
    }
  }
  const target = refs.indexOf(own) + 1;
  const continent = emptyMask(grid);
  for (let y = 0; y < grid.h; y++) {
    const cy = Math.min(coarse.h - 1, Math.max(0, Math.floor((coarse.lat0 - (grid.lat0 - (y + 0.5) * cell)) / coarse.cell)));
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x; if (!land.data[i]) continue;
      const cx = Math.min(coarse.w - 1, Math.max(0, Math.floor((grid.lon0 + (x + 0.5) * cell - coarse.lon0) / coarse.cell)));
      if (label.data[cy * coarse.w + cx] === target) continent.data[i] = 1;
    }
  }
  const base = trace(continent, tol, 4);

  const clipAll = (items: ClipItem[]): Map<string, PolygonCoords[] | null> => {
    const out = new Map<string, PolygonCoords[] | null>();
    const kind = (x: ClipItem) => cfg.keepIds?.includes(x.id) ? 'keep'
      : cfg.islandIds?.includes(x.id) ? 'island'
      : cfg.seaLayers?.includes(x.layer) || cfg.seaIds?.includes(x.id) ? 'sea'
      : !cfg.partition || cfg.partition.outlineIds?.includes(x.id) || cfg.partition.outlinePattern?.test(x.id) ? 'outline' : 'relief';
    // Cells already given to a lake or a relief unit.
    const claimed = emptyMask(grid);
    const claim = (m: Mask) => {
      const dx = Math.round((m.grid.lon0 - grid.lon0) / cell); const dy = Math.round((grid.lat0 - m.grid.lat0) / cell);
      for (let y = 0; y < m.grid.h; y++) for (let x = 0; x < m.grid.w; x++) {
        const gx = x + dx, gy = y + dy;
        if (m.data[y * m.grid.w + x] && gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h) claimed.data[gy * grid.w + gx] = 1;
      }
    };
    const relief: Array<{ item: ClipItem; mask: Mask; cells: number }> = [];
    const cutters = new Map<string, Mask>();
    for (const [cutter, targets] of Object.entries(cfg.partition?.cuts ?? {})) {
      const c = items.find((x) => x.id === cutter);
      if (c) for (const t of targets) { const m = cutters.get(t) ?? emptyMask(grid); const sub = makeGrid(bboxOf(c.polys), cell, cell * 2); const f = fill(emptyMask(sub), c.polys); cutters.set(t, m); const dx = Math.round((sub.lon0 - grid.lon0) / cell); const dy = Math.round((grid.lat0 - sub.lat0) / cell); for (let y = 0; y < sub.h; y++) for (let xx = 0; xx < sub.w; xx++) { const gx = xx + dx, gy = y + dy; if (f.data[y * sub.w + xx] && gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h) m.data[gy * grid.w + gx] = 1; } }
    }
    for (const x of items) {
      const k = kind(x);
      const sub = makeGrid(bboxOf(x.polys), cell, cell * 2);
      const area = fill(emptyMask(sub), x.polys);
      if (k === 'keep') { out.set(x.id, null); claim(area); continue; }
      if (k === 'island') { out.set(x.id, trace(combine(area, dilate(window(land, sub), Math.round((cfg.islandBuffer ?? 0.4) / cell)), 'and'), tol * 2)); continue; }
      let m = combine(area, window(land, sub), k === 'sea' ? 'andNot' : 'and');
      const cut = cutters.get(x.id); if (cut) m = combine(m, window(cut, sub), 'andNot');
      if (k === 'relief') { let n = 0; for (const v of m.data) n += v; relief.push({ item: x, mask: m, cells: n }); continue; }
      out.set(x.id, trace(m, tol));
    }
    const prio = cfg.partition?.priorityIds ?? [];
    const rank = (r: (typeof relief)[number]) => (prio.includes(r.item.id) ? prio.indexOf(r.item.id) - prio.length : 0);
    relief.sort((a, b) => rank(a) - rank(b) || a.cells - b.cells || (a.item.id < b.item.id ? -1 : 1));
    for (const r of relief) {
      const m = combine(r.mask, window(claimed, r.mask.grid), 'andNot');
      claim(m);
      out.set(r.item.id, trace(m, tol));
    }
    return out;
  };
  return { base, clipAll };
}
