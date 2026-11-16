// Generic, convention-based topic builder for mixed topics (areas, lines, points).
// See docs/project/tasks/0005_MIXED_GEOMETRY/task.md §3.
//
//   node scripts/data/topic.ts <config.ts> [--out <dir>] [--check]
//
// The config names the source (a folder of .shp/.geojson files, one .gpkg, or one file); every layer of the
// source becomes part of ONE question set, whatever its geometry. Fields by convention: id, name_hu, name_uk.
// A layer called "hatter" or "background" is the map base and is not asked.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { pointInRing, validatePolygon, type PolygonCoords } from './geometry.ts';
import { projectLine, projectPoint, projectPolygons, type ProjectionConfig } from './projection.ts';
import { readSource, type SourceLayer } from './sources.ts';
import type { Geometry, Pos } from './wkb.ts';

export type LocalizedText = { hu: string; uk: string };
export type TopicConfig = {
  id: string;
  dataVersion: string;
  title: LocalizedText;
  /** Source path relative to the repository root (folder, .gpkg, .shp or .geojson). */
  source: string;
  /** Map base when the source has no "hatter" layer: another source (e.g. world land), relative to the repo root. */
  background?: string;
  /** Only these base features (matched on the base's `id` field), e.g. one continent of a world land layer. */
  backgroundIds?: string[];
  /** Base simplification tolerance in degrees (default 0.01°). */
  simplifyBackground?: number;
  /** World-map style projection (pre-projected like the world topic); without it the map is Web Mercator. */
  projection?: ProjectionConfig;
  /** Only layers whose name starts with this prefix (one GeoPackage holding several topics); the prefix is dropped. */
  layerPrefix?: string;
  /** Optional per-layer field renames when a source does not follow id / name_hu / name_uk. */
  fields?: Record<string, { id?: string; name_hu?: string; name_uk?: string }>;
  /** Area layers drawn as water (seas, oceans) instead of land. */
  waterLayers?: string[];
  /** Single area features drawn as water although their layer is land (a lake or bay among the regions). */
  waterIds?: string[];
  /** Optional per-layer titles for the teacher's checklist (default: the layer name). */
  layerTitles?: Record<string, LocalizedText>;
  /** Area layers whose features must not overlap each other (e.g. countries). */
  coverage?: string[];
  /** Area simplification tolerance in degrees, per layer (default 0.01°); detailed coastlines would exceed the size budget. */
  simplifyAreas?: Record<string, number>;
  /** Line simplification tolerance in degrees, per layer (default 0.005°). */
  simplify?: Record<string, number>;
  provenance: { source: string | null; sourceUrl: string | null; license: string | null; licenseUrl: string | null; status: 'unverified' | 'verified' };
};

export type GeomType = 'area' | 'line' | 'point';
type OutFeature = { type: 'Feature'; id: string; properties: { id: string; names: LocalizedText; kind: 'generic' | 'ocean'; geomType: GeomType; layer: string }; geometry: Geometry };
type Check = { id: string; status: 'pass' | 'warn' | 'fail'; detail: string };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BACKGROUND = /^(hatter|háttér|background)$/i;
const MAX_GZIP_BYTES = 1_500_000;
const DEFAULT_TOLERANCE = 0.005;
const DEFAULT_AREA_TOLERANCE = 0.01;

/**
 * Simplifies every ring (closed, so both ends stay). Rings that collapse below 4 positions are dropped unless they
 * are a polygon's outer ring; a polygon whose outer ring collapses (a tiny islet) is dropped while another remains.
 */
export function simplifyPolygons(polys: PolygonCoords[], tol: number): PolygonCoords[] {
  if (tol <= 0) return polys;
  const ring = (r: Pos[]) => { const open = simplifyLine(r.slice(0, -1).concat([r[0]!]), tol); return open; };
  const out: PolygonCoords[] = [];
  for (const poly of polys) {
    const outer = ring(poly[0]!);
    if (outer.length < 4) continue;
    out.push([outer, ...poly.slice(1).map(ring).filter((h) => h.length >= 4)]);
  }
  if (out.length) return out;
  // Keep at least the largest original polygon so that no feature disappears.
  const size = (p: PolygonCoords) => p[0]!.length;
  return [polys.reduce((a, b) => (size(b) > size(a) ? b : a))];
}
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const round = (v: number) => Math.round(v * 1e6) / 1e6;
const finitePos = (p: Pos) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

