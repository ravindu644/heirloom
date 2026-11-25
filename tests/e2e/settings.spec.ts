// Settings through the screen, on the real engine and server, and the whole app at phone widths.
import { readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { accountWith, digits, go, quickAdd, ready, signIn, taskRow, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';

type Lengths = Parameters<typeof accountWith>[1];
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const panel = (page: Page, title: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, level: 2, exact: true }) });

async function signedInto(devices: Device[], tag: string, lengths: Lengths = {}) {
  const name = username(tag);
  await accountWith(name, lengths);
  for (const d of devices) {
    await signIn(d.page, name);
    await ready(d.page);
  }
  return name;
}
const openSettings = async (page: Page, name: string) => {
  await page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
};

test('lengths changed on A are the next lap\'s on B; the day target shows on Today', async ({ deviceA: a, deviceB: b }) => {
  const name = await signedInto([a, b], 'slengths');
  await openSettings(a.page, name);
  const lap = a.page.getByRole('group', { name: 'A lap' });
  await expect(lap).toContainText('25 minutes');
  await lap.getByRole('button', { name: 'One minute less' }).click();
  await expect(lap).toContainText('24 minutes');
  await expect(digits(b.page)).toHaveText('24:00', { timeout: 2000 });

  const target = panel(a.page, 'Day target');
  await expect(target).toContainText('No target');
  await target.getByRole('button', { name: 'One lap more' }).click();
  await expect(target).toContainText('1 lap a day');
  await go(b.page, 'Today');
  await expect(b.page.getByText('0 of 1 lap today')).toBeVisible({ timeout: 2000 });
});

test('auto-start: with both switches on, the break starts when a lap rings and the next lap when the break rings (3 s lengths written from Node: the steppers stop at a minute)', async ({ deviceA: a }) => {
  const name = await signedInto([a], 'sauto', { work_ms: 3000, short_ms: 3000 });
  await openSettings(a.page, name);
  for (const label of ['Start the break when a lap rings', 'Start the next lap when a break rings']) {
    const box = a.page.getByRole('checkbox', { name: label });
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
  }
  await go(a.page, 'Focus');
  await button(a.page, 'Start lap 1').click();
  await expect(a.page.getByText('Short break, after lap 1 of 4')).toBeVisible({ timeout: 6000 });
  await expect(a.page.getByText('Lap 2 of 4, focus')).toBeVisible({ timeout: 6000 });
});

test('"Ring on this laptop" stays this laptop\'s own, across a reload', async ({ deviceA: a, deviceB: b }) => {
  const name = await signedInto([a, b], 'sring');
  for (const d of [a, b]) await openSettings(d.page, name);
  const ring = (page: Page) => page.getByRole('checkbox', { name: 'Ring on this laptop' });
  const before = await ring(b.page).getAttribute('aria-checked');
  await ring(a.page).click();
  const now = await ring(a.page).getAttribute('aria-checked');
  expect(now).not.toBe(before);
  await b.page.waitForTimeout(1000);
  await expect(ring(b.page)).toHaveAttribute('aria-checked', before!);
  await a.page.reload();
  await expect(ring(a.page)).toHaveAttribute('aria-checked', now!);
});

test('"Mark a finished lap": off, a first lap shows no mark; on, the first lap shows "Lap 1. The bell works." once, and not again after a reload', async ({ deviceA: a, deviceB: b }) => {
  const off = await signedInto([a], 'smarkoff', { work_ms: 3000, short_ms: 60000 });
  const on = await signedInto([b], 'smarkon', { work_ms: 3000, short_ms: 60000 });
  await openSettings(a.page, off);
  const celebrate = a.page.getByRole('checkbox', { name: 'Mark a finished lap' });
  await expect(celebrate).toHaveAttribute('aria-checked', 'true');
  await celebrate.click();
  await expect(celebrate).toHaveAttribute('aria-checked', 'false');
  await go(a.page, 'Focus');
  for (const d of [a, b]) await button(d.page, 'Start lap 1').click();
  for (const d of [a, b]) await expect(button(d.page, 'Skip break')).toBeVisible({ timeout: 8000 });
  await expect(b.page.getByText('Lap 1. The bell works.')).toBeVisible();
  await a.page.waitForTimeout(500);
  await expect(a.page.getByText('Lap 1. The bell works.')).toHaveCount(0);
  await b.page.reload();
  await expect(button(b.page, 'Skip break')).toBeVisible();
  await b.page.waitForTimeout(500);
  await expect(b.page.getByText('Lap 1. The bell works.')).toHaveCount(0);
});

test('a saved copy holds the account\'s cells; brought back into a fresh account it brings the tasks; twice, everything was here already; a file that is not a copy says so', async ({ deviceA: a, deviceB: b }, info) => {
  const first = await signedInto([a], 'scopy');
  await go(a.page, 'Today');
  await quickAdd(a.page, 'chapter 5 ~3');
  await expect(taskRow(a.page, 'chapter 5')).toBeVisible();
  await openSettings(a.page, first);
  const [download] = await Promise.all([a.page.waitForEvent('download'), button(a.page, 'Save a copy').click()]);
  expect(download.suggestedFilename()).toMatch(/^heirloom-\d{4}-\d{2}-\d{2}\.json$/);
  const path = info.outputPath('copy.json');
  await download.saveAs(path);
  const copy = JSON.parse(readFileSync(path, 'utf8'));
  expect(copy).toMatchObject({ heirloom: 1, account: first });
  expect(copy.cells.some((c: { dataset: string; value: unknown }) => c.dataset === 'task' && c.value === 'chapter 5')).toBe(true);
  await expect(panel(a.page, 'Your copy').getByRole('status')).toHaveText(`Saved as ${download.suggestedFilename()}.`);

  const second = await signedInto([b], 'scopy2');
  await openSettings(b.page, second);
  const bring = async (file: string) => {
    const [chooser] = await Promise.all([b.page.waitForEvent('filechooser'), button(b.page, 'Bring a copy back').click()]);
    await chooser.setFiles(file);
  };
  const said = panel(b.page, 'Your copy').getByRole('status');
  await bring(path);
  await expect(said).toHaveText(/^\d+ changes? brought in\.$/);
  await bring(path);
  await expect(said).toHaveText('Everything in that copy was here already.');
  const text = info.outputPath('notes.txt');
  writeFileSync(text, 'my study notes');
  await bring(text);
  await expect(said).toHaveText('That file could not be read as a copy.');
  const other = info.outputPath('other.json');
  writeFileSync(other, JSON.stringify({ hello: 'world' }));
  await bring(other);
  await expect(said).toHaveText('That file was not saved by heirloom.');
  await go(b.page, 'Today');
  await expect(taskRow(b.page, 'chapter 5')).toBeVisible();
});

test('at 412 and 471 wide the document never scrolls sideways on any of the five screens or Settings', async ({ deviceA: a }) => {
  const name = await signedInto([a], 'swidth');
  for (const width of [412, 471]) {
    await a.page.setViewportSize({ width, height: 915 });
    for (const screen of ['Focus', 'Today', 'Progress', 'Habits', 'Room'] as const) {
      await go(a.page, screen);
      await a.page.waitForTimeout(150);
      const { scroll, view } = await a.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
      expect(scroll, `${screen} at ${width}`).toBeLessThanOrEqual(view);
    }
    await openSettings(a.page, name);
    const { scroll, view } = await a.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
    expect(scroll, `Settings at ${width}`).toBeLessThanOrEqual(view);
    await button(a.page, 'Back').click();
  }
});
