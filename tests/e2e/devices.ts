// The rail for every multi-device test: import `test` from here and name the devices you need.
//
//   test('a pomodoro started on A shows on B', async ({ deviceA, deviceB }) => {
//     await deviceA.page.goto('/');
//     await deviceB.setOffline(true);
//   });
import { test as base } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

// One person's phone or laptop: its own storage and cookies, and its own network switch.
export type Device = {
  context: BrowserContext;
  page: Page;
  setOffline(offline: boolean): Promise<void>;
};

async function device({ browser }: { browser: Browser }, use: (d: Device) => Promise<void>) {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Tests go offline through here, not through context, so a transport that needs more than
  // setOffline (a WebSocket that stays open, say) is fixed in one place.
  await use({ context, page, setOffline: (offline) => context.setOffline(offline) });
  await context.close();
}

// Playwright only builds the fixtures a test names, so deviceC costs nothing until a test asks.
export const test = base.extend<{ deviceA: Device; deviceB: Device; deviceC: Device }>({
  deviceA: device,
  deviceB: device,
  deviceC: device,
});
export { expect } from '@playwright/test';
