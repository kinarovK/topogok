// Pre-projection for topics drawn on a whole-world style map (as the world topic): every coordinate is
// projected to a world projection, then stored as the Web Mercator "display" lon/lat that MapLibre draws.
// The central meridian moves the map's cut away from the topic, so nothing is torn at ±180°.
import type { Pos } from './wkb.ts';

export type ProjectionName = 'robinson' | 'mollweide' | 'hammer' | 'laea' | 'lcc' | 'albers' | 'miller';
/**
 * centralMeridian: the map's middle meridian (the cut moves to the opposite side).
 * center: oblique aspect – this lon/lat becomes the middle of the map (e.g. [0, -90] puts the South Pole in the
 * middle of a world map); rotation turns the map around that centre (degrees).
 * parallels: the two standard parallels of a conic projection ('lcc' conformal, 'albers' equal-area); the map's
 * vertical middle is their mean. 'laea' (Lambert azimuthal equal-area) is meant with `center`.
 */
export type ProjectionConfig = { name: ProjectionName; centralMeridian?: number; center?: [number, number]; rotation?: number; parallels?: [number, number] };

/** Oblique aspect: rotates the sphere so that `center` moves to (0, 0), then turns by `rotation`. */
function rotate(cfg: ProjectionConfig, [lon, lat]: Pos): Pos {
  if (!cfg.center) return [lon, lat];
  const [l0, p0] = cfg.center; const g = (cfg.rotation ?? 0) * RAD;
  const l = (lon - l0) * RAD; const p = lat * RAD; const c = p0 * RAD;
  let x = Math.cos(p) * Math.cos(l); let y = Math.cos(p) * Math.sin(l); let z = Math.sin(p);
  [x, z] = [x * Math.cos(c) + z * Math.sin(c), -x * Math.sin(c) + z * Math.cos(c)];
  [y, z] = [y * Math.cos(g) - z * Math.sin(g), y * Math.sin(g) + z * Math.cos(g)];
  return [Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD];
}

const RAD = Math.PI / 180;
const ROBINSON: number[][] = [
  [1.0, 0.0], [0.9986, 0.062], [0.9954, 0.124], [0.99, 0.186], [0.9822, 0.248], [0.973, 0.31], [0.96, 0.372], [0.9427, 0.434], [0.9216, 0.4958],
  [0.8962, 0.5571], [0.8679, 0.6176], [0.835, 0.6769], [0.7986, 0.7346], [0.7597, 0.7903], [0.7186, 0.8435], [0.6732, 0.8936], [0.6213, 0.9394],
  [0.5722, 0.9761], [0.5322, 1.0],
];
function cubic(col: number, lat: number): number {
  const t = Math.min(Math.max(Math.abs(lat), 0), 90) / 5; const i = Math.min(Math.floor(t), 17); const f = t - i;
  const v = (k: number) => (k < 0 ? 2 * ROBINSON[0]![col]! - ROBINSON[1]![col]! : k > 18 ? 2 * ROBINSON[18]![col]! - ROBINSON[17]![col]! : ROBINSON[k]![col]!);
  const p0 = v(i - 1), p1 = v(i), p2 = v(i + 1), p3 = v(i + 2);
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

/** Plane coordinates scaled so that the equator spans ±π (like the Web Mercator x range). */
function planeXY(cfg: ProjectionConfig, lon: number, lat: number): [number, number] {
  const l = lon * RAD; const p = lat * RAD;
  switch (cfg.name) {
    // Miller cylindrical: straight parallels and meridians, as on many school wall maps of Eurasia.
    case 'miller': return [l, 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * Math.max(-89.9 * RAD, Math.min(89.9 * RAD, p))))];
    case 'laea': {
      const k = Math.sqrt(2 / Math.max(1e-12, 1 + Math.cos(p) * Math.cos(l)));
      return [k * Math.cos(p) * Math.sin(l), k * Math.sin(p)];
    }
    case 'lcc': {
      const [a, b] = (cfg.parallels ?? [30, 60]).map((v) => v * RAD) as [number, number]; const p0 = (a + b) / 2;
      const t = (v: number) => Math.tan(Math.PI / 4 + Math.max(-89.5 * RAD, Math.min(89.5 * RAD, v)) / 2);
      const n = a === b ? Math.sin(a) : Math.log(Math.cos(a) / Math.cos(b)) / Math.log(t(b) / t(a));
      const F = (Math.cos(a) * t(a) ** n) / n; const rho = F / t(p) ** n; const rho0 = F / t(p0) ** n;
      return [rho * Math.sin(n * l), rho0 - rho * Math.cos(n * l)];
    }
    case 'albers': {
      const [a, b] = (cfg.parallels ?? [30, 60]).map((v) => v * RAD) as [number, number]; const p0 = (a + b) / 2;
      const n = (Math.sin(a) + Math.sin(b)) / 2; const C = Math.cos(a) ** 2 + 2 * n * Math.sin(a);
      const rho = (v: number) => Math.sqrt(Math.max(0, C - 2 * n * Math.sin(v))) / n;
      return [rho(p) * Math.sin(n * l), rho(p0) - rho(p) * Math.cos(n * l)];
    }
    case 'robinson': return [cubic(0, lat) * l, Math.sign(lat) * cubic(1, lat) * (1.3523 / 0.8487)];
    case 'mollweide': {
      let t = p;
      for (let k = 0; k < 30; k++) { const d = (2 * t + Math.sin(2 * t) - Math.PI * Math.sin(p)) / (2 + 2 * Math.cos(2 * t)); t -= d; if (Math.abs(d) < 1e-10 || !Number.isFinite(d)) break; }
      if (!Number.isFinite(t)) t = Math.sign(p) * Math.PI / 2;
      return [l * Math.cos(t), (Math.PI / 2) * Math.sin(t)];
    }
    case 'hammer': {
      const d = Math.sqrt(1 + Math.cos(p) * Math.cos(l / 2));
      return [(Math.PI / 2) * (Math.cos(p) * Math.sin(l / 2)) / d, (Math.PI / 4) * Math.sin(p) / d];
    }
  }
}

