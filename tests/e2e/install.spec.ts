// The web app installs as an app (a PWA): Chromium's own installability check, run against the
// real server's built app, with its manifest and every icon it names, and no CSP line on the way.
//
// Two things the rail's devices cannot do here. The headless shell answers no installability
// errors whatever the page holds (a page with no manifest at all included), so this runs the full
// Chromium in its new headless mode. And every context Playwright makes is off the record, which
// Chromium calls "in-incognito" and never installs from, so this one is a profile on disk.
import { expect, test } from '@playwright/test';
import { ADDR } from './server.ts';

test('installable: no installability errors once the page and its service worker are up; the manifest parses, is "heirloom", standalone, with 192 and 512 icons for any and for maskable, each a PNG that answers 200; no CSP error', async ({ playwright }, info) => {
  const context = await playwright.chromium.launchPersistentContext(info.outputPath('profile'), {
    channel: 'chromium',
    headless: true,
    baseURL: `http://${ADDR}`,
    executablePath: process.env.BROWSER_PATH || undefined,
  });
  try {
    // Console errors and CSP violations, as the rail collects them on its own devices.
    const errors: string[] = [];
    await context.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)),
    );
    const page = context.pages()[0] ?? (await context.newPage());
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByLabel('Username')).toBeVisible();
    // The service worker is the last thing an install waits for.
    expect(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)), 'no service worker took the page').toBe(true);

    const cdp = await context.newCDPSession(page);
    const installErrors = async () => ((await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] }).installabilityErrors.map((e) => e.errorId);
    await expect.poll(installErrors, { timeout: 10000, message: 'Chromium says the app cannot be installed' }).toEqual([]);

    const manifest = (await cdp.send('Page.getAppManifest')) as { url: string; errors: { message: string }[]; data?: string };
    expect(manifest.errors, 'the manifest has parse errors').toEqual([]);
    expect(manifest.url).toMatch(/\/manifest\.webmanifest$/);
    const data = JSON.parse(manifest.data!) as { name: string; display: string; icons: { src: string; sizes: string; type: string; purpose?: string }[] };
    expect(data.name).toBe('heirloom');
    expect(data.display).toBe('standalone');
    for (const purpose of ['any', 'maskable'])
      for (const size of ['192x192', '512x512'])
        expect(data.icons.filter((icon) => icon.sizes === size && (icon.purpose ?? 'any').split(' ').includes(purpose)), `no ${size} icon for ${purpose}`).toHaveLength(1);

    // Every icon the manifest names is a PNG the server serves.
    for (const icon of data.icons) {
      const res = await page.request.get(new URL(icon.src, manifest.url).href);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type'], icon.src).toMatch(/^image\/png/);
    }
    await cdp.detach();
    expect(errors.filter((line) => /CSP|Content Security Policy/i.test(line)), 'a CSP error on the way').toEqual([]);
    expect(errors, 'errors on the page').toEqual([]);
  } finally {
    await context.close();
  }
});
