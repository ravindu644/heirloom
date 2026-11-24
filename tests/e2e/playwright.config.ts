import { defineConfig } from '@playwright/test';
import { ADDR } from './server.ts';

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: `http://${ADDR}`,
    browserName: 'chromium',
    headless: true,
    // For a machine where Playwright's own Chromium will not start. See TOOLCHAINS.md.
    launchOptions: { executablePath: process.env.BROWSER_PATH || undefined },
  },
  // Not webServer: Playwright ignores how that exits, so a server killed mid-shutdown stayed green.
  globalSetup: './server.ts',
});