/** Same scale as the world topic (src/data world pipeline): the projected world is drawn at half size. */
export const DISPLAY_SCALE = 0.5;

export function projectPos(cfg: ProjectionConfig, [lon, lat]: Pos): Pos {
  const [x, y] = planeXY(cfg, lon, lat);
  const X = x * DISPLAY_SCALE; const Y = y * DISPLAY_SCALE;
  return [X / RAD, (2 * Math.atan(Math.exp(Y)) - Math.PI / 2) / RAD];
}

/** Longitude relative to the central meridian, in [-180, 180]. */
const rel = (lon: number, cm: number) => { let v = lon - cm; while (v > 180) v -= 360; while (v < -180) v += 360; return v; };

/** Inserts points so that no step exceeds `step` degrees (projected edges follow the curved graticule). */
function densify(line: Pos[], step = 1): Pos[] {
  const out: Pos[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!; const b = line[i]!;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(line[line.length - 1]!);
  return out;
}

/** Unwraps a path so consecutive longitudes never jump by more than 180°. */
function unwrap(path: Pos[], cm: number): Pos[] {
  const out: Pos[] = [];
  for (const [lon, lat] of path) {
    let x = rel(lon, cm);
    const prev = out[out.length - 1];
    if (prev) { while (x - prev[0] > 180) x -= 360; while (x - prev[0] < -180) x += 360; }
    out.push([x, lat]);
  }
  return out;
}

/** Sutherland–Hodgman against x <= max (sign 1) or x >= min (sign -1) for a closed ring. */
function clipRing(ring: Pos[], edge: number, keepBelow: boolean): Pos[] {
  const inside = (p: Pos) => (keepBelow ? p[0] <= edge : p[0] >= edge);
  const out: Pos[] = [];
  const pts = ring.slice(0, -1);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!; const b = pts[(i + 1) % pts.length]!;
    const cross = (): Pos => { const t = (edge - a[0]) / (b[0] - a[0]); return [edge, a[1] + t * (b[1] - a[1])]; };
    if (inside(a)) { out.push(a); if (!inside(b)) out.push(cross()); } else if (inside(b)) out.push(cross());
  }
  if (out.length) out.push(out[0]!);
  return out;
}

/**
 * A ring (lon/lat) relative to the central meridian, cut at the map edge: returns pieces inside [-180, 180].
 * A ring that goes once around a pole (e.g. Antarctica) is closed along the pole.
 */
