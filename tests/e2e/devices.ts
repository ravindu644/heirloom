// The rail for every multi-device test: import `test` from here and name the devices you need.
//
//   test('a pomodoro started on A shows on B', async ({ deviceA, deviceB }) => {
//     await deviceA.page.goto('/');
//     await deviceB.setOffline(true);
//   });
import { test as base } from '@playwright/test';
import type { Browser, BrowserContext, Page, WebSocketRoute } from '@playwright/test';
import { stopAll } from '../sync/harness.ts';

// One person's phone or laptop: its own storage and cookies, and its own network switch.
export type Device = {
  context: BrowserContext;
  page: Page;
  /** The Wi-Fi switch: requests fail, the open socket closes and new ones are refused. */
  setOffline(offline: boolean): Promise<void>;
  /** A network that is up and goes nowhere: sockets stay open, no event fires, and no frame gets through either way. */
  silence(silent: boolean): void;
  /** Console errors, page errors and CSP violations so far, from every page of the device. */
  errors: string[];
};

// The browser reports a failed request on the console by itself. Going offline and a wrong
// password are both supposed to fail a request, so those lines are not the app's errors. A CSP
// line never looks like these.
const NETWORK = /^Failed to load resource|net::ERR_|^WebSocket connection to .* failed/;

function watch(page: Page, errors: string[]) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !NETWORK.test(msg.text())) errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`page: ${err.message}`));
}

// A phone: a finger, not a mouse, and a phone's window. The rest is the same rail.
const PHONE = { hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } };

const device = (options: Parameters<Browser['newContext']>[0] = {}) => async ({ browser }: { browser: Browser }, use: (d: Device) => Promise<void>) => {
  const context = await browser.newContext(options);
  const errors: string[] = [];
  // The browser logs a CSP violation too, but the event says it whatever the console does.
  await context.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)),
  );
  context.on('page', (page) => watch(page, errors));

  // context.setOffline alone leaves an open WebSocket open and silent: no close, no frames, so
  // the app believes it is connected until a ping goes unanswered (offline.spec.ts measures it).
  // A laptop whose Wi-Fi goes off loses the socket at once, so every socket goes through here,
  // where going offline can close it and refuse the next.
  let offline = false;
  let silent = false;
  const open = new Map<WebSocketRoute, WebSocketRoute>();
  await context.routeWebSocket(/\/api\/ws$/, (ws) => {
    if (offline) return ws.close();
    const server = ws.connectToServer();
    open.set(ws, server);
    // Passed on by hand, so that silence can swallow them.
    ws.onMessage((frame) => {
      if (!silent) server.send(frame);
    });
    server.onMessage((frame) => {
      if (!silent) ws.send(frame);
    });
    // With a handler here Playwright no longer passes the page's close on, so it is passed by hand.
    ws.onClose(() => {
      open.delete(ws);
      void server.close();
    });
  });

  const page = await context.newPage();
  await use({
    context,
    page,
    errors,
    silence: (value) => void (silent = value),
    async setOffline(value) {
      offline = value;
      await context.setOffline(value);
      if (!value) return;
      for (const [ws, server] of open) await Promise.all([ws.close(), server.close()]);
      open.clear();
    },
  });
  await context.close();
  if (errors.length) throw new Error(`errors on the device's pages:\n${errors.join('\n')}`);
};

// Playwright only builds the fixtures a test names, so deviceC and phone cost nothing until a test asks.
// `nodes` is automatic: Node devices a test made (to read the server, or to write settings) stop with it.
export const test = base.extend<{ deviceA: Device; deviceB: Device; deviceC: Device; phone: Device; nodes: void }>({
  deviceA: device(),
  deviceB: device(),
  deviceC: device(),
  phone: device(PHONE),
  nodes: [
    async ({}, use) => {
      await use();
      await stopAll();
    },
    { auto: true },
  ],
});
export { expect } from '@playwright/test';
