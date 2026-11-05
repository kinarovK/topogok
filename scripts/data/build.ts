// TopoGok data pipeline: SHP (read-only) -> validated GeoJSON package + manifest + validation report.
// Usage: node scripts/data/build.ts [--check]
//   --check  regenerate into a temporary directory and compare byte-for-byte with the committed package
//            (no files are replaced). Exit code 1 on any validation error or difference.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readDbf, readShp, readShxCount } from './shapefile.ts';
import {
  bboxOf, forEachCandidatePair, makeLaea, partsToPolygons, projectedArea, ringSegments, segmentRelation, validatePolygon,
  type Issue, type PolygonCoords,
} from './geometry.ts';
import { EXPECTED_REGIONS, DATA_VERSION, TOPIC_ID, INSETS, INSET_PADDING_RATIO, PROVENANCE } from './config.ts';

const root = process.env['TOPOGOK_ROOT'] ? resolve(process.env['TOPOGOK_ROOT']) : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checkOnly = process.argv.includes('--check');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

type Report = {
  generatedFor: { topicId: string; dataVersion: string };
  tool: { name: string; node: string };
  sources: Array<{ file: string; sha256: string; bytes: number }>;
  checks: Array<{ id: string; status: 'pass' | 'fail'; detail: string }>;
  issues: Issue[];
  metrics: Record<string, number | string>;
  outputs: Array<{ file: string; sha256: string; bytes: number }>;
};

export function fail(report: Report, id: string, detail: string) {
  report.checks.push({ id, status: 'fail', detail });
}
export function pass(report: Report, id: string, detail: string) {
  report.checks.push({ id, status: 'pass', detail });
}

/** Deterministic JSON: stable key order given by construction, no whitespace variance. */
function stableJson(value: unknown): string {
  return JSON.stringify(value) + '\n';
}

