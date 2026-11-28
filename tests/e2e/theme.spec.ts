// Light or dark (DESIGN.md): Settings' choice of System, Light or Dark, on this device only, in force
// from the first paint of a reload. The grounds are read from DESIGN.md, not written here again.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { signedInto, signIn } from './app.ts';
import { expect, test } from './devices.ts';

const design = readFileSync(new URL('../../DESIGN.md', import.meta.url), 'utf8');
const hexOf = (key: string) => design.match(new RegExp(`^\\s+${key}: "(#[0-9A-Fa-f]{6})"`, 'm'))![1]!;
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const LIGHT = hexOf('ground');
const DARK = hexOf('dark-ground');

const pick = (page: Page) => page.getByRole('group', { name: 'Light or dark' });
const choice = (page: Page, name: 'System' | 'Light' | 'Dark') => pick(page).getByRole('button', { name, exact: true });
const attr = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const ground = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ground').trim().toUpperCase());
const painted = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const metas = (page: Page) => page.locator('meta[name="theme-color"]').evaluateAll((els) => els.map((el) => (el.getAttribute('content') ?? '').toUpperCase()));
const toSettings = (page: Page, name: string) => page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();

test('Light or dark: Dark on a light system is dark at once and from the first paint of a reload, by theme.js alone; System follows the system both ways; Light on a dark system stays light; a second device of the account keeps its own, System', async ({ deviceA: a, deviceB: b }) => {
  await a.page.emulateMedia({ colorScheme: 'light' });
  await b.page.emulateMedia({ colorScheme: 'light' });
  const { name } = await signedInto(a, 'theme');
  await toSettings(a.page, name);
  await expect(choice(a.page, 'System')).toHaveAttribute('aria-pressed', 'true');
  expect(await attr(a.page)).toBeNull();
  expect(await painted(a.page)).toBe(rgb(LIGHT));

  // Dark: the attribute, the ground, the page's paint and both of the bar's colours.
  await choice(a.page, 'Dark').click();
  await expect(choice(a.page, 'Dark')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => attr(a.page)).toBe('dark');
  expect(await ground(a.page)).toBe(DARK.toUpperCase());
  await expect.poll(() => painted(a.page)).toBe(rgb(DARK));
  expect(await metas(a.page)).toEqual([DARK.toUpperCase(), DARK.toUpperCase()]);

  // The second device of the account stays on its own choice, System, and light.
  await signIn(b.page, name);
  await toSettings(b.page, name);
  await a.page.waitForTimeout(1500);
  await expect(choice(b.page, 'System')).toHaveAttribute('aria-pressed', 'true');
  expect(await attr(b.page)).toBeNull();
  expect(await painted(b.page)).toBe(rgb(LIGHT));

  // A reload with the app's own code refused: theme.js in <head> alone puts the first paint in
  // dark. The service worker would hand the script over from its cache, so it goes first.
  await a.page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  });
  const app = (url: URL) => /^\/assets\/.+\.js$/.test(url.pathname);
  let refused = 0;
  await a.page.route(app, (route) => (refused++, route.abort()));
  await a.page.reload({ waitUntil: 'domcontentloaded' });
  expect(await attr(a.page), 'theme.js did not set the theme before the app').toBe('dark');
  expect(await painted(a.page), 'the first paint is not dark').toBe(rgb(DARK));
  expect(refused, 'the app\'s script was never asked for, so it was not refused').toBeGreaterThan(0);
  await expect(a.page.getByRole('group', { name: 'Light or dark' }), 'the app ran all the same').toHaveCount(0);
  await a.page.unroute(app);
  await a.page.reload();
  await expect(choice(a.page, 'Dark')).toHaveAttribute('aria-pressed', 'true');

  // System: the attribute goes, and the page follows the system, dark and back.
  await choice(a.page, 'System').click();
  await expect.poll(() => attr(a.page)).toBeNull();
  await a.page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => painted(a.page)).toBe(rgb(DARK));
  await a.page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => painted(a.page)).toBe(rgb(LIGHT));

  // Light on a dark system stays light.
  await a.page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => painted(a.page)).toBe(rgb(DARK));
  await choice(a.page, 'Light').click();
  await expect.poll(() => attr(a.page)).toBe('light');
  await expect.poll(() => painted(a.page)).toBe(rgb(LIGHT));
  expect(await metas(a.page)).toEqual([LIGHT.toUpperCase(), LIGHT.toUpperCase()]);
  await a.page.reload();
  await expect(choice(a.page, 'Light')).toHaveAttribute('aria-pressed', 'true');
  expect(await painted(a.page)).toBe(rgb(LIGHT));

  // And B, all along, on System.
  await expect(choice(b.page, 'System')).toHaveAttribute('aria-pressed', 'true');
  expect(await attr(b.page)).toBeNull();
});