/** Douglas–Peucker in degrees; always keeps both ends. */
export function simplifyLine(line: Pos[], tol: number): Pos[] {
  if (line.length <= 2 || tol <= 0) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = 1; keep[line.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = line[a]!; const [bx, by] = line[b]!;
    const dx = bx - ax; const dy = by - ay; const len2 = dx * dx + dy * dy;
    let best = -1; let dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = line[i]!;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > dmax) { dmax = d; best = i; }
    }
    if (best >= 0 && dmax > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return line.filter((_, i) => keep[i]);
}

/**
 * Joins line parts whose ends meet (within `snap` degrees, ~1 km by default) into continuous lines, reversing parts
 * where needed: a river exported as hundreds of two-point segments, or with small gaps between its pieces, would
 * otherwise be simplified piece by piece and drawn with gaps. Branches (a delta) stay separate parts.
 */
export function mergeLineParts(parts: Pos[][], snap = 0.01): Pos[][] {
  const left = parts.filter((l) => l.length >= 2).map((l) => [...l]);
  const used = new Set<number>();
  const dist = (a: Pos, b: Pos) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // The nearest free part end within the snap distance: [part index, whether it is that part's start].
  const nearest = (tip: Pos): [number, boolean] | undefined => {
    let best: [number, boolean] | undefined; let bestD = snap;
    left.forEach((l, j) => {
      if (used.has(j)) return;
      for (const atStart of [true, false]) { const d = dist(tip, atStart ? l[0]! : l[l.length - 1]!); if (d <= bestD) { bestD = d; best = [j, atStart]; } }
    });
    return best;
  };
  const out: Pos[][] = [];
  for (let i = 0; i < left.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let line = left[i]!;
    for (const atEnd of [true, false]) {
      for (;;) {
        const hit = nearest(atEnd ? line[line.length - 1]! : line[0]!);
        if (!hit) break;
        used.add(hit[0]);
        const part = left[hit[0]]!;
        if (atEnd) line = dedupe([...line, ...(hit[1] ? part : [...part].reverse())]);
        else line = dedupe([...(hit[1] ? [...part].reverse() : part), ...line]);
      }
    }
    out.push(line);
  }
  return out;
}

/** Removes A–B–A back-and-forth spikes from a closed ring (they come from near-duplicate vertices). */
export function removeSpikes(ring: Pos[]): Pos[] {
  const same = (a: Pos, b: Pos) => a[0] === b[0] && a[1] === b[1];
  let pts = ring.slice(0, -1); let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length >= 3; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length]!; const next = pts[(i + 1) % pts.length]!;
      if (same(prev, next)) { pts.splice(i, 1); pts = pts.filter((p, k) => k === 0 || !same(p, pts[k - 1]!)); changed = true; break; }
    }
  }
  if (pts.length && same(pts[0]!, pts[pts.length - 1]!)) pts.pop();
  return pts.length ? [...pts, pts[0]!] : [];
}

function dedupe(line: Pos[]): Pos[] {
  return line.filter((p, i) => i === 0 || p[0] !== line[i - 1]![0] || p[1] !== line[i - 1]![1]);
}

const isCcw = (ring: Pos[]) => ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0) > 0;
/** RFC 7946 orientation: outer rings counter-clockwise, holes clockwise. */
const rewind = (poly: Pos[][]) => poly.map((ring, i) => (isCcw(ring) === (i === 0) ? ring : [...ring].reverse()));

const polysOf = (g: Geometry): PolygonCoords[] => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const allPositions = (g: Geometry): Pos[] => {
  switch (g.type) {
    case 'Point': return [g.coordinates];
    case 'MultiPoint': case 'LineString': return g.coordinates;
    case 'MultiLineString': case 'Polygon': return g.coordinates.flat();
    case 'MultiPolygon': return g.coordinates.flat(2);
  }
};

export type BuildResult = { ok: boolean; checks: Check[]; files: { manifest: string; regions: string; country: string }; report: Record<string, unknown> };

