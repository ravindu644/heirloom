// Usage: node tests/e2e/heirloomd.ts <host:port>
// Runs the real server on a fresh data directory and takes the directory with it when it stops.
// Stop it by signalling the process group, as Playwright and Ctrl-C both do.
// Playwright's config is loaded again in every worker, so the directory cannot be made there.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const data = mkdtempSync(join(tmpdir(), 'heirloom-e2e-'));
// Also runs when the binary is missing and spawn throws, so a failed start leaves nothing either.
process.on('exit', () => rmSync(data, { recursive: true, force: true }));

const bin = join(import.meta.dirname, '../../server/bin/heirloomd');
const server = spawn(bin, ['-addr', process.argv[2]!, '-data', data], { stdio: 'inherit' });
// The group signal has already reached heirloomd. Forwarding it here would be a second one, which
// kills the server mid-shutdown, before the database closes. These handlers only keep this
// process alive until the server is gone, so the directory can be removed.
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {});
server.on('exit', (code, signal) => {
  // A clean stop is exit code 0, so any death by signal means it never finished shutting down.
  if (signal) console.error(`heirloomd was killed by ${signal} before it finished shutting down`);
  process.exit(code ?? 1);
});
