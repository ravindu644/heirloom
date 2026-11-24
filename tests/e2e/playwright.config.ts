import { defineConfig } from '@playwright/test';

// Not 8787: `make dev` may be running there, and e2e must never talk to a server it did not start.
const addr = '127.0.0.1:8788';

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: `http://${addr}`,
    browserName: 'chromium',
    headless: true,
    // For a machine where Playwright's own Chromium will not start. See TOOLCHAINS.md.
    launchOptions: { executablePath: process.env.BROWSER_PATH || undefined },
  },
  webServer: {
    command: `node heirloomd.ts ${addr}`,
    url: `http://${addr}/healthz`,
    reuseExistingServer: false,
    // Without this Playwright sends SIGKILL, and the temp data directory outlives the run.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
