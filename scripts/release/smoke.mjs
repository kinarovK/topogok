/* global fetch, setTimeout */
// HTTP smoke test of a deployed (or locally served) build. Checks what a browser test cannot see:
// response headers, the release identity, that every precached file is reachable, and that no
// source/backup file is published. Usage: node scripts/release/smoke.mjs <baseUrl> [expectedBuildId]
// Exit code 0 = pass. Retries for a short while because a fresh Pages deployment can take a moment.

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:4173/');
const expectedBuild = process.argv[3] ?? null;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(new URL(path, base), { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
      if (res.status < 500) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) { last = new Error(`${e.message}${e.cause ? ` (${e.cause.code ?? e.cause.message ?? e.cause})` : ''}`); }
    await sleep(5000);
  }
  throw new Error(`${path}: ${last?.message ?? last}`);
}

const index = await get('/');
const html = await index.text();
if (index.status !== 200) errors.push(`/ returned ${index.status}`);
if (!html.includes('id="root"')) errors.push('/ does not look like the app shell');

const h = (name) => index.headers.get(name) ?? '';
const expectHeader = (name, test, why) => { if (!test(h(name))) errors.push(`header ${name} ${why}: "${h(name)}"`); };
expectHeader('content-security-policy', (v) => v.includes("default-src 'self'") && v.includes("script-src 'self'") && v.includes("worker-src 'self'") && v.includes("connect-src 'self'"), 'missing or not self-only');
expectHeader('x-content-type-options', (v) => v === 'nosniff', 'should be nosniff');
expectHeader('x-frame-options', (v) => v === 'DENY', 'should be DENY');
expectHeader('referrer-policy', (v) => v === 'no-referrer', 'should be no-referrer');
expectHeader('cache-control', (v) => /no-cache/.test(v), 'index must be revalidated');
if (base.protocol === 'https:') {
  const http = new URL(base); http.protocol = 'http:';
  try {
    const r = await fetch(http, { redirect: 'manual' });
    if (!(r.status >= 300 && r.status < 400 && (r.headers.get('location') ?? '').startsWith('https:'))) errors.push(`http:// does not redirect to https (status ${r.status})`);
  } catch { /* plain HTTP may be refused entirely, which is also fine */ }
}

// External references in the shell: everything must be same-origin (no CDN, font or tile server).
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (/^(https?:)?\/\//.test(m[1])) errors.push(`external reference in index.html: ${m[1]}`);
}

// A branch alias (e.g. <branch>.<project>.pages.dev) can serve the previous deployment for a short while.
let version = null;
for (let i = 0; i < 12; i++) {
  try { version = await (await get('/version.json')).json(); } catch { version = null; }
  if (!version || !expectedBuild || version.buildId === expectedBuild) break;
  await sleep(10000);
}
if (!version) errors.push('/version.json is missing or not JSON');
if (version) {
  if (expectedBuild && version.buildId !== expectedBuild) errors.push(`buildId ${version.buildId} ≠ expected ${expectedBuild}`);
  if (!version.appVersion || !version.dataVersions) errors.push('version.json lacks appVersion/dataVersions');
}

// Every precached URL must be served (this also proves the local MapLibre worker and topic data are there).
const sw = await (await get('/sw.js')).text();
if ((await get('/sw.js')).headers.get('cache-control')?.includes('no-cache') !== true) errors.push('sw.js must be served with no-cache');
const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
if (urls.length < 10) errors.push(`suspiciously few precached URLs (${urls.length})`);
for (const u of urls) {
  const r = await get(u, 3);
  if (r.status !== 200) errors.push(`${u}: HTTP ${r.status}`);
  else await r.arrayBuffer();
}
const worker = urls.find((u) => /maplibre-gl-worker.*\.mjs$/.test(u));
if (!worker) errors.push('no local MapLibre worker in the precache');
else {
  const wr = await get(worker);
  if (!/max-age=31536000/.test(wr.headers.get('cache-control') ?? '')) errors.push('hashed assets are not served as immutable');
}

// Things that must never be published. A SPA fallback (200 + app shell) also counts as "not published".
for (const p of ['/shp/', '/backups/', '/.git/config', '/.env', '/src/main.tsx', '/package.json', '/data/ukraine-administration/source.shp']) {
  const r = await get(p, 2);
  const body = await r.text();
  if (r.status === 200 && !body.includes('id="root"')) errors.push(`${p} is published`);
}

const summary = `${base.href} build=${version?.buildId ?? '?'} app=${version?.appVersion ?? '?'} precached=${urls.length}`;
if (errors.length) {
  for (const e of errors) console.error(`smoke: FAIL ${e}`);
  console.error(`smoke: ${summary}`);
  process.exit(1);
}
console.log(`smoke: PASS ${summary}`);
