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
import { readSource, type SourceLayer } from './sources.ts';
import type { Geometry, Pos } from './wkb.ts';

export type LocalizedText = { hu: string; uk: string };
export type TopicConfig = {
  id: string;
  dataVersion: string;
  title: LocalizedText;
  /** Source path relative to the repository root (folder, .gpkg, .shp or .geojson). */
  source: string;
  /** Optional per-layer field renames when a source does not follow id / name_hu / name_uk. */
  fields?: Record<string, { id?: string; name_hu?: string; name_uk?: string }>;
  /** Optional per-layer titles for the teacher's checklist (default: the layer name). */
  layerTitles?: Record<string, LocalizedText>;
  /** Area layers whose features must not overlap each other (e.g. countries). */
  coverage?: string[];
  /** Line simplification tolerance in degrees, per layer (default 0.005°). */
  simplify?: Record<string, number>;
  provenance: { source: string | null; sourceUrl: string | null; license: string | null; licenseUrl: string | null; status: 'unverified' | 'verified' };
};

export type GeomType = 'area' | 'line' | 'point';
type OutFeature = { type: 'Feature'; id: string; properties: { id: string; names: LocalizedText; kind: 'generic'; geomType: GeomType; layer: string }; geometry: Geometry };
type Check = { id: string; status: 'pass' | 'fail'; detail: string };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BACKGROUND = /^(hatter|háttér|background)$/i;
const MAX_GZIP_BYTES = 1_500_000;
const DEFAULT_TOLERANCE = 0.005;
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
  const srcPath = isAbsolute(config.source) ? config.source : join(sourceRoot, config.source);
  let layers: SourceLayer[] = [];
  try { layers = readSource(srcPath); check('source', true, `${layers.length} layer(s): ${layers.map((l) => l.name).join(', ')}`); }
  catch (e) { check('source', false, String(e instanceof Error ? e.message : e)); }

  const background = layers.filter((l) => BACKGROUND.test(l.name));
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
        const parts = (g.type === 'LineString' ? [g.coordinates] : g.coordinates)
          .map((l) => dedupe(simplifyLine(dedupe(l), tol).map((p): Pos => [round(p[0]), round(p[1])])));
        if (parts.some((l) => l.length < 2)) { problems.push(`${where}: a line part has fewer than 2 distinct points`); continue; }
        geometry = parts.length === 1 ? { type: 'LineString', coordinates: parts[0]! } : { type: 'MultiLineString', coordinates: parts }; geomType = 'line';
      } else {
        const polys = polysOf(g).map((poly) => rewind(poly.map((ring) => ring.map((p): Pos => [round(p[0]), round(p[1])]))));
        const issues = polys.flatMap((poly) => validatePolygon(id, poly));
        if (issues.length) { problems.push(`${where}: ${issues.slice(0, 3).map((x) => `${x.code} ${x.detail}`).join('; ')}`); continue; }
        geometry = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0]! } : { type: 'MultiPolygon', coordinates: polys }; geomType = 'area';
      }
      types.add(geomType);
      features.push({ type: 'Feature', id, properties: { id, names, kind: 'generic', geomType, layer: layer.name }, geometry });
    }
    layerStats.push({ layer: layer.name, geomTypes: [...types], count: n - skippedEmpty, skippedEmpty });
  }
  check('features', problems.length === 0 && features.length > 0, problems.length ? `${problems.length} problem(s): ${problems.slice(0, 20).join(' | ')}` : `${features.length} question features`);

  // Background: the base layer if given, otherwise the asked areas themselves.
  const bgPolys: PolygonCoords[] = background.flatMap((l) => l.features.flatMap((x) => (x.geometry ? polysOf(x.geometry) : [])))
    .map((poly) => rewind(poly.map((ring) => ring.map((p): Pos => [round(p[0]), round(p[1])]))));
  const basePolys = bgPolys.length ? bgPolys : features.filter((x) => x.properties.geomType === 'area').flatMap((x) => polysOf(x.geometry));
  check('background', basePolys.length > 0, bgPolys.length ? `base layer "${background.map((l) => l.name).join(', ')}" (${bgPolys.length} polygon(s))` : basePolys.length ? 'no base layer: the asked areas form the background' : 'no base layer and no areas: add a "hatter" layer');
  const bgIssues = bgPolys.flatMap((poly) => validatePolygon('hatter', poly));
  if (bgPolys.length) check('background-geometry', bgIssues.length === 0, bgIssues.length ? bgIssues.slice(0, 3).map((x) => x.code).join(', ') : 'valid');

  const all = [...features.flatMap((x) => allPositions(x.geometry)), ...basePolys.flat(2)];
  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of all) { bb[0] = Math.min(bb[0]!, x); bb[1] = Math.min(bb[1]!, y); bb[2] = Math.max(bb[2]!, x); bb[3] = Math.max(bb[3]!, y); }
  const bounds = (all.length ? bb.map(round) : [0, 0, 1, 1]) as [number, number, number, number];

  // Points must lie on the base map.
  const inBase = (p: Pos) => basePolys.some((poly) => pointInRing(p, poly[0]!) && !poly.slice(1).some((h) => pointInRing(p, h)));
  const strayPoints = features.filter((x) => x.geometry.type === 'Point' && basePolys.length && !inBase(x.geometry.coordinates)).map((x) => x.id);
  check('points-on-map', strayPoints.length === 0, strayPoints.length ? `outside the base map: ${strayPoints.join(', ')}` : 'all points lie on the base map');

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

  const sorted = [...features].sort((a, b) => (a.properties.layer < b.properties.layer ? -1 : a.properties.layer > b.properties.layer ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const regions = JSON.stringify({ type: 'FeatureCollection', features: sorted }) + '\n';
  const country = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 'base', properties: { id: 'base', names: config.title }, geometry: { type: 'MultiPolygon', coordinates: basePolys } }] }) + '\n';
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
    featureCount: features.length, bounds,
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
    ...r.checks.map((c) => `| ${c.id} | ${c.status === 'pass' ? 'OK' : 'HIBA'} | ${c.detail.replaceAll('|', '/')} |`), '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const configPath = args.find((a) => !a.startsWith('--'));
  if (!configPath) { console.error('usage: node scripts/data/topic.ts <config.ts> [--out <dir>] [--check]'); process.exit(2); }
  const outIdx = args.indexOf('--out');
  const config = (await import(pathToFileURL(resolve(configPath)).href) as { default: TopicConfig }).default;
  const r = buildTopic(config);
  for (const c of r.checks) console.log(`${c.status === 'pass' ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`);
  const outRoot = outIdx >= 0 ? resolve(args[outIdx + 1]!) : join(root, 'public/data');
  const finalDir = join(outRoot, config.id, config.dataVersion);
  if (args.includes('--check')) {
    const same = r.ok && (['manifest', 'regions', 'country'] as const).every((k) => existsSync(join(finalDir, `${k === 'manifest' ? 'manifest.json' : `${k}.geojson`}`))
      && readFileSync(join(finalDir, k === 'manifest' ? 'manifest.json' : `${k}.geojson`), 'utf8') === r.files[k]);
    console.log(same ? `OK: ${finalDir} matches the source` : `MISMATCH: ${finalDir} differs from a fresh build`);
    process.exit(same ? 0 : 1);
  }
  if (outIdx < 0) {
    mkdirSync(join(root, 'reports'), { recursive: true });
    writeFileSync(join(root, `reports/${config.id}-validation.json`), JSON.stringify(r.report, null, 2) + '\n');
    writeFileSync(join(root, `reports/${config.id}-validation.md`), reportMarkdown(r));
  }
  if (!r.ok) { console.error('Validation failed; package not written.'); process.exit(1); }
  const tmp = join(outRoot, config.id, `.tmp-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, 'manifest.json'), r.files.manifest);
  writeFileSync(join(tmp, 'regions.geojson'), r.files.regions);
  writeFileSync(join(tmp, 'country.geojson'), r.files.country);
  if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
  renameSync(tmp, finalDir);
  console.log(`Wrote ${finalDir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
