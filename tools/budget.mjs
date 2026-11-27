// Usage: node tools/budget.mjs   (after `make web`, and `make server` for the binary row)
// Measures the built app and the server binary against the budgets in docs/ARCHITECTURE.md §7.
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'client/dist';
if (!fs.existsSync(dist)) { console.error('budget: no client/dist, run `make web` first'); process.exit(1); }
const files = fs.readdirSync(dist, { recursive: true }).map((f) => path.join(dist, f));
const sum = (ext, size) => files.filter((f) => f.endsWith(ext)).reduce((n, f) => n + size(f), 0);
const gz = (f) => gzipSync(fs.readFileSync(f)).length;
const raw = (f) => fs.statSync(f).size;
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const KB = 1024, bin = 'server/bin/heirloomd-arm64';

const rows = [
  // First load is what index.html names. The lazy chunks are Capacitor's, which only the phone
  // app imports (platform/index.ts), and sw.js is the worker, not the page.
  ['JS, gzipped', [...html.matchAll(/<script\b[^>]*\bsrc="\/([^"]+\.js)"/g)].reduce((n, m) => n + gz(path.join(dist, m[1])), 0), 90 * KB],
  ['CSS, gzipped', sum('.css', gz), 20 * KB],
  // Each tag on its own, attributes in any order or quoting, so a new preload cannot slip past.
  ['fonts preloaded', (html.match(/<link\b[^>]*>/g) ?? []).filter((l) => /rel=["']?preload/.test(l) && /as=["']?font/.test(l)).length, 2],
  // DESIGN.md: five files, about 110 KB for the whole app.
  ['fonts, all files', sum('.woff2', raw), 115 * KB],
  // PRODUCT: the bells, all three, small enough to ship in the app and the page.
  ['bells, all files', sum('.ogg', raw), 200 * KB],
  ...(fs.existsSync(bin) ? [['server binary, arm64', raw(bin), 25 * KB * KB]] : []),
];

let over = 0;
for (const [name, got, limit] of rows) {
  const show = (n) => (limit < KB ? `${n}` : limit < KB * KB ? `${(n / KB).toFixed(1)} KB` : `${(n / KB / KB).toFixed(1)} MB`);
  const bad = name === 'fonts preloaded' ? got > limit : got >= limit;
  if (bad) over++;
  console.log(`${bad ? 'OVER' : 'ok  '}  ${name.padEnd(22)} ${show(got).padStart(9)}  limit ${show(limit)}`);
}
if (!fs.existsSync(bin)) console.log('      server binary not built, run `make server` to measure it');
process.exit(over ? 1 : 0);
