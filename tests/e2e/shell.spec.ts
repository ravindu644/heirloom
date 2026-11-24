// The frame every screen stands in: the header with the person, Settings behind it, and the
// widths of real phones.
import type { Page } from '@playwright/test';
import { accountWith, digits, go, ready, signIn, statusLine, username } from './app.ts';
import { expect, test } from './devices.ts';

const PHONE = { width: 412, height: 915 };
const LAPTOP = { width: 1440, height: 900 };

const person = (page: Page, name: string) => page.getByRole('link', { name: `Settings, signed in as ${name}` });

test('Settings is reached from the person in the header, on a phone and on a laptop; sign out there goes back to sign in', async ({ deviceA: a }) => {
  const name = username('settings');
  await accountWith(name);
  await signIn(a.page, name);
  await ready(a.page);
  for (const size of [PHONE, LAPTOP]) {
    await a.page.setViewportSize(size);
    await go(a.page, 'Today');
    await expect(person(a.page, name)).toBeVisible();
    await expect(person(a.page, name)).toContainText(name);
    await person(a.page, name).click();
    await expect(a.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(a.page.getByText('This laptop keeps step with the server at 127.0.0.1:8788.')).toBeVisible();
    await a.page.getByRole('button', { name: 'Back' }).click();
    await expect(a.page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  }
  await person(a.page, name).click();
  await a.page.getByRole('button', { name: 'Sign out' }).click();
  await expect(a.page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('sign out offline with unsent work is refused in the words, and the person stays signed in', async ({ deviceA: a }) => {
  const name = username('refuse');
  await accountWith(name);
  await signIn(a.page, name);
  await ready(a.page);
  await a.setOffline(true);
  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  await expect(statusLine(a.page)).toHaveText('No connection. 1 change is safe on this laptop.');
  await person(a.page, name).click();
  await a.page.getByRole('button', { name: 'Sign out' }).click();
  await expect(a.page.getByRole('alert')).toHaveText('Needs a connection. 1 change is only on this laptop, so you stay signed in until it is sent.');
  await expect(person(a.page, name)).toBeVisible();
  await expect(a.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

  // Back online the change goes, the refusal is no longer true, and signing out works.
  await a.setOffline(false);
  await expect(statusLine(a.page)).toHaveText('', { timeout: 5000 });
  await expect(a.page.getByRole('alert')).toHaveCount(0);
  await a.page.getByRole('button', { name: 'Sign out' }).click();
  await expect(a.page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('the header is the same on Focus, Today and Settings: the mark and the person in the same places, the screen starting at the same height', async ({ deviceA: a }) => {
  const name = username('header');
  await accountWith(name);
  await signIn(a.page, name);
  await ready(a.page);
  const boxes = async () => ({
    mark: await a.page.getByRole('link', { name: 'heirloom' }).first().boundingBox(),
    person: await person(a.page, name).boundingBox(),
    screen: (await a.page.locator('main').boundingBox())?.y,
  });
  for (const size of [PHONE, LAPTOP]) {
    await a.page.setViewportSize(size);
    const seen: Record<string, Awaited<ReturnType<typeof boxes>>> = {};
    await go(a.page, 'Focus');
    await ready(a.page);
    seen.focus = await boxes();
    await go(a.page, 'Today');
    await expect(a.page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    seen.today = await boxes();
    await person(a.page, name).click();
    await expect(a.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    seen.settings = await boxes();
    expect(seen.focus.mark, `${size.width}px`).not.toBeNull();
    expect(seen.today, `Today against Focus at ${size.width}px`).toEqual(seen.focus);
    expect(seen.settings, `Settings against Focus at ${size.width}px`).toEqual(seen.focus);
    await a.page.getByRole('button', { name: 'Back' }).click();
  }
});

test('at 471 px, the sign-in fields and buttons run margin to margin, and the timer is bigger than at 412', async ({ deviceA: a }) => {
  const name = username('wide');
  await accountWith(name);
  await a.page.setViewportSize({ width: 471, height: 1040 });
  await a.page.goto('/');
  const edges = async (locator: ReturnType<Page['getByLabel']>) => {
    const box = (await locator.boundingBox())!;
    return [Math.round(box.x), Math.round(box.x + box.width)];
  };
  const username_ = await edges(a.page.getByLabel('Username'));
  const [left, right] = username_ as [number, number];
  // The same gutter on both sides, and nothing narrower than the page allows.
  expect(left, 'left gutter').toBeLessThanOrEqual(32);
  expect(471 - right, 'right gutter').toBe(left);
  expect(await edges(a.page.getByLabel('Password'))).toEqual(username_);
  const buttons = a.page.getByRole('button', { name: 'Sign in', exact: true }).locator('xpath=..');
  expect(await edges(buttons as never)).toEqual(username_);

  await signIn(a.page, name);
  await ready(a.page);
  const width = async (w: number) => {
    await a.page.setViewportSize({ width: w, height: 1040 });
    await a.page.waitForTimeout(200);
    return (await digits(a.page).boundingBox())!.width;
  };
  const at412 = await width(412);
  const at471 = await width(471);
  console.log(`timer digits: ${at412.toFixed(1)} px wide at 412, ${at471.toFixed(1)} px at 471`);
  expect(at471).toBeGreaterThan(at412);
});
