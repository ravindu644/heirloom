// Starts heirloomd for the whole run, and the phone app's build on a static server of its own (the
// app is not served by its server, so it is another origin). The function it returns is the
// teardown, which throws, and so fails the run, unless heirloomd shut down cleanly.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { remote, startServer } from '../server.ts';

// Not 8787: `make dev` may be running there, and e2e must never talk to a server it did not start.
export const ADDR = '127.0.0.1:8788';

/** The run's server, from inside a worker: globalSetup leaves its data directory in the environment. */
export const e2eServer = () => remote(`http://${ADDR}`, process.env.HEIRLOOM_E2E_DATA!);

/** Where the phone app's build is served, from inside a worker. */
export const appUrl = () => process.env.HEIRLOOM_E2E_APP!;

const ROOT = join(import.meta.dirname, '../..');
const APP = join(ROOT, 'client/dist-app');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

// The app as the phone app is built (make apk's line, without Capacitor or Gradle), served as files.
async function serveApp() {
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', 'dist-app', '--logLevel', 'warn'], { cwd: ROOT, env: { ...process.env, VITE_APP: '1', VITE_SERVER_URL: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
  const files = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    // Any path that is not a file is the page, as a static host serves a single-page app.
    const file = join(APP, path === '/' ? 'index.html' : path);
    const body = await readFile(file).catch(() => null);
    if (body) res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    else res.writeHead(200, { 'content-type': 'text/html' }).end(await readFile(join(APP, 'index.html')));
  });
  await new Promise<void>((resolve) => files.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(files.address() as AddressInfo).port}`, close: () => new Promise<void>((resolve) => files.close(() => resolve())) };
}

export default async function () {
  const server = await startServer(ADDR);
  process.env.HEIRLOOM_E2E_DATA = server.data;
  // The first account on a server is its owner, and before it a signed-out page offers setup, not
  // sign in. An owner nobody uses makes the shared server an ordinary one for every test, in any
  // order; every account a test makes is then a member. Tests of a fresh server start their own.
  const res = await fetch(`http://${ADDR}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'e2e_owner', password: 'not used by any test', device: '0e2e0e2e0e2e0e2e' }),
  });
  if (!res.ok) throw new Error(`the shared server's owner was not made: ${res.status} ${await res.text()}`);
  const app = await serveApp();
  process.env.HEIRLOOM_E2E_APP = app.url;
  return async () => {
    await app.close();
    await server.stop();
  };
}
