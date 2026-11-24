import { defineConfig } from '@playwright/test';
import { ADDR } from './server.ts';

export default defineConfig({
  testDir: '.',
  // Every test makes its own account, so they share the server and nothing else; the minute-long
  // ones then run beside the rest instead of after them.
  fullyParallel: true,
  use: {
    baseURL: `http://${ADDR}`,
    browserName: 'chromium',
    headless: true,
    // Into tests/e2e/test-results, which .gitignore keeps out.
    screenshot: 'only-on-failure',
    // For a machine where Playwright's own Chromium will not start. See TOOLCHAINS.md.
    launchOptions: { executablePath: process.env.BROWSER_PATH || undefined },
  },
  // Not webServer: Playwright ignores how that exits, so a server killed mid-shutdown stayed green.
  globalSetup: './server.ts',
});
