// Helper for a split setup: npm install runs on Windows (which has registry access), while the
// build/test shell is Linux x64 (glibc). npm installs only the native optional packages of the
// current OS, so this script downloads the Linux x64 glibc variants listed in package-lock.json
// as tarballs into .linux-binaries/ (npm pack does no platform check). Nothing is installed or
// changed in node_modules here; the Linux side unpacks them. Run: npm run setup:linux-binaries
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const wanted = [];
for (const [path, meta] of Object.entries(lock.packages ?? {})) {
  if (!path.startsWith('node_modules/') || !meta.optional || !meta.version) continue;
  const os = meta.os ?? [];
  const cpu = meta.cpu ?? [];
  const libc = meta.libc ?? [];
  if (!os.includes('linux') || !cpu.includes('x64')) continue;
  if (libc.length && !libc.includes('glibc')) continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  wanted.push(`${name}@${meta.version}`);
}
const unique = [...new Set(wanted)].sort();
if (unique.length === 0) {
  console.log('No Linux x64 native optional packages found in package-lock.json.');
  process.exit(0);
}
mkdirSync('.linux-binaries', { recursive: true });
console.log(`Downloading ${unique.length} package(s):\n  ${unique.join('\n  ')}`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npm, ['pack', ...unique, '--pack-destination', '.linux-binaries'], { stdio: 'inherit', shell: process.platform === 'win32' });
console.log('Done: .linux-binaries/');