function run(): number {
  const report: Report = {
    generatedFor: { topicId: TOPIC_ID, dataVersion: DATA_VERSION },
    tool: { name: 'scripts/data/build.ts (dependency-free SHP/DBF reader, OGC validity checks, ellipsoidal LAEA area)', node: process.version },
    sources: [], checks: [], issues: [], metrics: {}, outputs: [],
  };

  // 1. File groups, readability, CRS, source hashes
  const groups = {
    country: { base: 'shp/ukraine_country_boundary', required: ['.shp', '.shx', '.dbf', '.prj'] },
    regions: { base: 'shp/ukraine_oblasts', required: ['.shp', '.shx', '.dbf', '.prj', '.cpg'] },
  };
  for (const [name, g] of Object.entries(groups)) {
    const missing = g.required.filter((ext) => !existsSync(join(root, g.base + ext)));
    if (missing.length) fail(report, `files-${name}`, `missing ${missing.join(', ')}`);
    else pass(report, `files-${name}`, `${g.required.join(' ')} present`);
    for (const ext of ['.shp', '.shx', '.dbf', '.prj', '.cpg']) {
      const p = join(root, g.base + ext);
      if (existsSync(p)) {
        const b = readFileSync(p);
        report.sources.push({ file: g.base + ext, sha256: sha256(b), bytes: b.length });
      }
    }
  }
  if (report.checks.some((c) => c.status === 'fail')) return finish(report, null);

  for (const g of Object.values(groups)) {
    const prj = readFileSync(join(root, g.base + '.prj'), 'latin1');
    const wgs84 = /GEOGCS\["GCS_WGS_1984"/.test(prj) && /UNIT\["Degree",0\.0174532925199433\]/.test(prj) && !/PROJCS/.test(prj);
    if (wgs84) pass(report, `crs-${g.base}`, 'geographic WGS 84 (EPSG:4326), degrees');
    else fail(report, `crs-${g.base}`, `unexpected CRS: ${prj.slice(0, 120)}`);
  }
  const cpg = readFileSync(join(root, groups.regions.base + '.cpg'), 'latin1').trim().toUpperCase();
  if (cpg === 'UTF-8' || cpg === 'UTF8') pass(report, 'encoding-regions', 'cpg declares UTF-8');
  else fail(report, 'encoding-regions', `cpg = ${cpg}`);

  const countryShp = readShp(join(root, groups.country.base + '.shp'));
  const regionShp = readShp(join(root, groups.regions.base + '.shp'));
  const countryShx = readShxCount(join(root, groups.country.base + '.shx'));
  const regionShx = readShxCount(join(root, groups.regions.base + '.shx'));
  const regionDbf = readDbf(join(root, groups.regions.base + '.dbf'), 'utf-8');
  const countryDbf = readDbf(join(root, groups.country.base + '.dbf'), 'latin1');

  // 3. Record counts, IDs, names
  if (countryShp.records.length === 1 && countryShx === 1 && countryDbf.records.length === 1) pass(report, 'country-count', '1 shape, 1 index entry, 1 attribute row');
  else fail(report, 'country-count', `shp ${countryShp.records.length}, shx ${countryShx}, dbf ${countryDbf.records.length}`);
  if (regionShp.records.length === regionDbf.records.length && regionShx === regionShp.records.length) pass(report, 'region-record-alignment', `${regionShp.records.length} shp = shx = dbf`);
  else fail(report, 'region-record-alignment', `shp ${regionShp.records.length}, shx ${regionShx}, dbf ${regionDbf.records.length}`);

  const expectedIds = Object.keys(EXPECTED_REGIONS).sort();
  const seen = new Map<string, number>();
  regionDbf.records.forEach((r, i) => {
    const id = String(r['iso_3166_2'] ?? '');
    seen.set(id, (seen.get(id) ?? 0) + 1);
    void i;
  });
  const dupes = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  const actualIds = [...seen.keys()].sort();
  const missingIds = expectedIds.filter((id) => !seen.has(id));
  const extraIds = actualIds.filter((id) => !(id in EXPECTED_REGIONS));
  if (!dupes.length && !missingIds.length && !extraIds.length && actualIds.length === 27) pass(report, 'region-ids', '27 unique iso_3166_2 IDs, exactly the expected set');
  else fail(report, 'region-ids', `duplicates [${dupes}], missing [${missingIds}], unexpected [${extraIds}]`);

  const nameProblems: string[] = [];
  for (const r of regionDbf.records) {
    const id = String(r['iso_3166_2']);
    const exp = EXPECTED_REGIONS[id];
    if (!exp) continue;
    for (const loc of ['hu', 'uk'] as const) {
      const raw = String(r[`name_${loc}`] ?? '');
      const v = raw.normalize('NFC');
      if (!v) nameProblems.push(`${id}: empty name_${loc}`);
      else if (v !== exp[loc]) nameProblems.push(`${id}: name_${loc} "${v}" differs from DATA_CONTRACT "${exp[loc]}"`);
    }
  }
  if (nameProblems.length) fail(report, 'region-names', nameProblems.join('; '));
  else pass(report, 'region-names', 'all 27 name_hu and name_uk non-empty, NFC, equal to the DATA_CONTRACT list');

  // 4. Geometry validation
  type Built = { id: string; polygons: PolygonCoords[] };
  const regions: Built[] = [];
  regionShp.records.forEach((rec, i) => {
    const id = String(regionDbf.records[i]!['iso_3166_2']);
    if (rec.parts.length === 0) { report.issues.push({ featureId: id, code: 'empty', detail: 'null shape' }); return; }
    const { polygons, issues } = partsToPolygons(id, rec.parts);
    report.issues.push(...issues);
    for (const poly of polygons) report.issues.push(...validatePolygon(id, poly));
    regions.push({ id, polygons });
  });
  const countryRec = countryShp.records[0]!;
  const country = partsToPolygons('UA', countryRec.parts);
  report.issues.push(...country.issues);
  for (const poly of country.polygons) report.issues.push(...validatePolygon('UA', poly));
  if (report.issues.length) fail(report, 'geometry-validity', `${report.issues.length} issue(s), see issues`);
  else pass(report, 'geometry-validity', 'all rings closed, finite, ≥4 positions, no self-intersections, holes inside shells');

  // 5. Coverage: regions must tile the country exactly (shared edges, no crossings, matching outer boundary)
  const allSegs = regions.flatMap((r) => r.polygons.flatMap((poly, pi) => poly.flatMap((ring, ri) => ringSegments(ring, pi * 1000 + ri, r.id))));
  let crossings = 0;
  const crossingSamples: string[] = [];
  forEachCandidatePair(allSegs, 0.05, (a, b) => {
    if (a.owner === b.owner) return;
    const rel = segmentRelation(a, b);
    const identical = (a.ax === b.ax && a.ay === b.ay && a.bx === b.bx && a.by === b.by) || (a.ax === b.bx && a.ay === b.by && a.bx === b.ax && a.by === b.ay);
    if (rel === 'cross' || (rel === 'overlap' && !identical)) {
      crossings++;
      if (crossingSamples.length < 10) crossingSamples.push(`${a.owner}/${b.owner} ${rel} near ${a.ax.toFixed(4)},${a.ay.toFixed(4)}`);
    }
  });
  const edgeKey = (s: { ax: number; ay: number; bx: number; by: number }) => {
    const p = `${s.ax},${s.ay}`; const q = `${s.bx},${s.by}`;
    return p < q ? `${p}|${q}` : `${q}|${p}`;
  };
  const edgeCount = new Map<string, number>();
  for (const s of allSegs) edgeCount.set(edgeKey(s), (edgeCount.get(edgeKey(s)) ?? 0) + 1);
  const overused = [...edgeCount.values()].filter((n) => n > 2).length;
  const outer = new Set([...edgeCount].filter(([, n]) => n === 1).map(([k]) => k));
  const countrySegs = country.polygons.flatMap((poly, pi) => poly.flatMap((ring, ri) => ringSegments(ring, pi * 1000 + ri, 'UA')));
  const countryEdges = new Set(countrySegs.map(edgeKey));
  const onlyRegions = [...outer].filter((k) => !countryEdges.has(k)).length;
  const onlyCountry = [...countryEdges].filter((k) => !outer.has(k)).length;

  const laea = makeLaea(31.5, 48.5);
  const countryArea = projectedArea(country.polygons, laea);
  const regionAreas = Object.fromEntries(regions.map((r) => [r.id, projectedArea(r.polygons, laea)]));
  const regionSum = Object.values(regionAreas).reduce((a, b) => a + b, 0);
  const areaDiff = Math.abs(countryArea - regionSum);
  report.metrics['countryAreaM2'] = Math.round(countryArea);
  report.metrics['sumRegionAreaM2'] = Math.round(regionSum);
  report.metrics['areaDifferenceM2'] = Number(areaDiff.toFixed(3));
  report.metrics['regionEdgeCrossings'] = crossings;
  report.metrics['edgesUsedMoreThanTwice'] = overused;
  report.metrics['outerEdgesNotInCountry'] = onlyRegions;
  report.metrics['countryEdgesNotOuterRegionEdges'] = onlyCountry;
  report.metrics['regionVertexCount'] = regions.reduce((n, r) => n + r.polygons.reduce((m, p) => m + p.reduce((k, ring) => k + ring.length, 0), 0), 0);
  report.metrics['countryVertexCount'] = country.polygons.reduce((m, p) => m + p.reduce((k, ring) => k + ring.length, 0), 0);
  const coverageOk = crossings === 0 && overused === 0 && onlyRegions === 0 && onlyCountry === 0 && areaDiff <= 1;
  const coverageDetail = `crossings ${crossings}${crossingSamples.length ? ' [' + crossingSamples.join('; ') + ']' : ''}, edges used >2× ${overused}, region outer edges missing from country ${onlyRegions}, country edges missing from region outline ${onlyCountry}, |area(country) − Σarea(regions)| = ${areaDiff.toFixed(3)} m² (tolerance 1 m²)`;
  if (coverageOk) pass(report, 'country-vs-union', coverageDetail);
  else fail(report, 'country-vs-union', coverageDetail);

  if (report.checks.some((c) => c.status === 'fail')) return finish(report, null);

  // 6. Build output (whitelisted fields, sorted by ID)
  const geom = (polys: PolygonCoords[]) => (polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys });
  const kindOf = (id: string) => (id === 'UA-30' || id === 'UA-40' ? 'city' : id === 'UA-43' ? 'autonomous-republic' : 'oblast');
  const regionsGeo = {
    type: 'FeatureCollection',
    features: [...regions].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => {
      const exp = EXPECTED_REGIONS[r.id]!;
      const rec = regionDbf.records.find((x) => x['iso_3166_2'] === r.id)!;
      const en = String(rec['name_en'] ?? '').normalize('NFC');
      return {
        type: 'Feature',
        id: r.id,
        properties: { id: r.id, names: en ? { hu: exp.hu, uk: exp.uk, en } : { hu: exp.hu, uk: exp.uk }, kind: kindOf(r.id) },
        geometry: geom(r.polygons),
      };
    }),
  };
  const countryGeo = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', id: 'UA', properties: { id: 'UA', names: { hu: 'Ukrajna', uk: 'Україна' } }, geometry: geom(country.polygons) }],
  };
  const bounds = bboxOf(country.polygons).map((v) => Number(v.toFixed(6))) as [number, number, number, number];
  const insets = INSETS.map((ins) => {
    const target = regions.find((r) => r.id === ins.anchorFeatureId)!;
    const [w, s, e, n] = bboxOf(target.polygons);
    const pad = Math.max(e - w, n - s) * INSET_PADDING_RATIO;
    return { id: ins.id, anchorFeatureId: ins.anchorFeatureId, title: ins.title, bounds: [w - pad, s - pad, e + pad, n + pad].map((v) => Number(v.toFixed(6))) };
  });
  const countryText = stableJson(countryGeo);
  const regionsText = stableJson(regionsGeo);
  const manifest = {
    schemaVersion: 1,
    id: TOPIC_ID,
    dataVersion: DATA_VERSION,
    title: { hu: 'Ukrajna közigazgatása', uk: 'Адміністративний устрій України' },
    geometryKind: 'polygon',
    featureCount: 27,
    bounds,
    layers: {
      background: { path: 'country.geojson', sha256: sha256(countryText) },
      questions: { path: 'regions.geojson', sha256: sha256(regionsText) },
    },
    insets,
    provenance: PROVENANCE,
  };
  const manifestText = stableJson(manifest);
  report.metrics['insetPaddingRatio'] = INSET_PADDING_RATIO;
  for (const [id, a] of Object.entries(regionAreas)) report.metrics[`areaKm2.${id}`] = Number((a / 1e6).toFixed(1));
  return finish(report, { 'manifest.json': manifestText, 'country.geojson': countryText, 'regions.geojson': regionsText });
}

