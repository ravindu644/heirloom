// Usage: make server && node tools/readme/shoot.ts   (the README's pictures, into docs/resources/readme/)
//
// Seeds a throwaway server (seed.ts, port 8799), signs maya in on the browser build it serves, and
// shoots each screen at phone size (412x915 at 2.625, so 1082x2402), dark. The welcome comes from
// the phone app's own build (VITE_APP=1), made into a temp folder. Then hero.html, with these
// pictures in its phones, becomes hero.png. Everything it starts, it stops.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seed } from './seed.ts';

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'docs/resources/readme');
// No caret, focus rings or scrollbars in a picture.
const CLEAN = '*{caret-color:transparent!important} *:focus,*:focus-visible{outline:none!important} ::-webkit-scrollbar{display:none} *{scrollbar-width:none!important}';

const errors: string[] = [];
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.addStyleTag({ content: CLEAN });
  await page.mouse.move(-10, -10);
}
const shot = async (page: Page, name: string) => {
  await settle(page);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('shot', name);
};
const scrollTo = (page: Page, top: number) => page.evaluate((top) => (document.querySelector('main')!.scrollTop = top), top);

const s = await seed();
const browser = await chromium.launch();
let files: ReturnType<typeof createServer> | undefined;
const app = mkdtempSync(join(tmpdir(), 'heirloom-readme-app-'));
try {
  const phone = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, colorScheme: 'dark' as const, isMobile: true, hasTouch: true, bypassCSP: true, timezoneId: s.tz };
  const ctx = await browser.newContext({ ...phone, baseURL: s.url });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const go = async (screen: string) => {
    await page.getByRole('navigation', { name: 'Screens' }).getByRole('link', { name: screen, exact: true }).click();
    await page.waitForTimeout(800);
  };

  await page.goto('/');
  await page.getByLabel('Username').fill('maya');
  await page.getByLabel('Password').fill(s.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('navigation', { name: 'Screens' }).waitFor();
  await page.waitForTimeout(2500);
  // One moment for the pictures. The app adds the server's offset to it with each message, so
  // Focus and Room, whose clocks must agree, are shot one after the other.
  await page.clock.setFixedTime(Date.now());
  await page.waitForTimeout(1200);

  await go('Focus');
  await shot(page, '01-focus');
  // The phones' status bars say the app's own minute: the race line's "at 19:14". The app's now is
  // the held clock plus the server's offset, so the held clock alone can be a minute short.
  const clock = (await page.locator('main').innerText()).match(/\bat (\d\d:\d\d)\./)?.[1] ?? (await page.evaluate(() => new Date().toTimeString().slice(0, 5)));
  await go('Room');
  // A picture is the circle's background-image (kit/person.tsx): wait for two, decoded.
  await page.waitForFunction(() => document.querySelectorAll('main [style*="background-image"]').length >= 2, null, { timeout: 15000 });
  await page.evaluate(() =>
    Promise.all([...document.querySelectorAll('main [style*="background-image"]')].map((el) => {
      const img = new Image();
      img.src = getComputedStyle(el).backgroundImage.slice(5, -2);
      return img.decode().catch(() => {});
    })),
  );
  // The cheers come with the room's messages, a moment after it opens: wait for both lines.
  await page.getByText(/cheered your last lap/).waitFor();
  await page.getByText('You cheered this lap.').waitFor();
  await page.waitForTimeout(500);
  await shot(page, '05-room');

  await go('Today');
  // The maths card's subtasks open; the strip's band (Read chapter 4) stays as it is.
  const bands = page.getByText('1 of 3 subtasks', { exact: true });
  const which = await bands.evaluateAll((els) => els.findIndex((el) => el.closest('section, li, article, [class*="_row_"], [class*="_card_"]')?.textContent?.includes('Revise for the maths test')));
  await bands.nth(Math.max(0, which)).click();
  await scrollTo(page, 0);
  await shot(page, '02-today');

  await go('Progress');
  await page.getByText(/^Progress, week of /).waitFor();
  await shot(page, '03-progress');
  const heading = page.getByRole('heading', { name: 'Today, lap by lap' });
  await heading.evaluate((el) => el.closest('section')!.scrollIntoView({ block: 'start' }));
  await page.locator('section', { has: heading }).last().getByText('Write the essay intro').click();
  await heading.evaluate((el) => {
    el.closest('section')!.scrollIntoView({ block: 'start' });
    document.querySelector('main')!.scrollTop -= 16;
  });
  await shot(page, '03b-progress-day');
  // The year: the grid of every day since the first lap, at the top of the screen.
  const since = page.getByRole('heading', { name: 'Since your first lap' });
  await since.evaluate((el) => {
    el.closest('section')!.scrollIntoView({ block: 'start' });
    document.querySelector('main')!.scrollTop -= 16;
  });
  await shot(page, '07-year');

  await go('Habits');
  await page.getByRole('button', { name: /^Today's times/ }).first().click();
  await scrollTo(page, 0);
  await shot(page, '04-habits');
  await ctx.close();

  // The phone app's first screen, from its own build on a static server of its own.
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', app, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, env: { ...process.env, VITE_APP: '1', VITE_SERVER_URL: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
  files = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(app, path === '/' ? 'index.html' : path);
    const body = await readFile(file).catch(() => null);
    res.writeHead(200, { 'content-type': body ? (types[extname(file)] ?? 'application/octet-stream') : 'text/html' }).end(body ?? (await readFile(join(app, 'index.html'))));
  });
  await new Promise<void>((resolve) => files!.listen(0, '127.0.0.1', resolve));
  const welcome = await browser.newContext(phone);
  const first = await welcome.newPage();
  first.on('pageerror', (e) => errors.push(e.message));
  await first.goto(`http://127.0.0.1:${(files.address() as AddressInfo).port}/`);
  await first.getByRole('button', { name: 'Connect to a server' }).waitFor();
  await shot(first, '06-welcome');
  await welcome.close();

  // The banner: three of the pictures above in phones, the clock they were taken at in each status bar.
  const hero = await browser.newPage({ viewport: { width: 2400, height: 1200 } });
  await hero.goto(`file://${join(import.meta.dirname, 'hero.html')}`);
  await hero.evaluate(async (clock) => {
    await (window as unknown as { fill(clock: string): Promise<void> }).fill(clock);
    await document.fonts.ready;
  }, clock);
  await hero.screenshot({ path: join(OUT, 'hero.png') });
  console.log('shot hero');
} finally {
  await browser.close();
  await new Promise((resolve) => (files ? files.close(resolve) : resolve(null)));
  rmSync(app, { recursive: true, force: true });
  await s.stop();
}
if (errors.length) {
  console.log(`errors on the pages:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