export function cutRing(ring: Pos[], cm: number): Pos[][] {
  let u = unwrap(ring, cm);
  const drift = u[u.length - 1]![0] - u[0]![0];
  if (Math.abs(drift) > 180) {
    // Polar ring: close along the pole (south if the ring lies in the southern hemisphere).
    const poleLat = u.reduce((s, p) => s + p[1], 0) / u.length < 0 ? -90 : 90;
    const last = u[u.length - 1]!; const first = u[0]!;
    u = [...u.slice(0, -1), [last[0], poleLat], [first[0], poleLat], first];
  }
  const pieces: Pos[][] = [];
  for (const shift of [-360, 0, 360]) {
    const shifted = u.map(([x, y]): Pos => [x + shift, y]);
    let r = clipRing(shifted, 180, true);
    if (r.length >= 4) r = clipRing(r, -180, false);
    if (r.length >= 4) pieces.push(r);
  }
  return pieces;
}

const prep = (cfg: ProjectionConfig, r: Pos[]) => (cfg.center ? densify(r, 0.5).map((p) => rotate(cfg, p)) : r);

/** Map frame: the oblique rotation, or longitudes relative to the central meridian (both put the cut at ±180°). */
function toFrame(cfg: ProjectionConfig, r: Pos[]): Pos[] {
  const d = densifyWrapped(r, 0.5);
  return cfg.center ? d.map((p) => rotate(cfg, p)) : d.map(([lon, lat]): Pos => [rel(lon, cfg.centralMeridian ?? 0), lat]);
}

/**
 * Source data is often split at ±180° (and closed along the pole). Such seam edges are removed and the open chains
 * are re-joined across the seam (a chain ending at 180°/lat continues with the one starting at −180°/lat), so the
 * map shows no seam line and a ring around the pole closes. Rings without seam edges stay as they are.
 */
export function stitchSeam(polys: Pos[][][]): { kept: Pos[][][]; stitched: Pos[][] } {
  const E = 1e-3;
  const onSeam = (p: Pos) => Math.abs(Math.abs(p[0]) - 180) < E || Math.abs(Math.abs(p[1]) - 90) < E;
  const seamEdge = (a: Pos, b: Pos) => onSeam(a) && onSeam(b) && (Math.abs(a[0] - b[0]) < E || Math.abs(Math.abs(a[1]) - 90) < E || Math.abs(Math.abs(b[1]) - 90) < E || Math.abs(Math.abs(a[0] - b[0]) - 360) < E);
  const out: Pos[][][] = [];
  const chains: Pos[][] = [];
  const loose: Pos[][] = []; // uncut rings (holes, islets) of a polygon whose outline was cut: re-nested later
  for (const poly of polys) {
    const kept: Pos[][] = [];
    let wasCut = false;
    for (const ring of poly) {
      const n = ring.length - 1;
      const cut = ring.slice(0, n).map((p, i) => seamEdge(p, ring[i + 1]!));
      if (!cut.some(Boolean)) { kept.push(ring); continue; }
      wasCut = true;
      // Rotate so the ring starts right after a seam edge, then split into chains at seam edges.
      const s0 = cut.findIndex(Boolean) + 1;
      let cur: Pos[] = [];
      for (let k = 0; k < n; k++) {
        const i = (s0 + k) % n;
        cur.push(ring[i]!);
        if (cut[i]) { if (cur.length >= 2) chains.push(cur); cur = []; }
      }
      if (cur.length >= 2) chains.push(cur);
    }
    if (wasCut) loose.push(...kept); else if (kept.length) out.push(kept);
  }
  if (!chains.length) return { kept: polys, stitched: [] };
  // Join chains end-to-start at the seam: the start whose latitude is closest on the opposite side.
  const used = new Set<number>();
  const rings: Pos[][] = [];
  for (let i = 0; i < chains.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let ring = [...chains[i]!];
    for (let guard = 0; guard < chains.length; guard++) {
      const end = ring[ring.length - 1]!;
      let best = -1; let bestD = Infinity;
      for (let j = 0; j < chains.length; j++) {
        if (used.has(j) && j !== i) continue;
        const st = chains[j]![0]!;
        const d = Math.abs(st[1] - end[1]) + (Math.sign(st[0]) === Math.sign(end[0]) && Math.abs(end[1]) < 90 - E ? 1000 : 0);
        if (d < bestD) { bestD = d; best = j; }
      }
      if (best === i || best < 0) break;
      used.add(best);
      ring = ring.concat(chains[best]!);
    }
    ring.push(ring[0]!);
    if (ring.length >= 4) rings.push(ring);
  }
  return { kept: out, stitched: [...rings, ...loose] };
}

