// Reads every feature table of a GeoPackage (an SQLite file) with Node's built-in node:sqlite. Read-only.
// A geodatabase is converted to GeoPackage beforehand with ogr2ogr (see docs/project/tasks/0005_MIXED_GEOMETRY).
import { DatabaseSync } from 'node:sqlite';
import { parseGpkgGeometry, type Geometry } from './wkb.ts';

export type SourceFeature = { props: Record<string, unknown>; geometry: Geometry | null };
export type SourceLayer = { name: string; features: SourceFeature[] };

const WGS84 = new Set(['EPSG:4326', 'OGC:CRS84']);

export function readGpkg(path: string): SourceLayer[] {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = db.prepare(
      `SELECT c.table_name AS name, g.column_name AS geom, s.organization AS org, s.organization_coordsys_id AS code
       FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name JOIN gpkg_spatial_ref_sys s ON s.srs_id = g.srs_id
       WHERE c.data_type = 'features' ORDER BY c.table_name`).all() as Array<{ name: string; geom: string; org: string; code: number }>;
    return tables.map((t) => {
      if (!WGS84.has(`${String(t.org).toUpperCase()}:${t.code}`)) throw new Error(`${path}: layer ${t.name} is in ${t.org}:${t.code}, expected geographic WGS 84 (EPSG:4326)`);
      const quoted = (s: string) => `"${s.replaceAll('"', '""')}"`;
      const rows = db.prepare(`SELECT * FROM ${quoted(t.name)}`).all() as Array<Record<string, unknown>>;
      return {
        name: t.name,
        features: rows.map((r) => {
          const { [t.geom]: blob, ...props } = r;
          return { props, geometry: blob instanceof Uint8Array ? parseGpkgGeometry(blob).geometry : null };
        }),
      };
    });
  } finally {
    db.close();
  }
}
