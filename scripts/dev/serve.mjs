// Minimal static server for the production build that applies dist/_headers (CSP etc.) the way
// Cloudflare Pages would, with SPA fallback to index.html. Usage: node scripts/dev/serve.mjs [dir] [port]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4173);
const host = process.env.HOST ?? '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function parseHeaders() {
  const p = join(root, '_headers');
  if (!existsSync(p)) return [];
  const rules = [];
  let cur = null;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: {} }; rules.push(cur); continue; }
    const i = line.indexOf(':');
    if (cur && i > 0) cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return rules;
}
const rules = parseHeaders();
const match = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = decodeURIComponent(url.pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const candidate = join(file, 'index.html');
    if (existsSync(candidate)) file = candidate;
    else if (!extname(path)) { file = join(root, 'index.html'); path = '/index.html'; }
    else { res.writeHead(404).end('not found'); return; }
  }
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
  for (const r of rules) if (match(r.pattern, path)) Object.assign(headers, r.headers);
  let body = readFileSync(file);
  // Compress text like a CDN would, so transfer sizes are realistic.
  if (/gzip/.test(String(req.headers['accept-encoding'] ?? '')) && !/^image\/png/.test(headers['Content-Type'])) {
    body = gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
  }
  res.writeHead(200, headers);
  res.end(body);
}).listen(port, host, () => console.log(`TopoGok: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/ (${root})`));
