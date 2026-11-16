// Writers for synthetic test sources only (SHP + DBF + PRJ + CPG, GeoJSON, GeoPackage). Never used on owner data.
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { Geometry, Pos } from '../wkb.ts';

export type FixtureFeature = { props: Record<string, string>; geometry: Geometry };
const PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

/** Writes base.shp/.shx/.dbf/.prj/.cpg. Polygons are written with clockwise outer rings (shapefile convention). */
export function writeShapefile(base: string, features: FixtureFeature[]): void {
  const kind = features[0]!.geometry.type;
  const shapeType = kind === 'Point' ? 1 : kind.includes('Line') ? 3 : 5;
  const contents = features.map((f) => {
    if (f.geometry.type === 'Point') {
      const b = Buffer.alloc(20); b.writeInt32LE(1, 0); b.writeDoubleLE(f.geometry.coordinates[0], 4); b.writeDoubleLE(f.geometry.coordinates[1], 12); return b;
    }
    const g = f.geometry;
    const parts: Pos[][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates
      : g.type === 'Polygon' ? g.coordinates.map((r, i) => (i === 0 ? [...r].reverse() : r))
      : g.type === 'MultiPolygon' ? g.coordinates.flatMap((p) => p.map((r, i) => (i === 0 ? [...r].reverse() : r))) : [];
    const pts = parts.flat();
    const b = Buffer.alloc(44 + parts.length * 4 + pts.length * 16);
    b.writeInt32LE(shapeType, 0);
    const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
    [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].forEach((v, i) => b.writeDoubleLE(v, 4 + i * 8));
    b.writeInt32LE(parts.length, 36); b.writeInt32LE(pts.length, 40);
    let idx = 0; parts.forEach((p, i) => { b.writeInt32LE(idx, 44 + i * 4); idx += p.length; });
    pts.forEach((p, i) => { b.writeDoubleLE(p[0], 44 + parts.length * 4 + i * 16); b.writeDoubleLE(p[1], 52 + parts.length * 4 + i * 16); });
    return b;
  });
  const header = (len: number) => {
    const h = Buffer.alloc(100);
    h.writeInt32BE(9994, 0); h.writeInt32BE(len / 2, 24); h.writeInt32LE(1000, 28); h.writeInt32LE(shapeType, 32);
    return h;
  };
  const records = contents.map((c, i) => { const r = Buffer.alloc(8); r.writeInt32BE(i + 1, 0); r.writeInt32BE(c.length / 2, 4); return Buffer.concat([r, c]); });
  const shpLen = 100 + records.reduce((s, r) => s + r.length, 0);
  writeFileSync(`${base}.shp`, Buffer.concat([header(shpLen), ...records]));
  let off = 100;
  const index = records.map((r) => { const b = Buffer.alloc(8); b.writeInt32BE(off / 2, 0); b.writeInt32BE((r.length - 8) / 2, 4); off += r.length; return b; });
  writeFileSync(`${base}.shx`, Buffer.concat([header(100 + index.length * 8), ...index]));
  writeFileSync(`${base}.prj`, PRJ);
  writeFileSync(`${base}.cpg`, 'UTF-8');
  writeDbf(`${base}.dbf`, features.map((f) => f.props));
}

function writeDbf(path: string, rows: Array<Record<string, string>>): void {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const widths = names.map((n) => Math.max(1, ...rows.map((r) => Buffer.byteLength(r[n] ?? ''))));
  const hlen = 32 + names.length * 32 + 1;
  const rlen = 1 + widths.reduce((a, b) => a + b, 0);
  const h = Buffer.alloc(hlen);
  h[0] = 3; h.writeUInt32LE(rows.length, 4); h.writeUInt16LE(hlen, 8); h.writeUInt16LE(rlen, 10);
  names.forEach((n, i) => { h.write(n.slice(0, 10), 32 + i * 32, 'latin1'); h[32 + i * 32 + 11] = 0x43; h[32 + i * 32 + 16] = widths[i]!; });
  h[hlen - 1] = 0x0d;
  const body = rows.map((r) => {
    const b = Buffer.alloc(rlen, 0x20);
    let o = 1; names.forEach((n, i) => { b.write(r[n] ?? '', o, 'utf8'); o += widths[i]!; });
    return b;
  });
  writeFileSync(path, Buffer.concat([h, ...body, Buffer.from([0x1a])]));
}

export function writeGeoJson(path: string, features: FixtureFeature[]): void {
  writeFileSync(path, JSON.stringify({ type: 'FeatureCollection', features: features.map((f) => ({ type: 'Feature', properties: f.props, geometry: f.geometry })) }));
}

function wkb(g: Geometry): Buffer {
  const parts: Buffer[] = [];
  const head = (code: number) => { const b = Buffer.alloc(5); b[0] = 1; b.writeUInt32LE(code, 1); parts.push(b); };
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); parts.push(b); };
  const pos = (p: Pos) => { const b = Buffer.alloc(16); b.writeDoubleLE(p[0], 0); b.writeDoubleLE(p[1], 8); parts.push(b); };
  const line = (l: Pos[]) => { u32(l.length); l.forEach(pos); };
  switch (g.type) {
    case 'Point': head(1); pos(g.coordinates); break;
    case 'LineString': head(2); line(g.coordinates); break;
    case 'Polygon': head(3); u32(g.coordinates.length); g.coordinates.forEach(line); break;
    case 'MultiPoint': head(4); u32(g.coordinates.length); for (const p of g.coordinates) parts.push(wkb({ type: 'Point', coordinates: p })); break;
    case 'MultiLineString': head(5); u32(g.coordinates.length); for (const l of g.coordinates) parts.push(wkb({ type: 'LineString', coordinates: l })); break;
    case 'MultiPolygon': head(6); u32(g.coordinates.length); for (const p of g.coordinates) parts.push(wkb({ type: 'Polygon', coordinates: p })); break;
  }
  return Buffer.concat(parts);
}

/** Minimal GeoPackage (as ogr2ogr writes it from a geodatabase): one feature table per layer, EPSG:4326. */
export function writeGpkg(path: string, layers: Record<string, FixtureFeature[]>): void {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL);
    CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT);
    CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z INTEGER, m INTEGER);
    INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84', 4326, 'EPSG', 4326, 'GEOGCS["WGS 84"]');`);
  for (const [name, features] of Object.entries(layers)) {
    const cols = [...new Set(features.flatMap((f) => Object.keys(f.props)))];
    db.exec(`CREATE TABLE "${name}" (fid INTEGER PRIMARY KEY, geom BLOB, ${cols.map((c) => `"${c}" TEXT`).join(', ')})`);
    db.prepare("INSERT INTO gpkg_contents VALUES (?, 'features', ?)").run(name, name);
    db.prepare("INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', 'GEOMETRY', 4326, 0, 0)").run(name);
    const ins = db.prepare(`INSERT INTO "${name}" (geom, ${cols.map((c) => `"${c}"`).join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`);
    for (const f of features) {
      const header = Buffer.from([0x47, 0x50, 0, 1, 0xe6, 0x10, 0, 0]); // "GP", v0, little-endian, no envelope, srs 4326
      ins.run(Buffer.concat([header, wkb(f.geometry)]), ...cols.map((c) => f.props[c] ?? null));
    }
  }
  db.close();
}
