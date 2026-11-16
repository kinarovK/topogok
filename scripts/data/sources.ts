// Reads a topic source by convention (docs/project/tasks/0005_MIXED_GEOMETRY/task.md §3):
//   - a folder: every .shp / .geojson / .json file is one layer (named after the file)
//   - a .gpkg file (a geodatabase converted with ogr2ogr): every feature table is one layer
//   - a single .shp / .geojson file: one layer
// All coordinates must be geographic WGS 84. Source files are only read.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { partsToPolygons } from './geometry.ts';
import { readGpkg, type SourceFeature, type SourceLayer } from './gpkg.ts';
import { readDbf, readShp, shapeKind } from './shapefile.ts';
import type { Geometry, Pos } from './wkb.ts';

export type { SourceFeature, SourceLayer };

const LAYER_EXT = new Set(['.shp', '.geojson', '.json']);

export function readSource(path: string): SourceLayer[] {
  if (!existsSync(path)) throw new Error(`source not found: ${path}`);
  if (statSync(path).isDirectory()) {
    const files = readdirSync(path).filter((f) => LAYER_EXT.has(extname(f).toLowerCase())).sort();
    if (files.length === 0) throw new Error(`${path}: no .shp or .geojson layers`);
    return files.map((f) => readLayerFile(join(path, f)));
  }
  if (extname(path).toLowerCase() === '.gpkg') return readGpkg(path);
  return [readLayerFile(path)];
}

function readLayerFile(file: string): SourceLayer {
  const ext = extname(file).toLowerCase();
  const name = basename(file, extname(file));
  return { name, features: ext === '.shp' ? readShapefile(file) : readGeoJson(file) };
}

function sibling(file: string, ext: string): string | null {
  const base = file.slice(0, -extname(file).length);
  for (const e of [ext, ext.toUpperCase()]) if (existsSync(base + e)) return base + e;
  return null;
}

/** Only geographic WGS 84 is accepted; anything else is an error, never a silent re-projection. */
export function isWgs84Prj(prj: string): boolean {
  return !/PROJCS/i.test(prj) && /GEOGCS\[/i.test(prj) && /(WGS_?1984|WGS 84)/i.test(prj);
}

function readShapefile(file: string): SourceFeature[] {
  const prj = sibling(file, '.prj');
  if (!prj) throw new Error(`${file}: missing .prj (the coordinate system must be stated)`);
  if (!isWgs84Prj(readFileSync(prj, 'latin1'))) throw new Error(`${file}: coordinate system is not geographic WGS 84`);
  const dbf = sibling(file, '.dbf');
  if (!dbf) throw new Error(`${file}: missing .dbf`);
  const cpg = sibling(file, '.cpg');
  const enc = cpg ? readFileSync(cpg, 'latin1').trim().toUpperCase() : 'UTF-8';
  if (!['UTF-8', 'UTF8', '65001'].includes(enc)) throw new Error(`${file}: attribute encoding ${enc} is not UTF-8`);
  const shp = readShp(file);
  const table = readDbf(dbf, 'utf-8');
  if (table.records.length !== shp.records.length) throw new Error(`${file}: ${shp.records.length} shapes but ${table.records.length} attribute rows`);
  const kind = shapeKind(shp.shapeType);
  if (!kind) throw new Error(`${file}: unsupported shape type ${shp.shapeType}`);
  return shp.records.map((r, i) => ({ props: table.records[i]!, geometry: shpGeometry(`${file}#${i + 1}`, kind, r.parts, r.point) }));
}

function shpGeometry(where: string, kind: 'point' | 'line' | 'polygon', parts: Pos[][], point?: Pos): Geometry | null {
  if (kind === 'point') return point ? { type: 'Point', coordinates: point } : null;
  if (parts.length === 0) return null;
  if (kind === 'line') return parts.length === 1 ? { type: 'LineString', coordinates: parts[0]! } : { type: 'MultiLineString', coordinates: parts };
  // SHP polygons: clockwise outer rings, counter-clockwise holes → GeoJSON polygons (outer rings counter-clockwise).
  const { polygons, issues } = partsToPolygons(where, parts);
  if (issues.length) throw new Error(`${where}: ${issues.map((x) => x.detail).join('; ')}`);
  return polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0]! } : { type: 'MultiPolygon', coordinates: polygons };
}

function readGeoJson(file: string): SourceFeature[] {
  let doc: unknown;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error(`${file}: invalid JSON`); }
  const o = doc as { type?: string; features?: unknown[]; crs?: { properties?: { name?: string } } };
  if (o.type !== 'FeatureCollection' || !Array.isArray(o.features)) throw new Error(`${file}: expected a GeoJSON FeatureCollection`);
  const crs = o.crs?.properties?.name;
  if (crs && !/(CRS84|EPSG::?4326)$/i.test(crs)) throw new Error(`${file}: coordinate system ${crs} is not WGS 84`);
  return o.features.map((f) => {
    const ft = f as { properties?: Record<string, unknown> | null; geometry?: Geometry | null; id?: unknown };
    const props = { ...(ft.properties ?? {}) };
    if (props['id'] === undefined && (typeof ft.id === 'string' || typeof ft.id === 'number')) props['id'] = ft.id;
    return { props, geometry: ft.geometry ?? null };
  });
}
