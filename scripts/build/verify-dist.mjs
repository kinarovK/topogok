// Post-build gate: the service worker precache must list every shipped file, and nothing from
// sources, backups or secrets may end up in the build. Usage: node scripts/build/verify-dist.mjs [dir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dir, p).split(sep).join('/'));
  }
};
walk(dir);

const errors = [];
const forbidden = files.filter((f) => /(^|\/)(shp|backups|reports|docs|src|\.linux-binaries)\//.test(f) || /\.(shp|shx|dbf|prj|cpg|sbn|sbx|map)$/.test(f) || /(^|\/)\.env/.test(f));
if (forbidden.length) errors.push(`forbidden files in build: ${forbidden.join(', ')}`);

const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
const precached = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));
const notPrecached = ['sw.js', '_headers', '_routes.json', 'registerSW.js'];
// The synthetic test topic (0005) is added to the E2E build after bundling; it must never be in a release build.
const testData = files.filter((f) => f.startsWith('data/test-'));
if (testData.length && !/dist-e2e\/?$/.test(dir)) errors.push(`test topic data in a release build: ${testData.join(', ')}`);
const missing = files.filter((f) => !notPrecached.includes(f) && !/^workbox-[\w-]+\.js$/.test(f) && !precached.has(f) && !f.startsWith('data/test-'));
if (missing.length) errors.push(`not in precache: ${missing.join(', ')}`);
for (const must of ['index.html', 'manifest.webmanifest']) if (!precached.has(must)) errors.push(`precache lacks ${must}`);
if (![...precached].some((u) => /maplibre-gl-worker.*\.mjs$/.test(u))) errors.push('precache lacks the MapLibre worker');
if (![...precached].some((u) => u.endsWith('regions.geojson'))) errors.push('precache lacks regions.geojson');
if ([...precached].some((u) => u.startsWith('api/') || u === '_routes.json')) errors.push('API or routing files must not be precached');

const total = files.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
console.log(`verify-dist: ${files.length} files, ${(total / 1024).toFixed(0)} KiB, ${precached.size} precached`);
if (errors.length) { for (const e of errors) console.error(`verify-dist: ${e}`); process.exit(1); }
console.log('verify-dist: OK');
