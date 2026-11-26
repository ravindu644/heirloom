// Settings through the screen, on the real engine and server, and the whole app at phone widths.
import { readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { accountWith, digits, go, lapLine, quickAdd, ready, signIn, startButton, startNow, taskRow, username } from './app.ts';
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

test('lengths: typed, a fraction or nothing put back, past an end brought to it, nudged by minus and plus, and the next lap\'s on B; the day target shows on Today', async ({ deviceA: a, deviceB: b }) => {
  const name = await signedInto([a, b], 'slengths');
  await openSettings(a.page, name);
  const lap = a.page.getByRole('spinbutton', { name: 'A lap' });
  await expect(lap).toHaveValue('25');
  // Typed, and kept on Enter.
  await lap.fill('30');
  await lap.press('Enter');
  await expect(digits(b.page)).toHaveText('30:00', { timeout: 2000 });
  // A fraction or nothing is put back; past either end a figure comes to the nearest one it can be.
  for (const wrong of ['2.5', '']) {
    await lap.fill(wrong);
    await lap.press('Enter');
    await expect(lap, `"${wrong}" was kept`).toHaveValue('30');
  }
  await expect(digits(b.page)).toHaveText('30:00');
  for (const [typed, kept, shown] of [['0', '1', '01:00'], ['400', '360', '6:00:00'], ['30', '30', '30:00']] as const) {
    await lap.fill(typed);
    await lap.press('Enter');
    await expect(lap, `"${typed}" typed`).toHaveValue(kept);
    await expect(b.page.locator('[class*="digits"]').first()).toHaveText(shown, { timeout: 2000 });
  }
  // Minus and plus still nudge.
  await a.page.getByRole('button', { name: 'A lap, one minute less', exact: true }).click();
  await expect(lap).toHaveValue('29');
  await expect(digits(b.page)).toHaveText('29:00', { timeout: 2000 });
  // A break is 1 to 60, kept when the field is left.
  const short = a.page.getByRole('spinbutton', { name: 'A short break' });
  await short.fill('7');
  await short.press('Tab');
  await expect(short).toHaveValue('7');
  // Past its top it comes to 60, and the plus is off there.
  await short.fill('61');
  await short.press('Tab');
  await expect(short).toHaveValue('60');
  await expect(a.page.getByRole('button', { name: 'A short break, one minute more', exact: true })).toBeDisabled();
  await a.page.getByRole('button', { name: 'A short break, one minute less', exact: true }).click();
  await expect(short).toHaveValue('59');
  await expect(a.page.getByRole('spinbutton', { name: 'The long break, after four laps' })).toHaveValue('15');

  const target = panel(a.page, 'Day target');
  await expect(target).toContainText('No target');
  await target.getByRole('button', { name: 'One lap more', exact: true }).click();
  await expect(target).toContainText('1 lap a day');
  await go(b.page, 'Today');
  await expect(b.page.getByText('0 of 1 lap today')).toBeVisible({ timeout: 2000 });
});

test('auto-start: with both switches on, the break starts when a lap reaches its bell and the next lap when the break reaches its bell (3 s lengths written from Node: the steppers stop at a minute)', async ({ deviceA: a }) => {
  const name = await signedInto([a], 'sauto', { work_ms: 3000, short_ms: 3000 });
  await openSettings(a.page, name);
  for (const label of ['Start the break when a lap reaches its bell', 'Start the next lap when a break reaches its bell']) {
    const box = a.page.getByRole('checkbox', { name: label });
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
  }
  await go(a.page, 'Focus');
  await startButton(a.page).click();
  // The break started by itself, then the next lap: the line names the break, then says nothing.
  await expect(lapLine(a.page)).toHaveText('Short break', { timeout: 6000 });
  await expect(a.page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({ timeout: 6000 });
  await expect(lapLine(a.page)).toHaveText('');
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
  for (const d of [a, b]) await startButton(d.page).click();
  for (const d of [a, b]) await expect(startNow(d.page)).toBeVisible({ timeout: 8000 });
  await expect(b.page.getByText('Lap 1. The bell works.')).toBeVisible();
  await a.page.waitForTimeout(500);
  await expect(a.page.getByText('Lap 1. The bell works.')).toHaveCount(0);
  await b.page.reload();
  await expect(startNow(b.page)).toBeVisible();
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