/** Planar ring area (signed) and point-in-ring, in map-frame coordinates. */
const ringArea = (r: Pos[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const inRing = (p: Pos, r: Pos[]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i]!; const b = r[j]!; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

/** Re-joined rings become polygons again: a ring inside a larger one is its hole (e.g. an ocean band). */
function nestRings(rings: Pos[][]): Pos[][][] {
  const sorted = [...rings].sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const polys: Pos[][][] = [];
  for (const r of sorted) {
    const host = polys.find((poly) => inRing(r[Math.floor(r.length / 2)]!, poly[0]!) && !poly.slice(1).some((h) => inRing(r[0]!, h)));
    if (host) host.push(ringArea(r) > 0 ? [...r].reverse() : r);
    else polys.push([ringArea(r) < 0 ? [...r].reverse() : r]);
  }
  return polys;
}

/** densify, but across ±180° the short way round (seam-joined rings step from 180° to −180°). */
function densifyWrapped(line: Pos[], step: number): Pos[] {
  const out: Pos[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!; let b = line[i]!;
    if (b[0] - a[0] > 180) b = [b[0] - 360, b[1]]; else if (a[0] - b[0] > 180) b = [b[0] + 360, b[1]];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(line[line.length - 1]!);
  return out;
}

/** Projects polygons: map frame, seams healed, cut at the map edge, projected. */
export function projectPolygons(cfg: ProjectionConfig, polys: Pos[][][]): Pos[][][] {
  // Source edges are straight in lon/lat: an edge from −180° to 180° runs along the whole parallel (e.g. the outline of
  // an ocean band after simplification). Densified here, before stitching, so later steps never read it as a seam jump.
  const { kept, stitched } = stitchSeam(polys.map((poly) => poly.map((r) => densify(r, 1))));
  const framed = [...kept.map((poly) => poly.map((r) => toFrame(cfg, r))), ...nestRings(stitched.map((r) => toFrame(cfg, r)))];
  return framed.flatMap((poly) => projectFramed(cfg, poly));
}

function projectFramed(cfg: ProjectionConfig, poly: Pos[][]): Pos[][][] {
  const outerPieces = cutRing(poly[0]!, 0);
  const holes = poly.slice(1).flatMap((h) => cutRing(h, 0));
  const proj = (r: Pos[]) => densify(r).map((p) => projectPos(cfg, p));
  // Holes go to the piece that contains them (by their first vertex); pieces from a cut rarely have holes.
  return outerPieces.map((outer) => {
    const xs = outer.map((p) => p[0]);
    const mine = holes.filter((h) => h[0]![0] >= Math.min(...xs) && h[0]![0] <= Math.max(...xs));
    return [proj(outer), ...mine.map(proj)];
  });
}

export function projectLine(cfg: ProjectionConfig, line: Pos[]): Pos[][] {
  const cm = cfg.center ? 0 : cfg.centralMeridian ?? 0;
  const u = densify(unwrap(prep(cfg, line), cm), 1);
  // Split where the unwrapped line leaves [-180, 180] (rare: a line across the cut).
  const parts: Pos[][] = [[]];
  for (const p of u) {
    const x = ((p[0] + 540) % 360) - 180;
    const cur = parts[parts.length - 1]!;
    const prev = cur[cur.length - 1];
    if (prev && Math.abs(x - prev[0]) > 180) parts.push([]);
    parts[parts.length - 1]!.push([x, p[1]]);
  }
  return parts.filter((l) => l.length >= 2).map((l) => l.map((p) => projectPos(cfg, p)));
}

export function projectPoint(cfg: ProjectionConfig, p: Pos): Pos {
  const q = rotate(cfg, p);
  return projectPos(cfg, [rel(q[0], cfg.center ? 0 : cfg.centralMeridian ?? 0), q[1]]);
}