export function buildTopic(config: TopicConfig, sourceRoot = root): BuildResult {
  const checks: Check[] = [];
  const check = (id: string, ok: boolean, detail: string) => { checks.push({ id, status: ok ? 'pass' : 'fail', detail }); return ok; };
  const warn = (id: string, detail: string) => { checks.push({ id, status: 'warn', detail }); };
  const srcPath = isAbsolute(config.source) ? config.source : join(sourceRoot, config.source);
  let layers: SourceLayer[] = [];
  try {
    layers = readSource(srcPath);
    if (config.layerPrefix) layers = layers.filter((l) => l.name.startsWith(config.layerPrefix!)).map((l) => ({ ...l, name: l.name.slice(config.layerPrefix!.length) }));
    check('source', true, `${layers.length} layer(s): ${layers.map((l) => l.name).join(', ')}`); }
  catch (e) { check('source', false, String(e instanceof Error ? e.message : e)); }

  let background = layers.filter((l) => BACKGROUND.test(l.name));
  if (!background.length && config.background) {
    try {
      background = readSource(isAbsolute(config.background) ? config.background : join(sourceRoot, config.background));
      const keep = config.backgroundIds;
      if (keep) {
        background = background.map((l) => ({ ...l, features: l.features.filter((x) => keep.includes(String(x.props['id'] ?? ''))) }));
        const found = new Set(background.flatMap((l) => l.features.map((x) => String(x.props['id']))));
        const missing = keep.filter((k) => !found.has(k));
        if (missing.length) check('background-source', false, `base feature(s) not found: ${missing.join(', ')}`);
      }
    }
    catch (e) { check('background-source', false, String(e instanceof Error ? e.message : e)); }
  }
  const questionLayers = layers.filter((l) => !BACKGROUND.test(l.name));
  const features: OutFeature[] = [];
  const problems: string[] = [];
  const layerStats: Array<{ layer: string; geomTypes: GeomType[]; count: number; skippedEmpty: number }> = [];
  const ids = new Set<string>();

  for (const layer of questionLayers) {
    const f = { id: 'id', name_hu: 'name_hu', name_uk: 'name_uk', ...config.fields?.[layer.name] };
    const tol = config.simplify?.[layer.name] ?? DEFAULT_TOLERANCE;
    const types = new Set<GeomType>();
    let skippedEmpty = 0; let n = 0;
    for (const src of layer.features) {
      n++;
      const rawId = src.props[f.id];
      const id = rawId === undefined || rawId === null || rawId === '' ? `${layer.name}-${n}` : String(rawId).trim();
      const where = `${layer.name}/${id}`;
      if (!ID_RE.test(id)) { problems.push(`${where}: id must be 1–64 characters of A–Z, a–z, 0–9, . _ -`); continue; }
      if (ids.has(id)) { problems.push(`${where}: duplicate id in the topic`); continue; }
      ids.add(id);
      const name = (k: string) => (typeof src.props[k] === 'string' ? (src.props[k] as string).normalize('NFC').replace(/\s+/g, ' ').trim() : '');
      const names = { hu: name(f.name_hu), uk: name(f.name_uk) };
      if (!names.hu || !names.uk) problems.push(`${where}: missing ${!names.hu ? f.name_hu : f.name_uk}`);
      const g = src.geometry;
      if (!g) { skippedEmpty++; problems.push(`${where}: empty geometry`); continue; }
      if (!allPositions(g).every(finitePos)) { problems.push(`${where}: coordinates outside geographic WGS 84 ranges`); continue; }
      let geometry: Geometry; let geomType: GeomType;
      if (g.type === 'Point' || g.type === 'MultiPoint') {
        const pts = g.type === 'Point' ? [g.coordinates] : g.coordinates;
        if (pts.length !== 1) { problems.push(`${where}: a point element must be exactly one point (got ${pts.length})`); continue; }
        geometry = { type: 'Point', coordinates: [round(pts[0]![0]), round(pts[0]![1])] }; geomType = 'point';
      } else if (g.type === 'LineString' || g.type === 'MultiLineString') {
        const all = mergeLineParts(g.type === 'LineString' ? [g.coordinates] : g.coordinates)
          .map((l) => dedupe(simplifyLine(dedupe(l), tol).map((p): Pos => [round(p[0]), round(p[1])])));
        // Tiny parts that vanish when simplified are dropped; a line needs at least one real part.
        const parts = all.filter((l) => l.length >= 2);
        if (!parts.length) { problems.push(`${where}: a line part has fewer than 2 distinct points`); continue; }
        geometry = parts.length === 1 ? { type: 'LineString', coordinates: parts[0]! } : { type: 'MultiLineString', coordinates: parts }; geomType = 'line';
      } else {
        // Simplification can make a ring cross itself; then the tolerance is halved until the result is valid.
        let tolA = config.simplifyAreas?.[layer.name] ?? DEFAULT_AREA_TOLERANCE;
        let polys: PolygonCoords[] = []; let issues: ReturnType<typeof validatePolygon> = [];
        for (let attempt = 0; attempt < 8; attempt++, tolA = attempt === 7 ? 0 : tolA / 2) {
          polys = simplifyPolygons(polysOf(g), tolA).map((poly) => rewind(poly.map((ring) => dedupe(ring.map((p): Pos => [round(p[0]), round(p[1])])))));
          issues = polys.flatMap((poly) => validatePolygon(id, poly));
          if (!issues.length || tolA === 0) break;
        }
        if (issues.length) { problems.push(`${where}: ${issues.slice(0, 3).map((x) => `${x.code} ${x.detail}`).join('; ')}`); continue; }
        geometry = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0]! } : { type: 'MultiPolygon', coordinates: polys }; geomType = 'area';
      }
      types.add(geomType);
      const kind = geomType === 'area' && (config.waterLayers?.includes(layer.name) || config.waterIds?.includes(id)) ? 'ocean' : 'generic';
      features.push({ type: 'Feature', id, properties: { id, names, kind, geomType, layer: layer.name }, geometry });
    }
    layerStats.push({ layer: layer.name, geomTypes: [...types], count: n - skippedEmpty, skippedEmpty });
  }
  check('features', problems.length === 0 && features.length > 0, problems.length ? `${problems.length} problem(s): ${problems.slice(0, 20).join(' | ')}` : `${features.length} question features`);

  // Background: the base layer if given, otherwise the asked areas themselves.
  // The base is only drawn, never asked: spikes from near-duplicate vertices are removed, and a polygon that stays
  // invalid is left out with a warning instead of failing the whole topic.
  const bgTol = config.simplifyBackground ?? DEFAULT_AREA_TOLERANCE;
  const bgRaw: PolygonCoords[] = background.flatMap((l) => l.features.flatMap((x) => (x.geometry ? polysOf(x.geometry) : [])));
  const bgPolys: PolygonCoords[] = []; const bgDropped: string[] = [];
  for (const [i, raw] of bgRaw.entries()) {
    let tol = bgTol; let poly: PolygonCoords = []; let ok = false;
    for (let attempt = 0; attempt < 8 && !ok; attempt++, tol = attempt === 7 ? 0 : tol / 2) {
      const simple = simplifyPolygons([raw], tol)[0];
      if (!simple) { ok = true; poly = []; break; }
      poly = rewind(simple.map((ring) => removeSpikes(dedupe(ring.map((p): Pos => [round(p[0]), round(p[1])])))).filter((r) => r.length >= 4));
      ok = poly.length > 0 && validatePolygon('hatter', poly).length === 0;
    }
    if (ok && poly.length) bgPolys.push(poly); else if (!ok) bgDropped.push(`polygon ${i}`);
  }
  const basePolys = bgPolys.length ? bgPolys : features.filter((x) => x.properties.geomType === 'area').flatMap((x) => polysOf(x.geometry));
  check('background', basePolys.length > 0, bgPolys.length ? `base layer "${background.map((l) => l.name).join(', ')}" (${bgPolys.length} polygon(s))` : basePolys.length ? 'no base layer: the asked areas form the background' : 'no base layer and no areas: add a "hatter" layer');
  if (bgDropped.length) warn('background-geometry', `invalid base polygon(s) left out: ${bgDropped.join(', ')}`);

  const all = [...features.flatMap((x) => allPositions(x.geometry)), ...basePolys.flat(2)];
  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of all) { bb[0] = Math.min(bb[0]!, x); bb[1] = Math.min(bb[1]!, y); bb[2] = Math.max(bb[2]!, x); bb[3] = Math.max(bb[3]!, y); }
  const bounds = (all.length ? bb.map(round) : [0, 0, 1, 1]) as [number, number, number, number];

  // Points must lie on the base map.
  const inBase = (p: Pos) => basePolys.some((poly) => pointInRing(p, poly[0]!) && !poly.slice(1).some((h) => pointInRing(p, h)));
  const strayPoints = features.filter((x) => x.geometry.type === 'Point' && basePolys.length && !inBase(x.geometry.coordinates)).map((x) => x.id);
  // A coarse base may miss a cape or an islet: the dot is still drawn, so points near the coast are only reported;
  // a point far from any land is most likely a coordinate error.
  const near = (p: Pos, d: number) => [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]].some(([dx, dy]) => inBase([p[0] + dx!, p[1] + dy!]));
  const coordsOf = (id: string) => (features.find((x) => x.id === id)!.geometry as { coordinates: Pos }).coordinates;
  const offShore = strayPoints.filter((id) => !near(coordsOf(id), 0.5));
  const farPoints = offShore.filter((id) => ![1, 2, 3].some((d) => near(coordsOf(id), d)));
  if (farPoints.length) check('points-on-map', false, `far from the base map (> 3°): ${farPoints.join(', ')}`);
  else if (offShore.length) warn('points-on-map', `off the coarse base map, within 3° of land (drawn anyway): ${offShore.join(', ')}`);
  else check('points-on-map', true, strayPoints.length ? `within 0.5° of the base map: ${strayPoints.join(', ')}` : 'all points lie on the base map');

  // Coverage layers: no two features overlap (sampled on a grid scaled to the bounds).
  for (const layer of config.coverage ?? []) {
    const polys = features.filter((x) => x.properties.layer === layer && x.properties.geomType === 'area').map((x) => ({ id: x.id, polys: polysOf(x.geometry) }));
    const step = Math.max((bounds[2] - bounds[0]) / 400, (bounds[3] - bounds[1]) / 400);
    let overlaps = 0;
    for (let y = bounds[1] + step / 2; y < bounds[3]; y += step) for (let x = bounds[0] + step / 2; x < bounds[2]; x += step) {
      let hits = 0;
      for (const f of polys) if (f.polys.some((poly) => pointInRing([x, y], poly[0]!) && !poly.slice(1).some((h) => pointInRing([x, y], h)))) hits++;
      if (hits > 1) overlaps++;
    }
    check(`coverage-${layer}`, polys.length > 0 && overlaps === 0, polys.length ? `${overlaps} overlapping sample point(s)` : 'layer has no areas');
  }

  // Validation ran on lon/lat; the package stores display coordinates when a world projection is used.
  const pj = config.projection;
  const r6 = (p: Pos): Pos => [round(p[0]), round(p[1])];
  const projectGeometry = (g: Geometry): Geometry => {
    if (!pj) return g;
    if (g.type === 'Point') return { type: 'Point', coordinates: r6(projectPoint(pj, g.coordinates)) };
    if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const parts = (g.type === 'LineString' ? [g.coordinates] : g.coordinates).flatMap((l) => projectLine(pj, l)).map((l) => dedupe(l.map(r6)));
      return parts.length === 1 ? { type: 'LineString', coordinates: parts[0]! } : { type: 'MultiLineString', coordinates: parts };
    }
    const polys = projectPolygons(pj, polysOf(g)).map((poly) => poly.map((ring) => dedupe(ring.map(r6))));
    return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0]! } : { type: 'MultiPolygon', coordinates: polys };
  };
  const sorted = [...features].sort((a, b) => (a.properties.layer < b.properties.layer ? -1 : a.properties.layer > b.properties.layer ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((f) => (pj ? { ...f, geometry: projectGeometry(f.geometry) } : f));
  const outBase = pj ? projectPolygons(pj, basePolys).map((poly) => poly.map((ring) => dedupe(ring.map(r6)))) : basePolys;
  const regions = JSON.stringify({ type: 'FeatureCollection', features: sorted }) + '\n';
  const country = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 'base', properties: { id: 'base', names: config.title }, geometry: { type: 'MultiPolygon', coordinates: outBase } }] }) + '\n';
  const outBounds = pj ? (() => {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of sorted) for (const [x, y] of allPositions(f.geometry)) { b[0] = Math.min(b[0]!, x); b[1] = Math.min(b[1]!, y); b[2] = Math.max(b[2]!, x); b[3] = Math.max(b[3]!, y); }
    return b.map(round) as [number, number, number, number];
  })() : bounds;
  const gz = gzipSync(regions).length + gzipSync(country).length;
  check('size', gz <= MAX_GZIP_BYTES, `${(gz / 1024).toFixed(0)} KiB gzipped (limit ${(MAX_GZIP_BYTES / 1024).toFixed(0)} KiB)`);

  const groups = questionLayers.map((l) => ({
    id: l.name,
    title: config.layerTitles?.[l.name] ?? { hu: l.name, uk: l.name },
    geomTypes: [...new Set(features.filter((x) => x.properties.layer === l.name).map((x) => x.properties.geomType))],
  }));
  const mixed = features.some((x) => x.properties.geomType !== 'area');
  const manifest = JSON.stringify({
    schemaVersion: 1, id: config.id, dataVersion: config.dataVersion, title: config.title, geometryKind: mixed ? 'mixed' : 'polygon',
    featureCount: features.length, bounds: outBounds,
    layers: { background: { path: 'country.geojson', sha256: sha(country) }, questions: { path: 'regions.geojson', sha256: sha(regions) } },
    groups, insets: [], provenance: config.provenance,
  }) + '\n';
  const byType = (t: GeomType) => features.filter((x) => x.properties.geomType === t).length;
  const report = {
    topicId: config.id, dataVersion: config.dataVersion, node: process.version, source: config.source, checks, layers: layerStats,
    totals: { area: byType('area'), line: byType('line'), point: byType('point') },
    bytes: { regions: Buffer.byteLength(regions), country: Buffer.byteLength(country), gzipped: gz },
  };
  return { ok: !checks.some((c) => c.status === 'fail'), checks, files: { manifest, regions, country }, report };
}