function finish(report: Report, files: Record<string, string> | null): number {
  const outRoot = join(root, 'public/data', TOPIC_ID);
  const finalDir = join(outRoot, DATA_VERSION);
  const ok = files !== null && !report.checks.some((c) => c.status === 'fail');
  if (files) {
    for (const [name, text] of Object.entries(files)) report.outputs.push({ file: `public/data/${TOPIC_ID}/${DATA_VERSION}/${name}`, sha256: sha256(text), bytes: Buffer.byteLength(text) });
  }
  // Source files must be unchanged after the run.
  const after = report.sources.map((s) => sha256(readFileSync(join(root, s.file))));
  if (after.some((h, i) => h !== report.sources[i]!.sha256)) {
    fail(report, 'sources-unchanged', 'a source file changed during the run');
  } else pass(report, 'sources-unchanged', 'source hashes identical before and after the run');

  const reportText = JSON.stringify(report, null, 2) + '\n';
  if (checkOnly) {
    let diff = 0;
    if (ok && files) {
      for (const [name, text] of Object.entries(files)) {
        const p = join(finalDir, name);
        if (!existsSync(p) || readFileSync(p, 'utf8') !== text) { console.error(`DIFF ${name}`); diff++; }
      }
    }
    printSummary(report);
    if (!ok || diff) { console.error(ok ? `${diff} committed file(s) differ from a fresh build` : 'validation failed'); return 1; }
    console.log(`OK: committed package ${DATA_VERSION} is byte-identical to a fresh build.`);
    return 0;
  }
  mkdirSync(join(root, 'reports'), { recursive: true });
  writeFileSync(join(root, 'reports/data-validation.json'), reportText);
  writeFileSync(join(root, 'reports/data-validation.md'), toMarkdown(report, ok));
  printSummary(report);
  if (!ok || !files) { console.error('Validation failed; the existing package was left untouched.'); return 1; }
  // 8. Write to temp dir, then swap in atomically.
  mkdirSync(outRoot, { recursive: true });
  const tmp = mkdtempSync(join(existsSync(outRoot) ? outRoot : tmpdir(), '.tmp-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(tmp, name), text);
  if (existsSync(finalDir)) {
    const old = `${finalDir}.old-${process.pid}`;
    renameSync(finalDir, old);
    renameSync(tmp, finalDir);
    rmSync(old, { recursive: true, force: true });
  } else renameSync(tmp, finalDir);
  for (const d of readdirSync(outRoot)) if (d.startsWith('.tmp-')) rmSync(join(outRoot, d), { recursive: true, force: true });
  console.log(`Wrote ${finalDir}`);
  return 0;
}

function printSummary(report: Report) {
  for (const c of report.checks) console.log(`${c.status === 'pass' ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`);
  for (const i of report.issues.slice(0, 20)) console.log(`  issue ${i.featureId} ${i.code} ${i.detail}`);
}

function toMarkdown(r: Report, ok: boolean): string {
  const lines = [
    '# Adatvalidációs jelentés', '',
    `Generálta: \`npm run data:build\` (${r.tool.name}), Node ${r.tool.node}. Téma: \`${r.generatedFor.topicId}\`, adatverzió: \`${r.generatedFor.dataVersion}\`.`, '',
    `Összesített eredmény: **${ok ? 'SIKERES' : 'SIKERTELEN'}**.`, '',
    '## Források (SHA-256)', '', '| Fájl | Bájt | SHA-256 |', '|---|---:|---|',
    ...r.sources.map((s) => `| \`${s.file}\` | ${s.bytes} | \`${s.sha256}\` |`), '',
    '## Ellenőrzések', '', '| Ellenőrzés | Eredmény | Részletek |', '|---|---|---|',
    ...r.checks.map((c) => `| ${c.id} | ${c.status === 'pass' ? 'PASS' : 'FAIL'} | ${c.detail.replace(/\|/g, '\\|')} |`), '',
    '## Geometriai hibák', '', r.issues.length ? r.issues.map((i) => `- ${i.featureId} ${i.code}: ${i.detail}`).join('\n') : 'Nincs.', '',
    '## Mérőszámok', '', '| Mérőszám | Érték |', '|---|---:|',
    ...Object.entries(r.metrics).map(([k, v]) => `| ${k} | ${v} |`), '',
    '## Kimenetek', '', '| Fájl | Bájt | SHA-256 |', '|---|---:|---|',
    ...r.outputs.map((s) => `| \`${s.file}\` | ${s.bytes} | \`${s.sha256}\` |`), '',
    '## Transzformációk', '',
    '- Bemenet: EPSG:4326, kimenet: EPSG:4326 / GeoJSON `[longitude, latitude]`; nincs reprojekció, egyszerűsítés, kerekítés vagy geometriajavítás.',
    '- Gyűrűirány: shapefile (külső óramutató szerint) → RFC 7946 (külső óramutatóval ellentétes, lyuk óramutató szerint).',
    '- Attribútumok: csak `id`, `names.hu/uk/en`, `kind`; az ország örökölt attribútumai helyett saját `UA` metaadat.',
    '- Területszámítás: ellipszoidi Lambert-féle területtartó azimutális vetület (WGS 84, középpont 31,5° K / 48,5° É), egyenes élekkel a vetített síkon.',
    '- Eltérés a DATA_CONTRACT 2. és 4. lépésétől: a munkakörnyezetben nem volt GDAL/GEOS, ezért saját, függőség nélküli olvasó és OGC-szabályokat követő validáció fut. A GDAL-os keresztellenőrzés parancsa a `scripts/data/README.md`-ben; lefuttatása nyitott feladat.',
    '',
  ];
  return lines.join('\n');
}

process.exit(run());
