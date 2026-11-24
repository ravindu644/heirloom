// The real server on a fresh data directory, for the sync tests, the simulator and e2e.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const BIN = join(import.meta.dirname, '../server/bin/heirloomd');

export interface Server {
  url: string;
  invite(): string;
  /** SIGTERM, then throws unless heirloomd exited 0: a server killed mid-shutdown is a failure. */
  stop(): Promise<void>;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });

export async function startServer(addr?: string): Promise<Server> {
  addr ??= `127.0.0.1:${await freePort()}`;
  const data = mkdtempSync(join(tmpdir(), 'heirloom-sync-'));
  const proc = spawn(BIN, ['-addr', addr, '-data', data], { stdio: ['ignore', 'ignore', 'pipe'] });
  // Kept quiet, but kept: when it fails, what it said is the first thing to read.
  let log = '';
  proc.stderr.on('data', (chunk) => (log = (log + chunk).slice(-4000)));
  // A test that throws before stop() must not leave a server or a directory behind.
  const cleanup = () => {
    proc.kill('SIGKILL');
    rmSync(data, { recursive: true, force: true });
  };
  process.once('exit', cleanup);
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    proc.on('exit', (code, signal) => resolve({ code, signal })),
  );
  const url = `http://${addr}`;
  for (let tries = 0; ; tries++) {
    if (proc.exitCode !== null) throw new Error(`heirloomd exited with ${proc.exitCode} before it was up\n${log}`);
    try {
      if ((await fetch(url + '/healthz')).ok) break;
    } catch {}
    if (tries > 100) throw new Error('heirloomd did not answer /healthz in 5 s');
    await sleep(50);
  }
  return {
    url,
    invite: () => execFileSync(BIN, ['-data', data, '-invite'], { encoding: 'utf8' }).trim(),
    async stop() {
      proc.kill('SIGTERM');
      const late = setTimeout(() => proc.kill('SIGKILL'), 5000);
      const end = await exited;
      clearTimeout(late);
      process.off('exit', cleanup);
      rmSync(data, { recursive: true, force: true });
      if (end.code !== 0) throw new Error(`heirloomd did not shut down cleanly: code ${end.code}, signal ${end.signal}\n${log}`);
    },
  };
}