function reportMarkdown(r: BuildResult): string {
  const rep = r.report as { topicId: string; dataVersion: string; layers: Array<{ layer: string; geomTypes: string[]; count: number }>; totals: Record<string, number>; bytes: Record<string, number> };
  return [
    `# Adatellenőrzés: ${rep.topicId} ${rep.dataVersion}`, '',
    `Eredmény: **${r.ok ? 'sikeres' : 'HIBÁS, a csomag nem készült el'}**`, '',
    '| Réteg | Típus | Elemek |', '|---|---|---|',
    ...rep.layers.map((l) => `| ${l.layer} | ${l.geomTypes.join(', ') || '–'} | ${l.count} |`), '',
    `Összesen: terület ${rep.totals['area']}, vonal ${rep.totals['line']}, pont ${rep.totals['point']}; tömörítve ${Math.round((rep.bytes['gzipped'] ?? 0) / 1024)} KiB.`, '',
    '| Ellenőrzés | Eredmény | Részlet |', '|---|---|---|',
    ...r.checks.map((c) => `| ${c.id} | ${c.status === 'pass' ? 'OK' : c.status === 'warn' ? 'FIGYELEM' : 'HIBA'} | ${c.detail.replaceAll('|', '/')} |`), '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const configPath = args.find((a) => !a.startsWith('--'));
  if (!configPath) { console.error('usage: node scripts/data/topic.ts <config.ts> [--out <dir>] [--check]'); process.exit(2); }
  const outIdx = args.indexOf('--out');
  const mod = (await import(pathToFileURL(resolve(configPath)).href) as { default: TopicConfig | TopicConfig[] }).default;
  // A config module may describe several topics (e.g. one per continent from one GeoPackage).
  let failed = false;
  for (const config of Array.isArray(mod) ? mod : [mod]) {
    if (Array.isArray(mod)) console.log(`== ${config.id}`);
    if (!buildOne(config, args, outIdx)) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

function buildOne(config: TopicConfig, args: string[], outIdx: number): boolean {
  const r = buildTopic(config);
  for (const c of r.checks) console.log(`${c.status.toUpperCase()} ${c.id}: ${c.detail}`);
  const outRoot = outIdx >= 0 ? resolve(args[outIdx + 1]!) : join(root, 'public/data');
  const finalDir = join(outRoot, config.id, config.dataVersion);
  if (args.includes('--check')) {
    const same = r.ok && (['manifest', 'regions', 'country'] as const).every((k) => existsSync(join(finalDir, `${k === 'manifest' ? 'manifest.json' : `${k}.geojson`}`))
      && readFileSync(join(finalDir, k === 'manifest' ? 'manifest.json' : `${k}.geojson`), 'utf8') === r.files[k]);
    console.log(same ? `OK: ${finalDir} matches the source` : `MISMATCH: ${finalDir} differs from a fresh build`);
    return same;
  }
  if (outIdx < 0) {
    mkdirSync(join(root, 'reports'), { recursive: true });
    writeFileSync(join(root, `reports/${config.id}-validation.json`), JSON.stringify(r.report, null, 2) + '\n');
    writeFileSync(join(root, `reports/${config.id}-validation.md`), reportMarkdown(r));
  }
  if (!r.ok) { console.error('Validation failed; package not written.'); return false; }
  const tmp = join(outRoot, config.id, `.tmp-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, 'manifest.json'), r.files.manifest);
  writeFileSync(join(tmp, 'regions.geojson'), r.files.regions);
  writeFileSync(join(tmp, 'country.geojson'), r.files.country);
  if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
  renameSync(tmp, finalDir);
  console.log(`Wrote ${finalDir}`);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
