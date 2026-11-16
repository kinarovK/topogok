// Synthetic mixed topic for tests only (not shipped to users): two countries, three rivers (two close together),
// three points, a base layer. Writes the same layers twice: as a folder (SHP + GeoJSON) and as one GeoPackage.
//   node scripts/data/fixtures/make-mixed.ts [outDir]   (default build/fixtures/mixed)
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeGeoJson, writeGpkg, writeShapefile, type FixtureFeature } from './write.ts';

const rect = (w: number, s: number, e: number, n: number): FixtureFeature['geometry'] => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

export const MIXED_LAYERS: Record<string, FixtureFeature[]> = {
  hatter: [{ props: { name_hu: 'Háttér', name_uk: 'Тло' }, geometry: rect(10, 0, 22, 10) }],
  orszagok: [
    { props: { id: 'MX-A', name_hu: 'Alfaföld', name_uk: 'Альфаленд' }, geometry: rect(10, 0, 16, 10) },
    { props: { id: 'MX-B', name_hu: 'Bétaföld', name_uk: 'Беталенд' }, geometry: rect(16, 0, 22, 10) },
  ],
  folyok: [
    { props: { id: 'MX-R1', name_hu: 'Első folyó', name_uk: 'Перша річка' }, geometry: { type: 'LineString', coordinates: [[12, 1], [12, 5], [12, 9]] } },
    { props: { id: 'MX-R2', name_hu: 'Második folyó', name_uk: 'Друга річка' }, geometry: { type: 'LineString', coordinates: [[12.6, 1], [12.6, 9]] } },
    { props: { id: 'MX-R3', name_hu: 'Harmadik folyó', name_uk: 'Третя річка' }, geometry: { type: 'MultiLineString', coordinates: [[[17, 5], [18.5, 5.5], [21, 6]], [[18.5, 5.5], [19, 8]]] } },
  ],
  pontok: [
    { props: { id: 'MX-P1', name_hu: 'Északi pont', name_uk: 'Північна точка' }, geometry: { type: 'Point', coordinates: [19.5, 9] } },
    { props: { id: 'MX-P2', name_hu: 'Középső pont', name_uk: 'Центральна точка' }, geometry: { type: 'Point', coordinates: [14.5, 3] } },
    { props: { id: 'MX-P3', name_hu: 'Déli pont', name_uk: 'Південна точка' }, geometry: { type: 'Point', coordinates: [20, 2] } },
  ],
};

export function makeMixed(outDir: string): { folder: string; gpkg: string } {
  rmSync(outDir, { recursive: true, force: true });
  const folder = join(outDir, 'folder');
  mkdirSync(folder, { recursive: true });
  writeShapefile(join(folder, 'hatter'), MIXED_LAYERS['hatter']!);
  writeShapefile(join(folder, 'orszagok'), MIXED_LAYERS['orszagok']!);
  writeShapefile(join(folder, 'folyok'), MIXED_LAYERS['folyok']!);
  writeGeoJson(join(folder, 'pontok.geojson'), MIXED_LAYERS['pontok']!);
  const gpkg = join(outDir, 'mixed.gpkg');
  writeGpkg(gpkg, MIXED_LAYERS);
  return { folder, gpkg };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = resolve(process.argv[2] ?? 'build/fixtures/mixed');
  const r = makeMixed(out);
  console.log(`Wrote ${r.folder} and ${r.gpkg}`);
}
